// ═══════════════════════════════════════════════
// CARLETON PLACE CUP — 02-New-Dashboard-Plan.md §5.3
//   - Manage each FedEx-eligible/championship round's net-score results per player.
//   - Toggle showLeaderboard.
//   - Set/override the championship winner.
//   - Manage handicap checkpoints per player.
//
// Rounds themselves (including the FedEx-eligible and Championship flags)
// are managed once, in the Ryder Cup tab's Rounds table — this section
// reuses those same round docs rather than duplicating round CRUD here.
//
// FedEx totals: matches the old file's model (Analysis §10 — `fedex.players[].total`
// was a flat, manually-computed best-3-of-5 number, not derived in the browser).
// The admin types each player's total directly here; rank + starting strokes
// are then computed live from that total using the exact table from the
// legend in 01-Current-Dashboard-Analysis.md §5: 1st = -3, 2nd–3rd = -2,
// 4th–6th = -1, 7th+ = even.
// ═══════════════════════════════════════════════

import { rounds, roundResults, players, settings, playerHandicapHistory } from '../../shared/data-store.js';
import { createEditableTable } from '../components/editable-table.js';
import { sectionHeader, showToast, playerLabel, statusColumn, approveRowActions, escapeHtml } from '../ui-helpers.js';

const num = (v) => (v === '' || v == null ? 0 : Number(v));

export async function renderCarletonPlace(mount) {
  mount.innerHTML = `
    <div class="subsection" id="cpc-results"></div>
    <div class="subsection" id="cpc-totals"></div>
    <div class="subsection" id="cpc-championship"></div>
    <div class="subsection" id="cpc-handicaps"></div>
  `;

  const disposers = [
    renderRoundResults(mount.querySelector('#cpc-results')),
    renderFedexTotals(mount.querySelector('#cpc-totals')),
    renderChampionship(mount.querySelector('#cpc-championship')),
    renderHandicaps(mount.querySelector('#cpc-handicaps')),
  ];

  return () => disposers.forEach(d => d && d());
}

function startingStrokes(rank) {
  if (rank === 1) return -3;
  if (rank <= 3) return -2;
  if (rank <= 6) return -1;
  return 0;
}

function fedexEligibleOrChampionship(list) {
  return list.filter(r => r.fedexEligible || r.isChampionship);
}

// ── Round-by-round net results ───────────────────────────────────────
function renderRoundResults(mount) {
  mount.innerHTML = sectionHeader(
    'Round Net Results',
    'Only rounds flagged "FedEx eligible" or "Championship" (set in the Ryder Cup tab) show up here. Rows submitted from the Golfer Portal appear Pending until approved.'
  ) + `<div class="field" style="max-width:420px;margin-bottom:0.9rem">
      <label>Round</label>
      <select id="cpc-round-select"><option value="">— no eligible rounds yet —</option></select>
    </div>
    <div id="cpc-results-table-mount"></div>`;

  const select = mount.querySelector('#cpc-round-select');
  const tableMount = mount.querySelector('#cpc-results-table-mount');
  let currentTable = null;
  let playersCache = [];

  const unsubPlayers = players().onChange((docs) => {
    playersCache = docs;
    if (currentTable) currentTable.refresh();
  });

  function roundLabel(r) {
    return `Day ${r.day} ${r.session} — ${escapeHtml(r.format || 'Untitled')}${r.isChampionship ? ' (Championship)' : ''}`;
  }

  function mountTableFor(roundId) {
    if (currentTable) currentTable.destroy();
    if (!roundId) { tableMount.innerHTML = ''; currentTable = null; return; }
    const playerOptions = () => playersCache.map(p => ({ value: p.id, label: playerLabel(p) }));
    const nameFor = (id) => { const p = playersCache.find(p => p.id === id); return p ? playerLabel(p) : id; };

    const resultsCol = roundResults();
    currentTable = createEditableTable({
      mount: tableMount,
      collection: resultsCol,
      fixedFields: { roundId, status: 'confirmed' }, // any admin add/edit auto-confirms the row
      filter: (docs) => docs.filter(d => d.roundId === roundId),
      columns: [
        { key: 'playerId', label: 'Player', type: 'select', options: playerOptions, format: nameFor },
        { key: 'net', label: 'Net', type: 'number', parse: num },
        statusColumn(),
      ],
      defaultNew: { playerId: playersCache[0]?.id || '', net: 0, status: 'confirmed' },
      emptyText: 'No results entered for this round yet.',
      validate: (row) => (!row.playerId ? 'Pick a player.' : null),
      rowActions: approveRowActions(resultsCol),
    });
  }

  const unsubRounds = rounds().onChange((docs) => {
    const eligible = fedexEligibleOrChampionship(docs)
      .sort((a, b) => (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1));
    const prevValue = select.value;
    select.innerHTML = eligible.length
      ? eligible.map(r => `<option value="${r.id}">${roundLabel(r)}</option>`).join('')
      : '<option value="">— no eligible rounds yet —</option>';
    const stillExists = eligible.some(r => r.id === prevValue);
    select.value = stillExists ? prevValue : (eligible[0]?.id || '');
    mountTableFor(select.value);
  });

  select.addEventListener('change', () => mountTableFor(select.value));

  return () => {
    unsubPlayers();
    unsubRounds();
    if (currentTable) currentTable.destroy();
  };
}

// ── FedEx totals + computed rank/strokes + showLeaderboard toggle ──────
function renderFedexTotals(mount) {
  mount.innerHTML = sectionHeader(
    'FedEx Points Totals',
    'Enter each player’s best-3-of-5 total (computed outside the app, same as the old workflow). Rank and starting strokes are computed automatically.'
  ) + `<label class="checkbox-field" style="margin-bottom:0.8rem">
      <input type="checkbox" id="cpc-show-leaderboard" /> Show leaderboard on the public dashboard
    </label>
    <div id="cpc-totals-table"></div>`;

  const toggle = mount.querySelector('#cpc-show-leaderboard');
  const tableMount = mount.querySelector('#cpc-totals-table');
  const settingsCol = settings();
  const playersCol = players();

  const unsubSettings = settingsCol.onChange((docs) => {
    const trip = docs.find(d => d.id === 'trip');
    toggle.checked = !!trip?.cpcShowLeaderboard;
  });
  toggle.addEventListener('change', async () => {
    try {
      await settingsCol.set('trip', { cpcShowLeaderboard: toggle.checked });
      showToast('Saved.');
    } catch (e) {
      console.error('[carletonPlace] toggle save failed', e);
      showToast('Save failed — see console.', 'error');
    }
  });

  const unsubPlayers = playersCol.onChange((docs) => {
    const allZero = docs.every(p => !p.fedexTotal);
    const sorted = [...docs].sort((a, b) => (b.fedexTotal || 0) - (a.fedexTotal || 0));
    let lastTotal = null, lastRank = 0;
    const rankCounts = {};
    sorted.forEach((p, i) => {
      if (p.fedexTotal !== lastTotal) { lastRank = i + 1; lastTotal = p.fedexTotal; }
      p.__rank = lastRank;
      rankCounts[lastRank] = (rankCounts[lastRank] || 0) + 1;
    });

    tableMount.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>Total</th><th>Strokes</th><th class="col-actions"></th></tr></thead>
          <tbody>${sorted.length ? sorted.map(p => {
            const tied = rankCounts[p.__rank] > 1;
            const rankDisp = allZero ? '—' : `${tied ? 'T' : ''}${p.__rank}`;
            const strokes = allZero ? '—' : (startingStrokes(p.__rank) === 0 ? 'E' : startingStrokes(p.__rank));
            return `<tr data-player="${p.id}">
              <td>${rankDisp}</td>
              <td><span class="team-dot ${p.team}"></span>${escapeHtml(playerLabel(p))}</td>
              <td><input type="number" step="0.01" value="${p.fedexTotal || 0}" data-total-input="${p.id}" style="width:5.5rem;background:var(--bg-card-2);border:1px solid var(--border);color:var(--text);border-radius:5px;padding:0.25rem 0.4rem" /></td>
              <td>${strokes}</td>
              <td class="col-actions"><button type="button" class="btn small primary" data-save-total="${p.id}">Save</button></td>
            </tr>`;
          }).join('') : `<tr class="empty-row"><td colspan="5">No players yet — add the roster in Roster &amp; Settings.</td></tr>`}</tbody>
        </table>
      </div>`;

    tableMount.querySelectorAll('[data-save-total]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.saveTotal;
      const input = tableMount.querySelector(`[data-total-input="${id}"]`);
      try {
        await playersCol.update(id, { fedexTotal: Number(input.value) || 0 });
        showToast('Saved.');
      } catch (e) {
        console.error('[carletonPlace] total save failed', e);
        showToast('Save failed — see console.', 'error');
      }
    }));
  });

  return () => { unsubSettings(); unsubPlayers(); };
}

// ── Championship winner ──────────────────────────────────────────────
function renderChampionship(mount) {
  mount.innerHTML = sectionHeader(
    'Championship',
    'Auto-detected from the championship round’s net results below; override only if it ends in a tie.'
  ) + `<div id="cpc-champ-status" class="hint" style="margin-bottom:0.6rem"></div>
    <form class="settings-form" id="cpc-champ-form">
      <div class="field">
        <label>Winner override (optional)</label>
        <input type="text" name="winnerOverride" placeholder="Leave blank to use the auto-detected winner" />
      </div>
      <div><button type="submit" class="btn small primary">Save override</button></div>
    </form>`;

  const statusEl = mount.querySelector('#cpc-champ-status');
  const form = mount.querySelector('#cpc-champ-form');
  const settingsCol = settings();

  let roundsCache = [];
  let resultsCache = [];
  let playersCache = [];

  function recomputeStatus() {
    const champRound = roundsCache.find(r => r.isChampionship);
    if (!champRound) {
      statusEl.textContent = 'No round is flagged "Championship" yet — set that in the Ryder Cup tab.';
      return;
    }
    const results = resultsCache.filter(r => r.roundId === champRound.id);
    if (results.length === 0) {
      statusEl.textContent = `Championship round: ${champRound.format || 'Untitled'} (${champRound.course || 'course TBD'}) — no results entered yet.`;
      return;
    }
    const best = Math.min(...results.map(r => r.net));
    const leaders = results.filter(r => r.net === best);
    const nameFor = (playerId) => { const p = playersCache.find(p => p.id === playerId); return p ? playerLabel(p) : playerId; };
    if (leaders.length === 1) {
      statusEl.textContent = `Auto-detected winner: ${nameFor(leaders[0].playerId)} (net ${best}).`;
    } else {
      statusEl.textContent = `Tied at net ${best} between ${leaders.map(l => nameFor(l.playerId)).join(', ')} — set a winner override below.`;
    }
  }

  const unsubRounds = rounds().onChange((docs) => { roundsCache = docs; recomputeStatus(); });
  const unsubResults = roundResults().onChange((docs) => { resultsCache = docs; recomputeStatus(); });
  const unsubPlayers = players().onChange((docs) => { playersCache = docs; recomputeStatus(); });
  const unsubSettings = settingsCol.onChange((docs) => {
    const trip = docs.find(d => d.id === 'trip');
    if (document.activeElement && form.contains(document.activeElement)) return;
    form.winnerOverride.value = trip?.cpcWinnerOverride || '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await settingsCol.set('trip', { cpcWinnerOverride: form.winnerOverride.value.trim() });
      showToast('Saved.');
    } catch (err) {
      console.error('[carletonPlace] winner override save failed', err);
      showToast('Save failed — see console.', 'error');
    }
  });

  return () => { unsubRounds(); unsubResults(); unsubPlayers(); unsubSettings(); };
}

// ── Handicap trends ───────────────────────────────────────────────────
function renderHandicaps(mount) {
  mount.innerHTML = sectionHeader('Handicap Trends', 'Add a dated checkpoint per player — the dashboard shows the most recent ones.') +
    `<div class="field" style="max-width:420px;margin-bottom:0.9rem">
      <label>Player</label>
      <select id="hcp-player-select"><option value="">— add players first —</option></select>
    </div>
    <div id="hcp-table-mount"></div>`;

  const select = mount.querySelector('#hcp-player-select');
  const tableMount = mount.querySelector('#hcp-table-mount');
  let currentTable = null;

  function mountTableFor(playerId) {
    if (currentTable) currentTable.destroy();
    if (!playerId) { tableMount.innerHTML = ''; currentTable = null; return; }
    currentTable = createEditableTable({
      mount: tableMount,
      collection: playerHandicapHistory(playerId),
      columns: [
        { key: 'date', label: 'Checkpoint label / date', type: 'text' },
        { key: 'value', label: 'Handicap', type: 'number', step: '0.1', parse: num },
      ],
      defaultNew: { date: '', value: 0 },
      emptyText: 'No handicap checkpoints for this player yet.',
      validate: (row) => (!row.date?.trim() ? 'Give this checkpoint a label (e.g. "Jan 2027").' : null),
    });
  }

  const unsubPlayers = players().onChange((docs) => {
    const prevValue = select.value;
    select.innerHTML = docs.length
      ? docs.map(p => `<option value="${p.id}">${escapeHtml(playerLabel(p))}</option>`).join('')
      : '<option value="">— add players first —</option>';
    const stillExists = docs.some(p => p.id === prevValue);
    select.value = stillExists ? prevValue : (docs[0]?.id || '');
    mountTableFor(select.value);
  });

  select.addEventListener('change', () => mountTableFor(select.value));

  return () => {
    unsubPlayers();
    if (currentTable) currentTable.destroy();
  };
}
