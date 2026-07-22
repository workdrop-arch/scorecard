// ═══════════════════════════════════════════════
// SIDE ACTION — 02-New-Dashboard-Plan.md §5.4
//   Per round: set the pot/detail text, CTP holes (hole #, yardage, par),
//   long-drive hole, and manage winners (CTP / Long Drive / Skins).
//   CTP and Long Drive can also arrive here as golfer self-report claims
//   (plan §6.3, built in golfer/sections/ctpLongDrive.js) — those save as
//   status:"pending" and show up with an Approve action, same convention
//   as Round Net Results in the Carleton Place Cup tab. Skins stays
//   admin-only (see the schema note in shared/data-store.js).
//
// sideActionRounds uses the round's own id as its document id (one doc
// per round, upserted with .set()) rather than a separate auto-id +
// lookup — simpler than the schema comment in data-store.js suggests,
// documented here since it's a deliberate deviation.
// ═══════════════════════════════════════════════

import { rounds, players, sideActionRounds, ctpResults, longDriveResults, skinsResults } from '../../shared/data-store.js';
import { createEditableTable } from '../components/editable-table.js';
import { sectionHeader, showToast, playerLabel, statusColumn, approveRowActions, escapeHtml } from '../ui-helpers.js';

const num = (v) => (v === '' || v == null ? '' : Number(v));
const nameFor = (list, id) => { const p = list.find(p => p.id === id); return p ? playerLabel(p) : id; };

export async function renderSideAction(mount) {
  mount.innerHTML = `
    <div class="field" style="max-width:420px;margin-bottom:1.25rem">
      <label>Round</label>
      <select id="sa-round-select"><option value="">— add rounds in the Ryder Cup tab first —</option></select>
    </div>
    <div id="sa-body"></div>
  `;

  const select = mount.querySelector('#sa-round-select');
  const body = mount.querySelector('#sa-body');
  let disposeBody = null;
  let roundsCache = [];

  function roundLabel(r) {
    return `Day ${r.day} ${r.session} — ${escapeHtml(r.format || 'Untitled')}`;
  }

  function mountBodyFor(roundId) {
    if (disposeBody) disposeBody();
    if (!roundId) { body.innerHTML = ''; disposeBody = null; return; }
    disposeBody = renderRoundSideAction(body, roundId);
  }

  const unsubRounds = rounds().onChange((docs) => {
    roundsCache = [...docs].sort((a, b) => (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1));
    const prevValue = select.value;
    select.innerHTML = roundsCache.length
      ? roundsCache.map(r => `<option value="${r.id}">${roundLabel(r)}</option>`).join('')
      : '<option value="">— add rounds in the Ryder Cup tab first —</option>';
    const stillExists = roundsCache.some(r => r.id === prevValue);
    select.value = stillExists ? prevValue : (roundsCache[0]?.id || '');
    mountBodyFor(select.value);
  });

  select.addEventListener('change', () => mountBodyFor(select.value));

  return () => {
    unsubRounds();
    if (disposeBody) disposeBody();
  };
}

function renderRoundSideAction(mount, roundId) {
  mount.innerHTML = `
    <div class="subsection" id="sa-config"></div>
    <div class="subsection" id="sa-ctp"></div>
    <div class="subsection" id="sa-ld"></div>
    <div class="subsection" id="sa-skins"></div>
  `;

  const disposers = [
    renderConfigForm(mount.querySelector('#sa-config'), roundId),
    renderCtpResults(mount.querySelector('#sa-ctp'), roundId),
    renderLongDriveResults(mount.querySelector('#sa-ld'), roundId),
    renderSkinsResults(mount.querySelector('#sa-skins'), roundId),
  ];
  return () => disposers.forEach(d => d && d());
}

// ── Pot detail / CTP hole definitions / long-drive hole ────────────────
function renderConfigForm(mount, roundId) {
  mount.innerHTML = sectionHeader('Round Setup', 'Pot description, CTP holes, and the long-drive hole for this round.') +
    `<form id="sa-config-form" class="settings-form" style="max-width:640px">
      <div class="field">
        <label>Pot / detail text</label>
        <input type="text" name="potDetail" placeholder="e.g. Skins pot $200 · 2 CTPs · 1 Long Drive" />
      </div>
      <label class="checkbox-field"><input type="checkbox" name="noSkins" /> No skins game this round</label>

      <div class="eyebrow muted" style="margin-top:0.4rem">CTP holes</div>
      <div id="sa-ctp-holes-rows"></div>
      <div><button type="button" class="btn small ghost" id="sa-add-ctp-hole">+ Add CTP hole</button></div>

      <div class="eyebrow muted" style="margin-top:0.4rem">Long drive hole</div>
      <div class="form-row">
        <div class="field"><label>Hole #</label><input type="number" name="ldHole" /></div>
        <div class="field"><label>Yards</label><input type="number" name="ldYds" /></div>
        <div class="field"><label>Par</label><input type="number" name="ldPar" /></div>
      </div>
      <div class="hint">Leave hole # blank if this round has no long-drive contest.</div>

      <div><button type="submit" class="btn primary small">Save round setup</button></div>
    </form>`;

  const form = mount.querySelector('#sa-config-form');
  const ctpRowsMount = mount.querySelector('#sa-ctp-holes-rows');
  let ctpHolesDraft = [];

  function renderCtpHoleRows() {
    ctpRowsMount.innerHTML = ctpHolesDraft.length
      ? ctpHolesDraft.map((h, i) => `
        <div class="form-row" data-ctp-row="${i}" style="align-items:flex-end">
          <div class="field"><label>Hole #</label><input type="number" data-ctp-field="hole" value="${h.hole ?? ''}" /></div>
          <div class="field"><label>Yards</label><input type="number" data-ctp-field="yds" value="${h.yds ?? ''}" /></div>
          <div class="field"><label>Par</label><input type="number" data-ctp-field="par" value="${h.par ?? ''}" /></div>
          <div class="field"><label>&nbsp;</label><button type="button" class="btn small danger" data-remove-ctp="${i}">Remove</button></div>
        </div>`).join('')
      : `<div class="hint">No CTP holes yet.</div>`;

    ctpRowsMount.querySelectorAll('[data-remove-ctp]').forEach(btn => btn.addEventListener('click', () => {
      ctpHolesDraft.splice(Number(btn.dataset.removeCtp), 1);
      renderCtpHoleRows();
    }));
  }

  mount.querySelector('#sa-add-ctp-hole').addEventListener('click', () => {
    ctpHolesDraft.push({ hole: '', yds: '', par: 3 });
    renderCtpHoleRows();
  });

  function readCtpHoleRowsFromDom() {
    return Array.from(ctpRowsMount.querySelectorAll('[data-ctp-row]')).map(rowEl => ({
      hole: Number(rowEl.querySelector('[data-ctp-field="hole"]').value) || 0,
      yds: Number(rowEl.querySelector('[data-ctp-field="yds"]').value) || 0,
      par: Number(rowEl.querySelector('[data-ctp-field="par"]').value) || 0,
    }));
  }

  const col = sideActionRounds();
  const unsubscribe = col.onChange((docs) => {
    const doc = docs.find(d => d.id === roundId);
    if (document.activeElement && form.contains(document.activeElement)) return;
    form.potDetail.value = doc?.potDetail || '';
    form.noSkins.checked = !!doc?.noSkins;
    form.ldHole.value = doc?.ldHole?.hole ?? '';
    form.ldYds.value = doc?.ldHole?.yds ?? '';
    form.ldPar.value = doc?.ldHole?.par ?? '';
    ctpHolesDraft = doc?.ctpHoles ? doc.ctpHoles.map(h => ({ ...h })) : [];
    renderCtpHoleRows();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ldHoleNum = Number(form.ldHole.value);
    try {
      await col.set(roundId, {
        potDetail: form.potDetail.value.trim(),
        noSkins: form.noSkins.checked,
        ctpHoles: readCtpHoleRowsFromDom(),
        ldHole: ldHoleNum ? { hole: ldHoleNum, yds: Number(form.ldYds.value) || 0, par: Number(form.ldPar.value) || 0 } : null,
      });
      showToast('Round setup saved.');
    } catch (err) {
      console.error('[sideAction] config save failed', err);
      showToast('Save failed — see console.', 'error');
    }
  });

  return unsubscribe;
}

// ── CTP winners ──────────────────────────────────────────────────────
function renderCtpResults(mount, roundId) {
  mount.innerHTML = sectionHeader('Closest to Pin — Winners') + `<div id="sa-ctp-table"></div>`;

  let playersCache = [];
  let ctpHolesCache = [];
  let table = null;

  const unsubPlayers = players().onChange((docs) => { playersCache = docs; if (table) table.refresh(); });
  const unsubConfig = sideActionRounds().onChange((docs) => {
    ctpHolesCache = docs.find(d => d.id === roundId)?.ctpHoles || [];
    if (table) table.refresh();
  });

  const ctpCol = ctpResults();
  table = createEditableTable({
    mount: mount.querySelector('#sa-ctp-table'),
    collection: ctpCol,
    fixedFields: { roundId, status: 'confirmed' },
    filter: (docs) => docs.filter(d => d.roundId === roundId),
    columns: [
      {
        key: 'hole', label: 'Hole', type: 'select', parse: Number,
        options: () => ctpHolesCache.map(h => ({ value: String(h.hole), label: `Hole ${h.hole} (${h.yds || '?'}y, par ${h.par || '?'})` })),
        format: (v) => `Hole ${v}`,
      },
      {
        key: 'playerId', label: 'Winner', type: 'select',
        options: () => playersCache.map(p => ({ value: p.id, label: playerLabel(p) })),
        format: (id) => nameFor(playersCache, id),
      },
      { key: 'sponsor', label: 'Sponsor note (optional)', type: 'text' },
      statusColumn(),
    ],
    defaultNew: { hole: ctpHolesCache[0]?.hole || '', playerId: '', sponsor: '', status: 'confirmed' },
    emptyText: ctpHolesCache.length ? 'No CTP winners recorded yet.' : 'Add CTP holes in Round Setup above first.',
    validate: (row) => (!row.playerId ? 'Pick a winner.' : null),
    rowActions: approveRowActions(ctpCol),
  });

  return () => { unsubPlayers(); unsubConfig(); table.destroy(); };
}

// ── Long drive winner(s) ────────────────────────────────────────────
function renderLongDriveResults(mount, roundId) {
  mount.innerHTML = sectionHeader('Long Drive — Winner') + `<div id="sa-ld-table"></div>`;

  let playersCache = [];
  let table = null;
  const unsubPlayers = players().onChange((docs) => { playersCache = docs; if (table) table.refresh(); });

  const ldCol = longDriveResults();
  table = createEditableTable({
    mount: mount.querySelector('#sa-ld-table'),
    collection: ldCol,
    fixedFields: { roundId, status: 'confirmed' },
    filter: (docs) => docs.filter(d => d.roundId === roundId),
    columns: [
      {
        key: 'playerId', label: 'Winner', type: 'select',
        options: () => playersCache.map(p => ({ value: p.id, label: playerLabel(p) })),
        format: (id) => nameFor(playersCache, id),
      },
      { key: 'yds', label: 'Yards (optional)', type: 'number', parse: num },
      { key: 'dist', label: 'Distance note (optional)', type: 'text' },
      statusColumn(),
    ],
    defaultNew: { playerId: '', yds: '', dist: '', status: 'confirmed' },
    emptyText: 'No long-drive winner recorded yet.',
    validate: (row) => (!row.playerId ? 'Pick a winner.' : null),
    rowActions: approveRowActions(ldCol),
  });

  return () => { unsubPlayers(); table.destroy(); };
}

// ── Skins winners ────────────────────────────────────────────────────
function renderSkinsResults(mount, roundId) {
  mount.innerHTML = sectionHeader('Skins — Winners') + `<div id="sa-skins-table"></div>`;

  let playersCache = [];
  let table = null;
  const unsubPlayers = players().onChange((docs) => { playersCache = docs; if (table) table.refresh(); });

  table = createEditableTable({
    mount: mount.querySelector('#sa-skins-table'),
    collection: skinsResults(),
    fixedFields: { roundId },
    filter: (docs) => docs.filter(d => d.roundId === roundId),
    columns: [
      {
        key: 'playerId', label: 'Player', type: 'select',
        options: () => playersCache.map(p => ({ value: p.id, label: playerLabel(p) })),
        format: (id) => nameFor(playersCache, id),
      },
      { key: 'count', label: 'Skins won', type: 'number', parse: num },
      { key: 'payout', label: 'Payout ($)', type: 'number', step: '0.01', parse: num },
    ],
    defaultNew: { playerId: '', count: 1, payout: 0 },
    emptyText: 'No skins winners recorded yet.',
    validate: (row) => (!row.playerId ? 'Pick a player.' : null),
  });

  return () => { unsubPlayers(); table.destroy(); };
}
