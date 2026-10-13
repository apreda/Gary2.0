/**
 * Kickoff weather from Open-Meteo (Aug 25 2026).
 *
 * Keyless, no account, no vendor relationship. Replaces a grounded web search
 * that asked a language model what the weather was — slow, unverifiable, and
 * pinned to "today" rather than to kickoff.
 *
 * The number that matters most here is WIND. The football grounding prompt is
 * instructed to omit weather below 25 mph sustained, which is far past the
 * point where it changes a game: field goals and the deep ball start moving
 * around 15 mph, and a 15-20 mph crosswind was reaching Gary as a clear day.
 *
 * Every figure is a forecast for the kickoff HOUR at the stadium's own
 * coordinates. Forecasts are not facts, so the return states its issue time
 * and how far ahead of kickoff it was made — a five-day-out wind number and a
 * two-hour-out wind number are not the same evidence.
 */

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 10_000;

/** Open-Meteo WMO weather codes, collapsed to what a bettor would say. */
const WMO = new Map([
  [0, 'clear'], [1, 'mostly clear'], [2, 'partly cloudy'], [3, 'overcast'],
  [45, 'fog'], [48, 'freezing fog'],
  [51, 'light drizzle'], [53, 'drizzle'], [55, 'heavy drizzle'],
  [61, 'light rain'], [63, 'rain'], [65, 'heavy rain'],
  [66, 'freezing rain'], [67, 'heavy freezing rain'],
  [71, 'light snow'], [73, 'snow'], [75, 'heavy snow'], [77, 'snow grains'],
  [80, 'rain showers'], [81, 'heavy rain showers'], [82, 'violent rain showers'],
  [85, 'snow showers'], [86, 'heavy snow showers'],
  [95, 'thunderstorm'], [96, 'thunderstorm with hail'], [99, 'severe thunderstorm with hail']
]);

function compassPoint(degrees) {
  if (!Number.isFinite(degrees)) return null;
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(degrees / 22.5) % 16];
}

/**
 * Fetch the forecast for one kickoff.
 *
 * @param {{lat:number, lon:number}} venue  stadium coordinates
 * @param {Date|string} kickoff             kickoff time
 * @returns {Promise<object|null>}          null on any failure — weather is
 *                                          context, never a reason to lose a pick
 */
export async function getKickoffWeather(venue, kickoff, { fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (!venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lon)) return null;
  const kickoffDate = kickoff instanceof Date ? kickoff : new Date(kickoff);
  if (!Number.isFinite(kickoffDate.getTime())) return null;

  const params = new URLSearchParams({
    latitude: String(venue.lat),
    longitude: String(venue.lon),
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,relative_humidity_2m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'UTC',
    forecast_days: '16'
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let payload;
  try {
    const response = await fetchImpl(`${OPEN_METEO_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const hours = payload?.hourly?.time;
  if (!Array.isArray(hours) || hours.length === 0) return null;

  // Open-Meteo returns whole hours in UTC. Match the kickoff hour exactly
  // rather than the nearest reading, so a 20:15 kickoff reads the 20:00 hour
  // and never silently borrows a value from the following morning.
  const target = `${kickoffDate.toISOString().slice(0, 13)}:00`;
  const index = hours.indexOf(target);
  if (index === -1) {
    // The fetch SUCCEEDED and the hour simply is not in the series — the
    // kickoff is past the forecast horizon (or before it). That is a
    // different fact from "the lookup failed", and Gary should be able to
    // tell them apart: a Week 1 game two weeks out has no forecast yet, and
    // saying so is honest where a generic "unavailable" reads like a fault.
    const first = hours[0];
    const last = hours[hours.length - 1];
    return {
      unavailable: true,
      reason: target > last
        ? `Kickoff (${target}Z) is beyond the forecast horizon, which currently reaches ${last}Z.`
        : `Kickoff (${target}Z) is before the available forecast window, which starts ${first}Z.`,
      horizon_end_utc: last
    };
  }

  const at = (key) => {
    const series = payload.hourly[key];
    const value = Array.isArray(series) ? series[index] : null;
    return Number.isFinite(value) ? value : null;
  };

  const windSpeed = at('wind_speed_10m');
  const gusts = at('wind_gusts_10m');
  const direction = at('wind_direction_10m');
  const leadHours = Math.round((kickoffDate.getTime() - now.getTime()) / 3_600_000);

  return {
    kickoff_utc: target,
    temperature_f: at('temperature_2m'),
    feels_like_f: at('apparent_temperature'),
    wind_mph: windSpeed,
    wind_gust_mph: gusts,
    wind_direction: compassPoint(direction),
    precip_chance_pct: at('precipitation_probability'),
    precip_inches: at('precipitation'),
    humidity_pct: at('relative_humidity_2m'),
    conditions: WMO.get(at('weather_code')) ?? null,
    // Open-Meteo reports the elevation it actually resolved the coordinates
    // to. It doubles as a coordinate check: a stadium that comes back at the
    // wrong elevation is a stadium in the wrong place.
    elevation_m: Number.isFinite(payload?.elevation) ? payload.elevation : null,
    forecast_lead_hours: Number.isFinite(leadHours) ? leadHours : null,
    provenance: `Open-Meteo hourly forecast for the kickoff hour, issued ~${leadHours}h ahead`
  };
}

/**
 * Plain description of the wind, with no claim about what it means for the
 * game. Layer 1 only: Gary decides whether it matters.
 */
export function windDescription(weather) {
  if (!weather || !Number.isFinite(weather.wind_mph)) return null;
  const parts = [`${Math.round(weather.wind_mph)} mph`];
  if (weather.wind_direction) parts.push(`from the ${weather.wind_direction}`);
  if (Number.isFinite(weather.wind_gust_mph) && weather.wind_gust_mph > weather.wind_mph + 3) {
    parts.push(`gusting ${Math.round(weather.wind_gust_mph)}`);
  }
  return parts.join(' ');
}
