// ═══════════════════════════════════════════════
// RENDER — RYDER CUP TAB
// Ported near-verbatim from the original renderRyder() (Analysis §4).
// The only behavioral change: DAY_NAMES was a hardcoded {1:'Monday',...}
// table assuming a fixed 4-day, Monday-start trip. This template is
// reused across trips of any length/start day, so the weekday name is
// now pulled from the trip's own WEATHER_DAYS entry for that day number.
// ═══════════════════════════════════════════════

import { fp, chevronSVG, nameWithBadges, escapeHtml } from './helpers.js';

const TOTAL_POINTS_FALLBACK = 48;

function totalPointsAvailable(state) {
  let total = 0;
  state.data.days.forEach(day => day.rounds.forEach(r => { total += r.pointsAvail || 0; }));
  return total || TOTAL_POINTS_FALLBACK;
}

function computeTotals(state) {
  let redTotal = 0, blueTotal = 0, decided = 0, remaining = 0;
  state.data.days.forEach(day => day.rounds.forEach(round => {
    if (round.status === 'upcoming') { remaining += round.pointsAvail || 0; return; }
    round.matches.forEach(m => { redTotal += m.redPts; blueTotal += m.bluePts; decided += m.redPts + m.bluePts; });
    if (round.status === 'live') {
      const pts = round.matches.reduce((s, m) => s + m.redPts + m.bluePts, 0);
      remaining += (round.pointsAvail || 0) - pts;
    }
  }));
  return { redTotal, blueTotal, decided, remaining };
}

function weekdayName(state, dayNum) {
  const wd = state.WEATHER_DAYS.find(d => d.dayNum === dayNum);
  return wd ? wd.dayName : `Day ${dayNum}`;
}

export function renderRyder(state) {
  const TOTAL_POINTS = totalPointsAvailable(state);
  const POINTS_TO_WIN = TOTAL_POINTS / 2 + 0.5;
  const t = computeTotals(state);
  const redPct = TOTAL_POINTS ? (t.redTotal / TOTAL_POINTS) * 100 : 0;
  const bluePct = TOTAL_POINTS ? (t.blueTotal / TOTAL_POINTS) * 100 : 0;
  const redNeeds = Math.max(0, POINTS_TO_WIN - t.redTotal);
  const blueNeeds = Math.max(0, POINTS_TO_WIN - t.blueTotal);

  const redName = escapeHtml(state.data.red.name);
  const blueName = escapeHtml(state.data.blue.name);

  let projClass, projText;
  if (t.redTotal > t.blueTotal) {
    projClass = 'red-leading';
    projText = `${redName} lead by ${fp(t.redTotal - t.blueTotal)} — ${fp(t.remaining)} pts remaining`;
  } else if (t.blueTotal > t.redTotal) {
    projClass = 'blue-leading';
    projText = `${blueName} lead by ${fp(t.blueTotal - t.redTotal)} — ${fp(t.remaining)} pts remaining`;
  } else {
    projClass = 'tied';
    projText = `All square — ${fp(t.remaining)} pts remaining`;
  }
  if (t.redTotal >= POINTS_TO_WIN) { projClass = 'red-leading'; projText = `${redName} have won the Ryder Cup!`; }
  else if (t.blueTotal >= POINTS_TO_WIN) { projClass = 'blue-leading'; projText = `${blueName} have won the Ryder Cup!`; }
  else if (redNeeds > t.remaining) { projClass = 'blue-leading'; projText = `${blueName} have clinched the Ryder Cup!`; }
  else if (blueNeeds > t.remaining) { projClass = 'red-leading'; projText = `${redName} have clinched the Ryder Cup!`; }

  const bigSize = window.innerWidth < 600 ? '3rem' : '4.5rem';
  const sepSize = window.innerWidth < 600 ? '1rem' : '1.5rem';

  let h = '';
  h += `<div class="main-score">
    <div class="team-block">
      <div class="team-label red">${redName}</div>
      <div class="big-number red" style="font-size:${bigSize}">${fp(t.redTotal)}</div>
    </div>
    <div class="score-sep" style="font-size:${sepSize}">&ndash;</div>
    <div class="team-block">
      <div class="team-label blue">${blueName}</div>
      <div class="big-number blue" style="font-size:${bigSize}">${fp(t.blueTotal)}</div>
    </div>
  </div>`;

  h += `<div class="master-bar-wrap"><div class="master-bar">
    <div class="win-marker">${fp(POINTS_TO_WIN)} TO WIN</div><div class="win-line"></div>
    <div class="red-fill" style="width:${redPct}%">${redPct > 5 ? `<span class="bar-label">${fp(t.redTotal)}</span>` : ''}</div>
    <div class="remaining"></div>
    <div class="blue-fill" style="width:${bluePct}%">${bluePct > 5 ? `<span class="bar-label">${fp(t.blueTotal)}</span>` : ''}</div>
  </div></div>`;

  h += `<div class="status-wrap"><div class="status-strip">
    <div class="status-item"><div class="status-label">Red Needs</div><div class="status-value red">${fp(redNeeds)}</div></div>
    <div class="status-item"><div class="status-label">Decided</div><div class="status-value neutral">${fp(t.decided)} / ${TOTAL_POINTS}</div></div>
    <div class="status-item"><div class="status-label">Remaining</div><div class="status-value gold">${fp(t.remaining)}</div></div>
    <div class="status-item"><div class="status-label">Blue Needs</div><div class="status-value blue">${fp(blueNeeds)}</div></div>
  </div></div>`;

  h += `<div class="proj-wrap"><div class="projection ${projClass}">${projText}</div></div>`;

  h += `<div class="content">`;

  if (!state.data.days.length) {
    h += `<div class="round-block-empty">No rounds scheduled yet.</div>`;
  }

  const byDay = {};
  state.data.days.forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });
  const dayStatus = (d) => {
    const entries = byDay[d] || [];
    if (!entries.length) return 'none';
    const allFinal = entries.every(e => e.rounds.every(r => r.status === 'final'));
    const anyStarted = entries.some(e => e.rounds.some(r => r.status === 'live' || r.status === 'final'));
    if (allFinal) return 'final';
    if (anyStarted) return 'live';
    return 'upcoming';
  };
  const dayPoints = (d) => {
    let r = 0, b = 0;
    (byDay[d] || []).forEach(e => e.rounds.forEach(rd => rd.matches.forEach(m => { r += m.redPts; b += m.bluePts; })));
    return { red: r, blue: b };
  };

  state.data.days.forEach((day, i) => {
    h += `<div class="day-header">
      <span class="day-label">Day ${day.day} &bull; ${day.session}</span>
      <span class="day-line"></span>
      <span class="day-course">${escapeHtml(day.course)}</span>
    </div>`;

    day.rounds.forEach(round => {
      const sLabel = round.status === 'final' ? 'Final' : round.status === 'live' ? `● Live — ${escapeHtml(round.liveHole || '')}` : 'Upcoming';
      const sClass = round.status === 'live' ? 'live' : '';

      h += `<div class="match-card${round.status === 'upcoming' ? ' upcoming' : ''}">
        <div class="match-header">
          <div><span class="match-format">${escapeHtml(round.format)}</span><span class="match-pts-badge">${round.pointsAvail} PTS</span></div>
          <span class="match-status ${sClass}">${sLabel}</span>
        </div>
        <div class="match-detail">${escapeHtml(round.detail)}</div>
        <div class="chevron-matches">`;

      round.matches.forEach(m => {
        const isUp = round.status === 'upcoming';
        const isLive = round.status === 'live';
        const numPlayers = Math.max(m.red.length, m.blue.length);
        const hasRoster = !!(m.redRoster && m.redRoster.length) || !!(m.blueRoster && m.blueRoster.length);
        const rowH = hasRoster ? 92 : (numPlayers <= 1 ? 48 : numPlayers <= 2 ? 62 : 82);

        let winner = 'none';
        if (!isUp && !isLive) {
          if (m.redPts > m.bluePts) winner = 'red';
          else if (m.bluePts > m.redPts) winner = 'blue';
          else if (m.redPts > 0) winner = 'halved';
        }

        h += `<div class="chevron-row" style="height:${rowH}px">`;
        h += `<div style="position:absolute;inset:0;z-index:1">${chevronSVG(winner, rowH)}</div>`;

        const rosterHTML = (names) => {
          const lines = [];
          for (let i = 0; i < names.length; i += 2) {
            lines.push(names.slice(i, i + 2).map(n => `<span class="rname">${escapeHtml(n)}</span>`).join(' &bull; '));
          }
          return lines.join('<br>');
        };
        const playerCell = (p, team) => {
          if (m.isTeam) return escapeHtml(p[1]);
          const shortName = `${p[0][0]}. ${p[1]}`;
          const full = `${p[0]} ${p[1]}`;
          return nameWithBadges(state, shortName, full, 'sm', team);
        };
        h += `<div class="chev-names left">`;
        m.red.forEach(p => h += `<div class="chev-player">${playerCell(p, 'red')}</div>`);
        if (m.redRoster && m.redRoster.length) h += `<div class="chev-roster">${rosterHTML(m.redRoster)}</div>`;
        h += `</div>`;
        h += `<div class="chev-names right">`;
        m.blue.forEach(p => h += `<div class="chev-player">${playerCell(p, 'blue')}</div>`);
        if (m.blueRoster && m.blueRoster.length) h += `<div class="chev-roster">${rosterHTML(m.blueRoster)}</div>`;
        h += `</div>`;
        h += `<div class="chev-center">`;
        if (isLive) h += `<div class="chev-live-dot">● LIVE</div>`;
        if (m.label) h += `<div class="chev-match-label">${escapeHtml(m.label)}</div>`;
        if (isUp) {
          h += `<div class="chev-pts" style="color:var(--text-muted);font-size:0.85rem">TBD</div>`;
        } else if (isLive) {
          h += `<div class="chev-pts" style="color:var(--text-muted);font-size:0.85rem">IN PLAY</div>`;
        } else {
          h += `<div class="chev-pts"><span class="r">${fp(m.redPts)}</span><span class="s">:</span><span class="b">${fp(m.bluePts)}</span></div>`;
          let oc = '';
          if (m.redPts > m.bluePts) oc = 'RED WIN';
          else if (m.bluePts > m.redPts) oc = 'BLUE WIN';
          else if (m.redPts > 0) oc = 'HALVED';
          if (oc) h += `<div class="chev-outcome" style="color:rgba(255,255,255,0.8)">${oc}</div>`;
        }
        h += `</div></div>`;
      });

      h += `</div></div>`;
    });

    const isLastEntryOfDay = (i === state.data.days.length - 1) || (state.data.days[i + 1].day !== day.day);
    if (isLastEntryOfDay) {
      const nextDayStatus = dayStatus(day.day + 1);
      if (dayStatus(day.day) === 'final' && (nextDayStatus === 'upcoming' || nextDayStatus === 'none')) {
        const pts = dayPoints(day.day);
        const dn = weekdayName(state, day.day);
        let barCls, barText;
        if (pts.red > pts.blue) {
          barCls = 'blue';
          barText = `${dn} hosts: ${blueName} 🏠 &nbsp;&bull;&nbsp; ${fp(pts.red)}–${fp(pts.blue)}`;
        } else if (pts.blue > pts.red) {
          barCls = 'red';
          barText = `${dn} hosts: ${redName} 🏠 &nbsp;&bull;&nbsp; ${fp(pts.red)}–${fp(pts.blue)}`;
        } else {
          barCls = 'flip';
          barText = `${dn} tied ${fp(pts.red)}–${fp(pts.blue)} &nbsp;&bull;&nbsp; Coin flip for host`;
        }
        h += `<div class="host-divider"><div class="host-divider-bar ${barCls}">${barText}</div></div>`;
      }
    }
  });
  h += `</div>`;

  h += `<div class="footer" style="padding-top:0.5rem">First to ${fp(POINTS_TO_WIN)} wins &bull; ${TOTAL_POINTS} points available</div>`;

  return h;
}
