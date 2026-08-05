// gary2.0/supabase/functions/social-auto-post/barepick.ts
// THE REPLY FORMAT (founder, Aug 5 2026). Replies to other accounts carry the PICK AND NOTHING ELSE.
//
//   "I would want that to only be the pick, because I can't trust A.I. to say any sentences or such without
//    sounding cringe and totally like A.I. ... I'm okay if the replies are just like 'Yankees ML' — aka just
//    the pick, no odds, just the pick."
//
// So there is NO model in this path. Not a voice pass, not a rewrite, not a "short" prose mode — a reply is
// a deterministic string derived from a pick Gary already made. That is a hard architectural boundary, not a
// setting: if a reply can never contain a generated sentence, it can never contain a cringe one.
//
// Odds are stripped deliberately. The odds Gary priced are not the odds the reader has at their book, and a
// bare stance ("Yankees ML") reads as a call while a priced one ("Yankees ML -144") reads as a tout. The
// SPREAD or TOTAL stays, because that is part of what the bet IS: "Astros -1.5" is a different bet from
// "Astros ML", but "-106" is just today's price.
//
// parseTrailingOdds is reused verbatim from pl.ts (3+ digits, so -1.5 and 8.5 are never read as a price),
// which keeps the reply text and the P/L ledger agreeing on what counts as odds.

import { parseTrailingOdds } from "./pl.ts";

// "Cubs ML -108" -> "Cubs ML" | "Astros -1.5 -106" -> "Astros -1.5" | "Under 8.5" -> "Under 8.5"
export function barePick(pickText: string): string {
  const raw = String(pickText ?? "").trim();
  if (!raw) return "";
  if (parseTrailingOdds(raw) === null) return raw.replace(/\s+/g, " ");
  // Drop only the trailing price token (with or without parens), never anything earlier in the string.
  return raw.replace(/\s*\(?[+-]\d{3,}\)?\s*$/, "").replace(/\s+/g, " ").trim();
}

// A reply is publishable only if it is EXACTLY a bare pick: no newlines, no links, no hashtags, no emoji,
// no sentence punctuation, and short. This is the gate that makes the "no generated prose" rule enforceable
// rather than merely intended — anything a future code path tries to slip in here fails the check.
// Sentence punctuation is banned, but a DECIMAL is not sentence punctuation: "Astros -1.5" and "Under 8.5"
// are bets, while "Cubs ML." is a sentence. So a period is only allowed when it sits between two digits.
const BANNED = /[\n\r@#!?]|https?:\/\/|(?<!\d)\.|\.(?!\d)|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

export function isPublishableReply(text: string, allowedPicks: string[]): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.length > 40) return false;
  if (BANNED.test(t)) return false;
  // Must match a pick Gary actually made today. Never a pick we invented for the conversation.
  return allowedPicks.some((p) => barePick(p) === t);
}
