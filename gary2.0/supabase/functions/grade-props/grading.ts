// Pure prop-settlement contract shared by the existing Edge grader's runtime
// and its tests. This intentionally mirrors scripts/lib/resultsGradingReliability.js.

function finiteNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Numeric over/under props push on an exact tie; binary sides do not. */
export function gradePropResult(actual: unknown, line: unknown, bet: unknown): string | null {
  const actualValue = finiteNumber(actual);
  const lineValue = finiteNumber(line);
  const side = String(bet ?? "").trim().toLowerCase();
  if (actualValue == null) return null;

  if (side === "yes" || side === "anytime") return actualValue >= 1 ? "won" : "lost";
  if (side === "no") return actualValue < 1 ? "won" : "lost";
  if (lineValue == null || !["over", "under"].includes(side)) return null;
  if (actualValue === lineValue) return "push";
  if (side === "over") return actualValue > lineValue ? "won" : "lost";
  return actualValue < lineValue ? "won" : "lost";
}
