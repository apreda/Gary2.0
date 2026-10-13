/** Game-time weather for open-air parks (split from tomorrowService.js, Oct 13 2026). */
import axios from 'axios';
import { getETDateStr } from '../dailySlateService.js';
import { nameKey, abbrFor } from './basics.js';

/* ──── WEATHER (outdoor MLB, day-before forecast via Open-Meteo) ──────────── */

// Domed / retractable-roof MLB parks — closed/controlled, so the open-air forecast
// never reaches the field. Static fact set (like RIVALRY_PAIRS); skip these games.
const ROOFED_PARKS = new Set([
  'tropicana field',          // Rays (fixed)
  'rogers centre',            // Blue Jays (retractable)
  'chase field',              // Diamondbacks (retractable)
  'minute maid park',         // Astros (retractable) — also "daikin park"
  'daikin park',
  'globe life field',         // Rangers (retractable)
  'american family field',    // Brewers (retractable)
  't-mobile park',            // Mariners (retractable)
  'loandepot park',           // Marlins (retractable)
  'loandepot park ',
]);
function isRoofedPark(name) {
  return ROOFED_PARKS.has(nameKey(name).replace(/\s+/g, ' ').trim());
}

const WEATHER_TEMP_HOT = 88;   // °F — "ball carries" note
const WEATHER_TEMP_COLD = 50;  // °F — "heavy air" note
const WEATHER_WIND_MIN = 12;   // mph — wind "in play"
const WEATHER_RAIN_PCT = 40;   // % — rain watch

/**
 * WEATHER — first-pitch forecast for tomorrow's OUTDOOR MLB games, via Open-Meteo
 * (free, key-less, day-before-available forecast source). Each game's venue
 * lat/lon comes from the MLB Stats API venue feed; the
 * hourly forecast is read at the game's UTC start hour. GROUNDED: domed/closed
 * parks are skipped, and a game with no resolvable coords or forecast is omitted —
 * never a fabricated reading. Each row carries temp_f / wind_mph / precip_pct + a
 * short plain-text `note` for the single most notable factor (or null when calm).
 */
export async function buildWeather(schedule, etDateStr, teamIndex) {
  const rows = [];
  const venueCache = new Map(); // venueId -> {lat, lon, name}
  for (const g of schedule || []) {
    try {
      const iso = g?.gameDate;
      if (!iso) continue;
      const start = new Date(iso);
      if (Number.isNaN(start.getTime()) || getETDateStr(start) !== etDateStr) continue;

      const venueName = g?.venue?.name || null;
      if (isRoofedPark(venueName)) continue; // domed/closed — forecast is moot

      const coords = await venueCoords(g?.venue?.id, venueCache);
      if (!coords) continue;
      // Roof flag from the venue feed is the authoritative skip when present.
      if (coords.roofType && /dome|retractable|closed|indoor/i.test(coords.roofType)) continue;

      const hourKey = iso.slice(0, 13); // "2026-06-27T23" (UTC, matches Open-Meteo GMT)
      const dateKey = iso.slice(0, 10);
      const fc = await openMeteoHour(coords.lat, coords.lon, dateKey, hourKey);
      if (!fc) continue;

      const { temp, wind, precip } = fc;
      const awayName = g?.teams?.away?.team?.name;
      const homeName = g?.teams?.home?.team?.name;

      // Single most notable plain-text note (rain > heat > wind > cold), or null.
      let note = null;
      if (Number.isFinite(precip) && precip >= WEATHER_RAIN_PCT) note = `${Math.round(precip)}% rain`;
      else if (Number.isFinite(temp) && temp >= WEATHER_TEMP_HOT) note = `${Math.round(temp)}° — ball carries`;
      else if (Number.isFinite(wind) && wind >= WEATHER_WIND_MIN) note = `${Math.round(wind)} mph wind`;
      else if (Number.isFinite(temp) && temp <= WEATHER_TEMP_COLD) note = `${Math.round(temp)}° — heavy air`;

      rows.push({
        league: 'MLB',
        matchup: awayName && homeName ? `${awayName} @ ${homeName}` : null,
        away_abbr: abbrFor(awayName, teamIndex),
        home_abbr: abbrFor(homeName, teamIndex),
        venue: venueName,
        temp_f: Number.isFinite(temp) ? Math.round(temp) : null,
        wind_mph: Number.isFinite(wind) ? Math.round(wind) : null,
        precip_pct: Number.isFinite(precip) ? Math.round(precip) : null,
        note,
        commence_time: iso,
      });
    } catch (e) {
      console.warn(`[TomorrowBoard] weather game skipped: ${e.message}`);
    }
  }
  return rows;
}

/** MLB venue lat/lon (+ roofType) from the Stats API venue feed; cached per id. Never throws. */
async function venueCoords(venueId, cache) {
  if (venueId == null) return null;
  if (cache.has(venueId)) return cache.get(venueId);
  let result = null;
  try {
    const { data } = await axios.get(
      `https://statsapi.mlb.com/api/v1/venues/${venueId}?hydrate=location`,
      { timeout: 8000 },
    );
    const v = data?.venues?.[0];
    const lat = Number(v?.location?.defaultCoordinates?.latitude);
    const lon = Number(v?.location?.defaultCoordinates?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      result = { lat, lon, name: v?.name || null, roofType: v?.roofType || null };
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] venue ${venueId} coords failed: ${e.message}`);
  }
  cache.set(venueId, result);
  return result;
}

/** Open-Meteo hourly forecast at a UTC hour key -> { temp, wind, precip } or null. Never throws. */
async function openMeteoHour(lat, lon, dateKey, hourKey) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT'
      + `&start_date=${dateKey}&end_date=${dateKey}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    const times = data?.hourly?.time;
    if (!Array.isArray(times)) return null;
    const i = times.findIndex((t) => String(t).slice(0, 13) === hourKey);
    if (i < 0) return null;
    return {
      temp: Number(data.hourly.temperature_2m?.[i]),
      wind: Number(data.hourly.wind_speed_10m?.[i]),
      precip: Number(data.hourly.precipitation_probability?.[i]),
    };
  } catch (e) {
    console.warn(`[TomorrowBoard] Open-Meteo fetch failed: ${e.message}`);
    return null;
  }
}
