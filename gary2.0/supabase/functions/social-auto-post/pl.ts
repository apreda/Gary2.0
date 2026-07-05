// gary2.0/supabase/functions/social-auto-post/pl.ts
// $100-flat-stake P/L math for the season-arc ledger. Ported from results-card/lib.cjs so the arc's
// numbers always agree with the results card. Odds ride the trailing token of pick_text ("Pirates ML -190");
// 3+ digits so spreads (-1.5) and totals (8.5) are never mistaken for a price.

export function parseTrailingOdds(pickText: string): number | null {
  const m = String(pickText ?? "").match(/\(?([+-]\d{3,})\)?\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

export function profitOn100(odds: number | null, result: string): number | null {
  if (result === "push") return 0;
  if (result !== "won") return -100;
  if (odds == null) return null;
  return odds > 0 ? odds : 10000 / Math.abs(odds);
}

export function money(n: number): string {
  const rounded = Math.round(Math.abs(n));
  return `${n >= 0 ? "+$" : "-$"}${rounded.toLocaleString("en-US")}`;
}

export function computeStanding(
  rows: { pick_text: string | null; result: string | null }[],
): { w: number; l: number; p: number; net: number; record: string; netLabel: string } {
  let w = 0, l = 0, p = 0, net = 0;
  for (const r of rows) {
    const result = String(r.result ?? "");
    if (result === "won") w++;
    else if (result === "lost") l++;
    else if (result === "push") p++;
    else continue;
    net += profitOn100(parseTrailingOdds(r.pick_text ?? ""), result) ?? 0;
  }
  return { w, l, p, net, record: `${w}-${l}`, netLabel: money(net) };
}
