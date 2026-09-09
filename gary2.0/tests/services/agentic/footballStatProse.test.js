// FOOTBALL TOOL RESULTS READ AS SENTENCES (founder, Sep 9 2026): the NE @ SEA
// card recited "0.0896 sack rate" and "-0.199 EPA/play" because the football
// branch of summarizeStatForContext handed Gary a JSON dump. Rates read as
// percentages, EPA as points per play, nothing dropped, nothing invented.
import { describe, it, expect } from 'vitest';
import { renderFootballStat, formatFootballValue } from '../../../src/services/agentic/orchestrator/footballStatProse.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

const payload = {
  category: 'Pass Protection',
  data_scope: 'Sack and QB-hit rate from play-by-play; pressure from PFR charting',
  reading_note: 'Sacks are the outcome; pressures are the process.',
  home: { team: 'Seattle Seahawks', sacks_allowed: 41, sack_rate_allowed: 0.0533, pocket_time_seconds: 2.41, primary_qb: 'Sam Darnold', rank: null },
  away: { team: 'New England Patriots', sacks_allowed: 55, sack_rate_allowed: 0.0896, epa_per_play: -0.199, blitzed: [{ player: 'Drake Maye', times_blitzed: 120, pressure_pct: 0.31 }] },
};

describe('football stat prose', () => {
  it('formats rates as percentages, EPA as points per play, nulls as not available', () => {
    expect(formatFootballValue('sack_rate_allowed', 0.0896)).toBe('9.0%');
    expect(formatFootballValue('epa_per_play', -0.199)).toBe('-0.20 points per play');
    expect(formatFootballValue('pocket_time_seconds', 2.41)).toBe('2.41 s');
    expect(formatFootballValue('sacks_allowed', 55)).toBe('55');
    expect(formatFootballValue('rank', null)).toBe('not available');
  });

  it('renders the whole payload as labeled lines in the caller\'s team order', () => {
    const text = renderFootballStat('PASS_PROTECTION', payload, 'Seattle Seahawks', 'New England Patriots', { homeFirst: false });
    expect(text.startsWith('PASS_PROTECTION:\ncategory: Pass Protection')).toBe(true);
    expect(text.indexOf('New England Patriots (New England Patriots):')).toBeLessThan(text.indexOf('Seattle Seahawks (Seattle Seahawks):'));
    expect(text).toContain('sack rate allowed: 9.0%');
    expect(text).toContain('EPA per play: -0.20 points per play');
    expect(text).toContain('blitzed: Drake Maye, times blitzed 120, pressure pct 31.0%');
    expect(text).toContain('primary QB: Sam Darnold');
    expect(text).toContain('rank: not available');
    expect(text).not.toContain('0.0896');
    expect(text).not.toContain('{');
  });

  it('the summarizer hands football tool results to the renderer, not JSON', () => {
    const out = summarizeStatForContext(payload, 'PASS_PROTECTION', 'Seattle Seahawks', 'New England Patriots', 'americanfootball_nfl');
    expect(out).toContain('sack rate allowed: 5.3%');
    expect(out).not.toContain('"sack_rate_allowed"');
  });
});
