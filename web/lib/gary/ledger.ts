import { computeRecord, effectiveOdds, isLegitPropResult, type Record_ } from './results';
import type { GameResultRow, PropResultRow } from './types';

const GRADED = new Set(['won', 'lost', 'push']);

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // Spreadsheet programs may evaluate cells beginning with these characters.
  // Prefix a literal apostrophe so public text exports cannot become formulas.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface PublicResultsLedger {
  games: GameResultRow[];
  props: PropResultRow[];
}

/** The decided, legitimate rows that power both public download formats. */
export function publicResultsLedger(
  games: GameResultRow[],
  props: PropResultRow[],
): PublicResultsLedger {
  const graded = (result: string | null) => GRADED.has((result ?? '').trim().toLowerCase());
  return {
    games: games.filter(row => graded(row.result)),
    props: props.filter(row => graded(row.result) && isLegitPropResult(row)),
  };
}

/** Public, stable export shape for the same ledger rendered on /results. */
export function resultsCsv(games: GameResultRow[], props: PropResultRow[]): string {
  const ledger = publicResultsLedger(games, props);
  const rows: unknown[][] = [[
    'kind', 'date', 'league', 'matchup', 'selection', 'result',
    'final_or_actual', 'odds', 'confidence',
  ]];

  for (const row of ledger.games) {
    rows.push([
      'game', row.game_date, row.league, row.matchup, row.pick_text,
      row.result, row.final_score, effectiveOdds(row.pick_text), row.confidence,
    ]);
  }
  for (const row of ledger.props) {
    const selection = row.pick_text ?? [row.player_name, row.bet, row.line_value, row.prop_type]
      .filter(value => value !== null && value !== undefined && String(value).length > 0)
      .join(' ');
    rows.push([
      'prop', row.game_date, '', row.matchup, selection, row.result,
      row.actual_value, effectiveOdds(row.pick_text, row.odds), '',
    ]);
  }

  return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`;
}

export interface MonthlyAudit {
  month: string;
  record: Record_;
}

export function monthlyGameAudit(rows: GameResultRow[]): MonthlyAudit[] {
  const buckets = new Map<string, GameResultRow[]>();
  for (const row of rows) {
    const month = (row.game_date ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !GRADED.has((row.result ?? '').trim().toLowerCase())) continue;
    buckets.set(month, [...(buckets.get(month) ?? []), row]);
  }
  return [...buckets]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthRows]) => ({ month, record: computeRecord(monthRows) }));
}

export interface ConfidenceAudit {
  label: string;
  floor: number;
  count: number;
  averageConfidence: number;
  record: Record_;
}

function confidencePercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return percent >= 50 && percent <= 100 ? percent : null;
}

/** Outcome calibration by displayed confidence band; ungraded/invalid rows are excluded. */
export function confidenceAudit(rows: GameResultRow[]): ConfidenceAudit[] {
  const floors = [50, 60, 70, 80, 90];
  return floors.flatMap(floor => {
    const upper = floor === 90 ? 101 : floor + 10;
    const bucket = rows.filter(row => {
      const confidence = confidencePercent(row.confidence);
      return confidence !== null && confidence >= floor && confidence < upper &&
        GRADED.has((row.result ?? '').trim().toLowerCase());
    });
    if (bucket.length === 0) return [];
    const averageConfidence = Math.round(
      bucket.reduce((sum, row) => sum + (confidencePercent(row.confidence) ?? 0), 0) / bucket.length,
    );
    return [{
      label: floor === 90 ? '90–100' : `${floor}–${floor + 9}`,
      floor,
      count: bucket.length,
      averageConfidence,
      record: computeRecord(bucket),
    }];
  });
}
