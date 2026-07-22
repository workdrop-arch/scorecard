// ═══════════════════════════════════════════════
// EDITABLE TABLE — generic CRUD table bound to a data-store collection.
// Used by every admin section instead of each one hand-rolling its own
// add/edit/delete table markup + wiring.
//
// createEditableTable({
//   mount,               // container element to render into
//   collection,          // a data-store collection accessor (players(), rounds(), ...)
//   columns,              // [{ key, label, type, options?, format?, parse?, required? }]
//   defaultNew,           // object of default values for the "add new" row
//   emptyText,            // shown when the collection has no docs
//   validate,             // optional (row) => string|null error message
//   filter,               // optional (docs) => docs, applied before rendering (e.g. scope to one round)
//   fixedFields,          // optional object merged into every save (add AND update), e.g. { roundId }.
//                         //   Required whenever a column is scoped by something that isn't itself an
//                         //   editable column — without this, "Add" would silently omit that field,
//                         //   since only declared columns are read out of the form.
//   onChange,             // optional (docs) => void, fired every time the filtered list updates
//                         //   (lets a section react to this table's data, e.g. recompute a summary)
//   rowActions,           // optional (row) => [{ label, cls, onClick(row) }] — extra buttons
//                         //   rendered before Edit/Delete on a given row. Used for things like
//                         //   an "Approve" button on golfer-submitted pending rows.
// })
// column.type: 'text' | 'number' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'readonly'
//   'readonly' renders via format()/displayValue() in both view and edit mode and is never
//   submitted by readFormRow() — pair it with fixedFields or a rowAction to actually change it.
//   options: array of {value,label} OR a function(row) => that array (for select/multiselect)
//   format(value, row): custom read-mode display string (defaults to raw value)
//   parse(rawString): transforms the raw form value before saving (e.g. Number)
//
// Returns { destroy() } — call when navigating away to unsubscribe cleanly.
// ═══════════════════════════════════════════════

import { showToast } from '../ui-helpers.js';

export function createEditableTable(config) {
  const {
    mount, collection, columns, defaultNew,
    emptyText = 'Nothing here yet.',
    validate, filter, onChange, fixedFields = {}, rowActions,
  } = config;

  let allDocs = [];
  let editingId = null;   // id of the row being edited, or null
  let addingNew = false;  // whether the "add new" form row is open
  let draft = {};         // current form values while editing/adding
  let saving = false;

  function resolveOptions(col, row) {
    const raw = typeof col.options === 'function' ? col.options(row) : (col.options || []);
    return raw;
  }

  function displayValue(col, value, row) {
    if (col.format) return col.format(value, row);
    if (col.type === 'checkbox') return value ? 'Yes' : 'No';
    if (col.type === 'multiselect') {
      const opts = resolveOptions(col, row);
      const labels = (value || []).map(v => opts.find(o => o.value === v)?.label || v);
      return labels.length ? labels.join(', ') : '—';
    }
    if (col.type === 'select') {
      const opts = resolveOptions(col, row);
      return opts.find(o => o.value === value)?.label ?? (value || '—');
    }
    if (value === '' || value == null) return '—';
    return String(value);
  }

  function fieldInput(col, row) {
    const value = draft[col.key];
    const name = `f_${col.key}`;
    if (col.type === 'readonly') {
      // Display-only in BOTH view and edit mode — no <input name="..."> is
      // rendered, so readFormRow() naturally can't find one and simply
      // omits this key from the saved row. Used for fields that are shown
      // for context (e.g. a "Pending/Confirmed" status pill) but should
      // only ever be changed via fixedFields or a dedicated rowAction,
      // never free-typed.
      const text = displayValue(col, value, row);
      return col.raw ? text : escapeHtml(text);
    }
    if (col.type === 'checkbox') {
      return `<input type="checkbox" name="${name}" ${value ? 'checked' : ''} />`;
    }
    if (col.type === 'textarea') {
      return `<textarea name="${name}" rows="2">${escapeHtml(value ?? '')}</textarea>`;
    }
    if (col.type === 'select') {
      const opts = resolveOptions(col, row);
      return `<select name="${name}">` +
        opts.map(o => `<option value="${escapeHtml(o.value)}" ${o.value === value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('') +
        `</select>`;
    }
    if (col.type === 'multiselect') {
      const opts = resolveOptions(col, row);
      const selected = new Set(value || []);
      return `<select name="${name}" multiple size="${Math.min(5, Math.max(3, opts.length))}">` +
        opts.map(o => `<option value="${escapeHtml(o.value)}" ${selected.has(o.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('') +
        `</select>`;
    }
    const inputType = col.type === 'number' ? 'number' : 'text';
    return `<input type="${inputType}" name="${name}" value="${escapeHtml(value ?? '')}" ${col.step ? `step="${col.step}"` : ''} />`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function readFormRow(formEl) {
    const row = {};
    columns.forEach(col => {
      const el = formEl.querySelector(`[name="f_${col.key}"]`);
      if (!el) return;
      let val;
      if (col.type === 'checkbox') val = el.checked;
      else if (col.type === 'multiselect') val = Array.from(el.selectedOptions).map(o => o.value);
      else val = el.value;
      row[col.key] = col.parse ? col.parse(val) : val;
    });
    return row;
  }

  async function handleSave(formEl, id) {
    if (saving) return;
    // fixedFields intentionally wins on key collisions with a column (e.g.
    // a table that always force-sets status:'confirmed' on admin saves,
    // even though `status` is also shown as a readonly column) — it's the
    // "non-negotiable via the form" set of values.
    const row = { ...readFormRow(formEl), ...fixedFields };
    if (validate) {
      const err = validate(row, id);
      if (err) { showToast(err, 'error'); return; }
    }
    saving = true;
    // Disable the button directly instead of calling render() here — a
    // full re-render would rebuild this row's inputs from `draft`, which
    // is only ever set when Edit/Add-new was first clicked and never
    // kept in sync with keystrokes. Re-rendering mid-save would visibly
    // wipe out whatever the user just typed while the write is in flight
    // (imperceptible on local storage, but would look broken over a real
    // network in Firestore mode).
    const saveBtn = mount.querySelector(`[data-save="${id ?? 'new'}"]`);
    if (saveBtn) saveBtn.disabled = true;
    try {
      if (id) await collection.update(id, row);
      else await collection.add(row);
      editingId = null;
      addingNew = false;
      showToast(id ? 'Saved.' : 'Added.');
    } catch (e) {
      console.error('[editable-table] save failed', e);
      showToast('Save failed — see console.', 'error');
      if (saveBtn) saveBtn.disabled = false; // let the user retry without losing what they typed
    } finally {
      saving = false;
      render();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this row? This cannot be undone.')) return;
    try {
      await collection.remove(id);
      showToast('Deleted.');
    } catch (e) {
      console.error('[editable-table] delete failed', e);
      showToast('Delete failed — see console.', 'error');
    }
  }

  function render() {
    const docs = filter ? filter(allDocs) : allDocs;

    const headerCells = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('') + `<th class="col-actions"></th>`;

    const bodyRows = docs.map(row => {
      if (editingId === row.id) {
        return `<tr class="is-editing" data-row-form="${row.id}">
          ${columns.map(col => `<td>${fieldInput(col, row)}</td>`).join('')}
          <td class="col-actions">
            <button type="button" class="btn small primary" data-save="${row.id}" ${saving ? 'disabled' : ''}>Save</button>
            <button type="button" class="btn small ghost" data-cancel>Cancel</button>
          </td>
        </tr>`;
      }
      const extraActions = (rowActions ? rowActions(row) : [])
        .map((a, i) => `<button type="button" class="btn small ${a.cls || 'ghost'}" data-row-action="${row.id}::${i}">${escapeHtml(a.label)}</button>`)
        .join('');
      return `<tr data-row="${row.id}">
        ${columns.map(col => {
          const text = displayValue(col, row[col.key], row);
          // format() output is only trusted as raw HTML when the column
          // explicitly opts in (col.raw === true) — every other value,
          // including whatever a format() function returns by default,
          // is escaped so admin-entered text (names, notes, etc.) can
          // never inject markup.
          return `<td>${col.raw ? text : escapeHtml(text)}</td>`;
        }).join('')}
        <td class="col-actions">
          ${extraActions}
          <button type="button" class="btn small ghost" data-edit="${row.id}">Edit</button>
          <button type="button" class="btn small danger" data-delete="${row.id}">Delete</button>
        </td>
      </tr>`;
    }).join('') || `<tr class="empty-row"><td colspan="${columns.length + 1}">${escapeHtml(emptyText)}</td></tr>`;

    const addRow = addingNew
      ? `<tr class="is-editing" data-row-form="new">
          ${columns.map(col => `<td>${fieldInput(col, {})}</td>`).join('')}
          <td class="col-actions">
            <button type="button" class="btn small primary" data-save="new" ${saving ? 'disabled' : ''}>Add</button>
            <button type="button" class="btn small ghost" data-cancel>Cancel</button>
          </td>
        </tr>`
      : '';

    mount.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}${addRow}</tbody>
        </table>
      </div>
      ${addingNew ? '' : `<div style="margin-top:0.6rem"><button type="button" class="btn primary small" data-add>+ Add</button></div>`}
    `;

    mount.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.edit;
      editingId = id;
      addingNew = false;
      draft = { ...docs.find(d => d.id === id) };
      render();
    }));
    mount.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => handleDelete(btn.dataset.delete)));
    mount.querySelectorAll('[data-row-action]').forEach(btn => btn.addEventListener('click', () => {
      const [id, idxStr] = btn.dataset.rowAction.split('::');
      const row = docs.find(d => d.id === id);
      const action = row && rowActions ? rowActions(row)[Number(idxStr)] : null;
      if (action) action.onClick(row);
    }));
    const addBtn = mount.querySelector('[data-add]');
    if (addBtn) addBtn.addEventListener('click', () => {
      addingNew = true;
      editingId = null;
      draft = { ...defaultNew };
      render();
    });
    mount.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => {
      editingId = null;
      addingNew = false;
      render();
    }));
    mount.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.save;
      const formRow = mount.querySelector(`[data-row-form="${id}"]`);
      handleSave(formRow, id === 'new' ? null : id);
    }));

    if (onChange) onChange(docs);
  }

  const unsubscribe = collection.onChange((docs) => {
    allDocs = docs;
    render();
  });

  return {
    destroy: () => unsubscribe(),
    refresh: render,
  };
}
