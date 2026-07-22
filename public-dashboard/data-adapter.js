// ═══════════════════════════════════════════════
// DATA ADAPTER — subscribes to every collection the dashboard needs and
// composes them into the same in-memory shape the original
// Boyne 2026 — Scoreboard.htm's render functions consumed (see
// 01-Current-Dashboard-Analysis.md §10). This is what lets those render
// functions be ported nearly verbatim per the plan's key insight
// (02-New-Dashboard-Plan.md §4): "decouple data-shape-in-memory from
// data-source."
//
// startDataAdapter(onChange) subscribes to everything and calls
// onChange(state) once immediately and again on every underlying change.
// state shape:
//   { teams, players, settings, data, fedex, handicaps, rounds,
//     championship, sideAction, tripSideBets, ROOKIES,
//     DEFENDING_CHAMP_NAME, WEATHER_DAYS, SCHEDULE_BY_DATE }
// ═══════════════════════════════════════════════

import {
  players, teams, settings, rounds, matches, roundResults,
  sideActionRounds, ctpResults, longDriveResults, skinsResults,
  sideBets, tripDays, scheduleItems, playerHandicapHistory,
} from '../shared/data-store.js';

function fullName(p) { return p ? `${p.first} ${p.last}` : 'Unknown'; }
function abbrevName(p) { return p ? `${p.first[0]}. ${p.last}` : 'Unknown'; }

function playersById(list) {
  const map = {};
  list.forEach(p => { map[p.id] = p; });
  return map;
}

// Round/session sort: by day, then AM before PM.
function bySessionOrder(a, b) {
  return (a.day - b.day) || (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1);
}

function toLegacyMatch(m, byId, teamsMeta) {
  if (m.isTeam) {
    const redLabel = m.redRosterLabel || teamsMeta.red.name;
    const blueLabel = m.blueRosterLabel || teamsMeta.blue.name;
    return {
      label: m.label || '',
      isTeam: true,
      red: [[redLabel, redLabel]],
      blue: [[blueLabel, blueLabel]],
      redRoster: (m.redPlayerIds || []).map(id => abbrevName(byId[id])),
      blueRoster: (m.bluePlayerIds || []).map(id => abbrevName(byId[id])),
      redPts: m.redPts || 0, bluePts: m.bluePts || 0,
    };
  }
  return {
    label: m.label || '',
    isTeam: false,
    red: (m.redPlayerIds || []).map(id => { const p = byId[id]; return [p ? p.first : '?', p ? p.last : 'Player']; }),
    blue: (m.bluePlayerIds || []).map(id => { const p = byId[id]; return [p ? p.first : '?', p ? p.last : 'Player']; }),
    redPts: m.redPts || 0, bluePts: m.bluePts || 0,
  };
}

function buildDayEntries(roundsList, matchesList, byId, teamsMeta) {
  const matchesByRound = {};
  matchesList.forEach(m => { (matchesByRound[m.roundId] = matchesByRound[m.roundId] || []).push(m); });

  // The championship round is an individual strokeplay event, not a
  // Ryder Cup team-points match — the original never gave the Boyne Cup
  // round its own day-header/match-card in data.days either (it only
  // ever appeared in the FedEx/championship tab). Without this, a
  // championship round with zero matches still gets a day-header and can
  // trip the host-divider's "tied 0-0, coin flip" logic for a day that
  // was never actually contesting any points.
  const byKey = new Map();
  roundsList.filter(r => !r.isChampionship).forEach(r => {
    const key = `${r.day}::${r.session}`;
    if (!byKey.has(key)) byKey.set(key, { day: r.day, session: r.session, course: r.course, rounds: [] });
    const entry = byKey.get(key);
    const roundMatches = (matchesByRound[r.id] || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(m => toLegacyMatch(m, byId, teamsMeta));
    entry.rounds.push({
      format: r.format, id: r.id, detail: r.detail, pointsAvail: r.pointsAvail || 0,
      status: r.status, liveHole: r.liveHole, matches: roundMatches,
    });
  });
  return Array.from(byKey.values()).sort(bySessionOrder);
}

function parseTriadHours(raw) {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(',').map(s => s.trim());
  if (parts.length !== 3) return null;
  return parts.map(p => (p.toUpperCase() === 'HIGH' ? 'HIGH' : Number(p)));
}

export function startDataAdapter(onChange) {
  const cache = {
    players: [], teams: [], settings: [], rounds: [], matches: [], roundResults: [],
    sideActionRounds: [], ctpResults: [], longDriveResults: [], skinsResults: [],
    sideBets: [], tripDays: [], scheduleItems: [],
  };
  const handicapsByPlayerId = {}; // playerId -> array of {date, value}
  const handicapUnsubs = new Map(); // playerId -> unsubscribe

  function compose() {
    const byId = playersById(cache.players);
    const teamRed = cache.teams.find(t => t.id === 'red') || { name: 'Red', captainId: '' };
    const teamBlue = cache.teams.find(t => t.id === 'blue') || { name: 'Blue', captainId: '' };
    const teamsMeta = { red: teamRed, blue: teamBlue };
    const trip = cache.settings.find(s => s.id === 'trip') || {};

    const ROOKIES = new Set(cache.players.filter(p => p.rookie).map(fullName));
    const DEFENDING_CHAMP_NAME = trip.defendingChampionName || '';

    const data = {
      red: { name: teamRed.name || 'Red', captain: fullName(byId[teamRed.captainId]) },
      blue: { name: teamBlue.name || 'Blue', captain: fullName(byId[teamBlue.captainId]) },
      days: buildDayEntries(cache.rounds, cache.matches, byId, teamsMeta),
    };

    const fedex = {
      showLeaderboard: !!trip.cpcShowLeaderboard,
      players: cache.players.map(p => ({ first: p.first, last: p.last, team: p.team, total: p.fedexTotal || 0 })),
    };

    const handicaps = {};
    cache.players.forEach(p => {
      const history = handicapsByPlayerId[p.id] || [];
      if (history.length) handicaps[fullName(p)] = history.slice(-3);
    });

    const resultsFor = (roundId) => cache.roundResults
      .filter(r => r.roundId === roundId)
      .map(r => {
        const p = byId[r.playerId];
        return { first: p ? p.first : '?', last: p ? p.last : 'Player', team: p ? p.team : 'red', net: r.net, pending: r.status === 'pending' };
      });

    const eligibleRounds = [...cache.rounds].filter(r => r.fedexEligible && !r.isChampionship).sort(bySessionOrder);
    const roundsOut = eligibleRounds.map(r => ({
      id: r.id, format: r.format, day: r.day, session: r.session, course: r.course,
      status: r.status, results: resultsFor(r.id),
    }));

    const champRound = cache.rounds.find(r => r.isChampionship);
    const championship = champRound ? {
      id: champRound.id, format: champRound.format, day: champRound.day, session: champRound.session,
      course: champRound.course, status: champRound.status, results: resultsFor(champRound.id),
      winner: trip.cpcWinnerOverride || null,
    } : null;

    const sideAction = [...cache.rounds]
      .filter(r => cache.sideActionRounds.some(sa => sa.id === r.id))
      .sort(bySessionOrder)
      .map(r => {
        const config = cache.sideActionRounds.find(sa => sa.id === r.id) || {};
        const ctps = cache.ctpResults.filter(c => c.roundId === r.id).map(c => ({
          hole: c.hole, player: fullName(byId[c.playerId]), sponsor: c.sponsor, pending: c.status === 'pending',
        }));
        const ldEntries = cache.longDriveResults.filter(l => l.roundId === r.id);
        const ldConfirmed = ldEntries.filter(l => l.status !== 'pending');
        const ldPick = ldConfirmed[ldConfirmed.length - 1] || ldEntries[ldEntries.length - 1] || null;
        const longDrive = ldPick ? {
          player: fullName(byId[ldPick.playerId]), yds: ldPick.yds || null, dist: ldPick.dist || '',
          pending: ldPick.status === 'pending',
        } : null;
        const skins = cache.skinsResults.filter(s => s.roundId === r.id).map(s => ({
          player: fullName(byId[s.playerId]), count: s.count, payout: s.payout,
        }));
        const roundBets = cache.sideBets.filter(b => b.roundId === r.id);
        return {
          id: r.id, day: r.day, session: r.session, format: r.format, course: r.course,
          detail: config.potDetail || '', status: r.status,
          ctpHoles: config.ctpHoles || [], ldHole: config.ldHole || null, noSkins: !!config.noSkins,
          ctps, longDrive, skins, sideBets: roundBets,
        };
      });

    const tripSideBets = cache.sideBets.filter(b => !b.roundId);

    const WEATHER_DAYS = [...cache.tripDays]
      .sort((a, b) => (a.dayNum ?? 0) - (b.dayNum ?? 0))
      .map(d => ({
        date: d.date, dayNum: d.dayNum, dayName: d.dayName, location: d.location,
        course: d.course, lat: d.lat, lon: d.lon, triadHours: parseTriadHours(d.triadHours),
      }));

    const SCHEDULE_BY_DATE = {};
    cache.scheduleItems.forEach(item => {
      (SCHEDULE_BY_DATE[item.date] = SCHEDULE_BY_DATE[item.date] || []).push(item);
    });
    Object.values(SCHEDULE_BY_DATE).forEach(list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

    onChange({
      teams: teamsMeta, players: cache.players, settings: trip,
      data, fedex, handicaps, rounds: roundsOut, championship, sideAction, tripSideBets,
      ROOKIES, DEFENDING_CHAMP_NAME, WEATHER_DAYS, SCHEDULE_BY_DATE,
      heroTitle: trip.heroTitle || 'Trip Dashboard', tripDateLabel: trip.tripDateLabel || '',
    });
  }

  function syncHandicapSubscriptions() {
    const currentIds = new Set(cache.players.map(p => p.id));
    // Unsubscribe players no longer on the roster.
    for (const [id, unsub] of handicapUnsubs) {
      if (!currentIds.has(id)) { unsub(); handicapUnsubs.delete(id); delete handicapsByPlayerId[id]; }
    }
    // Subscribe any new players.
    cache.players.forEach(p => {
      if (handicapUnsubs.has(p.id)) return;
      const unsub = playerHandicapHistory(p.id).onChange((docs) => {
        handicapsByPlayerId[p.id] = docs;
        compose();
      });
      handicapUnsubs.set(p.id, unsub);
    });
  }

  const subs = [
    players().onChange((docs) => { cache.players = docs; syncHandicapSubscriptions(); compose(); }),
    teams().onChange((docs) => { cache.teams = docs; compose(); }),
    settings().onChange((docs) => { cache.settings = docs; compose(); }),
    rounds().onChange((docs) => { cache.rounds = docs; compose(); }),
    matches().onChange((docs) => { cache.matches = docs; compose(); }),
    roundResults().onChange((docs) => { cache.roundResults = docs; compose(); }),
    sideActionRounds().onChange((docs) => { cache.sideActionRounds = docs; compose(); }),
    ctpResults().onChange((docs) => { cache.ctpResults = docs; compose(); }),
    longDriveResults().onChange((docs) => { cache.longDriveResults = docs; compose(); }),
    skinsResults().onChange((docs) => { cache.skinsResults = docs; compose(); }),
    sideBets().onChange((docs) => { cache.sideBets = docs; compose(); }),
    tripDays().onChange((docs) => { cache.tripDays = docs; compose(); }),
    scheduleItems().onChange((docs) => { cache.scheduleItems = docs; compose(); }),
  ];

  return () => {
    subs.forEach(u => u());
    handicapUnsubs.forEach(u => u());
    handicapUnsubs.clear();
  };
}
