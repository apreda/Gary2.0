import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildPass1Message,
  buildPass25Message
} from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { validateBilateralCases } from '../../../src/services/agentic/orchestrator/agentLoop.js';
import { NFL_CONSTITUTION } from '../../../src/services/agentic/constitution/nflConstitution.js';
import { NCAAF_CONSTITUTION } from '../../../src/services/agentic/constitution/ncaafConstitution.js';
import { buildSystemPrompt } from '../../../src/services/agentic/orchestrator/orchestratorMain.js';
import { footballPromptSha } from '../../../src/services/agentic/orchestrator/footballPromptSha.js';

describe('football side-symmetry contract', () => {
  it('puts the posted NFL line and both exact cover cases in the first Pass 1 turn', () => {
    const prompt = buildPass1Message(
      'verified scout',
      'Cleveland Browns',
      'Buffalo Bills',
      'August 22, 2026',
      'americanfootball_nfl',
      -2.5
    );

    expect(prompt).toContain('Posted spread: Cleveland Browns -2.5 / Buffalo Bills +2.5');
    expect(prompt).toContain('CASE FOR CLEVELAND BROWNS COVERING THE SPREAD:');
    expect(prompt).toContain('CASE FOR BUFFALO BILLS COVERING THE SPREAD:');
  });

  it('puts the posted NCAAF line and both exact cover cases in the first Pass 1 turn', () => {
    const prompt = buildPass1Message(
      'verified scout',
      'Home State',
      'Away State',
      'August 29, 2026',
      'americanfootball_ncaaf',
      7
    );

    expect(prompt).toContain('Posted spread: Home State +7 / Away State -7');
    expect(prompt).toContain('CASE FOR HOME STATE COVERING THE SPREAD:');
    expect(prompt).toContain('CASE FOR AWAY STATE COVERING THE SPREAD:');
  });

  it('does not let generic paragraphs mentioning both teams pass the strict football gate', () => {
    const generic = `${'Cleveland and Buffalo have competing strengths in this matchup. '.repeat(12)}\n\nINVESTIGATION COMPLETE`;
    const result = validateBilateralCases(generic, 'Cleveland Browns', 'Buffalo Bills', {
      requireExplicitHeadings: true
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('both_headings_missing');
  });

  it('accepts two substantial explicitly headed football cases', () => {
    const text = `CASE FOR CLEVELAND BROWNS COVERING THE SPREAD:\n${'Verified Cleveland cover-path evidence and its principal obstacle. '.repeat(8)}\n\nCASE FOR BUFFALO BILLS COVERING THE SPREAD:\n${'Verified Buffalo cover-path evidence and its principal obstacle. '.repeat(8)}\n\nINVESTIGATION COMPLETE`;
    const result = validateBilateralCases(text, 'Cleveland Browns', 'Buffalo Bills', {
      requireExplicitHeadings: true
    });

    expect(result.valid).toBe(true);
    expect(result.homeLen).toBeGreaterThanOrEqual(200);
    expect(result.awayLen).toBeGreaterThanOrEqual(200);
  });

  it('does not let a duplicated response pad a thin second case past the gate', () => {
    const response = `CASE FOR CLEVELAND BROWNS COVERING THE SPREAD:\n${'Verified Cleveland cover-path evidence and its principal obstacle. '.repeat(8)}\n\nCASE FOR BUFFALO BILLS COVERING THE SPREAD:\nThin Buffalo case.`;
    const result = validateBilateralCases(
      `${response}\n\n${response}\n\nINVESTIGATION COMPLETE`,
      'Cleveland Browns',
      'Buffalo Bills',
      { requireExplicitHeadings: true }
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('away_section_thin');
    expect(result.awayLen).toBeLessThan(200);
  });

  it('routes every normal and force-progression Pass 2.5 transition through the football case gate', () => {
    const source = readFileSync(
      new URL('../../../src/services/agentic/orchestrator/agentLoop.js', import.meta.url),
      'utf8'
    );
    const directBuilders = source.match(/\bbuildPass25Message\(/g) || [];
    const gatedTransitions = source.match(/\binjectPass25\(/g) || [];
    const gateStart = source.indexOf('const injectPass25 =');
    const strictValidation = source.indexOf('requireExplicitHeadings: true', gateStart);
    const soleBuilder = source.indexOf('buildPass25Message(', gateStart);

    expect(directBuilders).toHaveLength(1);
    expect(gatedTransitions.length).toBeGreaterThanOrEqual(4);
    expect(gateStart).toBeGreaterThan(-1);
    expect(strictValidation).toBeGreaterThan(gateStart);
    expect(soleBuilder).toBeGreaterThan(strictValidation);
  });

  it('injects a neutral football-only final checkpoint without changing NBA wording', () => {
    const nfl = buildPass25Message(
      'Cleveland Browns',
      'Buffalo Bills',
      'americanfootball_nfl',
      -2.5,
      NFL_CONSTITUTION.pass25DecisionGuards
    );
    const ncaaf = buildPass25Message(
      'Home State',
      'Away State',
      'americanfootball_ncaaf',
      -7,
      NCAAF_CONSTITUTION.pass25DecisionGuards
    );
    const nba = buildPass25Message('Home', 'Away', 'basketball_nba', -4, '');

    for (const prompt of [nfl, ncaaf]) {
      expect(prompt).toContain('FOOTBALL SIDE-INDEPENDENCE CHECK');
      expect(prompt).toContain('the sign of the spread is not evidence');
      expect(prompt).toContain('An unresolved factor remains unresolved');
      expect(prompt).not.toContain('the underdog, because the price pays far more');
      expect(prompt).not.toMatch(/take the points|lay the points|pick the favorite|pick the underdog/i);
      expect(prompt).toContain('A home pick uses "spreadHome" + "spreadHomeOdds"');
      expect(prompt).toContain('an away pick uses "spreadAway" + "spreadAwayOdds"');
      expect(prompt).not.toContain('For spread picks: use "spreadOdds" value');
    }
    expect(nfl).toContain('separate verified starter-phase evidence from verified reserve-phase evidence');
    // Aug 27 (founder, second GO of the day): the synthesis is the bare ask —
    // one human question, identical for every sport. No side cases, no
    // burden-of-proof framing, no board talk, no process narration.
    expect(nba).not.toContain('the underdog, because the price pays far more');
    for (const prompt of [nfl, ncaaf, nba]) {
      expect(prompt).toContain("What's your bet, and what are the reasons why?");
      expect(prompt).not.toContain('burden of proof');
      expect(prompt).not.toContain('Commit now');
      expect(prompt).not.toContain('BEST BET on this board');
    }
  });

  it('removes the one-sided favorite vignette from football system prompts', () => {
    const nfl = buildSystemPrompt(NFL_CONSTITUTION, 'americanfootball_nfl');
    const nba = buildSystemPrompt('', 'basketball_nba');

    expect(nfl).not.toContain('a favorite that looks ripe to be caught sleeping');
    expect(nfl).not.toMatch(/take the points|lay the points|pick the favorite|pick the underdog/i);
    // Aug 27 (founder): the dog-flavored example is gone for every sport.
    expect(nba).not.toContain('a favorite that looks ripe to be caught sleeping');
  });

  it('assigns stable, league-specific prompt-era fingerprints', () => {
    expect(footballPromptSha('americanfootball_nfl')).toMatch(/^[a-f0-9]{12}$/);
    expect(footballPromptSha('americanfootball_ncaaf')).toMatch(/^[a-f0-9]{12}$/);
    expect(footballPromptSha('americanfootball_nfl')).not.toBe(footballPromptSha('americanfootball_ncaaf'));
  });
});
