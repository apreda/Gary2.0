// gary2.0/supabase/functions/grade-results/grading.ts
// Pure grading logic for GAME picks (MLB 2-way), extracted from index.ts so
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

/** Provider numeric evidence; null/blank values remain missing, never zero. */
export function resultNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Home's headline card tells the story of the GAME. The recap body may explain
// Gary's bet, but odds/cover/cash language in the headline makes the card read
// like a receipt instead of a sports headline. Prompts are not enforcement, so
// both recap writers run their model output through this pure guard.
const BETTING_HEADLINE_RE =
  /\b(?:bet(?:s|ting)?|cash(?:ed|es|ing)?|cover(?:ed|s|ing)?|moneyline|spread|favorite|underdog|chalk|odds?|prices?)\b|\bML\b|\b(?:over|under)\s+\d+(?:\.\d+)?\b|(?<!\d)[+-]\d{2,4}\b/i;

// A final score is useful supporting information, but it is not the story by
// itself when the evidence contains the performance that decided the game.
// This catches the exact low-value shape that reached Home ("X beat Y 8-2")
// while keeping real headlines such as "X beat Y 8-2 behind six RBI".
const SCORE_ONLY_HEADLINE_RE =
  /\b(?:beat(?:s)?|defeat(?:s|ed)?|edge(?:s|d)?|top(?:s|ped)?|down(?:s|ed)?|win(?:s)?|won|lose(?:s)?|lost|fall(?:s)?)\b.*\b\d{1,2}\s*[-–]\s*\d{1,2}\s*$/i;

export function headlineNeedsRepair(headline: unknown): boolean {
  const value = String(headline ?? "").trim();
  return !value || BETTING_HEADLINE_RE.test(value) || SCORE_ONLY_HEADLINE_RE.test(value);
}

const countWord = (n: number): string => {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  return words[n] ?? String(n);
};

const teamMatches = (candidate: string, team: string): boolean => {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const a = clean(candidate), b = clean(team);
  return !!a && !!b && (a.includes(b) || b.includes(a));
};

/** Build an editorial game headline from verified player/team evidence. */
function evidenceHeadline(evidence: unknown, maxChars: number): string {
  const ev = String(evidence ?? "");
  const score = ev.match(
    /^FINAL SCORE:\s*(.*?) \(away\) (\d+)\s+—\s+(.*?) \(home\) (\d+)/m,
  );
  if (!score) return "";
  const [, away, awayRaw, home, homeRaw] = score;
  const awayScore = Number(awayRaw), homeScore = Number(homeRaw);
  if (awayScore === homeScore) {
    return `${away} and ${home} finish ${awayScore}-${homeScore}`.slice(0, maxChars);
  }
  const winner = awayScore > homeScore ? away : home;
  const loser = awayScore > homeScore ? home : away;
  const winnerScore = Math.max(awayScore, homeScore);
  const loserScore = Math.min(awayScore, homeScore);

  type Candidate = { rank: number; tail: string; shortTail: string };
  const candidates: Candidate[] = [];
  let section = "";
  for (const raw of ev.split("\n")) {
    const line = raw.trim();
    if (/^[A-Z][A-Z ']+:$/.test(line)) { section = line; continue; }
    if (!line.startsWith("- ")) continue;

    if (section === "HOME RUNS:") {
      const m = line.match(/^- (.*?) \((.*?)\): (\d+) HR, (\d+) RBI/);
      if (!m || !teamMatches(m[2], winner)) continue;
      const hr = Number(m[3]), rbi = Number(m[4]);
      const power = hr === 1 ? "home run" : `${countWord(hr)} home runs`;
      const full = rbi >= 2 ? `behind ${m[1]}'s ${power} and ${countWord(rbi)} RBI`
                            : `behind ${m[1]}'s ${power}`;
      candidates.push({ rank: 100 + hr * 25 + rbi * 3, tail: full,
        shortTail: `behind ${m[1]}'s ${power}` });
    } else if (section === "PITCHING LINES:") {
      const m = line.match(/^- (.*?) \((.*?)\): ([\d.]+) IP,.*? (\d+) ER,.*? (\d+) K/);
      if (!m || !teamMatches(m[2], winner)) continue;
      const ip = Number(m[3]), er = Number(m[4]), strikeouts = Number(m[5]);
      if (ip < 5 || (strikeouts < 6 && er > 0)) continue;
      const tail = er === 0 && ip >= 6
        ? `behind ${countWord(Math.floor(ip))} scoreless innings from ${m[1]}`
        : `behind ${m[1]}'s ${countWord(strikeouts)} strikeouts`;
      candidates.push({ rank: 65 + strikeouts * 3 + ip - er * 5, tail, shortTail: tail });
    } else if (section === "NOTABLE BATTING LINES:") {
      const m = line.match(/^- (.*?) \((.*?)\): (\d+)-for-(\d+)(.*)$/);
      if (!m || !teamMatches(m[2], winner)) continue;
      const hits = Number(m[3]);
      const rbi = Number(m[5].match(/(\d+) RBI/)?.[1] ?? 0);
      const steals = Number(m[5].match(/(\d+) SB/)?.[1] ?? 0);
      if (hits < 3 && rbi < 2 && steals < 2) continue;
      const feat = rbi >= 2 ? `${countWord(rbi)} RBI`
        : hits >= 3 ? `${countWord(hits)} hits` : `${countWord(steals)} steals`;
      const tail = `behind ${m[1]}'s ${feat}`;
      candidates.push({ rank: 45 + hits * 3 + rbi * 3 + steals * 2, tail, shortTail: tail });
    }
  }

  const margin = winnerScore - loserScore;
  const verb = loserScore === 0 ? "shut out" : margin >= 6 ? "rout" : margin === 1 ? "edge" : "beat";
  const base = `${winner} ${verb} ${loser}`;
  const best = candidates.sort((a, b) => b.rank - a.rank)[0];
  if (best) {
    const full = `${base} ${best.tail}`;
    if (full.length <= maxChars) return full;
    const short = `${base} ${best.shortTail}`;
    if (short.length <= maxChars) return short;
  }
  return `${base} ${winnerScore}-${loserScore}`.slice(0, maxChars);
}

export function gameOnlyHeadline(
  generatedHeadline: unknown,
  evidence: unknown,
  maxChars = 90,
): string {
  const generated = String(generatedHeadline ?? "").trim().replace(/\.$/, "");
  if (!headlineNeedsRepair(generated)) return generated.slice(0, maxChars);
  return evidenceHeadline(evidence, maxChars);
}

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
): string | null {
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

  // 3-way DRAW pick — checked before the team-ML fallback.
  if (/\b(draw|tie)\b/.test(p)) return hScore === vScore ? "won" : "lost";

  // Moneyline / team-to-win.
  if (side === "home") return hScore > vScore ? "won" : "lost";
  if (side === "away") return vScore > hScore ? "won" : "lost";
  // Not a team-score bet gradeGame can classify (e.g. a player prop) — leave
  // ungraded rather than fabricate a loss (Jul 15 2026: this returned "lost"
  // unconditionally here, so any player-prop-shaped pick living in daily_picks
  // got a fabricated result).
  return null;
}

// ── The Jul 10 2026 "stale recap" bug this function fixes ────────────────────
// game_recaps had NO staleness concept — writeRecap() in index.ts treated "a recap
// row already exists for this (game_date, league, matchup)" as permanently sufficient,
// even after a later re-grade corrected game_results to a DIFFERENT result. A recap
// generated off a bad early grade (Bug A/B, see grading.test.ts) sat in the DB narrating
// the wrong outcome forever, with no updated_at column to reveal the drift — and this
// table feeds Home's headline carousel, not just a tweet.
//
// Fix: a recap is stale if one already exists AND its stored result no longer matches
// the freshly-computed grade. index.ts regenerates (PATCH in place) instead of skipping.
export function recapIsStale(existingResult: string | null | undefined, freshResult: string): boolean {
  return existingResult != null && existingResult !== freshResult;
}
