// ═══════════════════════════════════════════════
// RENDER — SIDE ACTION TAB
// Ported from the original renderSide() (Analysis §8). New: a "Side
// Bets" section per round plus a trip-long section, reusing
// .side-card/.side-row/.side-section per plan §6.2 point 3 rather than
// inventing new visual language.
// ═══════════════════════════════════════════════

import { nameBadges, escapeHtml } from './helpers.js';

const pendingTag = (isPending) => (isPending ? '<span class="pending-tag">Pending</span>' : '');

function betStatusPill(status) {
  const label = status === 'open' ? 'Open' : status === 'settled' ? 'Settled' : 'Void';
  return `<span class="bet-status-pill ${status}">${label}</span>`;
}

function renderSideBetCard(state, bet, playersById) {
  const nameFor = (id) => { const p = playersById[id]; return p ? `${p.first} ${p.last}` : 'Unknown'; };
  const participants = (bet.participants || []).map(nameFor).join(', ');
  const winnerLine = bet.status === 'settled' ? `<div class="sponsor">Winner: ${escapeHtml(nameFor(bet.winnerId))}</div>` : '';
  return `<div class="side-row">
    <div class="label-l">
      <div class="label-hole">${escapeHtml(bet.type || 'Bet')}</div>
      <div class="label-detail">${escapeHtml(bet.stake || 'no stake set')}</div>
    </div>
    <div class="player-block">
      <div class="player">${escapeHtml(bet.description)}</div>
      <div class="sponsor">With: ${escapeHtml(participants)}</div>
      ${winnerLine}
    </div>
    <div class="meta">${betStatusPill(bet.status)}</div>
  </div>`;
}

export function renderSide(state) {
  const playersById = {};
  state.players.forEach(p => { playersById[p.id] = p; });

  let h = '';
  h += `<div class="tab-intro">
    <h2>Side Action</h2>
    <p>Closest-to-pin &bull; Long Drive &bull; Skins &bull; Side Bets &bull; By round</p>
  </div>`;

  h += `<div class="content" style="padding-top:1rem">`;

  if (state.tripSideBets.length) {
    h += `<div class="day-header">
      <span class="day-label">Trip-Long</span>
      <span class="day-line"></span>
    </div>`;
    h += `<div class="side-card">
      <div class="side-card-header"><div class="side-card-format">Side Bets</div></div>`;
    state.tripSideBets.forEach(bet => { h += renderSideBetCard(state, bet, playersById); });
    h += `</div>`;
  }

  if (!state.sideAction.length) {
    h += `<div class="round-block-empty">No side action set up yet.</div>`;
  }

  state.sideAction.forEach(round => {
    const isUp = round.status === 'upcoming';
    const sLabel = round.status === 'final' ? 'Final' : round.status === 'live' ? '● Live' : 'Upcoming';
    const sClass = round.status === 'final' ? 'final' : (round.status === 'live' ? 'live' : '');

    h += `<div class="day-header">
      <span class="day-label">Day ${round.day} &bull; ${round.session}</span>
      <span class="day-line"></span>
      <span class="day-course">${escapeHtml(round.course)}</span>
    </div>`;

    h += `<div class="side-card${isUp ? ' upcoming' : ''}">
      <div class="side-card-header">
        <div class="side-card-format">${escapeHtml(round.format)}</div>
        <div class="side-card-status ${sClass}">${sLabel}</div>
      </div>
      <div class="side-card-detail">${escapeHtml(round.detail)}</div>`;

    const ctpHoles = round.ctpHoles || [];
    const ctpWinners = round.ctps || [];
    if (ctpHoles.length > 0 || ctpWinners.length > 0) {
      h += `<div class="side-section"><div class="side-section-label">Closest to Pin</div>`;
      ctpHoles.forEach(ch => {
        const win = ctpWinners.find(c => c.hole === ch.hole);
        const badges = win ? nameBadges(state, win.player, 'sm') : '';
        const playerHtml = win ? `${escapeHtml(win.player)}${badges}${pendingTag(win.pending)}` : `<span class="tbd">TBD</span>`;
        h += `<div class="side-row">
          <div class="label-l">
            <div class="label-hole">Hole ${ch.hole}</div>
            <div class="label-detail">${ch.yds}y &middot; Par ${ch.par}</div>
          </div>
          <div class="player-block">
            <div class="player">${playerHtml}</div>
            ${win && win.sponsor ? `<div class="sponsor">${escapeHtml(win.sponsor)}</div>` : ''}
          </div>
          <div class="meta">$20</div>
        </div>`;
      });
      h += `</div>`;
    }

    const ldHole = round.ldHole;
    if (ldHole || round.longDrive) {
      h += `<div class="side-section"><div class="side-section-label">Long Drive</div>`;
      const win = round.longDrive;
      const ldBadges = win ? nameBadges(state, win.player, 'sm') : '';
      const playerHtml = win ? `${escapeHtml(win.player)}${ldBadges}${pendingTag(win.pending)}` : `<span class="tbd">TBD</span>`;
      const holeRef = ldHole || { hole: win?.hole, yds: win?.yds, par: win?.par };
      h += `<div class="side-row">
        <div class="label-l">
          <div class="label-hole">Hole ${holeRef.hole || '?'}</div>
          ${holeRef.yds && holeRef.par ? `<div class="label-detail">${holeRef.yds}y &middot; Par ${holeRef.par}</div>` : ''}
        </div>
        <div class="player-block">
          <div class="player">${playerHtml}</div>
          ${win && win.dist ? `<div class="sponsor">${escapeHtml(String(win.dist))}</div>` : ''}
        </div>
      </div>`;
      h += `</div>`;
    }

    if (!round.noSkins) {
      h += `<div class="side-section"><div class="side-section-label">Skins</div>`;
      if (isUp || round.skins.length === 0) {
        h += `<div class="side-empty">${isUp ? 'TBD' : 'No skins won (carryover or pot retained).'}</div>`;
      } else {
        h += `<div class="skins-header"><div class="sk-player">Player</div><div class="sk-count">Skins</div><div class="sk-payout">Payout</div></div>`;
        round.skins.forEach(s => {
          const sBadges = nameBadges(state, s.player, 'sm');
          h += `<div class="skins-row">
            <div class="sk-player">${escapeHtml(s.player)}${sBadges}</div>
            <div class="sk-count">${s.count}</div>
            <div class="sk-payout">$${s.payout}</div>
          </div>`;
        });
      }
      h += `</div>`;
    }

    const roundBets = round.sideBets || [];
    if (roundBets.length) {
      h += `<div class="side-section"><div class="side-section-label">Side Bets</div>`;
      roundBets.forEach(bet => { h += renderSideBetCard(state, bet, playersById); });
      h += `</div>`;
    }

    h += `</div>`; // side-card
  });

  h += `</div>`;
  return h;
}
