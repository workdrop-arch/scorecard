// ═══════════════════════════════════════════════
// ADMIN APP BOOTSTRAP — auth gate + tab navigation + section mounting.
// See 02-New-Dashboard-Plan.md §5 for the section spec.
// ═══════════════════════════════════════════════

import { authMode, onAuthChange, signIn, signOutUser } from '../shared/auth.js';
import { mode as dataMode, seedLocalIfEmpty, settings } from '../shared/data-store.js';
import { renderRoster } from './sections/roster.js';
import { renderRyder } from './sections/ryder.js';
import { renderCarletonPlace } from './sections/carletonPlace.js';
import { renderSideAction } from './sections/sideAction.js';
import { renderSchedule } from './sections/schedule.js';

const TABS = [
  { id: 'roster', label: 'Roster & Settings', render: renderRoster },
  { id: 'ryder', label: 'Ryder Cup', render: renderRyder },
  { id: 'cpc', label: 'Carleton Place Cup', render: renderCarletonPlace },
  { id: 'side', label: 'Side Action', render: renderSideAction },
  { id: 'schedule', label: 'Schedule / Weather', render: renderSchedule },
];

const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const modeBadge = document.getElementById('mode-badge');
const modeTag = document.getElementById('mode-tag');
const tabNav = document.getElementById('tab-nav');
const sectionContent = document.getElementById('section-content');
const signOutBtn = document.getElementById('sign-out-btn');
const loginTripName = document.getElementById('login-trip-name');
const brandTitle = document.getElementById('brand-title');

// ── Mode indicators ──────────────────────────────────────────────────
modeBadge.textContent = authMode === 'local'
  ? 'Local dev mode — passcode login, data stored only in this browser.'
  : 'Connected to Firebase.';
modeTag.textContent = dataMode === 'local' ? 'LOCAL' : 'LIVE';

// ── Shared trip config — same settings/trip doc the dashboard and
// golfer portal both read, so all three surfaces agree on the trip name.
// Subscribed before auth (like the golfer portal's roster dropdown)
// since seeing which trip you're about to sign into is part of login.
seedLocalIfEmpty().then(() => {
  settings().onChange((docs) => {
    const trip = docs.find(d => d.id === 'trip');
    const name = trip?.heroTitle?.trim();
    document.title = name ? `${name} — Admin` : 'Admin — Trip Dashboard';
    loginTripName.textContent = name || '';
    brandTitle.textContent = name || 'Admin Portal';
  });
});

// ── Login form (shape depends on authMode) ──────────────────────────
loginForm.innerHTML = authMode === 'local'
  ? `<div class="field"><label>Passcode</label><input type="password" name="passcode" autocomplete="off" /></div>
     <button type="submit" class="btn primary">Sign in</button>`
  : `<div class="field"><label>Email</label><input type="email" name="email" autocomplete="username" /></div>
     <div class="field"><label>Password</label><input type="password" name="password" autocomplete="current-password" /></div>
     <button type="submit" class="btn primary">Sign in</button>`;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const credentials = authMode === 'local'
    ? { passcode: loginForm.passcode.value }
    : { email: loginForm.email.value.trim(), password: loginForm.password.value };
  try {
    await signIn(credentials);
  } catch (err) {
    console.error('[admin] sign-in failed', err);
    loginError.textContent = err.message || 'Sign-in failed.';
  }
});

signOutBtn.addEventListener('click', () => signOutUser());

// ── Tab navigation ───────────────────────────────────────────────────
let currentDispose = null;
let activeTabId = TABS[0].id;

tabNav.innerHTML = TABS.map(t => `<button type="button" data-tab="${t.id}">${t.label}</button>`).join('');
tabNav.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));

async function selectTab(tabId) {
  activeTabId = tabId;
  tabNav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  if (currentDispose) { currentDispose(); currentDispose = null; }
  sectionContent.innerHTML = '';
  const tab = TABS.find(t => t.id === tabId);
  currentDispose = await tab.render(sectionContent);
}

// ── Auth gate ─────────────────────────────────────────────────────────
let booted = false;

onAuthChange(async (user) => {
  if (user) {
    loginScreen.hidden = true;
    appShell.hidden = false;
    if (!booted) {
      booted = true;
      await seedLocalIfEmpty();
      await selectTab(activeTabId);
    }
  } else {
    loginScreen.hidden = false;
    appShell.hidden = true;
    if (currentDispose) { currentDispose(); currentDispose = null; }
    booted = false;
  }
});
