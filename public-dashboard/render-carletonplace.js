// ═══════════════════════════════════════════════
// RENDER — CARLETON PLACE CUP TAB
// Ported from the original renderBoyne()/renderHandicapTrends*() (Analysis
// §5–6), renamed and generalized.
//
// Handicap trends generalization: the original had exactly three fixed
// checkpoints (Jan/May/Live) shared by every player. The new admin model
// allows any number of dated checkpoints per player (plan §5.3), so this
// shows up to the 3 most recent checkpoints per player as columns, using
// whichever player has the most checkpoints to label the column headers
// — in practice the admin enters a checkpoint for the whole roster in one
// sitting with one label ("Jan 2027"), so this reliably produces
// consistent headers without hardcoding checkpoint names/dates.
// ═══════════════════════════════════════════════

import { startingStrokes, rankNetResults, nameBadges, championshipWinnerName, escapeHtml } from './helpers.js';

// UI-only state for the Handicap Trends section — mirrors the original's
// module-level hcpSortKey/hcpSortDir/hcpFilter.
let hcpSortKey = 'live';
let hcpSortDir = 'asc';
let hcpFilter = 'all';

const fmtNet = n => (n > 0 ? `+${n}` : n < 0 ? `${n}` : 'E');
const pendingTag = (isPending) => (isPending ? '<span class="pending-tag">Pending</span>' : '');

function renderRoundLeaderboard(state, round) {
  const isFinal = round.status === 'final' && round.results && round.results.length > 0;
  const cls = isFinal ? 'round-block' : 'round-block upcoming';
  let h = `<div class="${cls}">
    <div class="round-block-header">
      <span class="round-block-title">${escapeHtml(round.format)}</span>
      <span class="round-block-course">${escapeHtml(round.course)}</span>
    </div>`;
  if (!isFinal) {
    h += `<div class="round-block-empty">Upcoming</div></div>`;
    return h;
  }
  h += `<table class="fedex-table compact"><tbody>`;
  const ranked = rankNetResults(round.results);
  ranked.forEach(p => {
    const rankCls = p.rank === 1 ? 'rank top' : 'rank';
    const rankDisp = (p.tied ? 'T' : '') + p.rank;
    const badges = nameBadges(state, `${p.first} ${p.last}`, 'md');
    h += `<tr>
      <td class="${rankCls}">${rankDisp}</td>
      <td class="player"><span class="team-dot ${p.team}"></span>${escapeHtml(p.first[0])}. ${escapeHtml(p.last)}${badges}${pendingTag(p.pending)}</td>
      <td class="right total">${fmtNet(p.net)}</td>
    </tr>`;
  });
  h += `</tbody></table></div>`;
  return h;
}

function renderBedSelection(state, irRound) {
  if (!irRound || irRound.status !== 'final' || !irRound.results || irRound.results.length === 0) return '';
  const red = irRound.results.filter(p => p.team === 'red').sort((a, b) => a.net - b.net);
  const blue = irRound.results.filter(p => p.team === 'blue').sort((a, b) => a.net - b.net);
  const renderTeam = (list, teamName, teamCls) => {
    let h = `<div><div class="bed-team-name ${teamCls}">${escapeHtml(teamName)}</div>`;
    list.forEach((p, i) => {
      const badges = nameBadges(state, `${p.first} ${p.last}`, 'sm');
      h += `<div class="bed-row">
        <span class="bed-rank">${i + 1}.</span>
        <span class="bed-name">${escapeHtml(p.first[0])}. ${escapeHtml(p.last)}${badges}</span>
        <span class="bed-net">${fmtNet(p.net)}</span>
      </div>`;
    });
    h += `</div>`;
    return h;
  };
  return `<div class="bed-block">
    <div class="bed-block-title">Bed Pick Order &mdash; ${escapeHtml(irRound.format)} net</div>
    <div class="bed-block-note">Within each team, lowest net picks bunks first.</div>
    <div class="bed-cols">${renderTeam(red, state.data.red.name, 'red')}${renderTeam(blue, state.data.blue.name, 'blue')}</div>
  </div>`;
}

export function renderCarletonPlace(state) {
  let h = '';
  h += `<div class="tab-intro">
    <h2>Carleton Place Cup</h2>
    <p>FedEx points across eligible rounds &bull; Best 3 rounds count &bull; Determines starting strokes for the championship</p>
  </div>`;

  h += `<div class="content" style="padding-top:1rem">`;

  const champ = state.championship;
  const champFinal = !!champ && champ.status === 'final' && champ.results.length > 0;
  const champWinner = champFinal ? championshipWinnerName(state) : null;

  if (champFinal) {
    if (champWinner) {
      h += `<div class="champ-banner">
        <div class="label">Carleton Place Cup Champion</div>
        <div class="name">${escapeHtml(champWinner)}</div>
        <div class="sub">${escapeHtml(champ.course)}</div>
      </div>`;
    }
    h += renderRoundLeaderboard(state, champ);
  }

  if (!state.fedex.showLeaderboard) {
    h += `<div class="side-card" style="text-align:center;padding:2rem 1rem">
      <div class="side-card-format" style="margin-bottom:0.5rem">Standings open after Round 1</div>
      <div class="match-detail">Eligible rounds are set in the Ryder Cup tab (marked "FedEx eligible")</div>
    </div>`;
  } else {
    if (champFinal) h += `<div class="rounds-header">FedEx Points — Final</div>`;
    const ranked = [...state.fedex.players].sort((a, b) => b.total - a.total);
    let lastTotal = null, lastRank = 0;
    ranked.forEach((p, i) => {
      if (p.total !== lastTotal) { lastRank = i + 1; lastTotal = p.total; }
      p.rank = lastRank;
    });
    h += `<table class="fedex-table">
      <thead><tr><th class="num">#</th><th>Player</th><th class="right">Total</th><th class="right">Strokes</th></tr></thead>
      <tbody>`;
    const allZero = ranked.every(p => p.total === 0);
    ranked.forEach(p => {
      const strokes = startingStrokes(p.rank);
      let strokesDisp, strokesCls, rankDisp;
      if (allZero || p.total === 0) {
        strokesDisp = '—'; strokesCls = 'zero'; rankDisp = '—';
      } else {
        strokesDisp = strokes === 0 ? 'E' : strokes;
        strokesCls = strokes === 0 ? 'zero' : '';
        rankDisp = p.rank;
      }
      const rankCls = (!allZero && p.rank === 1 && p.total > 0) ? 'rank top' : 'rank';
      const full = `${p.first} ${p.last}`;
      const badges = nameBadges(state, full, 'md');
      h += `<tr>
        <td class="${rankCls}">${rankDisp}</td>
        <td class="player">${escapeHtml(p.first[0])}. ${escapeHtml(p.last)}${badges}</td>
        <td class="right total">${p.total}</td>
        <td class="right strokes ${strokesCls}">${strokesDisp}</td>
      </tr>`;
    });
    h += `</tbody></table>`;
  }

  h += `<div class="fedex-legend">
    <strong>Scoring:</strong> Each eligible round, players earn points by net finish position (1st = 75, 2nd = 69, 3rd = 65, … 16th = 46). Ties split the points.<br>
    <strong>Best 3 of 5:</strong> Only your top 3 round scores count toward the FedEx total.<br>
    <strong>Starting strokes (championship):</strong> 1st = -3 &bull; 2nd–3rd = -2 &bull; 4th–6th = -1 &bull; 7th+ = even
  </div>`;

  if (state.rounds.length > 0) {
    h += `<div class="rounds-header">Round-by-round net leaderboards</div>`;
    state.rounds.forEach((r, i) => {
      h += renderRoundLeaderboard(state, r);
      if (i === 0) h += renderBedSelection(state, r);
    });
  }

  h += renderHandicapTrends(state);

  h += `</div>`;
  return h;
}

export function renderHandicapTrends(state) {
  return `<div class="hcp-section" id="hcp-section">${renderHandicapTrendsInner(state)}</div>`;
}

export function rerenderHandicapTrends(state) {
  const el = document.getElementById('hcp-section');
  if (el) el.innerHTML = renderHandicapTrendsInner(state);
}

export function renderHandicapTrendsInner(state) {
  const withHistory = state.fedex.players.map(p => {
    const full = `${p.first} ${p.last}`;
    return { first: p.first, last: p.last, team: p.team, checkpoints: state.handicaps[full] || [] };
  });

  const maxCols = Math.min(3, withHistory.reduce((m, r) => Math.max(m, r.checkpoints.length), 0));
  if (maxCols === 0) {
    return `<div class="rounds-header">Handicap Trends</div>
      <div class="hcp-intro">No handicap checkpoints entered yet — add them in the Admin Portal's Carleton Place Cup tab.</div>`;
  }

  // Column labels: the checkpoint labels from whichever player has the
  // most entries (see the module doc comment above for why this is a
  // safe assumption in practice).
  const labelSource = withHistory.reduce((best, r) => (r.checkpoints.length > (best?.checkpoints.length || 0) ? r : best), null);
  const colLabels = labelSource.checkpoints.slice(-maxCols).map(c => c.date || 'Checkpoint');

  let rows = withHistory.map(r => {
    const padded = Array(Math.max(0, maxCols - r.checkpoints.length)).fill(null).concat(r.checkpoints.slice(-maxCols)).map(c => c ? c.value : null);
    return { first: r.first, last: r.last, team: r.team, cols: padded };
  });

  if (hcpFilter !== 'all') rows = rows.filter(r => r.team === hcpFilter);

  const liveIdx = maxCols - 1;
  const cmpAsc = {
    live: (a, b) => (a.cols[liveIdx] ?? a.cols[liveIdx - 1] ?? 99) - (b.cols[liveIdx] ?? b.cols[liveIdx - 1] ?? 99),
    player: (a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first),
  };
  const baseCmp = cmpAsc[hcpSortKey] || cmpAsc.live;
  rows.sort(hcpSortDir === 'desc' ? (a, b) => baseCmp(b, a) : baseCmp);

  const fmt = v => (v != null ? v.toFixed(1) : '—');
  const trendDir = (value, prev) => {
    if (value == null || prev == null) return null;
    const d = +(value - prev).toFixed(1);
    if (d > 0) return 'up';
    if (d < 0) return 'down';
    return 'flat';
  };
  const arrowChar = { up: '▲', down: '▼', flat: '─' };
  const arrowCell = (value, prev) => {
    const dir = trendDir(value, prev);
    return dir ? `<td class="arrow-col ${dir}">${arrowChar[dir]}</td>` : `<td class="arrow-col"></td>`;
  };
  const valueCell = (value, prev) => {
    if (value == null) return `<td class="num hcp-cell">—</td>`;
    const dir = trendDir(value, prev);
    return `<td class="num hcp-cell${dir ? ' ' + dir : ''}">${fmt(value)}</td>`;
  };
  const pillCls = (val, kind) => `hcp-pill${kind ? ' ' + kind : ''}${hcpFilter === val ? ' active' : ''}`;
  const sortHeader = (key, label, extraCls = '') => {
    const isActive = hcpSortKey === key;
    const caret = isActive ? (hcpSortDir === 'asc' ? '▲' : '▼') : '';
    const cls = `${extraCls} sortable${isActive ? ' active' : ''}`.trim();
    return `<th class="${cls}" data-hcp-sort="${key}">${escapeHtml(label)}<span class="hcp-sort-caret">${caret}</span></th>`;
  };

  let h = '';
  h += `<div class="rounds-header">Handicap Trends</div>`;
  h += `<div class="hcp-intro">Captain draft prep — most recent handicap checkpoints. Green ▼ = handicap improved · red ▲ = handicap rose. Click a column header to sort.</div>`;
  h += `<div class="hcp-controls">
    <div class="hcp-controls-group">
      <span class="hcp-controls-label">Team</span>
      <div class="hcp-pills">
        <button type="button" class="${pillCls('all')}" data-hcp-filter="all">All</button>
        <button type="button" class="${pillCls('red', 'red')}" data-hcp-filter="red">Red</button>
        <button type="button" class="${pillCls('blue', 'blue')}" data-hcp-filter="blue">Blue</button>
      </div>
    </div>
  </div>`;
  if (rows.length === 0) {
    h += `<div class="round-block-empty">No players match this filter</div>`;
    return h;
  }

  h += `<table class="hcp-table"><thead><tr><th class="num col-rank">#</th>${sortHeader('player', 'Player')}`;
  colLabels.forEach((label, i) => {
    if (i > 0) h += `<th class="arrow-col"></th>`;
    h += sortHeader(i === liveIdx ? 'live' : `col${i}`, label, 'num col-cap');
  });
  h += `</tr></thead><tbody>`;
  rows.forEach((r, i) => {
    h += `<tr><td class="rank">${i + 1}</td><td class="player"><span class="team-dot ${r.team}"></span>${escapeHtml(r.first[0])}. ${escapeHtml(r.last)}</td>`;
    h += `<td class="num hcp-cell">${fmt(r.cols[0])}</td>`;
    for (let c = 1; c < maxCols; c++) {
      h += arrowCell(r.cols[c], r.cols[c - 1]) + valueCell(r.cols[c], r.cols[c - 1]);
    }
    h += `</tr>`;
  });
  h += `</tbody></table>`;
  return h;
}

export function setupHcpControls(getState) {
  const defaultDir = { player: 'asc', live: 'asc' };
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-hcp-filter]');
    if (pill) { hcpFilter = pill.dataset.hcpFilter; rerenderHandicapTrends(getState()); return; }
    const sortTh = e.target.closest('[data-hcp-sort]');
    if (sortTh) {
      const key = sortTh.dataset.hcpSort;
      if (hcpSortKey === key) hcpSortDir = hcpSortDir === 'asc' ? 'desc' : 'asc';
      else { hcpSortKey = key; hcpSortDir = defaultDir[key] || 'asc'; }
      rerenderHandicapTrends(getState());
    }
  });
}
