// Small shared UI helpers for the Golfer Portal — mirrors admin/ui-helpers.js
// but kept separate since the two apps are deployed/used independently.

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
    <div style="margin-bottom:0.75rem">
      <div class="eyebrow" style="font-size:0.85rem;letter-spacing:0.08em">${title}</div>
      ${subtitle ? `<div class="hint" style="margin-top:0.2rem;color:var(--text-muted);font-size:0.72rem">${subtitle}</div>` : ''}
    </div>`;
}

export function playerLabel(p) {
  return `${p.first} ${p.last}`;
}

// Wraps arbitrary inner HTML in the standard card shell, spaced for a
// stack of cards (used throughout the golfer portal instead of tables —
// this app is phone-first, so vertical cards beat wide tables).
export function gcard(innerHtml) {
  return `<div class="card" style="margin-bottom:0.75rem">${innerHtml}</div>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
