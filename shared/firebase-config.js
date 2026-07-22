// ═══════════════════════════════════════════════
// FIREBASE CONFIG — fill this in with your own project's values.
//
// How to get these values:
//   1. Go to https://console.firebase.google.com → create a project (free).
//   2. In the project, click the "</>" (web app) icon to register a web app.
//   3. Firebase shows you a config object — copy those values in below.
//   4. Firestore Database → create database (start in production mode).
//      Then Firestore Database → Rules → paste in the contents of
//      firestore.rules (repo root) and Publish.
//   5. Authentication → Sign-in method → enable BOTH "Email/Password"
//      (for the admin) and "Anonymous" (for golfers — see
//      shared/golfer-auth.js and GOLFER_TRIP_PASSCODE below).
//   6. Authentication → Users → Add user → create the one admin login
//      (email + password) — this is who signs into the Admin Portal.
//
// Until this is filled in, every app in this project (dashboard, admin,
// golfer portal) automatically falls back to LOCAL MODE: a fake in-browser
// database (localStorage-backed) with a dev-only passcode login, so you can
// build/demo/test everything without a real Firebase project yet. Nothing
// breaks by leaving this as placeholders — see shared/data-store.js and
// shared/auth.js for how the fallback works.
// ═══════════════════════════════════════════════

export const firebaseConfig = {
  apiKey: "AIzaSyCPjmnchCztZGGRQwoxFygVBSaUIa53UiM",
  authDomain: "cp-scoreboard.firebaseapp.com",
  projectId: "cp-scoreboard",
  storageBucket: "cp-scoreboard.firebasestorage.app",
  messagingSenderId: "217988962692",
  appId: "1:217988962692:web:c2ffd009e831a30d65a5d1",
};

// True once apiKey has been replaced with a real value. Everything in
// shared/data-store.js and shared/auth.js keys off this single flag.
export const FIREBASE_IS_CONFIGURED = firebaseConfig.apiKey !== "YOUR_API_KEY";

// Local-mode-only admin passcode (see shared/auth.js). Change this to
// anything you like — it only matters before a real Firebase project
// with real Auth users exists. Never used once FIREBASE_IS_CONFIGURED is true.
export const LOCAL_ADMIN_PASSCODE = "admin";

// Golfer Portal passcode (see shared/golfer-auth.js) — shared once with the
// whole group at trip kickoff, per 02-New-Dashboard-Plan.md §6 ("Access").
// Unlike LOCAL_ADMIN_PASSCODE, this ONE stays in use even once a real
// Firebase project is configured: the plan deliberately calls for a
// lightweight shared-passcode model for golfers rather than real per-player
// accounts (see plan §8, non-goals). In firestore mode, entering it
// additionally signs the browser in via Firebase Anonymous Auth, so
// Firestore security rules can still require "must be authenticated" on
// writes — the passcode itself is a convenience gate, not the real security
// boundary; write access should still be scoped in your Firestore rules.
export const GOLFER_TRIP_PASSCODE = "golf";
