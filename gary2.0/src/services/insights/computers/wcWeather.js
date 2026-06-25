// gary2.0/src/services/insights/computers/wcWeather.js
//
// LANE: wcWeather  (category token emitted: ballpark — iOS BALLPARK lane)
// "The actual forecast at kickoff." Live match-day weather for World Cup
// fixtures, fetched from Open-Meteo (free, no API key) by the stadium's
// latitude/longitude carried on the raw FIFA match object (match.stadium).
//
// COMPLEMENTS wcVenueEdge: that lane states STATIC venue facts (altitude, roof,
// heat-prone climate); this lane adds the LIVE forecast — notable heat, strong
// wind, or rain that shapes how a specific match plays today.
//
// WINDOW: only fixtures within WEATHER_WINDOW_DAYS (Open-Meteo is reliable ~7
// days out; a forecast three weeks ahead is noise). In preview mode (the full
// 104-fixture list) this bounds the fetches to what's imminent.
//
// SKIPS: roofed / climate-controlled venues (closed + retractable) — the forecast
// doesn't reach an air-conditioned pitch. Uses wcVenueEdge's shared roof table.
//
// TONE: CAUTION (a conditions factor to weigh), matching wcVenueEdge.
//
// DATA SHAPES (confirmed live 2026-06-25):
//   * RAW MATCH (ctx.games[i]): { id, datetime (ISO UTC), stadium:{ name,
//       latitude, longitude, ... }, home_team, away_team }.
//   * Open-Meteo /v1/forecast?...&timezone=GMT returns hourly arrays keyed to
//       GMT hours, so we match the fixture's UTC kickoff hour directly (no
//       per-venue timezone math).
//
// Defensive: missing coords, roofed venue, fetch failure, or no notable weather
// -> skip that fixture silently; never throws. Slate-wide cap, relevance-ranked.

import { makeRow, TONES, clampScore } from '../shared.js';
import { lookupVenue } from './wcVenueEdge.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEATHER_WINDOW_DAYS = 5;   // stay inside Open-Meteo's reliable range
const MAX_ROWS = 6;              // slate-wide cap, relevance-ranked

// Notable-weather thresholds (soccer-tuned — a 90+ minute endurance sport).
const HOT_F = 86;        // >= ~30°C — a stamina factor over a full match
const SCORCH_F = 93;     // >= ~34°C — serious heat
const WIND_MPH = 16;     // sustained wind that moves crosses, long balls, set pieces
const RAIN_PCT = 55;     // precip probability that means a wet, quick pitch

export async function computeWcWeather(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcWeather] examined 0, emitted 0');
    return [];
  }

  const refDate = parseDateStr(ctx?.date);
  const candidates = selectCandidates(games, refDate);

  const rows = [];
  let examined = 0;
  for (const match of candidates) {
    examined += 1;
    try {
      const row = await buildWeatherRow(match);
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcWeather] fixture error:', err?.message || err);
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const capped = rows.slice(0, MAX_ROWS);
  console.log(`[wcWeather] examined ${examined}, emitted ${capped.length}`);
  return capped;
}

async function buildWeatherRow(match) {
  const home = match?.home_team;
  const away = match?.away_team;
  const stadium = match?.stadium;
  if (!home?.name || !away?.name || !stadium?.name) return null;
  // Past matches: the forecast is pointless once it's over. Skip clearly-final fixtures.
  if (/final|complete|ended|finished|\bft\b/i.test(String(match.status || ''))) return null;

  const lat = Number(stadium.latitude);
  const lon = Number(stadium.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Skip climate-controlled venues — the forecast never reaches the pitch.
  const facts = lookupVenue(stadium.name);
  if (facts && (facts.roof === 'closed' || facts.roof === 'retractable')) return null;

  const iso = String(match.datetime || '');
  const hourKey = iso.slice(0, 13);   // "2026-06-25T20"
  const dateKey = iso.slice(0, 10);   // "2026-06-25"
  if (hourKey.length < 13 || !dateKey) return null;

  const forecast = await fetchForecast(lat, lon, dateKey);
  if (!forecast) return null;
  const hr = forecast.findHour(hourKey);
  if (!hr) return null;

  const { temp, wind, precip } = hr;
  const venueName = stadium.name;

  // Surface the single most notable factor (heat > rain > wind > warm).
  let value = null;
  let headline = null;
  let lead = null;
  let score = 0;
  if (Number.isFinite(temp) && temp >= SCORCH_F) {
    value = `${Math.round(temp)}°F`; score = 70;
    headline = `${home.name} vs ${away.name}: ${Math.round(temp)}°F heat at ${venueName}`;
    lead = `It reads ${Math.round(temp)}°F at kickoff — serious heat that tests conditioning and tends to drag the second-half tempo.`;
  } else if (Number.isFinite(precip) && precip >= RAIN_PCT) {
    value = `${Math.round(precip)}% RAIN`; score = 62;
    headline = `${home.name} vs ${away.name}: rain likely at ${venueName}`;
    lead = `A ${Math.round(precip)}% chance of rain at kickoff — a wet, quick pitch that can swing passing and finishing.`;
  } else if (Number.isFinite(wind) && wind >= WIND_MPH) {
    value = `${Math.round(wind)} MPH WIND`; score = 56;
    headline = `${home.name} vs ${away.name}: ${Math.round(wind)} mph wind at ${venueName}`;
    lead = `Sustained ${Math.round(wind)} mph wind at kickoff — it pushes around crosses, long balls, and set pieces.`;
  } else if (Number.isFinite(temp) && temp >= HOT_F) {
    value = `${Math.round(temp)}°F`; score = 52;
    headline = `${home.name} vs ${away.name}: warm at ${venueName}`;
    lead = `${Math.round(temp)}°F at kickoff — warm enough to weigh on legs across 90+ minutes.`;
  } else {
    return null;   // nothing notable — stay quiet
  }

  const bits = [];
  if (Number.isFinite(temp)) bits.push(`${Math.round(temp)}°F`);
  if (Number.isFinite(wind)) bits.push(`${Math.round(wind)} mph wind`);
  if (Number.isFinite(precip)) bits.push(`${Math.round(precip)}% rain`);
  const reading = bits.join(', ');

  return makeRow({
    category: 'ballpark',
    headline,
    detail: `${lead} Conditions at ${venueName}: ${reading}.`,
    game: wcGameLabel(match),
    value,
    tone: TONES.CAUTION,
    relevance_score: clampScore(score),
    game_id: match.id,
    meta: {
      kind: 'wc_weather',
      venue: venueName,
      temp_f: Number.isFinite(temp) ? Math.round(temp) : null,
      wind_mph: Number.isFinite(wind) ? Math.round(wind) : null,
      precip_pct: Number.isFinite(precip) ? Math.round(precip) : null,
    },
  });
}

// --- Open-Meteo fetch ------------------------------------------------------

/**
 * Fetch the GMT-keyed hourly forecast for one venue/day. Returns a small object
 * with findHour(hourKey) -> { temp, wind, precip } or null. Never throws.
 */
async function fetchForecast(lat, lon, dateKey) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT'
    + `&start_date=${dateKey}&end_date=${dateKey}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    console.error('[wcWeather] fetch error:', err?.message || err);
    return null;
  }
  if (!res?.ok) return null;
  let json;
  try { json = await res.json(); } catch { return null; }
  const times = json?.hourly?.time;
  if (!Array.isArray(times)) return null;
  const temps = json.hourly.temperature_2m || [];
  const winds = json.hourly.wind_speed_10m || [];
  const precs = json.hourly.precipitation_probability || [];
  return {
    findHour(hourKey) {
      const i = times.findIndex((t) => String(t).slice(0, 13) === hourKey);
      if (i < 0) return null;
      return { temp: Number(temps[i]), wind: Number(winds[i]), precip: Number(precs[i]) };
    },
  };
}

// --- helpers (mirror wcVenueEdge) ------------------------------------------

/** Fixtures within the next WEATHER_WINDOW_DAYS of ctx.date (all if no ref date). */
function selectCandidates(games, refDate) {
  const out = [];
  for (const m of games) {
    if (!m?.stadium?.name || !m?.home_team?.name || !m?.away_team?.name) continue;
    if (!refDate) { out.push(m); continue; }
    const dt = parseIso(m?.datetime);
    if (!dt) continue;
    const days = (dt.getTime() - refDate.getTime()) / DAY_MS;
    if (days >= -1 && days <= WEATHER_WINDOW_DAYS) out.push(m);
  }
  return out;
}

/** "AWY @ HOM" using 3-letter FIFA codes (split on ' @ ' by the iOS tokenizer). */
function wcGameLabel(match) {
  return `${fifaCode(match?.away_team)} @ ${fifaCode(match?.home_team)}`;
}

function fifaCode(team) {
  const code = team?.abbreviation || team?.country_code;
  if (code) return String(code).toUpperCase().slice(0, 3);
  return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD';
}

function parseIso(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateStr(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const mt = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return parseIso(dateStr);
  const d = new Date(Date.UTC(Number(mt[1]), Number(mt[2]) - 1, Number(mt[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default { computeWcWeather };
