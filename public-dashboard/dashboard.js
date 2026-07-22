// ═══════════════════════════════════════════════
// DASHBOARD BOOTSTRAP — wires the live data adapter to the ported render
// functions, tab switching, and handicap-trends controls. See the
// original renderAll()/setupTabs()/setupHcpControls() (Analysis §11).
// ═══════════════════════════════════════════════

import { startDataAdapter } from './data-adapter.js';
import { renderRyder } from './render-ryder.js';
import { renderCarletonPlace, setupHcpControls } from './render-carletonplace.js';
import { renderSide } from './render-side.js';
import { renderWeather } from './weather.js';

const heroTitleEl = document.getElementById('hero-title-text');
const heroEventEl = document.getElementById('hero-event-text');

let latestState = null;

function renderAll(state) {
  latestState = state;
  document.title = state.heroTitle;
  heroTitleEl.textContent = state.tripDateLabel || 'Golf Trip';
  heroEventEl.textContent = state.heroTitle;

  document.getElementById('view-ryder').innerHTML = renderRyder(state);
  document.getElementById('view-carletonplace').innerHTML = renderCarletonPlace(state);
  document.getElementById('view-side').innerHTML = renderSide(state);
  renderWeather(state); // async — manages its own innerHTML + cache
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab}`));
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });
}

setupTabs();
setupHcpControls(() => latestState);
startDataAdapter(renderAll);
window.addEventListener('resize', () => { if (latestState) renderAll(latestState); });
