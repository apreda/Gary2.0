// Stored football picks and scores for AFTER GARY's receipts. Formerly part
// of THE SWEAT, removed on Sep 24 2026 (founder: "just get rid of it").

import axios from 'axios';
import { etDateStr } from './shared.js';
import { footballSeasonForDate } from './footballData.js';

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function flattenPicks(value, table, rowIndex) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(
        `Malformed ${table}.picks JSON at row ${rowIndex}: ${error.message}`,
        { cause: error },
      );
    }
    if (Array.isArray(parsed)) return parsed;
  }
  throw new TypeError(`Malformed ${table}.picks at row ${rowIndex}: expected an array`);
}

function restConfig(options = {}) {
  const supabaseUrl = options.supabaseUrl
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.SUPABASE_URL;
  const key = options.key
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_ANON_KEY;
  return { supabaseUrl, key, client: options.client ?? axios };
}

async function restRows(path, params, options) {
  const { supabaseUrl, key, client } = restConfig(options);
  if (!supabaseUrl || !key) throw new Error('Supabase configuration missing for football proof');
  const { data } = await client.get(`${supabaseUrl}/rest/v1/${path}`, {
    params,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!Array.isArray(data)) {
    throw new TypeError(`Malformed ${path} response: expected an array`);
  }
  return data;
}

function picksFromRows(rows, table) {
  return rows.flatMap((row, rowIndex) => {
    const picks = flattenPicks(row?.picks, table, rowIndex);
    for (const pick of picks) {
      if (!pick || typeof pick !== 'object' || Array.isArray(pick)) {
        throw new TypeError(`Malformed ${table}.picks entry at row ${rowIndex}`);
      }
    }
    return picks;
  });
}

export async function loadStoredFootballPicks({ league, date, season, ...options }) {
  const leagueKey = String(league ?? '').toLowerCase();
  if (leagueKey === 'nfl') {
    const resolvedSeason = Number.isInteger(Number(season))
      ? Number(season)
      : footballSeasonForDate(date);
    if (!Number.isInteger(resolvedSeason)) {
      throw new TypeError('Invalid NFL date/season for football proof');
    }
    const rows = await restRows('weekly_nfl_picks', {
      season: `eq.${resolvedSeason}`,
      week_start: `lte.${date}`,
      select: 'picks',
      order: 'week_start.desc',
      limit: 3,
    }, options);
    return picksFromRows(rows, 'weekly_nfl_picks').filter((pick) => {
      const commence = pick?.commence_time;
      return String(pick?.league ?? '').toUpperCase() === 'NFL'
        && (!commence || etDateStr(commence) === date);
    });
  }
  if (leagueKey === 'ncaaf') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) {
      throw new TypeError('Invalid NCAAF date for football proof');
    }
    const rows = await restRows('daily_picks', {
      date: `eq.${date}`,
      select: 'picks',
      limit: 1,
    }, options);
    return picksFromRows(rows, 'daily_picks').filter((pick) =>
      ['NCAAF', 'AMERICANFOOTBALLNCAAF'].includes(normalize(pick?.league ?? pick?.sport).toUpperCase())
    );
  }
  return [];
}

export async function loadFootballLiveScores({ league, date, ...options }) {
  return restRows('live_scores', {
    date: `eq.${date}`,
    league: `eq.${String(league).toUpperCase()}`,
    select: 'game_id,away_score,home_score,status,detail,updated_at',
  }, options);
}

function settledScoreRow(row) {
  const match = /^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/.exec(String(row?.final_score ?? ''));
  const gameId = row?.game_id;
  if (!match || gameId == null) return null;
  return {
    game_id: String(gameId),
    away_score: Number(match[1]),
    home_score: Number(match[2]),
    status: 'final',
    detail: 'Final',
  };
}

/** Final-score fallback for the prior ET day after live_scores is pruned. */
export async function loadFootballSettledScores({ league, date, ...options }) {
  const leagueKey = String(league ?? '').toLowerCase();
  if (leagueKey === 'nfl') {
    const rows = await restRows('nfl_results', {
      game_date: `eq.${date}`,
      select: 'game_id,final_score',
      limit: 500,
    }, options);
    return rows.map(settledScoreRow).filter(Boolean);
  }
  if (leagueKey === 'ncaaf') {
    const rows = await restRows('game_results', {
      game_date: `eq.${date}`,
      league: 'eq.NCAAF',
      select: 'game_id,final_score',
      limit: 500,
    }, options);
    return rows.map(settledScoreRow).filter(Boolean);
  }
  return [];
}
