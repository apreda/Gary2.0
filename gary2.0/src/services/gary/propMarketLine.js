/** Preserve provider ticket meaning for integer-valued player counting stats. */
export function propMarketLine(row) {
  const value = row?.line_value;
  const line = value == null || value === '' ? NaN : Number(value);
  if (!Number.isFinite(line) || line < 0) throw new Error('Player prop has no valid provider line');
  // A milestone of 300 means 300+, equivalent to over 299.5, not over 300.
  // A half line (including anytime TD 0.5) already expresses that threshold.
  return row.market?.type === 'milestone' && Number.isInteger(line) ? line - 0.5 : line;
}
