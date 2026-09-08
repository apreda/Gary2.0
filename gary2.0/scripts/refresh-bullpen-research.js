#!/usr/bin/env node
// Preview by default. Upgrade only existing, current, ungraded bullpen research
// for the explicitly selected game and team. This does not run picks or other
// insight lanes, create rows, rebuild history, or alter the original row ID.
import '../src/loadEnv.js';
import { writeFile } from 'node:fs/promises';
import { getESTDate } from '../src/utils/dateUtils.js';
import { ballDontLieService as bdl } from '../src/services/ballDontLieService.js';
import { computeBullpenFatigue, shouldUpgradeBullpenEvidence } from '../src/services/insights/computers/bullpenFatigue.js';
import { gameLabel } from '../src/services/insights/shared.js';
import { hubJudgmentRevisionFilter } from './lib/hubJudgmentStorage.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/refresh-bullpen-research.js --game-id ID --team-id ID [--output PATH] [--apply]\nPreview is the default. --apply requires an output path; originals are saved before writing. Only today’s ungraded published row can be upgraded.');
  process.exit(0);
}
const options = {};
for (let index = 0; index < args.length; index++) {
  const flag = args[index];
  if (flag === '--apply') { options.apply = true; continue; }
  if (!['--game-id', '--team-id', '--output'].includes(flag) || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`Invalid option: ${flag}`);
  }
  options[flag.slice(2)] = args[++index];
}
if (!/^\d+$/.test(options['game-id'] || '') || !/^\d+$/.test(options['team-id'] || '')) throw new Error('Explicit numeric --game-id and --team-id are required');
if (options.apply && !options.output) throw new Error('--apply requires --output for the original-row backup and receipt');
const host = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!host || !key) throw new Error('Existing service-role connection is required');
const date = getESTDate();
const scope = { date: `eq.${date}`, league: 'eq.MLB', category: 'eq.bullpen_fatigue',
  team_id: `eq.${options['team-id']}`, game_id: `eq.${options['game-id']}`, result: 'is.null' };
const request = async (filters, method = 'GET', body) => {
  const url = new URL('/rest/v1/insight_connections', host);
  url.search = new URLSearchParams(filters).toString();
  const response = await fetch(url, { method, headers: { apikey: key, Authorization: `Bearer ${key}`,
    ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Bullpen ${method} failed with HTTP ${response.status}`);
  return response.json();
};
const originals = await request({ ...scope, select: '*' });
if (originals.length !== 1) throw new Error(`Expected exactly one current ungraded published row; found ${originals.length}`);
const [stored] = originals;
const games = (await bdl.getMlbGamesForETDate(date)).filter(game => String(game.id) === options['game-id']);
if (games.length !== 1) throw new Error('Requested game is not unique on today’s verified slate');
const game = games[0];
if (!game.visitor_team && game.away_team) game.visitor_team = game.away_team;
if (![game.home_team, game.visitor_team].some(team => String(team?.id) === options['team-id'])) throw new Error('Requested team is not in the exact slate game');
const rows = await computeBullpenFatigue({ date, games, helpers: { gameLabel } });
const matches = rows.filter(row => String(row.team_id) === options['team-id'] && String(row.game_id) === options['game-id']);
if (matches.length !== 1) throw new Error('No unique complete fresh bullpen evidence; existing row was preserved');
const fresh = { ...matches[0], date, league: 'MLB' };
const shouldUpgrade = shouldUpgradeBullpenEvidence(stored, fresh, date);
const report = { observed_at: new Date().toISOString(), date, mode: options.apply ? 'apply' : 'preview',
  originals, fresh, eligible: shouldUpgrade, applied: false };
const save = async () => { if (options.output) await writeFile(options.output, JSON.stringify(report, null, 2)); };
await save();
if (options.apply && shouldUpgrade) {
  if (date !== getESTDate()) throw new Error('Eastern date changed during collection; run a fresh preview');
  const patch = { headline: fresh.headline, detail: fresh.detail, value: fresh.value, tone: fresh.tone,
    meta: { ...stored.meta, ...fresh.meta } };
  const version = stored.meta?.research_version;
  const changed = await request({ ...scope, id: `eq.${stored.id}`, detail: `eq.${stored.detail}`,
    'meta->>research_version': version == null ? 'is.null' : `eq.${version}`,
    ...hubJudgmentRevisionFilter(stored.meta) }, 'PATCH', patch);
  if (changed.length !== 1) throw new Error('Stored row changed during collection; nothing was overwritten');
  const verified = await request({ ...scope, id: `eq.${stored.id}`, select: '*' });
  if (verified.length !== 1 || verified[0].detail !== fresh.detail
    || verified[0].meta?.research_version !== fresh.meta.research_version) throw new Error('Publication readback did not match the fresh evidence');
  report.applied = true;
  report.published_at = new Date().toISOString();
  report.verified = verified[0];
  await save();
}
console.log(JSON.stringify({ date, mode: report.mode, row_id: stored.id, eligible: shouldUpgrade,
  applied: report.applied, headline: fresh.headline, detail: fresh.detail,
  source_game_ids: fresh.meta.source_game_ids, output: options.output || null }, null, 2));
