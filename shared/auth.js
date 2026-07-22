// ═══════════════════════════════════════════════
// AUTH — dual-mode, same pattern as shared/data-store.js.
//
//   local mode (no Firebase project configured yet):
//     a single shared passcode (shared/firebase-config.js →
//     LOCAL_ADMIN_PASSCODE), session held in sessionStorage so it clears
//     when the tab closes. Dev/demo only — never used once Firebase is
//     configured.
//
//   firestore mode (FIREBASE_IS_CONFIGURED === true):
//     real Firebase Auth, email + password. Create the admin's account
//     once in the Firebase console under Authentication → Users; this
//     file just signs in against it.
//
// Callers (admin/auth-gate.js) only need authMode, onAuthChange, signIn,
// signOutUser — they never branch on local vs firestore themselves.
// ═══════════════════════════════════════════════

import { FIREBASE_IS_CONFIGURED, LOCAL_ADMIN_PASSCODE } from './firebase-config.js';

export const authMode = FIREBASE_IS_CONFIGURED ? 'firestore' : 'local';

const LOCAL_SESSION_KEY = 'scorecard:local-auth';
const localListeners = new Set();

function localUser() {
  return sessionStorage.getItem(LOCAL_SESSION_KEY) === '1'
    ? { uid: 'local-admin', email: 'local-admin@dev' }
    : null;
}

function notifyLocal() {
  const user = localUser();
  localListeners.forEach(cb => cb(user));
}

// ── Local mode implementation ──
function onAuthChangeLocal(cb) {
  localListeners.add(cb);
  cb(localUser());
  return () => localListeners.delete(cb);
}

function signInLocal({ passcode }) {
  if (passcode !== LOCAL_ADMIN_PASSCODE) {
    return Promise.reject(new Error('Incorrect passcode.'));
  }
  sessionStorage.setItem(LOCAL_SESSION_KEY, '1');
  notifyLocal();
  return Promise.resolve();
}

function signOutLocal() {
  sessionStorage.removeItem(LOCAL_SESSION_KEY);
  notifyLocal();
  return Promise.resolve();
}

// ── Firestore (real Firebase Auth) implementation — loaded lazily so the
// CDN import never happens in local mode. ──
let firebaseAuthPromise = null;
function loadFirebaseAuth() {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('./firestore-store.js'),
    ]).then(([authMod, storeMod]) => {
      const auth = authMod.getAuth(storeMod.firestoreApp());
      return { authMod, auth };
    });
  }
  return firebaseAuthPromise;
}

async function onAuthChangeFirestore(cb) {
  const { authMod, auth } = await loadFirebaseAuth();
  return authMod.onAuthStateChanged(auth, cb);
}

async function signInFirestore({ email, password }) {
  const { authMod, auth } = await loadFirebaseAuth();
  await authMod.signInWithEmailAndPassword(auth, email, password);
}

async function signOutFirestore() {
  const { authMod, auth } = await loadFirebaseAuth();
  await authMod.signOut(auth);
}

// ── Unified exports ──

// Always returns a Promise<unsubscribeFn> — even in local mode, where
// subscribing is actually synchronous — so callers never need to branch
// on mode: `const unsub = await onAuthChange(cb);`
export function onAuthChange(cb) {
  return authMode === 'local'
    ? Promise.resolve(onAuthChangeLocal(cb))
    : onAuthChangeFirestore(cb);
}

// credentials: { passcode } in local mode, { email, password } in firestore mode.
export function signIn(credentials) {
  return authMode === 'local' ? signInLocal(credentials) : signInFirestore(credentials);
}

export function signOutUser() {
  return authMode === 'local' ? signOutLocal() : signOutFirestore();
}
