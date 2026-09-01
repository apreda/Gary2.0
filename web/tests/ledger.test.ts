import { describe, expect, it } from 'vitest';
import { confidenceAudit, monthlyGameAudit, publicResultsLedger, resultsCsv } from '@/lib/gary/ledger';
import type { GameResultRow, PropResultRow } from '@/lib/gary/types';

const games: GameResultRow[] = [
  { game_date: '2026-08-30', league: 'MLB', matchup: 'Cubs @ Reds', pick_text: 'Cubs ML -118', result: 'won', final_score: '6-3', confidence: 0.72 },
  { game_date: '2026-08-29', league: 'MLB', matchup: 'Rays @ Padres', pick_text: 'Rays +1.5 -105', result: 'lost', final_score: '2-5', confidence: 68 },
  { game_date: '2026-07-20', league: 'MLB', matchup: 'A @ B', pick_text: 'Over 8 +100', result: 'push', final_score: '4-4', confidence: 0.72 },
];

const props: PropResultRow[] = [
  { game_date: '2026-08-30', player_name: 'A, Jr.', prop_type: 'hits', line_value: 1.5, actual_value: 2, result: 'won', odds: '-110', pick_text: '"A, Jr." Over 1.5 Hits', matchup: 'Cubs @ Reds', bet: 'Over' },
];

describe('public ledger exports and audits', () => {
  it('exports game and prop rows as escaped CSV', () => {
    const csv = resultsCsv(games, props);
    expect(csv).toContain('kind,date,league,matchup,selection,result,final_or_actual,odds,confidence');
    expect(csv).toContain("game,2026-08-30,MLB,Cubs @ Reds,Cubs ML -118,won,6-3,'-118,0.72");
    expect(csv).toContain('"""A, Jr."" Over 1.5 Hits"');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('keeps downloads aligned to decided, legitimate public results', () => {
    const ungraded = { ...games[0], result: null };
    const placeholder: PropResultRow = {
      game_date: '2026-08-30', player_name: null, prop_type: null, line_value: null,
      actual_value: null, result: 'won', odds: null, pick_text: null, matchup: null, bet: null,
    };
    const ledger = publicResultsLedger([...games, ungraded], [...props, placeholder]);
    expect(ledger.games).toEqual(games);
    expect(ledger.props).toEqual(props);
  });

  it('neutralizes spreadsheet-formula prefixes in CSV text', () => {
    const csv = resultsCsv([{ ...games[0], pick_text: '=HYPERLINK("bad")' }], []);
    expect(csv).toContain("'=HYPERLINK");
  });

  it('builds newest-first monthly records', () => {
    const audit = monthlyGameAudit(games);
    expect(audit.map(row => row.month)).toEqual(['2026-08', '2026-07']);
    expect(audit[0].record).toMatchObject({ wins: 1, losses: 1, graded: 2 });
  });

  it('normalizes fractional and percent confidence into outcome bands', () => {
    const audit = confidenceAudit(games);
    expect(audit.map(row => row.label)).toEqual(['60–69', '70–79']);
    expect(audit.find(row => row.label === '70–79')).toMatchObject({ count: 2, averageConfidence: 72 });
  });
});
