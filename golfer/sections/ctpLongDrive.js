// ═══════════════════════════════════════════════
// CTP / LONG DRIVE SELF-REPORT — 02-New-Dashboard-Plan.md §6.3
//   Golfer taps the relevant round, taps "I won CTP on hole X" or "I won
//   Long Drive." Saves as status:"pending" — admin resolves conflicts
//   (e.g. two people claiming the same hole) via the Approve action in
//   the Side Action tab. Honor-system-plus-admin-override, not a dispute
//   workflow, per the plan's explicit non-goals.
// ═══════════════════════════════════════════════

import { rounds, players, sideActionRounds, ctpResults, longDriveResults } from '../../shared/data-store.js';
import { showToast, sectionHeader, playerLabel, gcard, escapeHtml } from '../ui-helpers.js';

export async function renderCtpLongDrive(mount, session) {
  mount.innerHTML = `
    <div class="field" style="margin-bottom:1rem">
      <label>Round</label>
      <select id="cld-round-select"><option value="">— no rounds yet —</option></select>
    </div>
    <div id="cld-body"></div>
  `;

  const select = mount.querySelector('#cld-round-select');
  const body = mount.querySelector('#cld-body');

  let roundsCache = [];
  let playersCache = [];
  let disposeBody = null;

  function roundLabel(r) {
    return `Day ${r.day} ${r.session} — ${escapeHtml(r.format || 'Untitled')}`;
  }

  function mountBodyFor(roundId) {
    if (disposeBody) disposeBody();
    if (!roundId) { body.innerHTML = ''; disposeBody = null; return; }
    disposeBody = renderRoundBody(body, roundId, session, () => playersCache);
  }

  const unsubRounds = rounds().onChange((docs) => {
    roundsCache = [...docs].sort((a, b) => (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1));
    const prevValue = select.value;
    select.innerHTML = roundsCache.length
      ? roundsCache.map(r => `<option value="${r.id}">${roundLabel(r)}</option>`).join('')
      : '<option value="">— no rounds yet —</option>';
    const stillExists = roundsCache.some(r => r.id === prevValue);
    select.value = stillExists ? prevValue : (roundsCache[roundsCache.length - 1]?.id || '');
    mountBodyFor(select.value);
  });

  const unsubPlayers = players().onChange((docs) => { playersCache = docs; });

  select.addEventListener('change', () => mountBodyFor(select.value));

  return () => {
    unsubRounds();
    unsubPlayers();
    if (disposeBody) disposeBody();
  };
}

function renderRoundBody(mount, roundId, session, getPlayers) {
  mount.innerHTML = '<div class="hint">Loading…</div>';

  let configCache = null;
  let ctpCache = [];
  let ldCache = [];

  function nameFor(id) {
    const p = getPlayers().find(p => p.id === id);
    return p ? playerLabel(p) : 'Unknown';
  }

  function render() {
    if (!configCache) { mount.innerHTML = '<div class="hint">No closest-to-pin or long-drive contest set up for this round yet.</div>'; return; }

    const ctpHoles = configCache.ctpHoles || [];
    const ldHole = configCache.ldHole;

    let html = '';

    if (ctpHoles.length) {
      html += sectionHeader('Closest to Pin') + ctpHoles.map(h => {
        const claims = ctpCache.filter(c => c.hole === h.hole);
        const mine = claims.find(c => c.playerId === session.playerId);
        return gcard(`
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="font-weight:600">Hole ${h.hole}</div>
            <div class="hint">${h.yds ? `${h.yds}y &middot; ` : ''}Par ${h.par || '?'}</div>
          </div>
          ${claims.length ? `<div class="hint" style="margin-top:0.4rem">${claims.map(c => `${escapeHtml(nameFor(c.playerId))} (${c.status === 'pending' ? 'pending' : 'confirmed'})`).join(', ')}</div>` : '<div class="hint" style="margin-top:0.4rem">No claims yet.</div>'}
          <button type="button" class="btn ${mine ? 'ghost' : 'primary'} small" style="margin-top:0.6rem" data-ctp-claim="${h.hole}" ${mine ? 'disabled' : ''}>${mine ? 'You claimed this' : 'I won this hole'}</button>
        `);
      }).join('');
    }

    if (ldHole) {
      const claims = ldCache;
      const mine = claims.find(c => c.playerId === session.playerId);
      html += sectionHeader('Long Drive') + gcard(`
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-weight:600">Hole ${ldHole.hole}</div>
          <div class="hint">${ldHole.yds ? `${ldHole.yds}y &middot; ` : ''}${ldHole.par ? `Par ${ldHole.par}` : ''}</div>
        </div>
        ${claims.length ? `<div class="hint" style="margin-top:0.4rem">${claims.map(c => `${escapeHtml(nameFor(c.playerId))} (${c.status === 'pending' ? 'pending' : 'confirmed'})`).join(', ')}</div>` : '<div class="hint" style="margin-top:0.4rem">No claims yet.</div>'}
        <form id="ld-claim-form" style="margin-top:0.6rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <input type="number" name="yds" placeholder="Yards (optional)" style="flex:1;min-width:120px" ${mine ? 'disabled' : ''} />
          <button type="submit" class="btn ${mine ? 'ghost' : 'primary'} small" ${mine ? 'disabled' : ''}>${mine ? 'You claimed this' : 'I won Long Drive'}</button>
        </form>
      `);
    }

    if (!ctpHoles.length && !ldHole) {
      html = '<div class="hint">No closest-to-pin or long-drive contest set up for this round yet.</div>';
    }

    mount.innerHTML = html;

    mount.querySelectorAll('[data-ctp-claim]').forEach(btn => btn.addEventListener('click', async () => {
      const hole = Number(btn.dataset.ctpClaim);
      try {
        await ctpResults().add({ roundId, hole, playerId: session.playerId, sponsor: '', status: 'pending' });
        showToast('CTP claim submitted — pending review.');
      } catch (err) {
        console.error('[ctpLongDrive] ctp claim failed', err);
        showToast('Claim failed — see console.', 'error');
      }
    }));

    const ldForm = mount.querySelector('#ld-claim-form');
    if (ldForm) ldForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await longDriveResults().add({
          roundId, playerId: session.playerId,
          yds: e.target.yds.value ? Number(e.target.yds.value) : '',
          dist: '', status: 'pending',
        });
        showToast('Long drive claim submitted — pending review.');
      } catch (err) {
        console.error('[ctpLongDrive] long drive claim failed', err);
        showToast('Claim failed — see console.', 'error');
      }
    });
  }

  const unsubConfig = sideActionRounds().onChange((docs) => {
    configCache = docs.find(d => d.id === roundId) || null;
    render();
  });
  const unsubCtp = ctpResults().onChange((docs) => { ctpCache = docs.filter(d => d.roundId === roundId); render(); });
  const unsubLd = longDriveResults().onChange((docs) => { ldCache = docs.filter(d => d.roundId === roundId); render(); });

  return () => { unsubConfig(); unsubCtp(); unsubLd(); };
}
