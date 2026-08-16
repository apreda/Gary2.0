import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wireRunner = readFileSync(
  new URL('../../run-wire-items.js', import.meta.url),
  'utf8',
);
const marketPulseRunner = readFileSync(
  new URL('../../run-market-pulse.js', import.meta.url),
  'utf8',
);

function expectFailureReportedAfterLeagueLoop(source) {
  const leagueLoop = source.indexOf('for (const league of leagues)');
  const failureRecorded = source.indexOf('failures += 1', leagueLoop);
  const aggregateExit = source.lastIndexOf('if (failures > 0)');

  expect(leagueLoop).toBeGreaterThan(-1);
  expect(failureRecorded).toBeGreaterThan(leagueLoop);
  expect(aggregateExit).toBeGreaterThan(failureRecorded);
  expect(source.slice(aggregateExit)).toContain('process.exit(1)');
  expect(source).not.toContain('failures === leagues.length');
}

describe('Hub league failure visibility', () => {
  it('runs the full Wire league loop before reporting any partial failure', () => {
    expectFailureReportedAfterLeagueLoop(wireRunner);
    expect(wireRunner).toMatch(
      /if \(allow\.tokens\.size === 0\) \{[\s\S]*?continue;/,
    );
    expect(wireRunner).toMatch(
      /if \(rows\.length === 0\) \{[\s\S]*?continue;/,
    );
  });

  it('persists successful Market Pulse rows before reporting a partial failure', () => {
    expectFailureReportedAfterLeagueLoop(marketPulseRunner);

    const upsert = marketPulseRunner.indexOf("supabase.from(TABLE).upsert(rows, { onConflict: 'date,league' })");
    const aggregateExit = marketPulseRunner.lastIndexOf('if (failures > 0)');
    expect(upsert).toBeGreaterThan(-1);
    expect(aggregateExit).toBeGreaterThan(upsert);
  });

  it('keeps authoritative empty Market Pulse leagues on the successful no-row path', () => {
    expect(marketPulseRunner).toMatch(
      /if \(acc\.games_counted === 0\) \{[\s\S]*?No gradeable \$\{league\} games[\s\S]*?continue;/,
    );
    expect(marketPulseRunner).toContain('if (rows.length === 0) {');
    expect(marketPulseRunner).toContain('— no rows computed for ${targetDate}.`);');
  });
});
