// Gary's writing rules for anything a fan reads (writing.md at the repo
// root). Adam, Sep 21 2026: "I hate those dashes. They are big-time AI slop
// errors... find some type of AI slop writing skill to put into our code."
// The catalog follows four public sources, cut down to short sports copy:
// Wikipedia's "Signs of AI writing", the blader humanizer skill built on it,
// the sloptells frequency database and slopdetector's thresholds.
//
// Two exports: WRITING_RULES rides every reader-copy prompt (prevention);
// readerCopyTells() is the guard behind prompts that have a plain computed
// fallback (a read that trips it does not ship, the computed line does).
// Pick rationale carries the rules only: there is no fallback for Gary's own
// words, and a guard there would be a post-hoc checker on the pick.

export const WRITING_RULES = `WRITING RULES (a fan reads this; write it the way you would say it out loud to a friend who follows the league):
- No dashes as punctuation: no em dash, no en dash, no spaced hyphen joining clauses. Use a period, a comma or a colon. A hyphen inside a word or a score (2-6, right-hander, 10-for-32) is fine. No arrows in prose.
- No "not X but Y", "not just X, but Y", "it's not X, it's Y", "not because X, because Y". Say what it is.
- No closing disclaimer: no "read it as", "treat it as", "not a forecast", "not a prediction", "the lesson?". No one-line closers.
- No hedge padding: no "that said", "worth noting", "worth watching", "genuinely", "in practice", "feels like", "it's important to note", "could be driving it", "still,", "even so", "to be fair". If the sample is small, say so once, with the number.
- No sayings that sound deep ("the real question is", "at its core", "what really matters"), no staged run-ups ("here's the thing", "let's break it down", "honestly?"), no arguing with no one ("to be clear", "don't get me wrong", "I'm not saying").
- No inflated or sales words: pivotal, crucial, testament, underscores, highlights, landscape, tapestry, vibrant, boasts, robust, showcase, "stands as", "serves as", "plays a key role", "sets the stage". No "-ing" riders tacked onto a fact ("..., underscoring the gap"). No "linked to" or "tied to" when the fact sheet states the relationship.
- No sentence openers "Additionally", "Furthermore", "Moreover", "Ultimately". No forced lists of three.
- No rhetorical questions, exclamation marks, emojis, bold or headers. No chatbot residue ("I hope this helps", "great question").
- Simple verbs: is, has, allows, runs. Vary sentence length. Fewer sentences when the facts are thin: one true sentence beats four that circle it. State the point, then stop.`;

// The one-line form for Gary's own rationale asks (picks, props): the
// punctuation and framing rules only; the voice stays his.
export const RATIONALE_WRITING_RULE = 'Punctuation and framing: No dashes as punctuation (no em dash, no en dash, no spaced hyphen joining clauses; use a period, a comma or a colon), no arrows in prose, no "not X but Y" or "it\'s not X, it\'s Y" framing, no closing disclaimer sentence, no filler such as "that said" or "worth noting".';

// Each tell is high precision on short sports copy. Weak-alone signs
// (hyphenated pairs, passive voice, curly quotes) are left out on purpose.
const TELLS = [
  ['dash', /[—–]|\s-\s/],
  ['arrow', /[→←↔⇒]/],
  ['disclaimer', /\b(?:read|treat|take|view|see)\s+(?:it|this|that|these|those)\s+as\b|\bnot\s+a\s+(?:forecast|prediction|guarantee|lock)\b|\bthe\s+lesson\?|\blet\s+that\s+sink\s+in\b|\bread\s+that\s+again\b/i],
  ['not-x-but-y', /\bnot\s+(?:just|only|merely|simply)\b[^.!?]*\bbut\b|\b(?:it|this|that)(?:'s|\s+is|\s+was)\s+not\b[^.!?]*,\s*(?:it|this|that)(?:'s|\s+is|\s+was)\b|\bnot\s+(?:a|an|the)\b[^.!?]{0,60}\bbut\s+(?:a|an|the)\b|\bnot\s+because\b[^.!?]*[.,]\s*because\b/i],
  ['hedge', /\bthat\s+said\b|\bworth\s+(?:noting|mentioning|watching|a\s+look)\b|\bgenuinely\b|\bin\s+practice\b|\bfeels\s+like\b|\bimportant\s+to\s+note\b|\b(?:could|may|might)\s+be\s+driving\b|(?:^|[.!?]\s+)(?:still|even\s+so|to\s+be\s+fair),/i],
  ['aphorism', /\bthe\s+real\s+(?:question|issue|problem|story)\s+is\b|\bat\s+its\s+core\b|\bwhat\s+(?:really|actually)\s+matters\b|\bthe\s+heart\s+of\s+the\s+matter\b|\bin\s+reality\b/i],
  ['staging', /\bhere(?:'s|\s+is)\s+the\s+(?:thing|kicker)\b|\blet(?:'s|\s+us)\s+(?:dive|break|explore|look|be\s+honest)\b|\bhonestly\?|\breal\s+talk\b|\bto\s+be\s+clear\b|\bdon't\s+get\s+me\s+wrong\b|\bi(?:'m|\s+am)\s+not\s+saying\b|\bsome\s+might\s+say\b/i],
  ['inflation', /\b(?:pivotal|crucial|tapestry|landscape|vibrant|boasts?|robust|showcas(?:e|es|ing)|delve|testament|meticulous(?:ly)?|groundbreaking|enduring|garner(?:s|ed)?)\b|\bstands\s+as\b|\bserves\s+as\b|\bplays\s+a\s+(?:key|pivotal|crucial)\s+role\b|\bsets\s+the\s+stage\b|\bunderscor(?:es|ing|ed)\b|\bhighlight(?:s|ing|ed)\b/i],
  ['ing-rider', /,\s*(?:highlighting|underscoring|emphasizing|reflecting|showcasing|cementing|signaling|illustrating|demonstrating)\b/i],
  ['connector', /(?:^|[.!?]\s+)(?:additionally|furthermore|moreover|ultimately),/i],
  ['machine-date', /\b\d{4}-\d{2}-\d{2}\b|\bcurrent-\d{4}\b/],
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
  ['residue', /\bi\s+hope\s+this\s+helps\b|\bgreat\s+question\b|\blet\s+me\s+know\b|\bas\s+of\s+my\s+(?:knowledge|last)\b|\bwhile\s+(?:specific\s+)?details\s+are\s+limited\b|\bbased\s+on\s+available\s+information\b/i],
];

/** The tells found in one piece of reader copy, by name; [] when clean. */
export function readerCopyTells(text) {
  const copy = String(text ?? '');
  return TELLS.filter(([, re]) => re.test(copy)).map(([name]) => name);
}

export function readerCopyIsClean(text) {
  return readerCopyTells(text).length === 0;
}
