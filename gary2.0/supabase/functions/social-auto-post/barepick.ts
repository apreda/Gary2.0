// gary2.0/supabase/functions/social-auto-post/barepick.ts
// The bare pick (founder, Aug 5 2026): the bet without its price. "Cubs ML -108" -> "Cubs ML". The spread or
// total stays, because it is part of what the bet IS ("Astros -1.5" differs from "Astros ML"); the price is
// just today's number at one book. The free pick's middle line uses it, and it keys a streak pick to its row.

// A trailing American price: 3+ digits, so -1.5 and 8.5 are never read as a price.
export function parseTrailingOdds(pickText: string): number | null {
  const m = String(pickText ?? "").match(/\(?([+-]\d{3,})\)?\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

// "Cubs ML -108" -> "Cubs ML" | "Astros -1.5 -106" -> "Astros -1.5" | "Under 8.5" -> "Under 8.5"
export function barePick(pickText: string): string {
  const raw = String(pickText ?? "").trim();
  if (!raw) return "";
  if (parseTrailingOdds(raw) === null) return raw.replace(/\s+/g, " ");
  // Drop only the trailing price token (with or without parens), never anything earlier in the string.
  return raw.replace(/\s*\(?[+-]\d{3,}\)?\s*$/, "").replace(/\s+/g, " ").trim();
}
