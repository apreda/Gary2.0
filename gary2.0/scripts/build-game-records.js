#!/usr/bin/env node
/**
 * Builds the game records (src/services/gamebygame/gameRecordStore.js): every finished game of the season not yet in
 * the store, or not at the record's current version, written up and saved. Safe to run any time; a game that isn't
 * final or whose box isn't posted yet is left for the next run.
 *
 *   node scripts/build-game-records.js --league NBA [--season 2026] [--rebuild] [--only <gameId>]
 */
await import('../src/loadEnv.js');
const { saveGameRecord, storedGameIds } = await import('../src/services/gamebygame/gameRecordStore.js');
const { ballDontLieService } = await import('../src/services/providers/ballDontLieService.js');
const { nbaSeason } = await import('../src/utils/dateUtils.js');
const { buildNbaGameRecord, NBA_RECORD_VERSION } = await import('../src/services/sports/nba/nbaGameRecord.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const league = (arg('--league') || 'NBA').toUpperCase();
if (league !== 'NBA') { console.error(`build-game-records: ${league} has no game record yet (NBA only)`); process.exit(1); }
const season = Number(arg('--season') || nbaSeason());
const rebuild = process.argv.includes('--rebuild');
const only = arg('--only');

const games = only ? [{ id: Number(only), status: 'Final' }]
  : ((await ballDontLieService.getGames('basketball_nba', { seasons: [season], per_page: 100, paginateAll: true })) || [])
    .filter((g) => /final/i.test(String(g.status)));
const stored = await storedGameIds(league, season);
const todo = games.filter((g) => rebuild || only || stored.get(String(g.id)) !== NBA_RECORD_VERSION)
  .sort((a, b) => Date.parse(a.datetime || a.date) - Date.parse(b.datetime || b.date));
console.log(`${league} ${season}: ${games.length} finished games, ${stored.size} stored, ${todo.length} to build`);

let built = 0, failed = 0, flagged = 0, i = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (i < todo.length) {
    const g = todo[i++];
    try {
      const { row } = await buildNbaGameRecord(g.id);
      await saveGameRecord(row);
      built += 1;
      const bad = row.checks.filter((c) => !c.ok);
      if (bad.length) { flagged += 1; console.log(`  ${row.game_date} ${row.away_team} @ ${row.home_team}: ${bad.map((c) => `${c.check}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`); }
    } catch (e) {
      failed += 1;
      console.log(`  game ${g.id}: not built (${e.message})`);
    }
  }
}));
console.log(`built ${built}, ${flagged} with a check that did not hold, ${failed} not built`);
process.exit(0);
