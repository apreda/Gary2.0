// gary2.0/src/services/insights/computers/wcVenueEdge.js
//
// LANE: wcVenueEdge  (category token emitted: ballpark — iOS BALLPARK lane, venue
// effects)
// "The single biggest 2026-only edge: where a match is played. Two host venues sit
//  well above sea level — Mexico City's Estadio Azteca at ~2,240m and Guadalajara's
//  Estadio Akron at ~1,566m — where visiting sides historically fade late. And a
//  June/July tournament across 16 stadiums splits sharply between open-air bowls
//  baking in afternoon heat and climate-controlled roofed venues that neutralise
//  it."
//
// RESEARCH BACK-DROP: altitude depresses aerobic output and is the standout
// 2026-specific factor; June/July afternoon kickoffs in open stadiums (Miami,
// Kansas City, Philadelphia, the New York/New Jersey bowl) stress conditioning,
// while retractable/closed + air-conditioned venues (Houston NRG, Dallas AT&T,
// Atlanta Mercedes-Benz, Vancouver BC Place) hold a controlled climate.
//
// RUNS IN BOTH SLATE SHAPES (identical RAW FIFA match objects):
//   * PREVIEW: ctx.games = ALL 104 fixtures. We surface the most notable venue
//     fixtures (cap 6), altitude first.
//   * MATCH DAY: ctx.games = today's fixtures; we surface those within the window.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed; venue names probed off getStadiums()/match.stadium, NOT guessed):
//   * RAW MATCH (ctx.games[i]): { id, datetime (ISO UTC), stadium:{ id, name,
//       city, country, capacity, latitude, longitude }, home_team:{...},
//       away_team:{...}, group:{name}, stage:{name} }.
//   * The 16 real stadium names (probed): Arrowhead Stadium (Kansas City),
//       AT&T Stadium (Arlington), BC Place (Vancouver), BMO Field (Toronto),
//       Estadio Akron (Guadalajara), Estadio Azteca (Mexico City),
//       Estadio BBVA (Monterrey), Gillette Stadium (Foxborough),
//       Hard Rock Stadium (Miami Gardens), Levi's Stadium (Santa Clara),
//       Lincoln Financial Field (Philadelphia), Lumen Field (Seattle),
//       Mercedes-Benz Stadium (Atlanta), MetLife Stadium (East Rutherford),
//       NRG Stadium (Houston), SoFi Stadium (Inglewood). Any venue we cannot map
//       is logged and skipped.
//
// NOTE on the host stadiums: the official 2026 tournament names for the Mexican
// venues differ from these data labels (Estadio Banorte = the renamed Azteca;
// Estadio BBVA in Monterrey). We key the map on the names that ACTUALLY appear in
// the fixture data and accept the alternate names as match keywords so a future
// rename does not break the join.
//
// ROW SHAPE: ONE row per qualifying fixture (max one fact per fixture, altitude
// preferred over heat). game = 'AWY @ HOM', game_id set, value '2240m' / 'OPEN AIR'
// / 'CLIMATE-CONTROLLED'. tone CAUTION (a conditions factor to weigh).
//
// Defensive contract: any missing/unmappable venue -> skip silently and never
// throw. Empty slate -> []. Emits a one-line examined/emitted summary.

import { makeRow, TONES, clampScore } from '../shared.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// 10 days so the pre-tournament look-ahead already surfaces opening-slate
// venues (Azteca's June 11 altitude card is visible from June 1, not June 4+).
const WINDOW_DAYS = 10;
const MAX_PREVIEW_ROWS = 6;

// Relevance bands (per spec).
const SCORE_ALTITUDE = 72;
const SCORE_AFTERNOON_HEAT = 64;
const SCORE_ROOFED_RELIEF = 55;

// Local afternoon window (venue-local hours) that flags a heat fixture.
const AFTERNOON_START = 12;
const AFTERNOON_END = 17;
// Altitude threshold (metres) for a notable-altitude row.
const ALTITUDE_M = 1200;

/**
 * Static venue facts, keyed by a lowercased keyword found in the real stadium
 * name. `match` is the keyword we test against the fixture's stadium name;
 * `aliases` are alternate official names that should resolve to the same facts.
 *   altitudeM  metres above sea level (0 for sea-level coastal/inland bowls)
 *   roof       'open' | 'retractable' | 'closed'
 *   heatProne  true only for open venues in hot June/July climates (so a mild
 *              open-air venue like Seattle does NOT get a misleading "heat" row)
 *   utcOffset  the venue city's June UTC offset (hours) for local-hour kickoff
 *   climate    short plain note for the copy
 */
const VENUE_FACTS = [
  { match: 'estadio azteca', aliases: ['estadio banorte', 'azteca'], city: 'Mexico City', altitudeM: 2240, roof: 'open', heatProne: false, utcOffset: -6, climate: 'open bowl at high altitude' },
  { match: 'estadio akron', aliases: ['akron'], city: 'Guadalajara', altitudeM: 1566, roof: 'open', heatProne: false, utcOffset: -6, climate: 'open bowl at moderate altitude' },
  { match: 'estadio bbva', aliases: ['estadio monterrey', 'bbva'], city: 'Monterrey', altitudeM: 540, roof: 'open', heatProne: true, utcOffset: -6, climate: 'open-air in the hot northern Mexico summer' },
  { match: 'arrowhead', aliases: [], city: 'Kansas City', altitudeM: 0, roof: 'open', heatProne: true, utcOffset: -5, climate: 'open-air in a hot, humid continental summer' },
  { match: 'at&t stadium', aliases: ['att stadium', 'at&t'], city: 'Arlington', altitudeM: 0, roof: 'retractable', heatProne: false, utcOffset: -5, climate: 'retractable roof with air conditioning' },
  { match: 'bc place', aliases: [], city: 'Vancouver', altitudeM: 0, roof: 'retractable', heatProne: false, utcOffset: -7, climate: 'retractable roof, mild Pacific climate' },
  { match: 'bmo field', aliases: [], city: 'Toronto', altitudeM: 0, roof: 'open', heatProne: false, utcOffset: -4, climate: 'open-air lakeside' },
  { match: 'gillette', aliases: [], city: 'Foxborough', altitudeM: 0, roof: 'open', heatProne: false, utcOffset: -4, climate: 'open-air New England' },
  { match: 'hard rock', aliases: [], city: 'Miami Gardens', altitudeM: 0, roof: 'open', heatProne: true, utcOffset: -4, climate: 'open-air in South Florida heat and humidity' },
  { match: "levi's", aliases: ['levis stadium'], city: 'Santa Clara', altitudeM: 0, roof: 'open', heatProne: true, utcOffset: -7, climate: 'open-air in hot Bay Area inland afternoons' },
  { match: 'lincoln financial', aliases: ['linc'], city: 'Philadelphia', altitudeM: 0, roof: 'open', heatProne: true, utcOffset: -4, climate: 'open-air in a hot mid-Atlantic summer' },
  { match: 'lumen', aliases: [], city: 'Seattle', altitudeM: 0, roof: 'open', heatProne: false, utcOffset: -7, climate: 'open-air, mild Pacific Northwest' },
  { match: 'mercedes-benz', aliases: ['mercedes benz'], city: 'Atlanta', altitudeM: 0, roof: 'closed', heatProne: false, utcOffset: -4, climate: 'closed roof with air conditioning' },
  { match: 'metlife', aliases: [], city: 'East Rutherford', altitudeM: 0, roof: 'open', heatProne: true, utcOffset: -4, climate: 'open-air in an exposed Meadowlands bowl' },
  { match: 'nrg', aliases: [], city: 'Houston', altitudeM: 0, roof: 'retractable', heatProne: false, utcOffset: -5, climate: 'retractable roof with air conditioning' },
  { match: 'sofi', aliases: [], city: 'Inglewood', altitudeM: 0, roof: 'closed', heatProne: false, utcOffset: -7, climate: 'canopy roof, climate-managed' },
];

export async function computeWcVenueEdge(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcVenueEdge] examined 0, emitted 0');
    return [];
  }

  const refDate = parseDateStr(ctx?.date);
  const isPreview = ctx?.preview === true || games.length >= 60;

  // The fixtures we consider: a bounded window around ctx.date (keeps a 104-fixture
  // preview focused on what is imminent); when no ref date is available, take all.
  const candidates = selectCandidates(games, refDate);

  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const match of candidates) {
    stats.examined += 1;
    try {
      const row = buildVenueRow(match);
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcVenueEdge] fixture error:', err?.message || err);
      // continue to next fixture
    }
  }

  // Strongest first (altitude > heat > relief), then by date for stability.
  rows.sort((a, b) => {
    if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score;
    return String(a.__when).localeCompare(String(b.__when));
  });

  // Preview can produce many — cap to the most notable. Match days are small.
  const capped = isPreview ? rows.slice(0, MAX_PREVIEW_ROWS) : rows;
  const cleaned = capped.map((r) => { const { __when, ...rest } = r; return rest; });

  stats.emitted = cleaned.length;
  console.log(`[wcVenueEdge] examined ${stats.examined}, emitted ${stats.emitted}`);
  return cleaned;
}

function buildVenueRow(match) {
  const home = match?.home_team;
  const away = match?.away_team;
  if (!home?.name || !away?.name) return null;
  const venueName = match?.stadium?.name;
  if (!venueName) return null;

  const facts = lookupVenue(venueName);
  if (!facts) {
    console.log(`[wcVenueEdge] unmapped venue: ${venueName}`);
    return null;
  }

  // (1) ALTITUDE takes priority.
  if (facts.altitudeM >= ALTITUDE_M) {
    return makeRow({
      category: 'ballpark',
      headline: `${home.name} vs ${away.name} kicks off at ${venueName}`,
      detail:
        `${venueName} sits ${facts.altitudeM.toLocaleString('en-US')}m above sea level` +
        `${isHighestVenue(facts) ? ', the highest venue of the tournament' : ''}. ` +
        `Thinner air at this elevation affects stamina and ball flight.`,
      game: wcGameLabel(match),
      value: `${facts.altitudeM}m`,
      tone: TONES.CAUTION,
      relevance_score: clampScore(SCORE_ALTITUDE),
      game_id: match.id,
      __when: match.datetime || '',
    });
  }

  // (2) AFTERNOON HEAT in a HEAT-PRONE OPEN-AIR venue (local kickoff hour from
  // UTC + the city offset). Mild open-air venues (e.g. Seattle) are excluded so
  // the copy never claims "heat" where there is none.
  const localHour = localKickoffHour(match.datetime, facts.utcOffset);
  const isAfternoon = localHour != null && localHour >= AFTERNOON_START && localHour < AFTERNOON_END;
  if (facts.roof === 'open' && facts.heatProne && isAfternoon) {
    return makeRow({
      category: 'ballpark',
      headline: `${home.name} vs ${away.name}: afternoon heat at ${venueName}`,
      detail:
        `An open-air ${prettyHour(localHour)} local kickoff at ${venueName} — ${facts.climate}. ` +
        `Conditioning is tested when matches are played in the afternoon sun.`,
      game: wcGameLabel(match),
      value: 'OPEN AIR',
      tone: TONES.CAUTION,
      relevance_score: clampScore(SCORE_AFTERNOON_HEAT),
      game_id: match.id,
      __when: match.datetime || '',
    });
  }

  // (3) ROOFED-RELIEF context for a roofed venue (afternoon or otherwise).
  if (facts.roof === 'closed' || facts.roof === 'retractable') {
    return makeRow({
      category: 'ballpark',
      headline: `${home.name} vs ${away.name}: indoors at ${venueName}`,
      detail:
        `${venueName} is a ${facts.roof === 'closed' ? 'closed-roof' : 'retractable-roof'} venue — ${facts.climate}. ` +
        `The summer heat that exposes open stadiums is removed from this fixture.`,
      game: wcGameLabel(match),
      value: 'CLIMATE-CONTROLLED',
      tone: TONES.CAUTION,
      relevance_score: clampScore(SCORE_ROOFED_RELIEF),
      game_id: match.id,
      __when: match.datetime || '',
    });
  }

  // Open-air but not an afternoon kickoff and not at altitude — nothing notable.
  return null;
}

// --- venue lookup ----------------------------------------------------------

/** Match a fixture's stadium name to its static facts by keyword / alias.
 *  Exported so wcWeather can share the roof table (skip climate-controlled venues). */
export function lookupVenue(venueName) {
  const key = String(venueName || '').toLowerCase();
  if (!key) return null;
  for (const f of VENUE_FACTS) {
    if (key.includes(f.match)) return f;
    for (const a of f.aliases) {
      if (a && key.includes(a)) return f;
    }
  }
  return null;
}

/** True for the single highest-altitude venue in the map (Estadio Azteca). */
function isHighestVenue(facts) {
  let maxM = -Infinity;
  for (const f of VENUE_FACTS) if (f.altitudeM > maxM) maxM = f.altitudeM;
  return facts.altitudeM === maxM;
}

// --- candidate window ------------------------------------------------------

/** Fixtures within the next WINDOW_DAYS of ctx.date (all of them if no ref date). */
function selectCandidates(games, refDate) {
  if (!refDate) return games.filter((m) => m?.stadium?.name && m?.home_team?.name && m?.away_team?.name);
  const out = [];
  for (const m of games) {
    if (!m?.stadium?.name || !m?.home_team?.name || !m?.away_team?.name) continue;
    const dt = parseIso(m?.datetime);
    if (!dt) continue;
    const days = (dt.getTime() - refDate.getTime()) / DAY_MS;
    if (days >= -1 && days <= WINDOW_DAYS) out.push(m);
  }
  return out;
}

// --- time helpers ----------------------------------------------------------

/**
 * Local kickoff hour (0..23) given the UTC datetime and the venue's June UTC
 * offset. The match.datetime is UTC; we add the (negative) offset and wrap.
 */
function localKickoffHour(iso, utcOffset) {
  const d = parseIso(iso);
  if (!d || !Number.isFinite(Number(utcOffset))) return null;
  let h = d.getUTCHours() + Number(utcOffset);
  h = ((h % 24) + 24) % 24;
  return h;
}

/** 13 -> "1pm", 12 -> "12pm", 16 -> "4pm". */
function prettyHour(h) {
  const hr = ((Number(h) % 24) + 24) % 24;
  const ampm = hr >= 12 ? 'pm' : 'am';
  const display = hr % 12 === 0 ? 12 : hr % 12;
  return `${display}${ampm}`;
}

/** Parse an ISO datetime string to a Date, or null. */
function parseIso(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a YYYY-MM-DD ctx.date to a UTC midnight Date, or null. */
function parseDateStr(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const mt = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return parseIso(dateStr);
  const d = new Date(Date.UTC(Number(mt[1]), Number(mt[2]) - 1, Number(mt[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "AWY @ HOM" using 3-letter FIFA codes (split on ' @ ' by the iOS tokenizer). */
function wcGameLabel(match) {
  return `${fifaCode(match?.away_team)} @ ${fifaCode(match?.home_team)}`;
}

/** 3-letter FIFA code: abbreviation -> country_code -> first 3 of name uppercased. */
function fifaCode(team) {
  const code = team?.abbreviation || team?.country_code;
  if (code) return String(code).toUpperCase().slice(0, 3);
  return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD';
}

export default { computeWcVenueEdge };
