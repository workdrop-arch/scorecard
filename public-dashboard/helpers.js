// ═══════════════════════════════════════════════
// SHARED RENDER HELPERS — ported from the original Boyne 2026 —
// Scoreboard.htm (01-Current-Dashboard-Analysis.md §6–7). The badge/belt/
// rank logic is unchanged; the only real difference is that everything
// here takes the composed `state` object as a parameter instead of
// closing over module-level consts, since state is now live data.
//
// Badge year labels: the original hardcoded "★ '26" / "★ '25" because
// that file WAS the one-off 2026 edition. This codebase is reused across
// multiple years, so badges read generically ("★ Champ" / "★ Defending")
// instead of a hardcoded year — see the note above nameBadges().
// ═══════════════════════════════════════════════

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function fp(n) {
  return n % 1 === 0.5 ? n.toFixed(1) : String(n);
}

export function startingStrokes(rank) {
  if (rank === 1) return -3;
  if (rank <= 3) return -2;
  if (rank <= 6) return -1;
  return 0;
}

// Rank a results array ({first,last,team,net,...}) with ties. Lower net = better.
// Mutates and returns a sorted copy — matches the original's rankNetResults.
export function rankNetResults(results) {
  const sorted = [...results].sort((a, b) => a.net - b.net);
  let lastNet = null, lastRank = 0;
  sorted.forEach((p, i) => {
    if (p.net !== lastNet) { lastRank = i + 1; lastNet = p.net; }
    p.rank = lastRank;
  });
  const counts = {};
  sorted.forEach(p => { counts[p.rank] = (counts[p.rank] || 0) + 1; });
  sorted.forEach(p => { p.tied = counts[p.rank] > 1; });
  return sorted;
}

export function championshipWinnerName(state) {
  const champ = state.championship;
  if (!champ) return null;
  if (champ.winner) return champ.winner;
  if (!champ.results || !champ.results.length) return null;
  // Only confirmed results crown a champion — a golfer's still-pending
  // self-submitted score shouldn't be able to declare itself the winner.
  const confirmed = champ.results.filter(r => !r.pending);
  if (!confirmed.length) return null;
  const ranked = rankNetResults(confirmed);
  const top = ranked.filter(p => p.rank === 1);
  return top.length === 1 ? `${top[0].first} ${top[0].last}` : null;
}

// Belt = most recent CONFIRMED Longest Drive winner across any final side-action round.
export function beltHolderName(state) {
  for (let i = state.sideAction.length - 1; i >= 0; i--) {
    const r = state.sideAction[i];
    if (r.status === 'final' && r.longDrive && r.longDrive.player && !r.longDrive.pending) {
      return r.longDrive.player;
    }
  }
  return null;
}

// Returns HTML badges for a given full name. Output is trusted raw HTML —
// every string embedded in it is either a fixed label or has already been
// escaped by escapeHtml() before this function ever sees it (full names
// come from shared/data-store.js `players` docs, which are admin-entered
// free text — see nameWithBadges() below for where the escaping happens).
// size: 'md' (default) | 'sm' | 'xs'.  side: 'right' (default) | 'left'.
export function nameBadges(state, fullName, size, side) {
  if (!fullName) return '';
  size = size || 'md';
  side = side || 'right';
  const sizeCls = size === 'md' ? '' : ` badge-${size}`;
  const sideCls = side === 'left' ? ' left-side' : '';
  const champFinal = state.championship && state.championship.status === 'final' && state.championship.results.length > 0;
  const champWinner = champFinal ? championshipWinnerName(state) : null;
  const belt = beltHolderName(state);
  const badges = [];
  if (champWinner && fullName === champWinner) {
    badges.push(`<span class="champ-badge${sizeCls}${sideCls}" title="Carleton Place Cup Champion">★ Champ</span>`);
  }
  if (state.DEFENDING_CHAMP_NAME && fullName === state.DEFENDING_CHAMP_NAME) {
    badges.push(`<span class="champ-badge${sizeCls}${sideCls}" title="Defending Champion">★ Defending</span>`);
  }
  if (state.ROOKIES.has(fullName)) {
    badges.push(`<span class="rookie-badge${sizeCls}${sideCls}" title="Trip debut">Rookie</span>`);
  }
  if (belt && fullName === belt) {
    badges.push(`<span class="belt-badge${sizeCls}${sideCls}" title="Current Belt Holder (Longest Drive)">🥋 LD</span>`);
  }
  if (!badges.length) return '';
  const joined = badges.join(' ');
  return side === 'left' ? joined + ' ' : ' ' + joined;
}

// "badges + name" or "name + badges" depending on team (matches the
// original's Gooners/right-team-badges-on-left convention — here,
// generalized to "blue team gets badges on the left"). Escapes
// displayName itself; badge HTML stays trusted/raw.
export function nameWithBadges(state, displayName, fullName, size, team) {
  const side = team === 'blue' ? 'left' : 'right';
  const badges = nameBadges(state, fullName, size, side);
  const safeName = escapeHtml(displayName);
  return side === 'left' ? `${badges}${safeName}` : `${safeName}${badges}`;
}

// ── CHEVRON SVG (Ryder Cup match visualization) — verbatim port ──
let svgIdx = 0;
export function chevronSVG(winner, h) {
  const id = svgIdx++;
  const tip = 3.5;
  let paths = '';
  if (winner === 'red') {
    const rEnd = 77;
    paths = `<path d="M0 0 L${rEnd - tip} 0 L${rEnd} ${h / 2} L${rEnd - tip} ${h} L0 ${h}Z" fill="url(#rg${id})"/>`;
  } else if (winner === 'blue') {
    const bStart = 23;
    paths = `<path d="M100 0 L${bStart + tip} 0 L${bStart} ${h / 2} L${bStart + tip} ${h} L100 ${h}Z" fill="url(#bg${id})"/>`;
  } else if (winner === 'halved') {
    paths = `
      <rect x="0" y="0" width="50" height="${h}" fill="url(#rg${id})"/>
      <rect x="50" y="0" width="50" height="${h}" fill="url(#bg${id})"/>
    `;
  }
  return `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">
    <defs>
      <linearGradient id="rg${id}" x1="0%" x2="100%"><stop offset="0%" stop-color="#9a1830"/><stop offset="100%" stop-color="#c41e3a"/></linearGradient>
      <linearGradient id="bg${id}" x1="0%" x2="100%"><stop offset="0%" stop-color="#003da5"/><stop offset="100%" stop-color="#002d7a"/></linearGradient>
    </defs>
    ${paths}
  </svg>`;
}
