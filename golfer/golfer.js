// ═══════════════════════════════════════════════
// GOLFER APP BOOTSTRAP — roster-dropdown + passcode login, tab nav,
// section mounting. See 02-New-Dashboard-Plan.md §6 for the spec.
// ═══════════════════════════════════════════════

import { golferAuthMode, onGolferSessionChange, golferSignIn, golferSignOut } from '../shared/golfer-auth.js';
import { seedLocalIfEmpty, players, settings } from '../shared/data-store.js';
import { renderMyRound } from './sections/myRound.js';
import { renderSideBets } from './sections/sideBets.js';
import { renderCtpLongDrive } from './sections/ctpLongDrive.js';
import { playerLabel, escapeHtml } from './ui-helpers.js';

const TABS = [
  { id: 'myround', label: 'My Round', render: renderMyRound },
  { id: 'bets', label: 'Side Bets', render: renderSideBets },
  { id: 'ctpld', label: 'CTP / Long Drive', render: renderCtpLongDrive },
];

const loginScreen = document.getElementById('login-screen');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const loginPlayerSelect = document.getElementById('login-player-select');
const loginError = document.getElementById('login-error');
const modeBadge = document.getElementById('mode-badge');
const whoAmI = document.getElementById('who-am-i');
const tabNav = document.getElementById('tab-nav');
const sectionContent = document.getElementById('section-content');
const signOutBtn = document.getElementById('sign-out-btn');
const loginTripName = document.getElementById('login-trip-name');
const brandTitle = document.getElementById('brand-title');

modeBadge.textContent = golferAuthMode === 'local'
  ? 'Local dev mode — shared passcode, data stored only in this browser.'
  : 'Connected to Firebase.';

// Roster dropdown + shared trip name both populate immediately, independent
// of sign-in state — picking who you are, and seeing which trip you're
// about to check into, are both part of the login step itself. Same
// settings/trip doc the Admin Portal and public dashboard read, so all
// three surfaces agree on the trip name.
seedLocalIfEmpty().then(() => {
  players().onChange((docs) => {
    const sorted = [...docs].sort((a, b) => playerLabel(a).localeCompare(playerLabel(b)));
    loginPlayerSelect.innerHTML = sorted.length
      ? sorted.map(p => `<option value="${p.id}" data-name="${escapeHtml(playerLabel(p))}">${escapeHtml(playerLabel(p))}</option>`).join('')
      : '<option value="">— no roster yet, ask your admin —</option>';
  });
  settings().onChange((docs) => {
    const trip = docs.find(d => d.id === 'trip');
    const name = trip?.heroTitle?.trim();
    document.title = name ? `${name} — Golfer` : 'Golfer — Trip Dashboard';
    loginTripName.textContent = name || '';
    brandTitle.textContent = name || 'Golfer Portal';
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const playerId = loginForm.playerId.value;
  const playerName = loginForm.playerId.selectedOptions[0]?.dataset.name || '';
  try {
    await golferSignIn({ passcode: loginForm.passcode.value, playerId, playerName });
  } catch (err) {
    console.error('[golfer] sign-in failed', err);
    loginError.textContent = err.message || 'Sign-in failed.';
  }
});

signOutBtn.addEventListener('click', () => golferSignOut());

let currentDispose = null;
let activeTabId = TABS[0].id;
let currentSession = null;

tabNav.innerHTML = TABS.map(t => `<button type="button" data-tab="${t.id}">${t.label}</button>`).join('');
tabNav.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => selectTab(btn.dataset.tab)));

async function selectTab(tabId) {
  activeTabId = tabId;
  tabNav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  if (currentDispose) { currentDispose(); currentDispose = null; }
  sectionContent.innerHTML = '';
  const tab = TABS.find(t => t.id === tabId);
  currentDispose = await tab.render(sectionContent, currentSession);
}

let booted = false;

onGolferSessionChange(async (session) => {
  currentSession = session;
  if (session) {
    loginScreen.hidden = true;
    appShell.hidden = false;
    whoAmI.textContent = session.playerName;
    if (!booted) {
      booted = true;
      await selectTab(activeTabId);
    }
  } else {
    loginScreen.hidden = false;
    appShell.hidden = true;
    if (currentDispose) { currentDispose(); currentDispose = null; }
    booted = false;
  }
});
