// ═══════════════════════════════════════════════
// WEATHER TAB — ported from the original wx*/renderWeather (Analysis
// §9.1–9.2). Fetch/fallback logic (forecast → 3-yr historical average →
// hardcoded climatology) is unchanged. Generalized: the original
// hardcoded "May" and "northern Michigan" since it was a one-off file for
// a specific trip; here the month is parsed from each day's own date, and
// the climatology fallback is labeled as a rough generic estimate rather
// than tied to one location.
// ═══════════════════════════════════════════════

import { escapeHtml } from './helpers.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let weatherCache = null;
let weatherCacheDatesKey = null;
let weatherLoading = false;
let latestWeatherState = null;

function wxDaysUntilDate(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target - today) / 86400000);
}

function wmoIcon(code) {
  if (code == null) return '·';
  if (code === 0) return '☀';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁';
  if (code >= 45 && code <= 48) return '🌫';
  if (code >= 51 && code <= 57) return '🌦';
  if (code >= 61 && code <= 67) return '🌧';
  if (code >= 71 && code <= 77) return '🌨';
  if (code >= 80 && code <= 82) return '🌧';
  if (code >= 95) return '⛈';
  return '·';
}

function wmoDesc(code) {
  if (code == null) return '—';
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 66 && code <= 67) return 'Freezing rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return '—';
}

function wxCompass(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function wxFormatTime(iso) {
  if (!iso) return '—';
  const hm = iso.slice(11, 16);
  if (!hm || hm.length < 4) return '—';
  const [h, m] = hm.split(':').map(Number);
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function wxHourIndex(timeArr, hour) {
  if (!timeArr) return -1;
  for (let i = 0; i < timeArr.length; i++) {
    const h = parseInt(timeArr[i].slice(11, 13), 10);
    if (h === hour) return i;
  }
  return -1;
}

function fmtHourLabel(h) {
  if (h === 0) return '12AM';
  if (h === 12) return '12PM';
  if (h < 12) return h + 'AM';
  return (h - 12) + 'PM';
}

async function wxFetchForecast(lat, lon, date) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation,weather_code` +
    `&daily=sunrise,sunset` +
    `&timezone=auto&start_date=${date}&end_date=${date}` +
    `&wind_speed_unit=kmh&temperature_unit=celsius&precipitation_unit=mm`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.warn('[weather] forecast fetch network error', url, e);
    throw new Error('network');
  }
  if (!res.ok) {
    console.warn('[weather] forecast HTTP', res.status, url);
    throw new Error('forecast HTTP ' + res.status);
  }
  const j = await res.json();
  if (!j.hourly || !j.hourly.time || j.hourly.time.length === 0) {
    console.warn('[weather] forecast empty payload', date, j);
    throw new Error('forecast: no data for ' + date);
  }
  return j;
}

async function wxFetchHistorical(lat, lon, date) {
  const [, mm, dd] = date.split('-');
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear - 2, thisYear - 3];
  const datasets = (await Promise.all(years.map(async y => {
    const d = `${y}-${mm}-${dd}`;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover` +
      `&daily=sunrise,sunset` +
      `&timezone=auto&start_date=${d}&end_date=${d}` +
      `&wind_speed_unit=kmh&temperature_unit=celsius`;
    try {
      const res = await fetch(url);
      if (!res.ok) { console.warn('[weather] archive HTTP', res.status, 'for', d, url); return null; }
      const j = await res.json();
      if (!j.hourly || !j.hourly.time || j.hourly.time.length === 0) { console.warn('[weather] archive empty payload for', d, j); return null; }
      return j;
    } catch (e) {
      console.warn('[weather] archive fetch error for', d, e);
      return null;
    }
  }))).filter(Boolean);
  if (datasets.length === 0) throw new Error('archive returned no data');
  return wxAverageData(datasets, date);
}

// Hardcoded last-resort fallback — a generic temperate-climate diurnal
// curve, used ONLY when both the live forecast and the 3-year historical
// archive fail (e.g. no network at all). Not tied to any specific
// location or month; it's deliberately in the middle of the range so
// it's "plausible" rather than "accurate."
function wxClimatology(date) {
  const temp = [6, 5, 5, 5, 4, 4, 5, 7, 9, 11, 13, 14, 15, 16, 17, 17, 16, 15, 13, 12, 11, 10, 8, 7];
  const feels = [3, 2, 2, 2, 1, 1, 2, 5, 7, 9, 11, 13, 14, 15, 16, 16, 15, 14, 12, 10, 9, 8, 6, 4];
  const wind = [12, 12, 11, 11, 10, 10, 11, 13, 15, 17, 18, 19, 20, 21, 21, 20, 19, 17, 15, 13, 12, 12, 12, 12];
  const wdir = Array(24).fill(290);
  const precipProb = Array(24).fill(35);
  const precip = Array(24).fill(0);
  const wcode = Array(24).fill(2);
  return {
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => `${date}T${String(i).padStart(2, '0')}:00`),
      temperature_2m: temp, apparent_temperature: feels, wind_speed_10m: wind,
      wind_direction_10m: wdir, precipitation_probability: precipProb, precipitation: precip, weather_code: wcode,
    },
    daily: { sunrise: [`${date}T06:15`], sunset: [`${date}T20:55`] },
  };
}

function wxFeelsLike(t, v) {
  if (t == null) return null;
  if (v == null || v <= 4.8 || t > 10) return t;
  const p = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * t - 11.37 * p + 0.3965 * t * p;
}

function wxInferWmoCode(precipMm, cloudPct) {
  if (precipMm != null && precipMm >= 0.5) return 61;
  if (precipMm != null && precipMm >= 0.1) return 51;
  if (cloudPct == null) return 2;
  if (cloudPct >= 85) return 3;
  if (cloudPct >= 40) return 2;
  if (cloudPct >= 15) return 1;
  return 0;
}

function wxAverageData(datasets, targetDate) {
  const base = datasets[0];
  const hours = base.hourly.time.length;
  const out = {
    hourly: {
      time: Array.from({ length: hours }, (_, i) => `${targetDate}T${String(i).padStart(2, '0')}:00`),
      temperature_2m: [], apparent_temperature: [], wind_speed_10m: [], wind_direction_10m: [],
      precipitation: [], precipitation_probability: [], weather_code: [],
    },
    daily: {
      sunrise: [`${targetDate}T${((base.daily.sunrise?.[0]) || '').slice(11, 16) || '06:10'}`],
      sunset: [`${targetDate}T${((base.daily.sunset?.[0]) || '').slice(11, 16) || '20:50'}`],
    },
  };
  const avgScalar = (key, i) => {
    const vals = datasets.map(d => d.hourly[key]?.[i]).filter(v => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  for (let i = 0; i < hours; i++) {
    const tAvg = avgScalar('temperature_2m', i);
    const wAvg = avgScalar('wind_speed_10m', i);
    const pAvg = avgScalar('precipitation', i);
    const cAvg = avgScalar('cloud_cover', i);
    out.hourly.temperature_2m.push(tAvg);
    out.hourly.wind_speed_10m.push(wAvg);
    out.hourly.precipitation.push(pAvg);
    out.hourly.apparent_temperature.push(wxFeelsLike(tAvg, wAvg));
    out.hourly.weather_code.push(wxInferWmoCode(pAvg, cAvg));

    const dirs = datasets.map(d => d.hourly.wind_direction_10m?.[i]).filter(v => v != null);
    if (dirs.length) {
      const x = dirs.reduce((s, v) => s + Math.cos(v * Math.PI / 180), 0);
      const y = dirs.reduce((s, v) => s + Math.sin(v * Math.PI / 180), 0);
      out.hourly.wind_direction_10m.push((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
    } else {
      out.hourly.wind_direction_10m.push(null);
    }

    const precips = datasets.map(d => d.hourly.precipitation?.[i]).filter(v => v != null);
    out.hourly.precipitation_probability.push(precips.length ? (precips.filter(p => p > 0.1).length / precips.length) * 100 : null);
  }
  return out;
}

async function wxLoadDay(day) {
  const daysOut = wxDaysUntilDate(day.date);
  if (daysOut <= 16) {
    try {
      const data = await wxFetchForecast(day.lat, day.lon, day.date);
      return { day, data, source: 'forecast', daysOut, error: null };
    } catch (e) {
      console.warn('[weather] forecast failed, falling back to archive for', day.date, e.message);
    }
  }
  try {
    const data = await wxFetchHistorical(day.lat, day.lon, day.date);
    return { day, data, source: 'archive', daysOut, error: null };
  } catch (e) {
    console.warn('[weather] archive failed, using climatology for', day.date, e.message);
  }
  return { day, data: wxClimatology(day.date), source: 'climatology', daysOut, error: null };
}

async function wxLoadAll(weatherDays) {
  return Promise.all(weatherDays.map(wxLoadDay));
}

function wxRenderCard(state, { day, data, source, error }) {
  const badgeClass = source === 'forecast' ? 'forecast' : 'historical';
  const badgeText = source === 'forecast' ? 'Forecast' : 'Historical data';
  const [, mm, dd] = day.date.split('-');
  const monthLabel = MONTH_NAMES[Number(mm) - 1] || '';
  const header = `
    <div class="weather-card-head">
      <div>
        <div class="weather-date"><span class="wx-day-num">Day ${day.dayNum}</span>${escapeHtml(day.dayName)} · ${monthLabel} ${Number(dd)}</div>
        <div class="weather-course">${escapeHtml(day.location)}${day.course && day.course !== '—' ? ' · ' + escapeHtml(day.course) : ''}</div>
      </div>
      <div class="weather-badge ${badgeClass}">${badgeText}</div>
    </div>`;

  const scheduleItems = state.SCHEDULE_BY_DATE[day.date] || [];
  const scheduleHtml = scheduleItems.length ? `
    <div class="schedule-block">
      <div class="schedule-title">Schedule</div>
      ${scheduleItems.map(item => {
        const kindCls = item.kind === 'tee' ? ' is-tee' : (item.kind === 'draft' ? ' is-draft' : '');
        const detail = item.detail ? `<span class="schedule-detail">${escapeHtml(item.detail)}</span>` : '';
        return `<div class="schedule-row${kindCls}">
            <div class="schedule-time">${escapeHtml(item.time)}</div>
            <div class="schedule-icon">${item.icon || ''}</div>
            <div class="schedule-label">${escapeHtml(item.label)}${detail}</div>
          </div>`;
      }).join('')}
    </div>` : '';

  if (error || !data) {
    return `<div class="weather-card">${header}<div class="weather-error">Weather unavailable${error ? ' (' + escapeHtml(error) + ')' : ''}</div>${scheduleHtml}</div>`;
  }

  const tempAt = (hour) => { const idx = wxHourIndex(data.hourly.time, hour); return idx >= 0 ? data.hourly.temperature_2m[idx] : null; };
  const codeAt = (hour) => { const idx = wxHourIndex(data.hourly.time, hour); return idx >= 0 ? data.hourly.weather_code[idx] : null; };
  let maxT = null, maxHour = 15;
  for (let h = 9; h <= 21; h++) {
    const t = tempAt(h);
    if (t != null && (maxT == null || t > maxT)) { maxT = t; maxHour = h; }
  }

  const triadHours = day.triadHours || [9, 'HIGH', 20];
  const triadPoints = triadHours.map(h => {
    if (h === 'HIGH') return { label: 'HIGH', temp: maxT, code: codeAt(maxHour), emphasis: true };
    return { label: fmtHourLabel(h), temp: tempAt(h), code: codeAt(h) };
  });
  if (triadPoints.every(p => p.temp == null)) {
    return `<div class="weather-card">${header}<div class="weather-error">Weather unavailable (no hourly data)</div>${scheduleHtml}</div>`;
  }

  const triadHtml = triadPoints.map((p, i) => {
    const sep = i < triadPoints.length - 1 ? `<div class="wx-triad-sep"></div>` : '';
    const tempHtml = p.temp != null ? `${Math.round(p.temp)}°` : '—';
    const itemCls = p.emphasis ? ' is-high' : '';
    return `<div class="wx-triad-item${itemCls}">
        <div class="wx-triad-icon">${wmoIcon(p.code)}</div>
        <div class="wx-triad-time">${p.label}</div>
        <div class="wx-triad-temp">${tempHtml}</div>
      </div>${sep}`;
  }).join('');

  const idx3p = wxHourIndex(data.hourly.time, 15);
  const wCode = idx3p >= 0 ? data.hourly.weather_code[idx3p] : null;
  const conditionHtml = `<div class="wx-condition"><span class="wx-icon">${wmoIcon(wCode)}</span>${wmoDesc(wCode)}</div>`;

  const wind = idx3p >= 0 ? data.hourly.wind_speed_10m[idx3p] : null;
  const windDir = idx3p >= 0 ? data.hourly.wind_direction_10m[idx3p] : null;
  const precipWeights = { 10: 1, 11: 1, 12: 2, 13: 2, 14: 2, 15: 2, 16: 2, 17: 2, 18: 1, 19: 1 };
  let precipNum = 0, precipDen = 0, precipMm = 0, precipMmHas = false;
  for (const [h, w] of Object.entries(precipWeights)) {
    const i = wxHourIndex(data.hourly.time, parseInt(h, 10));
    const v = i >= 0 ? data.hourly.precipitation_probability[i] : null;
    if (v != null) { precipNum += v * w; precipDen += w; }
    const mm = i >= 0 ? data.hourly.precipitation[i] : null;
    if (mm != null) { precipMm += mm; precipMmHas = true; }
  }
  const precip = precipDen > 0 ? precipNum / precipDen : null;
  const sunset = data.daily?.sunset?.[0];

  const windHtml = (wind != null)
    ? `<span class="wx-wind-arrow" style="transform:rotate(${(((windDir || 0) + 180) % 360)}deg);">↑</span>${Math.round(wind)} km/h ${wxCompass(windDir)}`.trim()
    : '—';
  const precipHtml = (precip != null) ? `${Math.round(precip)}%` : '—';
  const precipMmHtml = precipMmHas ? `${precipMm.toFixed(1)} mm` : '—';
  const sunsetHtml = sunset ? wxFormatTime(sunset) : '—';

  return `
    <div class="weather-card">
      ${header}
      <div class="wx-section">
        ${conditionHtml}
        <div class="wx-triad">${triadHtml}</div>
        <div class="wx-meta">
          <div class="wx-meta-item"><span class="wx-meta-label">Wind (3PM)</span><span class="wx-meta-value">${windHtml}</span></div>
          <div class="wx-meta-item"><span class="wx-meta-label">Precip (round)</span><span class="wx-meta-value">${precipHtml}</span></div>
          <div class="wx-meta-item"><span class="wx-meta-label">Total precip</span><span class="wx-meta-value">${precipMmHtml}</span></div>
          <div class="wx-meta-item"><span class="wx-meta-label">Sunset</span><span class="wx-meta-value">${sunsetHtml}</span></div>
        </div>
      </div>
      ${scheduleHtml}
    </div>`;
}

function wxRenderFromCache(state) {
  const view = document.getElementById('view-weather');
  if (!view || !weatherCache) return;
  const allForecast = weatherCache.every(r => r.source === 'forecast');
  const anyForecast = weatherCache.some(r => r.source === 'forecast');
  const tripDaysOut = state.WEATHER_DAYS.length ? wxDaysUntilDate(state.WEATHER_DAYS[0].date) : 0;
  let intro;
  if (allForecast) {
    intro = `Live forecast from Open-Meteo · ${tripDaysOut} day${tripDaysOut === 1 ? '' : 's'} until Day 1.`;
  } else if (anyForecast) {
    intro = `Earlier days on live forecast, later days on historical averages. ${tripDaysOut} day${tripDaysOut === 1 ? '' : 's'} until Day 1.`;
  } else {
    intro = `Showing historical averages for these dates and this location. Live forecast takes over once the trip is within about 2 weeks.`;
  }
  view.innerHTML = `
    <div class="weather-wrap">
      <div class="weather-intro">${intro}</div>
      <div class="weather-intro" style="margin-top:-0.85rem;opacity:0.75;">HIGH = peak temp during golf hours (9a–9p), not the 24-hour max. May read lower than a phone's default weather app on cold-front days.</div>
      ${weatherCache.map(r => wxRenderCard(state, r)).join('')}
    </div>`;
}

export async function renderWeather(state) {
  const view = document.getElementById('view-weather');
  if (!view) return;

  // Track the freshest state seen even while a fetch is in flight below —
  // other collections (e.g. scheduleItems) can sync in mid-fetch, and the
  // eventual render must reflect them, not whatever was current when the
  // fetch started.
  latestWeatherState = state;

  if (!state.WEATHER_DAYS.length) {
    view.innerHTML = `<div class="weather-wrap"><div class="weather-loading">No trip days set up yet.</div></div>`;
    return;
  }

  const datesKey = state.WEATHER_DAYS.map(d => d.date).join(',');
  if (weatherCache && datesKey === weatherCacheDatesKey) { wxRenderFromCache(state); return; }
  if (weatherLoading) return;

  weatherLoading = true;
  view.innerHTML = `<div class="weather-wrap"><div class="weather-loading">Loading weather…</div></div>`;
  try {
    weatherCache = await wxLoadAll(state.WEATHER_DAYS);
    weatherCacheDatesKey = datesKey;
    wxRenderFromCache(latestWeatherState);
  } catch (e) {
    view.innerHTML = `<div class="weather-wrap"><div class="weather-error">Weather load failed: ${escapeHtml(e.message)}</div></div>`;
  } finally {
    weatherLoading = false;
  }
}
