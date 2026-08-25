import { describe, expect, it } from 'vitest';
import { getKickoffWeather, windDescription } from '../../src/services/weatherService.js';
import { NFL_VENUES, nflVenueFor, weatherApplies } from '../../src/services/agentic/tools/statRouters/footballVenues.js';

/**
 * Weather was the one environment factor Gary had no honest access to. The
 * grounding prompt is instructed to omit it below 25 mph sustained — well past
 * where kicking and the deep ball start moving — so a 15-20 mph crosswind
 * reached the desk as a clear day.
 */

const hourly = (startIso, count) => {
  const times = [];
  const t = new Date(startIso).getTime();
  for (let i = 0; i < count; i += 1) times.push(new Date(t + i * 3600000).toISOString().slice(0, 16));
  return times;
};

function fakeMeteo({ start = '2026-09-13T16:00:00Z', count = 6, elevation = 100, overrides = {} } = {}) {
  const time = hourly(start, count);
  const fill = (v) => new Array(count).fill(v);
  const payload = {
    elevation,
    hourly: {
      time,
      temperature_2m: fill(41),
      apparent_temperature: fill(33),
      precipitation_probability: fill(20),
      precipitation: fill(0),
      wind_speed_10m: fill(18),
      wind_gusts_10m: fill(29),
      wind_direction_10m: fill(270),
      weather_code: fill(3),
      relative_humidity_2m: fill(70),
      ...overrides
    }
  };
  return async () => ({ ok: true, json: async () => payload });
}

describe('kickoff weather', () => {
  it('reads the kickoff HOUR, not the nearest or the first reading', async () => {
    const fetchImpl = fakeMeteo({
      overrides: { wind_speed_10m: [1, 2, 3, 22, 5, 6] } // index 3 == 19:00Z
    });
    const w = await getKickoffWeather({ lat: 42, lon: -71 }, '2026-09-13T19:45:00Z', { fetchImpl });
    expect(w.kickoff_utc).toBe('2026-09-13T19:00');
    expect(w.wind_mph).toBe(22);
  });

  it('reports wind with direction and gusts', async () => {
    const w = await getKickoffWeather({ lat: 42, lon: -71 }, '2026-09-13T17:00:00Z', { fetchImpl: fakeMeteo() });
    expect(windDescription(w)).toBe('18 mph from the W gusting 29');
  });

  it('omits a gust that is not meaningfully above the sustained wind', async () => {
    const fetchImpl = fakeMeteo({ overrides: { wind_gusts_10m: new Array(6).fill(19) } });
    const w = await getKickoffWeather({ lat: 42, lon: -71 }, '2026-09-13T17:00:00Z', { fetchImpl });
    expect(windDescription(w)).toBe('18 mph from the W');
  });

  it('separates "beyond the forecast horizon" from "the lookup failed"', async () => {
    const w = await getKickoffWeather({ lat: 42, lon: -71 }, '2026-10-30T17:00:00Z', { fetchImpl: fakeMeteo() });
    expect(w.unavailable).toBe(true);
    expect(w.reason).toMatch(/beyond the forecast horizon/);
    expect(w.horizon_end_utc).toBeTruthy();
  });

  it('returns null — never a partial guess — when the request fails', async () => {
    const boom = async () => { throw new Error('network down'); };
    expect(await getKickoffWeather({ lat: 42, lon: -71 }, '2026-09-13T17:00:00Z', { fetchImpl: boom })).toBeNull();
  });

  it('refuses a venue without real coordinates', async () => {
    expect(await getKickoffWeather(null, '2026-09-13T17:00:00Z', { fetchImpl: fakeMeteo() })).toBeNull();
    expect(await getKickoffWeather({ lat: null, lon: null }, '2026-09-13T17:00:00Z', { fetchImpl: fakeMeteo() })).toBeNull();
  });
});

describe('NFL venue table', () => {
  it('covers all 32 teams', () => {
    expect(Object.keys(NFL_VENUES)).toHaveLength(32);
  });

  it('gives every venue usable coordinates and a roof', () => {
    for (const [team, v] of Object.entries(NFL_VENUES)) {
      expect(Number.isFinite(v.lat), `${team} lat`).toBe(true);
      expect(Number.isFinite(v.lon), `${team} lon`).toBe(true);
      expect(['open', 'dome', 'retractable'], `${team} roof`).toContain(v.roof);
      expect(['grass', 'turf'], `${team} surface`).toContain(v.surface);
    }
  });

  it('puts both shared-stadium pairs in the same place', () => {
    expect(NFL_VENUES['New York Giants'].lat).toBe(NFL_VENUES['New York Jets'].lat);
    expect(NFL_VENUES['Los Angeles Rams'].lon).toBe(NFL_VENUES['Los Angeles Chargers'].lon);
  });

  it('treats a retractable roof as weather-relevant, a fixed dome as not', () => {
    // A retractable roof's state is a game-day decision this table cannot
    // know, so the forecast still has to be fetched and flagged conditional.
    expect(weatherApplies('retractable')).toBe(true);
    expect(weatherApplies('open')).toBe(true);
    expect(weatherApplies('dome')).toBe(false);
  });

  it('resolves a team name without guessing across teams', () => {
    expect(nflVenueFor('Green Bay Packers').venue).toBe('Lambeau Field');
    expect(nflVenueFor('Packers').venue).toBe('Lambeau Field');
    expect(nflVenueFor('Nonexistent Team')).toBeNull();
    // "New York" alone matches two franchises — it must refuse, not pick one.
    expect(nflVenueFor('New York')).toBeNull();
  });
});
