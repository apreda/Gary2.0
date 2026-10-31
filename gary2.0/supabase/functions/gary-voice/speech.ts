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
    .replace(/[ \t]+/g, " ");
}

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
