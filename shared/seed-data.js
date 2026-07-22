// ═══════════════════════════════════════════════
// SEED DATA — demo/placeholder content used ONLY to initialize local mode
// on a first visit (see shared/data-store.js → seedLocalIfEmpty()).
//
// This is intentionally generic placeholder content, not any real trip's
// roster — per 02-New-Dashboard-Plan.md §2.2, real trip content is entered
// once through the Admin Portal itself, whenever it's finalized. This just
// gives every CRUD screen something non-empty to render and click through
// while building/testing. Never used once a real Firebase project is
// configured (see FIREBASE_IS_CONFIGURED).
// ═══════════════════════════════════════════════

export const SEED = {
  settings: [
    {
      __id: 'trip',
      heroTitle: 'Carleton Place 2027 (Demo)',
      tripDateLabel: 'Dates TBD',
      defendingChampionName: '',
      cpcShowLeaderboard: true,
      cpcWinnerOverride: '',
    },
  ],

  teams: [
    { __id: 'red', name: 'Red Squad (Demo)', captainId: '' },
    { __id: 'blue', name: 'Blue Squad (Demo)', captainId: '' },
  ],

  players: [
    { first: 'Sam', last: 'Rivera', team: 'red', captain: true, rookie: false },
    { first: 'Jamie', last: 'Chen', team: 'red', captain: false, rookie: true },
    { first: 'Pat', last: 'Nguyen', team: 'red', captain: false, rookie: false },
    { first: 'Casey', last: 'Brooks', team: 'blue', captain: true, rookie: false },
    { first: 'Morgan', last: 'Ellis', team: 'blue', captain: false, rookie: true },
    { first: 'Drew', last: 'Kowalski', team: 'blue', captain: false, rookie: false },
  ],

  rounds: [
    {
      __id: 'demo_round_1',
      day: 1, session: 'AM', course: 'Demo Course — Front 9',
      format: 'Sample Team Format', detail: '3v3 · 18 holes',
      pointsAvail: 4, status: 'upcoming', liveHole: '',
      fedexEligible: true, isChampionship: false, order: 1,
    },
    {
      __id: 'demo_round_2',
      day: 2, session: 'PM', course: 'Demo Course — Back 9',
      format: 'Sample Championship Round', detail: 'Net strokeplay',
      pointsAvail: 0, status: 'upcoming', liveHole: '',
      fedexEligible: false, isChampionship: true, order: 2,
    },
  ],

  matches: [],
  roundResults: [],

  sideActionRounds: [
    {
      // Doc id MUST equal the round's own id (admin/sections/sideAction.js
      // reads/writes this collection via .set(roundId, patch) — an
      // auto-generated or mismatched id here would make this config
      // unfindable, same as a mismatched roundId would on any other
      // collection). See the convention note at the top of that file.
      __id: 'demo_round_1',
      roundId: 'demo_round_1',
      potDetail: 'Skins pot $0 (demo) · 1 CTP · 1 Long Drive',
      ctpHoles: [{ hole: 3, yds: 140, par: 3 }],
      ldHole: { hole: 5, yds: 460, par: 5 },
      noSkins: false,
    },
  ],
  ctpResults: [],
  longDriveResults: [],
  skinsResults: [],
  sideBets: [],

  tripDays: [
    {
      date: '2027-06-01',
      dayNum: 1, dayName: 'Tue',
      location: 'Demo Resort', course: 'Demo Course',
      lat: 45.0, lon: -76.15,
      triadHours: '',
    },
  ],
  scheduleItems: [
    {
      date: '2027-06-01', time: '9:00 AM', icon: '🏌️',
      label: 'Sample tee off', detail: 'Demo Course', kind: 'tee', order: 1,
    },
  ],
};
