// THE WEATHER EACH NFL GAME WAS PLAYED IN (Oct 24 2026 read check: college games played in heavy rain read as ordinary
// games, and the NFL's game log had no weather either). The schedule carries each game's temperature and wind but not
// rain or snow, so those come from Open-Meteo's archived forecasts at the stadium over the game's hours (the kickoff hour
// and the three after it): one request per stadium for the season so far, cached half a day. Outdoor and open-roof games
// only.
import { siteFor } from './nflSchedule.js';
import { cachedResearch } from '../../gary/sharedResearchCache.js';
import { weatherCodeWords } from '../../providers/weatherService.js';

const API = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
const TTL_MS = 12 * 60 * 60_000;
const OUTSIDE = new Set(['outdoors', 'open']);

async function stadiumHours(site, start, end, fetchImpl, attempt = 1) {
  const params = new URLSearchParams({ latitude: String(site.lat), longitude: String(site.lon), start_date: start, end_date: end,
    hourly: 'precipitation,snowfall,weather_code', precipitation_unit: 'inch', timezone: 'UTC' });
  const res = await fetchImpl(`${API}?${params}`, { signal: AbortSignal.timeout(20_000) });
  // The free archive limits bursts: one stadium at a time, and a 429 waits and tries again (twice at most).
  if (res.status === 429 && attempt < 3) { await new Promise((r) => setTimeout(r, 4000 * attempt)); return stadiumHours(site, start, end, fetchImpl, attempt + 1); }
  if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.hourly?.time)) throw new Error('Open-Meteo archive: no hourly series');
  return body.hourly;
}

/**
 * Rain and snow over each played outdoor game's hours: Map game_id -> { precip, snow, conditions }. `rows`: schedule
 * rows of games already played; `kickoffOf(row)`: its kickoff in ms.
 */
export async function loadNflGameWeather(rows, kickoffOf, { fetchImpl = globalThis.fetch } = {}) {
  const bySite = new Map();
  for (const r of rows || []) {
    if (!OUTSIDE.has(r.roof)) continue;
    const site = siteFor(r);
    if (!site || !Number.isFinite(site.lat)) continue;
    if (!bySite.has(site.id)) bySite.set(site.id, { site, rows: [] });
    bySite.get(site.id).rows.push(r);
  }
  const out = new Map();
  for (const { site, rows: games } of bySite.values()) {
    const days = games.map((r) => new Date(kickoffOf(r)).toISOString().slice(0, 10)).sort();
    const end = new Date(Date.parse(days.at(-1)) + 86_400_000).toISOString().slice(0, 10);
    let hourly;
    try {
      hourly = await cachedResearch(`nfl_game_weather_v1:${site.id}:${days[0]}:${end}`, () => stadiumHours(site, days[0], end, fetchImpl),
        { ttlMs: TTL_MS, valid: (v) => Array.isArray(v?.time), enabled: fetchImpl === globalThis.fetch && !process.env.VITEST });
    } catch (e) {
      console.warn(`[NFL data] weather at ${site.name} not on file: ${e.message}`);
      for (const r of games) out.set(r.game_id, { missing: true });
      continue;
    }
    for (const r of games) {
      const first = hourly.time.indexOf(`${new Date(kickoffOf(r)).toISOString().slice(0, 13)}:00`);
      if (first < 0) continue;
      const span = [0, 1, 2, 3].map((k) => first + k).filter((i) => i < hourly.time.length);
      const sum = (key) => Math.round(span.reduce((a, i) => a + (Number(hourly[key]?.[i]) || 0), 0) * 100) / 100;
      out.set(r.game_id, { precip: sum('precipitation'), snow: sum('snowfall'),
        conditions: [...new Set(span.map((i) => weatherCodeWords(hourly.weather_code?.[i])).filter(Boolean))] });
    }
  }
  return out;
}

/**
 * One game's weather line, when it holds something: rain or snow over the game's hours, wind of 15 mph or more, or
 * freezing. `w`: loadNflGameWeather's entry; temperature and wind from the schedule row. Indoors or ordinary: null.
 */
export function gameWeatherLine(row, w) {
  if (!row || !OUTSIDE.has(row.roof)) return null;
  if (!w || w.missing) return 'weather: rain and snow not on file';
  const temp = row.temp === '' || row.temp == null ? null : Number(row.temp);
  const wind = row.wind === '' || row.wind == null ? null : Number(row.wind);
  const wet = w && (w.precip >= 0.05 || w.snow > 0);
  if (!wet && !(wind >= 15) && !(Number.isFinite(temp) && temp <= 32)) return null;
  return `weather: ${[wet ? `${w.snow > 0 ? `${w.snow.toFixed(1)} in. of snow, ` : ''}${w.precip.toFixed(2)} in. of precipitation over the game's first four hours${w.conditions.length ? ` (${w.conditions.join(', then ')})` : ''}` : null,
    Number.isFinite(temp) ? `${temp}°F` : null, Number.isFinite(wind) ? `wind ${wind} mph` : null].filter(Boolean).join(', ')}`;
}
