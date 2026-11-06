// Text on its way to the voice: what Gary writes is cut into pieces the voice can start on early, and
// anything that only makes sense on a screen (markdown marks, bullets, links) is taken out first.

/** Strip what a voice can't say: markdown emphasis, headings, bullets, links, emoji. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s*—\s*/g, ", ")
    // His chuckle, laugh and sigh stay for the voice to do; anything else in brackets would be read out.
    .replace(/\[([^\]]*)\]/g, (tag, word) => (DELIVERY.test(word) ? tag.toLowerCase() : ""))
    .replace(/\[(?![^\]]*\])|(?<!\[[^\]]*)\]/g, "")
    .replace(/[ \t]+/g, " ");
}

const DELIVERY = /^(chuckles|laughs|sighs)$/i;

/**
 * His words for the captions: what's in brackets is how he says it, not what he says, and the captions follow the
 * voice by counting words. A tag can arrive in two pieces, so an unclosed one waits for the next.
 */
export class CaptionFilter {
  private held = "";

  push(delta: string): string {
    const text = (this.held + delta).replace(/\[[^\]]*\]\s*/g, "");
    const open = text.lastIndexOf("[");
    if (open >= 0 && text.length - open < 40) {
      this.held = text.slice(open);
      return text.slice(0, open);
    }
    this.held = "";
    return text;
  }

  flush(): string {
    const rest = this.held.replace(/[[\]]/g, "");
    this.held = "";
    return rest;
  }
}

/** A whole answer as the captions and the log show it. */
export const withoutDelivery = (text: string) => text.replace(/\[[^\]]*\]\s*/g, "").replace(/[[\]]/g, "").trim();

/**
 * Hands out the finished part of a growing answer. A piece ends at a sentence end (or, for a long run
 * without one, a comma) so the voice can start talking before the whole answer is written, while
 * numbers like "3.5" and "-110" are never split.
 */
export class SpeechChunker {
  private buffer = "";
  private sent = 0;

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const rest = this.buffer.slice(this.sent);
      const cut = cutPoint(rest, this.sent === 0);
      if (cut < 0) break;
      const piece = rest.slice(0, cut);
      this.sent += cut;
      const clean = speakable(piece);
      if (clean.trim()) out.push(clean);
    }
    return out;
  }

  /** Whatever is left once the answer is done. */
  flush(): string | null {
    const rest = speakable(this.buffer.slice(this.sent));
    this.sent = this.buffer.length;
    return rest.trim() ? rest : null;
  }
}

/** Where the next piece ends in `s` (exclusive, including trailing space), or -1 to wait for more. */
function cutPoint(s: string, first: boolean): number {
  // Sentence ends: . ! ? followed by whitespace, not inside a number ("3.5") or an initial ("A.J.").
  const re = /[.!?]+["')\]]?(\s+)/g;
  let m: RegExpExecArray | null;
  const minLen = first ? 12 : 20;
  while ((m = re.exec(s))) {
    const end = m.index + m[0].length;
    const before = s.slice(Math.max(0, m.index - 3), m.index);
    if (/\b[A-Z]$/.test(before) && s[m.index] === ".") continue; // "A.J. Green", "St. Louis"
    if (/\b(vs|St|Mr|Jr|Sr|No)$/.test(before)) continue;
    if (end >= minLen) return end;
  }
  // A long run with no sentence end: break at a comma so the voice isn't kept waiting.
  if (s.length > 140) {
    const comma = s.lastIndexOf(", ", 120);
    if (comma > 40) return comma + 2;
  }
  return -1;
}

// His accent, for the voice only (the captions keep normal spelling). The voice reads spelling, so the
// giveaway words are respelled the way he says them. Every swap is one word for one word, because the
// captions follow the voice by counting words.
const JERSEY: Record<string, string> = {
  the: "da", that: "dat", this: "dis", these: "dese", those: "dose", them: "dem", they: "dey", their: "deir",
  there: "dere", then: "den", with: "wit", you: "ya", talk: "tawk", talks: "tawks", talked: "tawked",
  coffee: "cawfee", dog: "dawg", dogs: "dawgs",
  nothing: "nothin'", something: "somethin'", anything: "anythin'", everything: "everythin'",
};
const ING_NOUNS = new Set(["thing", "bring", "sting", "swing", "sling", "fling", "cling", "wring", "string", "spring", "ceiling", "sterling", "offspring"]);

function matchCase(from: string, to: string): string {
  if (from.length > 1 && from === from.toUpperCase()) return to.toUpperCase();
  return from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
}

/** North Jersey: d for th, wit, ya, tawk, cawfee, and -in' for -ing. */
export function jersey(text: string): string {
  return text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => {
    const [base, tail] = word.includes("'") ? [word.slice(0, word.indexOf("'")), word.slice(word.indexOf("'"))] : [word, ""];
    const lower = base.toLowerCase();
    if (tail && lower === "you") return word; // you're, you'll: "ya're" is not a word
    const swap = JERSEY[lower];
    if (swap) return matchCase(base, swap) + tail;
    // Lowercase only: a capital is a name (Manning, Reading), not a verb.
    if (!tail && /^[a-z]{2,}ing$/.test(base) && !ING_NOUNS.has(base)) return base.slice(0, -1) + "'";
    return word;
  });
}

// Long Island: the "aw" words, the r dropped off the end ("ovah", "covah", "nevah"), ya, and -in'.
const LONG_ISLAND: Record<string, string> = {
  talk: "tawk", talks: "tawks", talked: "tawked", talking: "tawkin'", coffee: "cawfee", dog: "dawg", dogs: "dawgs",
  long: "lawng", you: "ya", god: "gawd",
  // So they drop the r at the start of a sentence too, where a capital would read as a name.
  never: "nevah", over: "ovah", under: "undah", ever: "evah", after: "aftah", better: "bettah", other: "othah",
  brother: "brothah", number: "numbah", cover: "covah", whatever: "whatevah", remember: "remembah", either: "eithah",
  whether: "whethah", together: "togethah", later: "latah",
  nothing: "nothin'", something: "somethin'", anything: "anythin'", everything: "everythin'",
};
/** -er words whose -er isn't a dropped r (beer, career) or is stressed (prefer). */
const R_KEPT = /(eer|fer)s?$/;

/** Long Island: cawfee, tawk, dawg, ovah, nevah, ya, -in'. */
export function longIsland(text: string): string {
  return text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => {
    const [base, tail] = word.includes("'") ? [word.slice(0, word.indexOf("'")), word.slice(word.indexOf("'"))] : [word, ""];
    const lower = base.toLowerCase();
    if (tail && lower === "you") return word;
    const swap = LONG_ISLAND[lower];
    if (swap) return matchCase(base, swap) + tail;
    if (tail) return word;
    // Lowercase only: a capital is a name (Miller, Packers), said as it's spelled.
    if (/^[a-z]{2,}ers?$/.test(base) && !R_KEPT.test(base)) return base.replace(/er(s?)$/, "ah$1");
    if (/^[a-z]{2,}ing$/.test(base) && !ING_NOUNS.has(base)) return base.slice(0, -1) + "'";
    return word;
  });
}

/** The accent each voice was picked for, by ElevenLabs voice id. */
const ACCENTS: Record<string, (s: string) => string> = {
  VYTY6BZy2r6t2zp1udts: jersey, // #20, North Jersey
  // #35, Long Island 1 (picked Oct 31). The respelling alone barely moves Eleven v4 Turbo (it reads "cawfee"
  // as coffee); the delivery tag is what rounds the "aw" (measured: talk's F2 1328 Hz respelled, 892 tagged).
  HajairViv4XpOfGXskuF: (s) => "[strong Long Island accent] " + longIsland(s),
  // Clear take 1 (picked Nov 6 2026), the full-range redo of #35's guy. Kept as he heard and picked it: the tag, no respelling.
  n6z5BP3f6BLdUmqfxvaY: (s) => "[strong Long Island accent] " + s,
  // Uncle Dan (picked Nov 6 2026), on Eleven v4, as he heard and picked him: this cue on every line, no respelling.
  v54DUrx2qPTkyzeYbsyW: (s) => "[casual, brash] " + s,
};
export const accentFor = (voiceId: string) => ACCENTS[voiceId] ?? null;
