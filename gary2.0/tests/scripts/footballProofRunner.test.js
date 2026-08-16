import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../run-football-proof.js', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../../../.github/workflows/football-results.yml', import.meta.url),
  'utf8',
);
const liveScorePoller = readFileSync(
  new URL('../../scripts/poll-live-scores.js', import.meta.url),
  'utf8',
);
const finalizationWorker = readFileSync(
  new URL('../../scripts/run-live-finalization.js', import.meta.url),
  'utf8',
);
const proofWorker = readFileSync(
  new URL('../../scripts/run-live-football-proof.js', import.meta.url),
  'utf8',
);

describe('football proof refresh runner', () => {
  it('uses immutable stored picks and refreshes only the two proof categories', () => {
    expect(source).toContain('loadStoredFootballPicks');
    expect(source).toContain('loadPublishedFootballPicks');
    expect(source).toContain("['the_sweat'");
    expect(source).toContain("['after_gary'");
    expect(source).toContain('replaceFootballProofRows');
    expect(source).toContain('loadFootballProofIdentities');
    expect(source).toContain('lack THE NUMBER proof');
    expect(source).toContain('hydrateExactFootballGames');
    expect(source).toContain('mergeFootballProofScore');
    expect(source).not.toContain('.getGames(');
    expect(source).not.toContain('generateInsightConnections');
  });

  it('requires service-role writes and emits a structured outcome', () => {
    expect(source).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain('FOOTBALL_PROOF_OUTCOME=');
    expect(source).toContain("status = summary.failures.length ? 'failed' : 'complete'");
  });

  it('runs on the live cadence and keeps final grading retryable in the established poller', () => {
    expect(liveScorePoller).toContain('const FOOTBALL_PROOF_INTERVAL_MS = 15 * 60 * 1000');
    expect(liveScorePoller).toContain('function launchFootballProofIfDue(date, rows)');
    expect(liveScorePoller).toContain("'scripts/run-live-football-proof.js'");
    expect(liveScorePoller).toContain('queueGrading(targetDate, newlyFinal.map((row) => row.league))');
    expect(liveScorePoller.indexOf('queueGrading(targetDate, newlyFinal.map((row) => row.league))'))
      .toBeLessThan(liveScorePoller.indexOf("url: `${REST_URL}?on_conflict=date,league,game_id`"));
    expect(liveScorePoller).toContain('launchPendingGrading()');
    expect(liveScorePoller).toContain("'scripts/run-live-finalization.js'");
    expect(finalizationWorker).toContain("await runNodeScript('scripts/run-all-results.js', [date])");
    expect(finalizationWorker).toContain("await runNodeScript('run-grade-insights.js', ['--date', date])");
    expect(liveScorePoller).toContain('renameSync(tempPath, finalPath)');
    expect(finalizationWorker).toContain('function claimPendingRequests()');
    expect(finalizationWorker).toContain('renameSync(original, work)');
    expect(finalizationWorker).toContain('for (const item of claimed) unlinkSync(item.work)');
    expect(finalizationWorker).toContain('renameSync(item.work, item.original)');
    expect(liveScorePoller).toContain("spawn('/usr/bin/lockf'");
    expect(liveScorePoller).toContain("'-t', '0'");
    expect(liveScorePoller).toContain('LIVE_MAINTENANCE_LOCK');
    expect(finalizationWorker).toContain('const WORKER_DEADLINE_MS = 55 * 60 * 1000');
    expect(proofWorker).toContain('const WORKER_DEADLINE_MS = 12 * 60 * 1000');
    expect(proofWorker).toContain("'run-football-proof.js'");
    expect(proofWorker).toContain('writeFileSync(marker(date, league)');
    expect(liveScorePoller).toContain('throw new Error(`Could not read prior final-game state:');
    expect(liveScorePoller).not.toContain("stdio: 'ignore'");
  });

  it('keeps the GitHub workflow as a manual emergency/backfill path', () => {
    expect(workflow).not.toMatch(/^\s*schedule:/m);
    expect(workflow).toMatch(/^on:\n\s+workflow_dispatch:/m);
    expect(workflow).toContain('node run-football-proof.js');
    expect(workflow).toContain('FOOTBALL_PROOF_OUTCOME={"status":"complete"');
    expect(workflow).toContain('timeout-minutes: 60');
    expect(workflow).toContain('dates=("$(date -d yesterday +%F)" "$(date +%F)")');
    expect(workflow).toContain('node run-football-proof.js --date "$proof_date"');
    expect(workflow).toContain('proof_failed=1');
  });
});
