// ═══════════════════════════════════════════════
// SCHEDULE / WEATHER — 02-New-Dashboard-Plan.md §5.5
//   Edit each trip day's date, course, lat/lon, and the itinerary rows
//   (time, icon, label, detail, kind: tee/draft/plain).
// ═══════════════════════════════════════════════

import { tripDays, scheduleItems } from '../../shared/data-store.js';
import { createEditableTable } from '../components/editable-table.js';
import { sectionHeader, escapeHtml } from '../ui-helpers.js';

const num = (v) => (v === '' || v == null ? '' : Number(v));
const KIND_OPTIONS = [
  { value: '', label: 'Plain' },
  { value: 'tee', label: 'Tee time (emphasized)' },
  { value: 'draft', label: 'Draft (emphasized)' },
];

export async function renderSchedule(mount) {
  mount.innerHTML = `
    <div class="subsection" id="sched-days"></div>
    <div class="subsection" id="sched-items"></div>
  `;

  const daysTable = renderTripDaysTable(mount.querySelector('#sched-days'));
  const disposeItems = renderScheduleItemsSection(mount.querySelector('#sched-items'));

  return () => { daysTable.destroy(); disposeItems(); };
}

// ── Trip days (date, course, lat/lon for the weather API) ──────────────
function renderTripDaysTable(mount) {
  mount.innerHTML = sectionHeader(
    'Trip Days',
    'One row per day. Lat/lon are needed for the weather tab; find them with any map app (right-click a spot → "what’s here").'
  ) + `<div id="trip-days-table"></div>`;

  return createEditableTable({
    mount: mount.querySelector('#trip-days-table'),
    collection: tripDays(),
    columns: [
      { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text' },
      { key: 'dayNum', label: 'Day #', type: 'number', parse: num },
      { key: 'dayName', label: 'Weekday', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'course', label: 'Course', type: 'text' },
      { key: 'lat', label: 'Latitude', type: 'number', step: '0.0001', parse: num },
      { key: 'lon', label: 'Longitude', type: 'number', step: '0.0001', parse: num },
      { key: 'triadHours', label: 'Custom triad hours (optional)', type: 'text' },
    ],
    defaultNew: { date: '', dayNum: 1, dayName: '', location: '', course: '', lat: '', lon: '', triadHours: '' },
    emptyText: 'No trip days yet.',
    validate: (row) => {
      if (!row.date?.trim()) return 'Date is required.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date.trim())) return 'Date must be in YYYY-MM-DD format.';
      return null;
    },
  });
}

// ── Itinerary rows, scoped to one selected day ──────────────────────
function renderScheduleItemsSection(mount) {
  mount.innerHTML = sectionHeader('Daily Itinerary', 'Pick a day, then manage its schedule rows.') +
    `<div class="field" style="max-width:420px;margin-bottom:0.9rem">
      <label>Day</label>
      <select id="sched-day-select"><option value="">— add trip days above first —</option></select>
    </div>
    <div id="sched-items-table-mount"></div>`;

  const select = mount.querySelector('#sched-day-select');
  const tableMount = mount.querySelector('#sched-items-table-mount');
  let currentTable = null;

  function dayLabel(d) {
    return `${d.date || '(no date)'} — Day ${d.dayNum ?? '?'} ${d.dayName ? `(${escapeHtml(d.dayName)})` : ''}`.trim();
  }

  function mountTableFor(date) {
    if (currentTable) currentTable.destroy();
    if (!date) { tableMount.innerHTML = ''; currentTable = null; return; }
    currentTable = createEditableTable({
      mount: tableMount,
      collection: scheduleItems(),
      fixedFields: { date },
      filter: (docs) => docs.filter(d => d.date === date).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      columns: [
        { key: 'time', label: 'Time', type: 'text' },
        { key: 'icon', label: 'Icon (emoji)', type: 'text' },
        { key: 'label', label: 'Label', type: 'text' },
        { key: 'detail', label: 'Detail', type: 'text' },
        { key: 'kind', label: 'Emphasis', type: 'select', options: () => KIND_OPTIONS, format: (v) => KIND_OPTIONS.find(o => o.value === v)?.label || 'Plain' },
        { key: 'order', label: 'Order', type: 'number', parse: num },
      ],
      defaultNew: { time: '', icon: '', label: '', detail: '', kind: '', order: 1 },
      emptyText: 'No schedule rows for this day yet.',
      validate: (row) => (!row.label?.trim() ? 'Label is required.' : null),
    });
  }

  const unsubDays = tripDays().onChange((docs) => {
    const sorted = [...docs].sort((a, b) => (a.dayNum ?? 0) - (b.dayNum ?? 0));
    const prevValue = select.value;
    select.innerHTML = sorted.length
      ? sorted.map(d => `<option value="${d.date}">${dayLabel(d)}</option>`).join('')
      : '<option value="">— add trip days above first —</option>';
    const stillExists = sorted.some(d => d.date === prevValue);
    select.value = stillExists ? prevValue : (sorted[0]?.date || '');
    mountTableFor(select.value);
  });

  select.addEventListener('change', () => mountTableFor(select.value));

  return () => {
    unsubDays();
    if (currentTable) currentTable.destroy();
  };
}
