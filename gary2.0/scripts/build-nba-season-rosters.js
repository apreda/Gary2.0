#!/usr/bin/env node
/**
 * Who played for whom in a finished NBA regular season, from BDL box scores (Oct 13 2026: the desk's roster
 * changes since last season need last season's rosters, and BDL's season averages carry no team). Pages every
 * regular-season player line once, waits out BDL's rate limit, resumes from its progress file, and writes
 * data/nba/season-rosters-<season>.json: per team, each player's games, minutes, points, rebounds, assists and
 * first and last game dates for that team, plus the team's total minutes and last game date.
 *
 *   node scripts/build-nba-season-rosters.js --season 2025
 */
import '../src/loadEnv.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const season = Number(process.argv[process.argv.indexOf('--season') + 1]);
if (!Number.isInteger(season) || season < 2000) throw new Error('Usage: --season 2025');
const key = process.env.BALLDONTLIE_API_KEY;
if (!key) throw new Error('BALLDONTLIE_API_KEY is not set');
const out = resolve(`data/nba/season-rosters-${season}.json`);
const progressFile = `${out}.progress.json`;
mkdirSync(dirname(out), { recursive: true });

const minutesOf = (min) => {
  const [m, s] = String(min || '0').split(':').map(Number);
  return (Number.isFinite(m) ? m : 0) + (Number.isFinite(s) ? s / 60 : 0);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let state = existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')) : { cursor: null, pages: 0, rows: 0, teams: {} };
const save = (file, data) => { writeFileSync(`${file}.tmp`, JSON.stringify(data)); renameSync(`${file}.tmp`, file); };

for (;;) {
  const params = new URLSearchParams({ 'seasons[]': String(season), postseason: 'false', per_page: '100' });
  if (state.cursor != null) params.set('cursor', String(state.cursor));
  const response = await fetch(`https://api.balldontlie.io/nba/v1/stats?${params}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(30_000) }).catch((e) => ({ ok: false, status: 0, error: e }));
  if (response.status === 429 || response.status === 0 || response.status >= 500) {
    const wait = Math.min(Number(response.headers?.get?.('retry-after')) || 15, 65) * 1000;
    console.log(`page ${state.pages + 1}: ${response.status || response.error?.message}; waiting ${wait / 1000}s`);
    await sleep(wait);
    continue;
  }
  if (!response.ok) throw new Error(`BDL ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  for (const row of payload.data || []) {
    const teamId = row.team?.id;
    const playerId = row.player?.id;
    const minutes = minutesOf(row.min);
    if (teamId == null || playerId == null || minutes <= 0) continue;
    const team = (state.teams[teamId] ||= { name: row.team.full_name, minutes: 0, lastGame: null, players: {} });
    const date = String(row.game?.date || '').slice(0, 10);
    const p = (team.players[playerId] ||= { name: `${row.player.first_name} ${row.player.last_name}`.trim(), games: 0, minutes: 0, pts: 0, reb: 0, ast: 0, first: date, last: date });
    p.games += 1; p.minutes += minutes; p.pts += row.pts || 0; p.reb += row.reb || 0; p.ast += row.ast || 0;
    if (date && date < p.first) p.first = date;
    if (date && date > p.last) p.last = date;
    team.minutes += minutes;
    if (date && (!team.lastGame || date > team.lastGame)) team.lastGame = date;
  }
  state.pages += 1;
  state.rows += (payload.data || []).length;
  state.cursor = payload.meta?.next_cursor ?? null;
  save(progressFile, state);
  if (state.pages % 10 === 0) console.log(`page ${state.pages}: ${state.rows} rows`);
  if (state.cursor == null) break;
  // Pace to the key's own limit (the NBA trial allows 5 a minute; the paid tier 600).
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  if (Number.isFinite(limit) && limit > 0 && limit < 120) await sleep(Math.ceil(60_000 / limit) + 500);
}

save(out, { season, source: 'BDL /nba/v1/stats, regular season', builtAt: new Date().toISOString(), rows: state.rows, teams: state.teams });
console.log(`wrote ${out}: ${Object.keys(state.teams).length} teams, ${state.rows} rows, ${state.pages} pages`);
