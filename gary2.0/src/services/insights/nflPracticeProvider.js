// Dated practice participation and game designations from Gary's licensed BDL
// connection. Explicit season/week requests prevent current-week substitution.
import axios from 'axios';
import { fetchBdlPages } from '../bdlPagination.js';
import { waitForBdlRequestSlot } from '../bdlRequestGate.js';

export function nflSeasonType(value) {
  const names = { preseason: 1, regular: 2, postseason: 3 };
  return Object.hasOwn(names, value) ? names[value] :
    ([1, 2, 3].includes(Number(value)) ? Number(value) : null);
}

export async function fetchNflPracticeDesignations({ season, week, seasonType, seasonTypes, teamIds,
  client = axios, apiKey = process.env.BALLDONTLIE_API_KEY,
  waitForSlot = waitForBdlRequestSlot, signal,
} = {}) {
  const types = seasonTypes ?? [seasonType];
  if (!Number.isInteger(season) || season < 2002 || season > 2200 ||
      !Number.isInteger(week) || week < 1 || week > 22 || !Array.isArray(types) || !types.length ||
      types.length > 3 || types.some(type => !nflSeasonType(type)) ||
      !Array.isArray(teamIds) || !teamIds.length || teamIds.length > 32 ||
      teamIds.some(id => !/^\d+$/.test(String(id)) || Number(id) <= 0)) {
    throw new Error('NFL practice reports require an exact season, week, type and teams');
  }
  if (!apiKey) throw new Error('NFL practice reports require the BDL connection');
  const combined = AbortSignal.any([signal, AbortSignal.timeout(180_000)].filter(Boolean));
  return fetchBdlPages(async cursor => {
    await waitForSlot('nfl_practice_designations', { signal: combined });
    combined.throwIfAborted();
    try {
      const response = await client.get('https://api.balldontlie.io/nfl/v1/player_designations', {
        headers: { Authorization: apiKey }, timeout: 12_000, signal: combined,
        params: { season, week, 'season_types[]': [...new Set(types.map(nflSeasonType))],
          'team_ids[]': [...new Set(teamIds.map(String))], per_page: 100,
          ...(cursor != null ? { cursor } : {}) },
      });
      combined.throwIfAborted();
      if (response.status != null && (response.status < 200 || response.status >= 300)) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.data;
    } catch (error) {
      // Axios errors include credential-bearing request headers.
      if (combined.aborted) throw new Error('NFL practice report request cancelled');
      const status = Number(error?.response?.status);
      throw new Error(`NFL practice report request failed${Number.isInteger(status) ? ` (HTTP ${status})` : ''}`);
    }
  }, { label: 'NFL practice designations', maxPages: 40 });
}
