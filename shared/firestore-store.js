// ═══════════════════════════════════════════════
// FIRESTORE STORE — real backend, active once shared/firebase-config.js
// has real project values (FIREBASE_IS_CONFIGURED === true).
//
// Same public shape as shared/local-store.js: collection(path) returns
// { onChange, add, update, remove }. Loaded via Firebase's official CDN
// ES modules — no npm/build step, consistent with the rest of this
// project's zero-dependency, edit-and-refresh philosophy.
// ═══════════════════════════════════════════════

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc,
  addDoc, updateDoc, setDoc, deleteDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

function getApp_() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let dbInstance = null;
function db() {
  if (!dbInstance) dbInstance = getFirestore(getApp_());
  return dbInstance;
}

export function firestoreCollection(path) {
  const colRef = collection(db(), path);
  return {
    onChange(cb) {
      return onSnapshot(
        colRef,
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          docs.sort((a, b) => (a.__seq ?? 0) - (b.__seq ?? 0));
          cb(docs);
        },
        (err) => {
          console.error('[firestore-store] onSnapshot error for', path, err);
        }
      );
    },
    async add(data) {
      const ref = await addDoc(colRef, { ...data, __seq: Date.now() });
      return ref.id;
    },
    async update(id, patch) {
      await updateDoc(doc(db(), path, id), patch);
    },
    // Upsert by explicit id — creates the doc if missing, merges if present.
    // Used for fixed-id "singleton" docs (settings/trip, teams/red, teams/blue).
    async set(id, patch) {
      await setDoc(doc(db(), path, id), patch, { merge: true });
    },
    async remove(id) {
      await deleteDoc(doc(db(), path, id));
    },
  };
}

export function firestoreApp() {
  return getApp_();
}
