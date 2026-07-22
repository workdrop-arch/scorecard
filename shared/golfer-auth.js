// ═══════════════════════════════════════════════
// GOLFER AUTH — lightweight identity for the Golfer Portal.
// 02-New-Dashboard-Plan.md §6 ("Access"): a roster dropdown + a shared
// trip-wide passcode, not per-player accounts. This tracks WHICH player a
// browser session is acting as (not just a yes/no signed-in flag like
// shared/auth.js's admin session), since score/CTP/bet submissions need
// to be attributed to a specific player.
//
//   local mode: passcode checked against GOLFER_TRIP_PASSCODE, session
//     held in sessionStorage (clears when the tab closes).
//
//   firestore mode: same passcode gate, PLUS a real Firebase Anonymous
//     Auth sign-in, so Firestore security rules can still require
//     "request.auth != null" on writes. The passcode is a convenience
//     gate for the group, not itself the security boundary — see the
//     comment on GOLFER_TRIP_PASSCODE in shared/firebase-config.js.
// ═══════════════════════════════════════════════

import { FIREBASE_IS_CONFIGURED, GOLFER_TRIP_PASSCODE } from './firebase-config.js';

export const golferAuthMode = FIREBASE_IS_CONFIGURED ? 'firestore' : 'local';

const SESSION_KEY = 'scorecard:golfer-session'; // { playerId, playerName }

function readSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function writeSession(session) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

const listeners = new Set();
function notify() {
  const session = readSession();
  listeners.forEach(cb => cb(session));
}

// ── Firebase Anonymous Auth, loaded lazily so the CDN import never
// happens in local mode. ──
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

// credentials: { passcode, playerId, playerName }
export async function golferSignIn({ passcode, playerId, playerName }) {
  if (passcode !== GOLFER_TRIP_PASSCODE) {
    throw new Error('Incorrect passcode.');
  }
  if (!playerId) {
    throw new Error('Pick your name from the list.');
  }
  if (golferAuthMode === 'firestore') {
    const { authMod, auth } = await loadFirebaseAuth();
    if (!auth.currentUser) await authMod.signInAnonymously(auth);
  }
  writeSession({ playerId, playerName });
  notify();
}

export function golferSignOut() {
  writeSession(null);
  notify();
  return Promise.resolve();
}

// Always returns a Promise<unsubscribeFn>, mirroring shared/auth.js's
// onAuthChange contract — cb(session|null), fires immediately with the
// current session (or null) and again whenever it changes.
export function onGolferSessionChange(cb) {
  listeners.add(cb);
  cb(readSession());
  return Promise.resolve(() => listeners.delete(cb));
}

export function currentGolferSession() {
  return readSession();
}
