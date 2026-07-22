// Small shared UI helpers for the admin app — toast feedback + a couple
// of markup snippets reused across sections.

let toastEl = null;
let toastTimer = null;

export function showToast(message, kind = 'ok') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.toggle('error', kind === 'error');
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

export function sectionHeader(title, subtitle) {
  return `
    <div style="margin-bottom:1rem">
      <div class="eyebrow" style="font-size:0.85rem;letter-spacing:0.08em">${title}</div>
      ${subtitle ? `<div class="hint" style="margin-top:0.2rem;color:var(--text-muted);font-size:0.72rem">${subtitle}</div>` : ''}
    </div>`;
}

export function playerLabel(p) {
  return `${p.first} ${p.last}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ── Golfer-submission review helpers ──────────────────────────────────
// Shared by any admin table whose rows can arrive from the Golfer Portal
// as status:"pending" (roundResults, ctpResults, longDriveResults — see
// the schema notes in shared/data-store.js). Missing/undefined status is
// treated as "confirmed" so pre-existing admin-entered rows (saved before
// this feature existed) don't retroactively look pending.

// A readonly column (see admin/components/editable-table.js) showing a
// Pending/Confirmed pill. Pair with fixedFields:{status:'confirmed'} on
// the table so any admin save (add or edit) auto-confirms a row.
export function statusColumn() {
  return {
    key: 'status', label: 'Status', type: 'readonly', raw: true,
    format: (v) => {
      const isPending = v === 'pending';
      return `<span class="status-pill ${isPending ? 'upcoming' : 'final'}">${isPending ? 'Pending' : 'Confirmed'}</span>`;
    },
  };
}

// rowActions() factory — adds a one-click "Approve" button to pending rows only.
export function approveRowActions(collection) {
  return (row) => {
    if (row.status !== 'pending') return [];
    return [{
      label: 'Approve',
      cls: 'primary',
      onClick: async (r) => {
        try {
          await collection.update(r.id, { status: 'confirmed' });
          showToast('Approved.');
        } catch (e) {
          console.error('[approveRowActions] approve failed', e);
          showToast('Approve failed — see console.', 'error');
        }
      },
    }];
  };
}
