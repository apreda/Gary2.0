// gary2.0/supabase/functions/grade-results/grading.ts
// Pure grading logic for GAME picks (MLB 2-way + World Cup), extracted from index.ts so
// it runs under `node --test` with no Deno or network deps. index.ts imports these.
//
// ── The Jul 8 2026 "Red Sox @ White Sox" bug this module fixes ────────────────
// Two teams can SHARE a token — most notoriously the mascot: "Boston Red Sox" and
// "Chicago White Sox" both end in "Sox". The old side-detection used
// `pick.includes(mascot) || pick.includes(fullName)`, so a shared mascot ("sox") flagged
// BOTH sides at once. The disambiguation (`home && !away` / `away && !home`) then failed,
// and the code fell through to a "grade the HOME team" default — which INVERTED the result
// for any pick on the AWAY team. Live fallout: "Red Sox ML" in Red Sox @ White Sox graded
// 'lost' on a 5-0 Red Sox win, and the verdict tweet narrated a shutout that never happened.
//
// Fix: pickSide() decides the side using ONLY the tokens that DISTINGUISH the two teams —
// never a token they share. This can't flip a result for any same-mascot (or otherwise
// name-colliding) matchup, and leaves every non-colliding grade unchanged.

export type Side = "home" | "away" | null;

// Alphanumeric tokens of a team name ("Chicago White Sox" -> ["chicago","white","sox"]).
function teamWords(name: string): string[] {
  return name.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
}

// Does `hay` contain `token` as a STANDALONE token (not a substring of a longer word)?
// Prevents "red" matching inside "predators" and a bare mascot matching mid-word.
function hasToken(hay: string, token: string): boolean {
  if (!token) return false;
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i").test(hay);
}

// Which side of the game does this pick text refer to? 'home' | 'away' | null (undetermined).
// Robust to shared mascots (Red Sox / White Sox), shared city words (both "United"), and to
// whether the stored team name is full ("Boston Red Sox") or short ("Red Sox").
export function pickSide(pickText: string, homeTeam: string, awayTeam: string): Side {
  const pick = String(pickText ?? "").toLowerCase();
  const hFull = String(homeTeam ?? "").toLowerCase().trim();
  const aFull = String(awayTeam ?? "").toLowerCase().trim();

  // 1) Whole team name in the pick text — unambiguous when it lands on exactly one side.
  const homeFull = !!hFull && pick.includes(hFull);
  const awayFull = !!aFull && pick.includes(aFull);
  if (homeFull && !awayFull) return "home";
  if (awayFull && !homeFull) return "away";

  // 2) Otherwise match on the words UNIQUE to each team. A token they SHARE ("sox",
  //    "united", "city") can never decide the side, so it is dropped from both.
  const hWords = teamWords(hFull), aWords = teamWords(aFull);
  const shared = new Set(hWords.filter((w) => aWords.includes(w)));
  const homeHit = hWords.some((w) => !shared.has(w) && hasToken(pick, w));
  const awayHit = aWords.some((w) => !shared.has(w) && hasToken(pick, w));
  if (homeHit && !awayHit) return "home";
  if (awayHit && !homeHit) return "away";

  return null; // no distinguishing token present, or both matched — caller decides
}

// ── MLB / generic 2-way game grading (ML / total / spread) ───────────────────
// (ported from run-all-results.js; side-detection now via pickSide)
export function gradeGame(
  pickText: string, homeTeam: string, awayTeam: string, hScore: number, vScore: number,
): string {
  const p = pickText.toLowerCase();
  const isML = p.includes(" ml") || p.includes("moneyline");

  // Total (Over/Under) — team-agnostic, so no side needed.
  const total = pickText.match(/(over|under)\s+(\d+\.?\d*)/i);
  if (total) {
    const line = parseFloat(total[2]), actual = hScore + vScore;
    if (actual === line) return "push";
    return (total[1].toLowerCase() === "over" ? actual > line : actual < line) ? "won" : "lost";
  }

  const side = pickSide(pickText, homeTeam, awayTeam);

  // Spread (only if not a moneyline pick).
  if (!isML) {
    const sp = pickText.match(/([+-][1-9]\d{0,1}(\.\d)?)(?!\d)/);
    if (sp) {
      const spread = parseFloat(sp[1]);
      const diff = side === "home" ? hScore - vScore : vScore - hScore;
      if (diff + spread === 0) return "push";
      return diff + spread > 0 ? "won" : "lost";
    }
  }

  // 3-way DRAW pick (soccer) — checked before the team-ML fallback.
  if (/\b(draw|tie)\b/.test(p)) return hScore === vScore ? "won" : "lost";

  // Moneyline / team-to-win.
  if (side === "home") return hScore > vScore ? "won" : "lost";
  if (side === "away") return vScore > hScore ? "won" : "lost";
  return "lost";
}

// ── World Cup grading (3-way ML / draw / total / Asian handicap on the 90' score) ──
export function gradeSoccer(pick: any, regHome: number, regAway: number): string | null {
  const type = String(pick.type ?? "moneyline").toLowerCase();
  const text = String(pick.pick ?? "");
  const side = pickSide(text, String(pick.homeTeam ?? ""), String(pick.awayTeam ?? ""));

  if (type === "draw") return regHome === regAway ? "won" : "lost";
  if (type === "total") {
    const line = parseFloat(pick.goal_line), tot = regHome + regAway;
    if (tot === line) return "push";
    return (/over/i.test(text) ? tot > line : tot < line) ? "won" : "lost";
  }
  if (type === "asian_handicap") {
    const h = parseFloat(pick.handicap);
    const margin = side === "away" ? regAway - regHome : regHome - regAway;
    const adj = margin + h;
    if (adj === 0) return "push";
    return adj > 0 ? "won" : "lost";
  }
  if (side === "home") return regHome > regAway ? "won" : "lost";
  if (side === "away") return regAway > regHome ? "won" : "lost";
  return null; // couldn't map the pick to a side — leave ungraded rather than fabricate a loss
}
