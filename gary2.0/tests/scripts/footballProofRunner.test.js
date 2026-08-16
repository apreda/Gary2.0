import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../run-football-proof.js', import.meta.url), 'utf8');
const workflow = readFileSync(
  new URL('../../../.github/workflows/football-results.yml', import.meta.url),
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

  it('runs from the laptop-independent football results workflow', () => {
    expect(workflow).toContain('node run-football-proof.js');
    expect(workflow).toContain('FOOTBALL_PROOF_OUTCOME={"status":"complete"');
    expect(workflow).toContain('timeout-minutes: 60');
    expect(workflow).toContain('dates=("$(date -d yesterday +%F)" "$(date +%F)")');
    expect(workflow).toContain('node run-football-proof.js --date "$proof_date"');
    expect(workflow).toContain('proof_failed=1');
  });
});
