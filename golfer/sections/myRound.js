// ═══════════════════════════════════════════════
// MY ROUND — 02-New-Dashboard-Plan.md §6.1
//   Golfer picks the current/relevant round (defaults to whichever is
//   live, else the next upcoming one) and submits a summary net score.
//   Saves to the SAME `roundResults` collection the admin's Carleton
//   Place Cup tab manages, as status:"pending" until an admin approves
//   it (see shared/data-store.js schema notes + admin/ui-helpers.js).
//
//   Re-submitting for a round you've already entered edits your existing
//   doc instead of creating a duplicate, and re-queues it as "pending"
//   even if it had already been approved — a self-correction should
//   always get a fresh look, not silently overwrite a confirmed result.
// ═══════════════════════════════════════════════

import { rounds, roundResults } from '../../shared/data-store.js';
import { showToast, sectionHeader, gcard, escapeHtml } from '../ui-helpers.js';

function fedexEligibleOrChampionship(list) {
  return list.filter(r => r.fedexEligible || r.isChampionship);
}

function pickDefaultRound(eligibleRounds) {
  const live = eligibleRounds.find(r => r.status === 'live');
  if (live) return live;
  const upcoming = eligibleRounds.filter(r => r.status === 'upcoming');
  if (upcoming.length) return upcoming[0];
  return eligibleRounds[eligibleRounds.length - 1] || null;
}

export async function renderMyRound(mount, session) {
  mount.innerHTML = sectionHeader('My Round', 'Submit your net score once you’re done — an admin reviews it before it counts on the board.') +
    `<div class="field" style="margin-bottom:1rem">
      <label>Round</label>
      <select id="mr-round-select"><option value="">— no rounds yet —</option></select>
    </div>
    <div id="mr-form-mount"></div>
    <div id="mr-history-mount" style="margin-top:1.5rem"></div>`;

  const select = mount.querySelector('#mr-round-select');
  const formMount = mount.querySelector('#mr-form-mount');
  const historyMount = mount.querySelector('#mr-history-mount');

  let roundsCache = [];
  let resultsCache = [];
  let userPickedRound = false;

  function roundLabel(r) {
    return `Day ${r.day} ${r.session} — ${escapeHtml(r.format || 'Untitled')}${r.isChampionship ? ' (Championship)' : ''}`;
  }

  function renderForm(roundId) {
    const round = roundsCache.find(r => r.id === roundId);
    if (!round) { formMount.innerHTML = ''; return; }
    const mine = resultsCache.find(r => r.roundId === roundId && r.playerId === session.playerId);

    formMount.innerHTML = gcard(`
      <form id="mr-form">
        <div class="field">
          <label>Your net score for ${escapeHtml(round.course || round.format || 'this round')}</label>
          <input type="number" step="0.5" name="net" value="${mine ? mine.net : ''}" placeholder="e.g. 78" required />
        </div>
        ${mine ? `<div class="hint" style="margin:0.4rem 0 0.8rem">You already submitted ${mine.net} for this round (${mine.status === 'pending' ? 'pending review' : 'confirmed'}). Submitting again updates it and sends it back for review.</div>` : ''}
        <button type="submit" class="btn primary" style="width:100%;margin-top:0.6rem">${mine ? 'Update score' : 'Submit score'}</button>
      </form>
    `);

    formMount.querySelector('#mr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const net = Number(e.target.net.value);
      if (Number.isNaN(net)) { showToast('Enter a number.', 'error'); return; }
      try {
        const col = roundResults();
        if (mine) await col.update(mine.id, { net, status: 'pending' });
        else await col.add({ roundId, playerId: session.playerId, net, status: 'pending' });
        showToast('Score submitted — pending admin review.');
      } catch (err) {
        console.error('[myRound] submit failed', err);
        showToast('Submit failed — see console.', 'error');
      }
    });
  }

  function renderHistory() {
    const mine = resultsCache
      .filter(r => r.playerId === session.playerId)
      .map(r => ({ ...r, round: roundsCache.find(rd => rd.id === r.roundId) }))
      .filter(r => r.round)
      .sort((a, b) => (a.round.day - b.round.day) || (a.round.session === b.round.session ? 0 : a.round.session === 'AM' ? -1 : 1));

    if (!mine.length) { historyMount.innerHTML = ''; return; }
    historyMount.innerHTML = sectionHeader('Your submissions') + gcard(mine.map(r => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:0.35rem 0">
        <div style="font-size:0.8rem">Day ${r.round.day} ${r.round.session} — ${escapeHtml(r.round.format || '')}</div>
        <div style="font-family:'Oswald',sans-serif;font-weight:600;white-space:nowrap">${r.net}<span class="status-pill ${r.status === 'pending' ? 'upcoming' : 'final'}" style="margin-left:0.5rem">${r.status === 'pending' ? 'Pending' : 'Confirmed'}</span></div>
      </div>
    `).join(''));
  }

  const unsubRounds = rounds().onChange((docs) => {
    roundsCache = fedexEligibleOrChampionship(docs)
      .sort((a, b) => (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1));
    select.innerHTML = roundsCache.length
      ? roundsCache.map(r => `<option value="${r.id}">${roundLabel(r)}</option>`).join('')
      : '<option value="">— no rounds yet —</option>';
    if (!userPickedRound) {
      const def = pickDefaultRound(roundsCache);
      select.value = def ? def.id : '';
    }
    renderForm(select.value);
    renderHistory();
  });

  const unsubResults = roundResults().onChange((docs) => {
    resultsCache = docs;
    renderForm(select.value);
    renderHistory();
  });

  select.addEventListener('change', () => {
    userPickedRound = true;
    renderForm(select.value);
  });

  return () => { unsubRounds(); unsubResults(); };
}
