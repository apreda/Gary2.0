// The desk: everything Gary read before he made a pick, saved per game in pick_desks. One desk runs from about
// 150,000 to over 300,000 characters, far too much to read for a spoken answer, so he asks for a player or a topic
// and gets the parts that mention it.

export interface DeskPart { title: string; lines: string[] }

const RULE = /^\s*[━═─-][━═─ -]{9,}\s*$/;
const isRule = (l: string | undefined) => RULE.test(l ?? "");

/** The desk cut at its headings: a line over a rule, "## A heading" or "--- A heading ---". The rules go. */
export function deskParts(desk: string, briefing?: string | null): DeskPart[] {
  const lines = String(desk ?? "").split("\n");
  const parts: DeskPart[] = [];
  let part: DeskPart = { title: "THE GAME", lines: [] };
  lines.forEach((line, i) => {
    if (isRule(line)) return;
    const text = line.trim();
    const heading = /^## /.test(text) ? text.slice(3) : /^--- .+ ---$/.test(text) ? text.slice(4, -4) : text && /^\s*━{10,}/.test(lines[i + 1] ?? "") ? text : null;
    if (heading) {
      if (part.lines.some((l) => l.trim())) parts.push(part);
      part = { title: heading, lines: [] };
    } else {
      part.lines.push(line);
    }
  });
  if (part.lines.some((l) => l.trim())) parts.push(part);
  if (briefing?.trim()) parts.push({ title: "THE NEWS BRIEFING", lines: briefing.split("\n") });
  return parts;
}

const IGNORE = new Set(["the", "and", "for", "with", "about", "how", "what", "who", "his", "her", "their", "team", "game", "games", "tonight", "this", "that", "are", "was", "has", "have", "doing"]);

/** "injuries" and "injury" both look for "injur". */
const stem = (w: string) => (w.length > 4 ? w.replace(/(ies|y|es|s)$/, "") : w);

const words = (about: string) =>
  [...new Set(about.toLowerCase().split(/[^\p{L}\p{N}'-]+/u).filter((w) => w.length > 2 && !IGNORE.has(w)).map(stem))];

/** A very long line (a news story on one line), cut to the stretch around what he asked about. */
function around(line: string, want: string[], max = 900): string {
  if (line.length <= max) return line;
  const lower = line.toLowerCase();
  const at = Math.max(0, ...want.map((w) => lower.indexOf(w)).filter((i) => i >= 0).slice(0, 1));
  const start = Math.max(0, at - 250);
  return line.slice(start, start + max);
}

function overview(parts: DeskPart[], limit: number): string {
  const open = parts.filter((p) => /SITUATION|INJUR|MATCHUP|THE GAME/i.test(p.title)).slice(0, 3)
    .map((p) => `${p.title}\n${p.lines.join("\n").trim()}`).join("\n\n").slice(0, limit);
  return `${open}\n\nAlso on this desk: ${parts.map((p) => p.title).join("; ")}`.trim();
}

/** The parts of a desk about `about`, the closest first; with no topic or no match, its opening and a list of the rest. */
export function readDesk(parts: DeskPart[], about: unknown, limit = 9000): string {
  const want = typeof about === "string" ? words(about) : [];
  if (!want.length) return overview(parts, Math.min(limit, 4500));
  const has = (s: string) => { const l = s.toLowerCase(); return want.some((w) => l.includes(w)); };
  const found = parts.map((part) => {
    const hits = part.lines.flatMap((l, i) => (has(l) ? [i] : []));
    return { part, hits, named: has(part.title) };
  }).filter((f) => f.named || f.hits.length)
    .sort((a, b) => (Number(b.named) - Number(a.named)) || (b.hits.length - a.hits.length));
  if (!found.length) return `Nothing on "${about}" on this desk.\n\n${overview(parts, 2500)}`;

  const out: string[] = [];
  let room = limit;
  for (const { part, hits, named } of found) {
    if (room <= 200) break;
    let body: string;
    if (named) {
      body = part.lines.map((l) => (l.length > 1500 ? l.slice(0, 1500) : l)).join("\n").trim();
    } else {
      // The lines that mention it, each with the line either side.
      const keep = new Set(hits.flatMap((i) => [i - 1, i, i + 1]));
      body = part.lines.filter((_, i) => keep.has(i)).map((l) => around(l, want)).join("\n").trim();
    }
    const piece = `${part.title}\n${body}`.slice(0, Math.min(room, named ? 5000 : 2500));
    out.push(piece);
    room -= piece.length;
  }
  return out.join("\n\n");
}
