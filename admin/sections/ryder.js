// ═══════════════════════════════════════════════
// RYDER CUP — 02-New-Dashboard-Plan.md §5.2
//   - Add/edit/remove a round (day #, session, course, format, detail,
//     points available, status, live-hole text). No fixed round count —
//     admin builds the schedule out as it's finalized.
//   - Add/edit a match within a round: assign players to red/blue, mark
//     team-format vs individual, enter/adjust redPts/bluePts.
// ═══════════════════════════════════════════════

import { rounds, matches, players } from '../../shared/data-store.js';
import { createEditableTable } from '../components/editable-table.js';
import { sectionHeader, playerLabel, escapeHtml } from '../ui-helpers.js';

const SESSION_OPTIONS = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
const STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'live', label: 'Live' },
  { value: 'final', label: 'Final' },
];
const num = (v) => (v === '' || v == null ? 0 : Number(v));

export async function renderRyder(mount) {
  mount.innerHTML = `
    <div class="subsection" id="ryder-rounds"></div>
    <div class="subsection" id="ryder-matches"></div>
  `;

  let playersCache = [];
  let currentMatchesTable = null;

  const unsubPlayers = players().onChange((docs) => {
    playersCache = docs;
    if (currentMatchesTable) currentMatchesTable.refresh();
  });

  const roundsTable = renderRoundsTable(mount.querySelector('#ryder-rounds'));
  const disposeMatches = renderMatchesSection(mount.querySelector('#ryder-matches'), {
    getPlayers: () => playersCache,
    onTableCreated: (table) => { currentMatchesTable = table; },
  });

  return () => {
    unsubPlayers();
    roundsTable.destroy();
    disposeMatches();
  };
}

// ── Rounds table ──────────────────────────────────────────────────────
function renderRoundsTable(mount) {
  mount.innerHTML = sectionHeader(
    'Rounds',
    'Every day/session/format for the trip. "FedEx eligible" feeds the Carleton Place Cup points race; "Championship" marks the final strokeplay round.'
  ) + `<div id="rounds-table"></div>`;

  return createEditableTable({
    mount: mount.querySelector('#rounds-table'),
    collection: rounds(),
    columns: [
      { key: 'day', label: 'Day', type: 'number', parse: num },
      { key: 'session', label: 'Session', type: 'select', options: () => SESSION_OPTIONS },
      { key: 'course', label: 'Course', type: 'text' },
      { key: 'format', label: 'Format', type: 'text' },
      { key: 'detail', label: 'Detail', type: 'text' },
      { key: 'pointsAvail', label: 'Points', type: 'number', parse: num },
      {
        key: 'status', label: 'Status', type: 'select', raw: true,
        options: () => STATUS_OPTIONS,
        format: (v) => `<span class="status-pill ${v}">${STATUS_OPTIONS.find(o => o.value === v)?.label ?? v}</span>`,
      },
      { key: 'liveHole', label: 'Live hole note', type: 'text' },
      { key: 'fedexEligible', label: 'FedEx eligible', type: 'checkbox' },
      { key: 'isChampionship', label: 'Championship', type: 'checkbox' },
      { key: 'order', label: 'Order', type: 'number', parse: num },
    ],
    defaultNew: {
      day: 1, session: 'AM', course: '', format: '', detail: '',
      pointsAvail: 4, status: 'upcoming', liveHole: '',
      fedexEligible: true, isChampionship: false, order: 1,
    },
    emptyText: 'No rounds yet — add the trip schedule below.',
    validate: (row) => (!row.format?.trim() ? 'Format name is required.' : null),
  });
}

// ── Matches, scoped to one selected round ────────────────────────────
function renderMatchesSection(mount, { getPlayers, onTableCreated }) {
  mount.innerHTML = sectionHeader('Matches', 'Pick a round, then manage its matches.') +
    `<div class="field" style="max-width:420px;margin-bottom:0.9rem">
      <label>Round</label>
      <select id="match-round-select"><option value="">— add rounds above first —</option></select>
    </div>
    <div id="matches-table-mount"></div>`;

  const select = mount.querySelector('#match-round-select');
  const tableMount = mount.querySelector('#matches-table-mount');
  let currentTable = null;
  let roundsCache = [];

  function roundLabel(r) {
    return `Day ${r.day} ${r.session} — ${escapeHtml(r.format || 'Untitled')}`;
  }

  function mountTableFor(roundId) {
    if (currentTable) currentTable.destroy();
    if (!roundId) { tableMount.innerHTML = ''; currentTable = null; return; }

    const redOptions = () => getPlayers().filter(p => p.team === 'red').map(p => ({ value: p.id, label: playerLabel(p) }));
    const blueOptions = () => getPlayers().filter(p => p.team === 'blue').map(p => ({ value: p.id, label: playerLabel(p) }));
    const nameFor = (id) => { const p = getPlayers().find(p => p.id === id); return p ? playerLabel(p) : id; };

    currentTable = createEditableTable({
      mount: tableMount,
      collection: matches(),
      fixedFields: { roundId },
      filter: (docs) => docs.filter(d => d.roundId === roundId),
      columns: [
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'isTeam', label: 'Team fmt.', type: 'checkbox' },
        { key: 'redRosterLabel', label: 'Red roster label', type: 'text' },
        {
          key: 'redPlayerIds', label: 'Red players', type: 'multiselect',
          options: redOptions, format: (ids) => (ids || []).map(nameFor).join(', ') || '—',
        },
        { key: 'blueRosterLabel', label: 'Blue roster label', type: 'text' },
        {
          key: 'bluePlayerIds', label: 'Blue players', type: 'multiselect',
          options: blueOptions, format: (ids) => (ids || []).map(nameFor).join(', ') || '—',
        },
        { key: 'redPts', label: 'Red pts', type: 'number', step: '0.5', parse: num },
        { key: 'bluePts', label: 'Blue pts', type: 'number', step: '0.5', parse: num },
        { key: 'order', label: 'Order', type: 'number', parse: num },
      ],
      defaultNew: {
        label: '', isTeam: false, redRosterLabel: '', blueRosterLabel: '',
        redPlayerIds: [], bluePlayerIds: [], redPts: 0, bluePts: 0, order: 1,
      },
      emptyText: 'No matches in this round yet.',
    });
    onTableCreated(currentTable);
  }

  const unsubRounds = rounds().onChange((docs) => {
    roundsCache = [...docs].sort((a, b) => (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1) || (a.order - b.order));
    const prevValue = select.value;
    select.innerHTML = roundsCache.length
      ? roundsCache.map(r => `<option value="${r.id}">${roundLabel(r)}</option>`).join('')
      : '<option value="">— add rounds above first —</option>';
    const stillExists = roundsCache.some(r => r.id === prevValue);
    select.value = stillExists ? prevValue : (roundsCache[0]?.id || '');
    mountTableFor(select.value);
  });

  select.addEventListener('change', () => mountTableFor(select.value));

  return () => {
    unsubRounds();
    if (currentTable) currentTable.destroy();
  };
}
