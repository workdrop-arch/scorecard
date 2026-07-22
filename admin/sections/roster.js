// ═══════════════════════════════════════════════
// ROSTER & SETTINGS — 02-New-Dashboard-Plan.md §5.1
//   - Add/edit/remove players (name, team, captain flag, rookie flag), editable anytime.
//   - Set team names.
//   - Set trip metadata: hero title, date range.
//   - Defending-champion name field (starts empty — see plan's Decisions log, year one omits the badge).
// ═══════════════════════════════════════════════

import { players, teams, settings, resetAllTripData } from '../../shared/data-store.js';
import { createEditableTable } from '../components/editable-table.js';
import { showToast, sectionHeader, playerLabel, escapeHtml } from '../ui-helpers.js';

const TEAM_OPTIONS = [
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
];

export async function renderRoster(mount) {
  mount.innerHTML = `
    <div class="subsection" id="ros-settings"></div>
    <div class="subsection" id="ros-teams"></div>
    <div class="subsection" id="ros-players"></div>
    <div class="subsection" id="ros-danger"></div>
  `;

  const disposers = [
    renderTripSettings(mount.querySelector('#ros-settings')),
    renderTeamNames(mount.querySelector('#ros-teams')),
    renderPlayersTable(mount.querySelector('#ros-players')),
    renderDangerZone(mount.querySelector('#ros-danger')),
  ];

  return () => disposers.forEach(d => d && d());
}

// ── Trip metadata + defending champion ──────────────────────────────
function renderTripSettings(mount) {
  mount.innerHTML = sectionHeader('Trip Settings', 'Hero title, date range, and the defending-champion badge (leave blank in year one).') +
    `<form class="settings-form" id="trip-settings-form">
      <div class="field">
        <label>Hero title</label>
        <input type="text" name="heroTitle" placeholder="e.g. Carleton Place 2027" />
      </div>
      <div class="field">
        <label>Date range label</label>
        <input type="text" name="tripDateLabel" placeholder="e.g. June 1–4, 2027" />
      </div>
      <div class="field">
        <label>Defending champion (optional)</label>
        <input type="text" name="defendingChampionName" placeholder="Leave blank if there is no prior champion" />
        <div class="hint">Gets a ★ badge everywhere their name appears on the dashboard.</div>
      </div>
      <div>
        <button type="submit" class="btn primary small">Save trip settings</button>
      </div>
    </form>`;

  const form = mount.querySelector('#trip-settings-form');
  const col = settings();

  const unsubscribe = col.onChange((docs) => {
    // No `if (!trip) return` guard here on purpose: a missing doc must
    // still clear the form back to blank (e.g. after Danger Zone → Reset
    // All Trip Data deletes it) — treating "missing" as "empty object"
    // makes that the same code path as "never configured yet."
    const trip = docs.find(d => d.id === 'trip') || {};
    if (document.activeElement && form.contains(document.activeElement)) return; // don't clobber while typing
    form.heroTitle.value = trip.heroTitle || '';
    form.tripDateLabel.value = trip.tripDateLabel || '';
    form.defendingChampionName.value = trip.defendingChampionName || '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await col.set('trip', {
        heroTitle: form.heroTitle.value.trim(),
        tripDateLabel: form.tripDateLabel.value.trim(),
        defendingChampionName: form.defendingChampionName.value.trim(),
      });
      showToast('Trip settings saved.');
    } catch (err) {
      console.error('[roster] trip settings save failed', err);
      showToast('Save failed — see console.', 'error');
    }
  });

  return unsubscribe;
}

// ── Team names + captains ────────────────────────────────────────────
function renderTeamNames(mount) {
  mount.innerHTML = sectionHeader('Team Names', 'Applies to the Ryder Cup tab’s two sides.') +
    `<div class="form-row">
      <div id="team-form-red"></div>
      <div id="team-form-blue"></div>
    </div>`;

  const disposeRed = renderOneTeamForm(mount.querySelector('#team-form-red'), 'red');
  const disposeBlue = renderOneTeamForm(mount.querySelector('#team-form-blue'), 'blue');
  return () => { disposeRed(); disposeBlue(); };
}

function renderOneTeamForm(mount, teamId) {
  mount.innerHTML = `
    <form class="settings-form" data-team-form="${teamId}">
      <div class="field">
        <label>${teamId === 'red' ? 'Red' : 'Blue'} team name</label>
        <input type="text" name="name" />
      </div>
      <div class="field">
        <label>Captain</label>
        <select name="captainId"><option value="">— none set —</option></select>
      </div>
      <div><button type="submit" class="btn small primary">Save</button></div>
    </form>`;

  const form = mount.querySelector('form');
  const teamsCol = teams();
  const playersCol = players();

  const unsubTeams = teamsCol.onChange((docs) => {
    // Same reasoning as the trip settings form above: missing doc must
    // still clear the fields, not leave stale values on screen.
    const t = docs.find(d => d.id === teamId) || {};
    if (document.activeElement && form.contains(document.activeElement)) return;
    form.name.value = t.name || '';
    form.captainId.value = t.captainId || '';
  });

  const unsubPlayers = playersCol.onChange((docs) => {
    const teamPlayers = docs.filter(p => p.team === teamId);
    const current = form.captainId.value;
    form.captainId.innerHTML = '<option value="">— none set —</option>' +
      teamPlayers.map(p => `<option value="${p.id}">${escapeHtml(playerLabel(p))}</option>`).join('');
    form.captainId.value = current;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await teamsCol.set(teamId, { name: form.name.value.trim(), captainId: form.captainId.value });
      showToast('Team saved.');
    } catch (err) {
      console.error('[roster] team save failed', err);
      showToast('Save failed — see console.', 'error');
    }
  });

  return () => { unsubTeams(); unsubPlayers(); };
}

// ── Players CRUD table ───────────────────────────────────────────────
function renderPlayersTable(mount) {
  mount.innerHTML = sectionHeader('Players', 'Team assignment shown as Red/Blue here — custom team names appear on the public dashboard.') +
    `<div id="players-table"></div>`;

  const table = createEditableTable({
    mount: mount.querySelector('#players-table'),
    collection: players(),
    columns: [
      { key: 'first', label: 'First', type: 'text', required: true },
      { key: 'last', label: 'Last', type: 'text', required: true },
      {
        key: 'team', label: 'Team', type: 'select', raw: true,
        options: () => TEAM_OPTIONS,
        format: (value) => `<span class="team-dot ${value}"></span>${value === 'red' ? 'Red' : 'Blue'}`,
      },
      { key: 'captain', label: 'Captain', type: 'checkbox' },
      { key: 'rookie', label: 'Rookie', type: 'checkbox' },
    ],
    defaultNew: { first: '', last: '', team: 'red', captain: false, rookie: false },
    emptyText: 'No players yet — add the roster below.',
    validate: (row) => {
      if (!row.first?.trim() || !row.last?.trim()) return 'First and last name are required.';
      return null;
    },
  });

  return table.destroy;
}

// ── Danger zone: reset all trip data ─────────────────────────────────
// One-way action — clears every collection (roster, teams, rounds,
// matches, results, side action, side bets, schedule, and trip
// settings). Used to clear out a test run before the real trip, or to
// blank the slate for reusing this same project next year. Gated behind
// a typed confirmation (not just a native confirm()) since this is a
// genuine point-of-no-return against the live shared project.
const RESET_CONFIRM_PHRASE = 'RESET';

function renderDangerZone(mount) {
  let confirming = false;
  let resetting = false;

  function render() {
    mount.innerHTML = sectionHeader('Danger Zone', 'Permanently clears every player, round, match, result, side bet, and trip setting — for wiping out test data or starting fresh for a new trip.') +
      (confirming ? `
        <div class="card" style="border-color:rgba(232,128,90,0.4)">
          <div style="color:var(--warn);font-weight:600;font-size:0.85rem;margin-bottom:0.5rem">This cannot be undone.</div>
          <div class="hint" style="margin-bottom:0.75rem">Every collection in the live project will be permanently deleted — roster, rounds, matches, results, side action, side bets, schedule, and trip settings. Type <strong style="color:var(--text)">${RESET_CONFIRM_PHRASE}</strong> to confirm.</div>
          <div class="field" style="max-width:280px;margin-bottom:0.75rem">
            <input type="text" id="reset-confirm-input" autocomplete="off" placeholder="${RESET_CONFIRM_PHRASE}" />
          </div>
          <div style="display:flex;gap:0.5rem">
            <button type="button" class="btn danger small" id="reset-confirm-btn" disabled ${resetting ? 'disabled' : ''}>${resetting ? 'Resetting…' : 'Permanently delete everything'}</button>
            <button type="button" class="btn ghost small" id="reset-cancel-btn" ${resetting ? 'disabled' : ''}>Cancel</button>
          </div>
        </div>`
      : `<button type="button" class="btn danger small" id="reset-start-btn">Reset all trip data</button>`);

    if (!confirming) {
      mount.querySelector('#reset-start-btn').addEventListener('click', () => { confirming = true; render(); });
      return;
    }

    const input = mount.querySelector('#reset-confirm-input');
    const confirmBtn = mount.querySelector('#reset-confirm-btn');
    input.addEventListener('input', () => { confirmBtn.disabled = input.value !== RESET_CONFIRM_PHRASE; });
    mount.querySelector('#reset-cancel-btn').addEventListener('click', () => { confirming = false; render(); });
    confirmBtn.addEventListener('click', async () => {
      if (input.value !== RESET_CONFIRM_PHRASE || resetting) return;
      resetting = true;
      render();
      try {
        await resetAllTripData();
        showToast('All trip data has been reset.');
        confirming = false;
      } catch (err) {
        console.error('[roster] reset failed', err);
        showToast('Reset failed partway through — see console.', 'error');
      } finally {
        resetting = false;
        render();
      }
    });
  }

  render();
  return () => {};
}
