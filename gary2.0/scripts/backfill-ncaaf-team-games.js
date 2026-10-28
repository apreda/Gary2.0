#!/usr/bin/env node
// One season's college finals into team_games, week by week (the team card's season; ncaafTeamGames.js keeps it
// current from the live-score poller after this).
//   node scripts/backfill-ncaaf-team-games.js            # this season
//   node scripts/backfill-ncaaf-team-games.js --season 2026 --dry
import '../src/loadEnv.js';

const { ballDontLieService: bdl } = await import('../src/services/providers/ballDontLieService.js');
const { ncaafTeamGameRows, syncNcaafTeamGames } = await import('../src/services/sports/ncaaf/ncaafTeamGames.js');

const args = process.argv.slice(2);
const at = args.indexOf('--season');
const season = at >= 0 ? Number(args[at + 1]) : new Date().getFullYear();
const dry = args.includes('--dry');

let total = 0;
for (let week = 0; week <= 17; week++) {
  const games = (await bdl.getGames('americanfootball_ncaaf', { seasons: [season], weeks: [week], per_page: 100 }, 1)) || [];
  const finals = ncaafTeamGameRows(games);
  if (!games.length) continue;
  if (dry) { console.log(`week ${week}: ${games.length} games, ${finals.length} finals`); total += finals.length; continue; }
  const r = await syncNcaafTeamGames(games);
  if (r.error) throw new Error(`week ${week}: ${r.error}`);
  console.log(`week ${week}: ${games.length} games, ${r.finals} finals stored`);
  total += r.finals || 0;
}
console.log(`${dry ? 'would store' : 'stored'} ${total} college finals for ${season}`);
