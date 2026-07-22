// ═══════════════════════════════════════════════
// DATA STORE — single entry point every app (dashboard/admin/golfer)
// imports instead of talking to local-store.js or firestore-store.js
// directly. Picks the active backend once, seeds demo data in local
// mode, and exposes named collection accessors that match the schema
// documented below (mirrors 02-New-Dashboard-Plan.md §4).
//
// Every collection exposes { onChange, add, update, set, remove }.
// Use update(id, patch) when editing a row the UI already listed (id is
// guaranteed to exist). Use set(id, patch) to upsert a fixed-id singleton
// doc that may not have been created yet (settings/trip, teams/red,
// teams/blue) — it creates-or-merges instead of throwing on a missing doc.
//
// SCHEMA
//   settings          — 1 doc, id "trip": { heroTitle, tripDateLabel,
//                        defendingChampionName, cpcShowLeaderboard,
//                        cpcWinnerOverride }
//   teams             — 2 docs, id "red"/"blue": { name, captainId }
//   players           — { first, last, team:"red"|"blue", captain, rookie }
//   players/{id}/handicapHistory
//                     — { date, value }  (one per checkpoint, any count)
//   rounds            — { day, session:"AM"|"PM", course, format, detail,
//                        pointsAvail, status:"upcoming"|"live"|"final",
//                        liveHole, fedexEligible, isChampionship, order }
//   matches           — { roundId, label, isTeam, redPlayerIds:[],
//                        bluePlayerIds:[], redRosterLabel, blueRosterLabel,
//                        redPts, bluePts, order }
//   roundResults      — { roundId, playerId, net, status:"pending"|"confirmed" }
//                        Admin-entered rows (via the Admin Portal's editable
//                        table) are always saved as "confirmed". Golfer
//                        Portal submissions save as "pending" until an admin
//                        approves them — see 02-New-Dashboard-Plan.md §6.1.
//   sideActionRounds  — { roundId, potDetail, ctpHoles:[{hole,yds,par}],
//                        ldHole:{hole,yds,par}|null, noSkins }
//   ctpResults        — { roundId, hole, playerId, sponsor, status:"pending"|"confirmed" }
//   longDriveResults  — { roundId, playerId, yds, dist, status:"pending"|"confirmed" }
//                        Same pending/confirmed convention as roundResults —
//                        golfer self-report (plan §6.3), admin-entered = confirmed.
//   skinsResults      — { roundId, playerId, count, payout }
//                        Admin-only — the plan does not call for golfer
//                        self-report on skins (harder to self-adjudicate),
//                        so there's no pending/confirmed status here.
//   sideBets          — { roundId|null, type, description, stake, createdBy,
//                        participants:[playerId], status:"open"|"settled"|"void",
//                        winnerId, createdAt, settledAt }. Golfer-created and
//                        golfer-settled (plan §6.2) — always public, no
//                        pending/confirmed gate.
//   tripDays          — { date:"YYYY-MM-DD", dayNum, dayName, location,
//                        course, lat, lon, triadHours }. Auto-id doc with
//                        `date` as a normal field (not the doc id) — keeps
//                        this collection editable through the same
//                        generic add/edit/delete table as everything else.
//   scheduleItems     — { date, time, icon, label, detail, kind, order }
//                        `date` here matches a tripDays doc's `date` field.
// ═══════════════════════════════════════════════

import { FIREBASE_IS_CONFIGURED } from './firebase-config.js';
import { localCollection, localSeedIfEmpty } from './local-store.js';
import { firestoreCollection } from './firestore-store.js';
import { SEED } from './seed-data.js';

export const mode = FIREBASE_IS_CONFIGURED ? 'firestore' : 'local';

export function col(path) {
  return mode === 'firestore' ? firestoreCollection(path) : localCollection(path);
}

// Named accessors — use these from section code instead of raw col('...')
// so a typo'd path can't silently create a stray collection.
export const players = () => col('players');
export const playerHandicapHistory = (playerId) => col(`players/${playerId}/handicapHistory`);
export const teams = () => col('teams');
export const settings = () => col('settings');
export const rounds = () => col('rounds');
export const matches = () => col('matches');
export const roundResults = () => col('roundResults');
export const sideActionRounds = () => col('sideActionRounds');
export const ctpResults = () => col('ctpResults');
export const longDriveResults = () => col('longDriveResults');
export const skinsResults = () => col('skinsResults');
export const tripDays = () => col('tripDays');
export const scheduleItems = () => col('scheduleItems');
export const sideBets = () => col('sideBets');

// One-off read built on top of onChange — resolves with the current list
// once, then unsubscribes. Handy for populating a <select> before a
// section finishes its own realtime render.
//
// local-store's onChange fires synchronously (immediately, within the
// onChange() call itself), so `unsub` would still be mid-assignment the
// first time this callback runs — calling it directly would throw a
// "Cannot access 'unsub' before initialization" ReferenceError. Worse,
// since notify() loops over all subscribers for a path and a throw
// aborts that loop, a broken callback here would silently stop every
// *other* subscriber on the same collection from being notified too.
// Deferring the unsubscribe to a microtask sidesteps this for both the
// synchronous (local) and asynchronous (Firestore) cases.
export function once(collection) {
  return new Promise((resolve) => {
    let unsub;
    let settled = false;
    unsub = collection.onChange((docs) => {
      if (settled) return;
      settled = true;
      resolve(docs);
      queueMicrotask(() => unsub && unsub());
    });
  });
}

// Seeds every collection listed in shared/seed-data.js, but only in local
// mode, and only for collections that are currently empty — never runs
// against a real Firestore project, never overwrites existing data.
export async function seedLocalIfEmpty() {
  if (mode !== 'local') return;
  for (const [path, docs] of Object.entries(SEED)) {
    localSeedIfEmpty(path, docs);
  }
}

async function deleteAllDocs(collection) {
  const docs = await once(collection);
  await Promise.all(docs.map(d => collection.remove(d.id)));
}

// Wipes every trip-specific document — used by the Admin Portal's "Reset
// Trip Data" danger-zone action (Roster & Settings tab) so an organizer
// can clear a test run, or start clean for next year's trip, without
// touching the Firebase console. Deletes players' handicapHistory
// subcollections first (they're only reachable per-player), then every
// top-level collection. Nothing about the trip survives this — including
// settings/teams — by design, since "reset" means a genuinely blank slate.
export async function resetAllTripData() {
  const playersDocs = await once(players());
  await Promise.all(playersDocs.map(p => deleteAllDocs(playerHandicapHistory(p.id))));

  const allCollections = [
    players(), teams(), settings(), rounds(), matches(), roundResults(),
    sideActionRounds(), ctpResults(), longDriveResults(), skinsResults(),
    sideBets(), tripDays(), scheduleItems(),
  ];
  for (const collection of allCollections) {
    await deleteAllDocs(collection);
  }
}
