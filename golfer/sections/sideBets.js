// ═══════════════════════════════════════════════
// SIDE BETS — 02-New-Dashboard-Plan.md §6.2
//   New game type, no prior art in the old file. Golfer creates a bet
//   (type, description, stake, participants, optional round), and any
//   participant can settle it later by declaring a winner (or voiding
//   it). Always public — see the Decisions log in the plan doc.
// ═══════════════════════════════════════════════

import { rounds, players, sideBets } from '../../shared/data-store.js';
import { showToast, sectionHeader, playerLabel, gcard, escapeHtml } from '../ui-helpers.js';

const BET_TYPES = [
  { value: 'press', label: 'Press' },
  { value: 'nassau', label: 'Nassau' },
  { value: 'prop', label: 'Prop bet' },
  { value: 'skin-side-bet', label: 'Side skin' },
  { value: 'custom', label: 'Custom' },
];

export async function renderSideBets(mount, session) {
  mount.innerHTML = `
    <div id="sb-new-mount"></div>
    <div id="sb-list-mount" style="margin-top:1.25rem"></div>
  `;

  let playersCache = [];
  let roundsCache = [];
  let betsCache = [];

  const newMount = mount.querySelector('#sb-new-mount');
  const listMount = mount.querySelector('#sb-list-mount');

  const nameFor = (id) => { const p = playersCache.find(p => p.id === id); return p ? playerLabel(p) : 'Unknown'; };
  const roundLabelFor = (id) => {
    if (!id) return 'Trip-long';
    const r = roundsCache.find(r => r.id === id);
    return r ? `Day ${r.day} ${r.session} — ${r.format || 'Untitled'}` : 'Unknown round';
  };

  function renderNewForm() {
    newMount.innerHTML = sectionHeader('New Side Bet') + gcard(`
      <form id="sb-new-form">
        <div class="field">
          <label>Type</label>
          <select name="type">${BET_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}</select>
        </div>
        <div class="field" style="margin-top:0.6rem">
          <label>Description</label>
          <textarea name="description" rows="2" placeholder="e.g. Closest to pin on 14, $10, loser buys a beer" required></textarea>
        </div>
        <div class="field" style="margin-top:0.6rem">
          <label>Stake</label>
          <input type="text" name="stake" placeholder="e.g. $10, or a round of beers" />
        </div>
        <div class="field" style="margin-top:0.6rem">
          <label>Round (optional)</label>
          <select name="roundId">
            <option value="">Trip-long / not round-specific</option>
            ${roundsCache.map(r => `<option value="${r.id}">Day ${r.day} ${r.session} — ${escapeHtml(r.format || 'Untitled')}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="margin-top:0.6rem">
          <label>Who's in on it?</label>
          <select name="participants" multiple size="${Math.min(6, Math.max(3, playersCache.length))}">
            ${playersCache.map(p => `<option value="${p.id}">${escapeHtml(playerLabel(p))}</option>`).join('')}
          </select>
          <div class="hint">Ctrl/Cmd-click to select more than one.</div>
        </div>
        <button type="submit" class="btn primary" style="width:100%;margin-top:0.8rem">Create bet</button>
      </form>
    `);

    newMount.querySelector('#sb-new-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const description = form.description.value.trim();
      const participantIds = Array.from(form.participants.selectedOptions).map(o => o.value);
      if (!description) { showToast('Add a description.', 'error'); return; }
      if (participantIds.length === 0) { showToast('Pick at least one participant.', 'error'); return; }
      try {
        await sideBets().add({
          type: form.type.value,
          description,
          stake: form.stake.value.trim(),
          roundId: form.roundId.value || null,
          createdBy: session.playerId,
          participants: Array.from(new Set([...participantIds, session.playerId])),
          status: 'open',
          winnerId: null,
          createdAt: Date.now(),
          settledAt: null,
        });
        showToast('Side bet created.');
        form.reset();
      } catch (err) {
        console.error('[sideBets] create failed', err);
        showToast('Create failed — see console.', 'error');
      }
    });
  }

  function canSettle(bet) {
    return bet.createdBy === session.playerId || (bet.participants || []).includes(session.playerId);
  }

  function renderList() {
    const sorted = [...betsCache].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    listMount.innerHTML = sectionHeader('All Side Bets') + (sorted.length
      ? sorted.map(bet => renderBetCard(bet)).join('')
      : gcard('<div class="hint">No side bets yet — start one above.</div>'));

    sorted.forEach(bet => {
      if (bet.status !== 'open' || !canSettle(bet)) return;
      const form = listMount.querySelector(`[data-settle-form="${bet.id}"]`);
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const winnerId = e.target.winnerId.value;
        if (!winnerId) { showToast('Pick a winner (or Void).', 'error'); return; }
        try {
          await sideBets().update(bet.id, {
            status: winnerId === '__void__' ? 'void' : 'settled',
            winnerId: winnerId === '__void__' ? null : winnerId,
            settledAt: Date.now(),
          });
          showToast(winnerId === '__void__' ? 'Bet voided.' : 'Bet settled.');
        } catch (err) {
          console.error('[sideBets] settle failed', err);
          showToast('Settle failed — see console.', 'error');
        }
      });
    });
  }

  function renderBetCard(bet) {
    const typeLabel = BET_TYPES.find(t => t.value === bet.type)?.label || 'Bet';
    const statusPill = bet.status === 'open'
      ? '<span class="status-pill live">Open</span>'
      : bet.status === 'settled'
        ? '<span class="status-pill final">Settled</span>'
        : '<span class="status-pill upcoming">Void</span>';
    const participantsLine = (bet.participants || []).map(nameFor).join(', ');
    const settleUi = bet.status === 'open' && canSettle(bet)
      ? `<form data-settle-form="${bet.id}" style="margin-top:0.6rem;display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
          <select name="winnerId" style="flex:1;min-width:140px">
            <option value="">Declare winner…</option>
            ${(bet.participants || []).map(id => `<option value="${id}">${escapeHtml(nameFor(id))}</option>`).join('')}
            <option value="__void__">— Void this bet —</option>
          </select>
          <button type="submit" class="btn small primary">Settle</button>
        </form>`
      : bet.status === 'settled'
        ? `<div class="hint" style="margin-top:0.4rem">Winner: ${escapeHtml(nameFor(bet.winnerId))}</div>`
        : '';

    return gcard(`
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem">
        <div style="font-weight:600">${escapeHtml(typeLabel)}</div>
        ${statusPill}
      </div>
      <div style="margin-top:0.35rem;font-size:0.85rem">${escapeHtml(bet.description)}</div>
      <div class="hint" style="margin-top:0.35rem">${escapeHtml(roundLabelFor(bet.roundId))} &middot; ${escapeHtml(bet.stake || 'no stake set')}</div>
      <div class="hint" style="margin-top:0.2rem">With: ${escapeHtml(participantsLine)}</div>
      ${settleUi}
    `);
  }

  const unsubPlayers = players().onChange((docs) => { playersCache = docs; renderNewForm(); renderList(); });
  const unsubRounds = rounds().onChange((docs) => {
    roundsCache = [...docs].sort((a, b) => (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1));
    renderNewForm(); renderList();
  });
  const unsubBets = sideBets().onChange((docs) => { betsCache = docs; renderList(); });

  return () => { unsubPlayers(); unsubRounds(); unsubBets(); };
}
