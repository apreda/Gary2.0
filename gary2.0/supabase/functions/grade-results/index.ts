// Supabase Edge Function: grade-results
//
// Cloud grade-on-final for GAME picks (props are a separate next layer — they
// need box-score stat extraction). Runs on pg_cron alongside live-scores so
// Gary's game picks settle 24/7, no laptop. For each FINAL game it grades the
// pick (MLB ML/total/spread; WC 3-way ML/draw/total/Asian-handicap on the 90'
// regulation score) and writes to game_results — dedup'd by (pick_text,
// game_date): a wrong early grade self-corrects on the next run (UPDATE), an
// ungraded one inserts, an already-correct one is a no-op.
//
// Right after a game grades, it ALSO generates + writes the betting RECAP
// (game_recaps) that feeds Home's headline carousel — so the headline lands the
// moment the game settles instead of waiting for the next local
// run-all-results.js pass. The recap is a faithful port of that script's
// recapGradedPick + src/services/gameRecap.js (same Flash prompt, same evidence
// pack, same game_recaps columns), hardened to 3-4 Gemini retries. GROUNDED:
// every fact comes from the real graded evidence — never fabricated. The local
// recap path stays intact as a backfill safety net.
//
// Faithful port of the grading + is_winners_pick logic in run-all-results.js.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
// Same model the local recap writer uses (GEMINI_FLASH_MODEL in
// orchestratorConfig.js) — cheap Flash, one call per graded game.
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const WC_SEASON = 2026;

// ── date helpers (ET) ───────────────────────────────────────────────────────
function estDate(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function isFinalStatus(raw: unknown): boolean {
  return String(raw ?? "").toUpperCase().includes("FINAL");
}

// ── BDL / Supabase REST ─────────────────────────────────────────────────────
async function bdlGet(path: string, params: Record<string, string | string[]>): Promise<any[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x)); else qs.append(k, v);
  }
  const res = await fetch(`${BDL_BASE}${path}?${qs.toString()}`, { headers: { Authorization: BDL_KEY } });
  if (!res.ok) throw new Error(`BDL ${path} ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}
const sbHeaders = {
  apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
};
async function sbGet(table: string, query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`${table} GET ${res.status}`);
  return await res.json();
}

// ── grading (ported from run-all-results.js + soccerGrading.js) ──────────────
function gradeGame(pickText: string, homeTeam: string, awayTeam: string, hScore: number, vScore: number): string {
  const p = pickText.toLowerCase();
  const hFull = homeTeam.toLowerCase(), vFull = awayTeam.toLowerCase();
  const hM = hFull.split(" ").pop()!, vM = vFull.split(" ").pop()!;
  const isML = p.includes(" ml") || p.includes("moneyline");
  const total = pickText.match(/(over|under)\s+(\d+\.?\d*)/i);
  if (total) {
    const line = parseFloat(total[2]), actual = hScore + vScore;
    if (actual === line) return "push";
    return (total[1].toLowerCase() === "over" ? actual > line : actual < line) ? "won" : "lost";
  }
  if (!isML) {
    const sp = pickText.match(/([+-][1-9]\d{0,1}(\.\d)?)(?!\d)/);
    if (sp) {
      const spread = parseFloat(sp[1]);
      const isHome = p.includes(hM) || p.includes(hFull);
      const diff = isHome ? hScore - vScore : vScore - hScore;
      if (diff + spread === 0) return "push";
      return diff + spread > 0 ? "won" : "lost";
    }
  }
  if (/\b(draw|tie)\b/.test(p)) return hScore === vScore ? "won" : "lost";
  const isHome = p.includes(hM) || p.includes(hFull);
  const isVis = p.includes(vM) || p.includes(vFull);
  if (isHome && !isVis) return hScore > vScore ? "won" : "lost";
  if (isVis && !isHome) return vScore > hScore ? "won" : "lost";
  if (isHome) return hScore > vScore ? "won" : "lost";
  if (isVis) return vScore > hScore ? "won" : "lost";
  return "lost";
}

function gradeSoccer(pick: any, regHome: number, regAway: number): string | null {
  const type = String(pick.type ?? "moneyline").toLowerCase();
  const text = String(pick.pick ?? "").toLowerCase();
  const hFull = String(pick.homeTeam ?? "").toLowerCase(), aFull = String(pick.awayTeam ?? "").toLowerCase();
  const hM = hFull.split(" ").pop()!, aM = aFull.split(" ").pop()!;
  const picksHome = !!hFull && (text.includes(hFull) || (!!hM && text.includes(hM)));
  const picksAway = !!aFull && (text.includes(aFull) || (!!aM && text.includes(aM)));
  if (type === "draw") return regHome === regAway ? "won" : "lost";
  if (type === "total") {
    const line = parseFloat(pick.goal_line), tot = regHome + regAway;
    if (tot === line) return "push";
    return (/over/.test(text) ? tot > line : tot < line) ? "won" : "lost";
  }
  if (type === "asian_handicap") {
    const h = parseFloat(pick.handicap);
    const margin = picksAway ? regAway - regHome : regHome - regAway;
    const adj = margin + h;
    if (adj === 0) return "push";
    return adj > 0 ? "won" : "lost";
  }
  if (picksHome && !picksAway) return regHome > regAway ? "won" : "lost";
  if (picksAway && !picksHome) return regAway > regHome ? "won" : "lost";
  return null;
}

// 90' regulation for WC: full score when no extra time, else sum of halves.
function regulationScore(m: any): { home: number; away: number } | null {
  const halves = m.first_half_home_score != null && m.second_half_home_score != null &&
    m.first_half_away_score != null && m.second_half_away_score != null;
  const sum = () => ({
    home: num(m.first_half_home_score)! + num(m.second_half_home_score)!,
    away: num(m.first_half_away_score)! + num(m.second_half_away_score)!,
  });
  if (!m.has_extra_time) {
    if (m.home_score != null && m.away_score != null) return { home: num(m.home_score)!, away: num(m.away_score)! };
    return halves ? sum() : null;
  }
  return halves ? sum() : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// ── game_results dedup write (re-grade on exist) ─────────────────────────────
async function writeResult(row: any): Promise<"insert" | "update" | "noop" | "fail"> {
  const existing = await sbGet("game_results",
    `pick_text=eq.${encodeURIComponent(row.pick_text)}&game_date=eq.${row.game_date}&select=id,result,final_score`);
  if (existing.length) {
    const e = existing[0];
    if (e.result === row.result && e.final_score === row.final_score) return "noop";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/game_results?id=eq.${e.id}`, {
      method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ result: row.result, final_score: row.final_score,
        is_winners_pick: row.is_winners_pick, updated_at: new Date().toISOString() }),
    });
    return res.ok ? "update" : "fail";
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_results`, {
    method: "POST", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify(row),
  });
  return res.ok ? "insert" : "fail";
}

// ─────────────────────────────────────────────────────────────────────────────
// BETTING RECAP (cloud port of scripts/run-all-results.js recapGradedPick +
// src/services/gameRecap.js + buildGameEvidence in src/services/factCheck.js).
//
// Right after a game pick grades to game_results, generate the ESPN-style
// betting recap that feeds Home's headline carousel and upsert it into
// game_recaps — so a recap lands the moment the game settles instead of waiting
// for the next local run-all-results.js pass. The LOCAL path stays intact as a
// backfill safety net (its own dedup makes a re-run a no-op once a recap
// exists). GROUNDED: every fact comes from the real graded evidence pack
// (final score + BDL box score + Gary's graded props) — never fabricated.
// Recap content + game_recaps columns are identical to the local writer.
// ─────────────────────────────────────────────────────────────────────────────

const RECAP_MAX_HEADLINE_CHARS = 90;
const RECAP_MAX_RECAP_CHARS = 700;
const RECAP_MAX_BULLET_CHARS = 45;
const RECAP_MAX_BULLETS = 4;
const RECAP_GEMINI_RETRIES = 4; // hardened (local writer retries twice) — 3-4 with backoff

// ── evidence pack (port of buildGameEvidence in factCheck.js) ────────────────
function recapFormatIp(ip: unknown): string {
  return ip != null ? String(ip) : "?";
}

function recapBuildEvidence(args: {
  league: string; homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number;
  mlbStats?: any[] | null; gradedProps?: any[] | null;
}): string {
  const { league, homeTeam, awayTeam, homeScore, awayScore, mlbStats, gradedProps } = args;
  const lines: string[] = [
    `FINAL SCORE: ${awayTeam} (away) ${awayScore} — ${homeTeam} (home) ${homeScore}`,
  ];

  if (league === "MLB" && Array.isArray(mlbStats) && mlbStats.length > 0) {
    const teamHits = new Map<string, number>();

    const pitchers = mlbStats.filter((s) => s.ip != null);
    if (pitchers.length) {
      lines.push("", "PITCHING LINES:");
      pitchers.sort((a, b) =>
        a.team_name === b.team_name
          ? (b.pitch_count || 0) - (a.pitch_count || 0)
          : String(a.team_name).localeCompare(String(b.team_name))
      );
      for (const p of pitchers) {
        const name = p.player?.full_name || `${p.player?.first_name || ""} ${p.player?.last_name || ""}`.trim();
        lines.push(
          `- ${name} (${p.team_name}): ${recapFormatIp(p.ip)} IP, ${p.p_hits ?? 0} H, ` +
          `${p.p_runs ?? 0} R, ${p.er ?? 0} ER, ${p.p_bb ?? 0} BB, ${p.p_k ?? 0} K, ` +
          `${p.p_hr ?? 0} HR allowed${p.pitch_count != null ? `, ${p.pitch_count} pitches` : ""}`
        );
      }
    }

    const batters = mlbStats.filter((s) => s.at_bats != null);
    const hrLines: string[] = [];
    const notableLines: string[] = [];
    for (const b of batters) {
      teamHits.set(b.team_name, (teamHits.get(b.team_name) || 0) + (b.hits || 0));
      const name = b.player?.full_name || `${b.player?.first_name || ""} ${b.player?.last_name || ""}`.trim();
      if ((b.hr || 0) > 0) {
        hrLines.push(`- ${name} (${b.team_name}): ${b.hr} HR, ${b.rbi ?? 0} RBI`);
      } else if ((b.hits || 0) >= 2 || (b.rbi || 0) >= 2 || (b.stolen_bases || 0) >= 1) {
        const extras: string[] = [];
        if (b.doubles) extras.push(`${b.doubles} 2B`);
        if (b.triples) extras.push(`${b.triples} 3B`);
        if (b.rbi) extras.push(`${b.rbi} RBI`);
        if (b.stolen_bases) extras.push(`${b.stolen_bases} SB`);
        notableLines.push(
          `- ${name} (${b.team_name}): ${b.hits || 0}-for-${b.at_bats}` +
          (extras.length ? `, ${extras.join(", ")}` : "")
        );
      }
    }
    if (hrLines.length) lines.push("", "HOME RUNS:", ...hrLines);
    if (notableLines.length) lines.push("", "NOTABLE BATTING LINES:", ...notableLines);
    if (teamHits.size) {
      lines.push("", `TEAM HITS: ${[...teamHits.entries()].map(([t, h]) => `${t} ${h}`).join(", ")}`);
    }
  }

  if (Array.isArray(gradedProps) && gradedProps.length > 0) {
    lines.push("", "GARY'S GRADED PROPS FOR THIS GAME — these prices are real:");
    for (const p of gradedProps) {
      const raw = p.odds != null ? String(p.odds).trim() : "";
      const odds = raw ? (raw.startsWith("-") || raw.startsWith("+") ? raw : `+${raw}`) : null;
      lines.push(
        `- ${p.player_name} ${p.bet} ${p.line_value} ${p.prop_type}` +
        (odds ? ` (${odds})` : "") +
        ` — ${String(p.result || "").toUpperCase()}` +
        (p.actual_value != null ? ` (actual: ${p.actual_value})` : "")
      );
    }
  }

  return lines.join("\n");
}

// ── prompt (port of buildPrompt in gameRecap.js) ─────────────────────────────
function recapDescribeBet(pick: any): string {
  const parts = [pick.pick];
  if (pick.odds != null && String(pick.odds).trim()) {
    const raw = String(pick.odds).trim();
    const american = raw.startsWith("-") || raw.startsWith("+") ? raw : `+${raw}`;
    parts.push(`(odds ${american})`);
  }
  return parts.join(" ");
}

function recapBuildPrompt(args: { pick: any; result: string; evidence: string }): string {
  const { pick, result, evidence } = args;
  const lg = String(pick.league || "").toLowerCase();
  const isWC = lg.includes("world_cup") || lg === "wc" || lg.includes("soccer_world_cup");
  const homeIsHost = ["united states", "usa", " usmnt", "canada", "mexico"]
    .some((h) => String(pick.homeTeam || "").toLowerCase().includes(h.trim()));
  const neutralNote = (isWC && !homeIsHost)
    ? `NEUTRAL SITE: this is a 2026 World Cup match at a neutral venue — do NOT say either ` +
      `team is playing "at home", and do NOT cite home-field, home-crowd, or travel advantage. ` +
      `The "(home)" tag below is only bracket bookkeeping for which side is listed where.\n`
    : "";
  return (
    `You write a short, ESPN-style recap of a finished game FROM THE BETTING PERSPECTIVE — ` +
    `the voice of a sharp friend recapping last night: the drama, the prices, and how the bet fared, ` +
    `woven into one tight story.\n\n` +
    `GAME: ${pick.awayTeam} (away) @ ${pick.homeTeam} (home) — ${pick.league}\n` +
    neutralNote +
    `THE BET: ${recapDescribeBet(pick)}\n` +
    `BET RESULT: ${String(result).toUpperCase()}\n\n` +
    `WHAT ACTUALLY HAPPENED — this is the ONLY source of facts you may use:\n${evidence}\n\n` +
    `RULES:\n` +
    `- Every fact (scores, names, stat lines, who homered, pitching lines) must appear in the ` +
    `evidence above. NEVER invent innings, sequences, stats, players, or anything else the evidence ` +
    `does not state. If the evidence is thin, write a shorter recap around the score and the price.\n` +
    `- The only betting price you know is the one in THE BET line. Do not invent other odds.\n` +
    `- Weave the bet's fate into the story (a +102 dog winning outright, a favorite that never ` +
    `showed up, a sweat that held on late). State prices naturally ("as a -130 favorite", "at +102").\n` +
    `- Voice: sharp, conversational, confident. No hedging, no exclamation points, no emojis, ` +
    `no cliches like "in a thrilling contest".\n` +
    `- Never use the words "we", "our", or "I" — the bettor is "Gary" if named at all.\n\n` +
    `OUTPUT:\n` +
    `- "headline": a clean, professional game headline in plain English — the result and the one ` +
    `thing that decided it. 6-12 words. Lead with the team and what they actually did. ` +
    `NO betting jargon ("dogs", "chalk", "cover", "cashes"), NO hype verbs ("explodes", "erupts", ` +
    `"power show", "roll"), NO odds or prices in the headline, NO cliches or clickbait. ` +
    `Good: "Tigers take down the Astros behind Colt Keith's three homers". ` +
    `Bad: "Tigers roll as +106 dogs behind Colt Keith power show". No ending period.\n` +
    `- "recap": the 2-4 sentence body.\n` +
    `- "bullets": 2-4 short stat lines from the game — the night's hard numbers. ` +
    `Each bullet is at most ${RECAP_MAX_BULLET_CHARS} characters. Facts STRICTLY from the evidence above. ` +
    `Add the betting lens ONLY where that exact price appears in the evidence: ` +
    `"Matt Olson 2 HR (+340 to homer)" is allowed only if a home-run prop price for Olson is ` +
    `listed in the evidence — otherwise the bullet is just "Matt Olson 2 HR". ` +
    `Other examples: "Burns 7 K over 5.1 IP"; "Over 9.5 cashed by 1.5 runs" (only if the total ` +
    `line is the bet above). Never invent a price, a line, or a stat.\n` +
    `- A player-prop bullet (shots, saves, goals, assists, tackles, K's, HR) may carry a ` +
    `price ONLY if that exact player's prop price is printed in the evidence above. ` +
    `SOCCER / WORLD CUP: there is NO per-player box score for these games, so do NOT write any ` +
    `individual player stat line (no "X 7 shots", no "Y 5 saves", no "Z 1 goal") — you would be ` +
    `inventing the number. A World Cup bullet must be a TEAM / result fact taken straight from the ` +
    `evidence ("Switzerland 4, Bosnia & Herzegovina 1", "Switzerland win the group opener"). ` +
    `Never invent a player's stat line or a market that is not in the evidence.\n\n` +
    `Output STRICT JSON only (no markdown fences, no prose):\n` +
    `{"headline":"...","recap":"...","bullets":["...","..."]}`
  );
}

// ── parse + sanitize (port of gameRecap.js) ──────────────────────────────────
function recapParseResponse(text: string | null): any {
  if (!text || typeof text !== "string") return null;
  const candidates: string[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1]) candidates.push(m[1].trim());
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* try next candidate */ }
  }
  return null;
}

function recapSanitizeBulletPrices(bullet: string, evidence: string): string {
  const ev = String(evidence || "");
  const inEv = (p: string) => ev.includes(p);
  let out = String(bullet);
  out = out.replace(/\s*\([^()]*\)/g, (grp) => {
    const prices = grp.match(/[+-]\d{2,4}\b/g) || [];
    return prices.some((p) => !inEv(p)) ? "" : grp;
  });
  out = out.replace(/\s*\bat\s+([+-]\d{2,4})\b/gi, (mm, p) => (inEv(p) ? mm : ""));
  out = out.replace(/[+-]\d{2,4}\b/g, (p) => (inEv(p) ? p : ""));
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;)])/g, "$1").trim();
}

const RECAP_SOCCER_STAT = /\b(\d+)\s+(saves?|shots?|goals?|assists?|tackles?|interceptions?|clearances?|blocks?|passes?|key\s+passes?|chances?|crosses?|dribbles?)\b/i;

function recapKeepBullet(bullet: string, evidence: string, league: string): boolean {
  const lg = String(league || "").toUpperCase();
  const isSoccer = lg === "WC" || lg.includes("SOCCER") || lg.includes("WORLD CUP");
  if (!isSoccer) return true;
  const m = String(bullet || "").match(RECAP_SOCCER_STAT);
  if (!m) return true;
  const numStr = m[1];
  const stem = m[2].toLowerCase().slice(0, 4);
  const ev = String(evidence || "").toLowerCase();
  const re = new RegExp(`\\b${numStr}\\b[^\\n]{0,40}${stem}|${stem}[^\\n]{0,40}\\b${numStr}\\b`, "i");
  return re.test(ev);
}

// ── Gemini Flash call (REST; hardened 3-4 retries with backoff) ──────────────
async function recapGenerate(args: { pick: any; result: string; evidence: string }): Promise<
  { headline: string; recap: string; bullets: string[] } | null
> {
  const { pick, result, evidence } = args;
  if (!pick?.pick || !evidence || !GEMINI_KEY) return null;

  const prompt = recapBuildPrompt({ pick, result, evidence });
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  let json: any = null;
  for (let attempt = 1; attempt <= RECAP_GEMINI_RETRIES && !json; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
      json = await r.json();
    } catch (e) {
      console.warn(`  [Recap] Flash attempt ${attempt}/${RECAP_GEMINI_RETRIES} failed: ${(e as Error).message}`);
      if (attempt < RECAP_GEMINI_RETRIES) await new Promise((res) => setTimeout(res, 800 * attempt));
    }
  }
  if (!json) return null;

  const text = (json?.candidates?.[0]?.content?.parts || [])
    .filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join("").trim();
  const parsed = recapParseResponse(text);
  if (!parsed) return null;

  const headline = parsed.headline != null
    ? String(parsed.headline).trim().replace(/\.$/, "").slice(0, RECAP_MAX_HEADLINE_CHARS) : "";
  const recap = parsed.recap != null
    ? String(parsed.recap).trim().slice(0, RECAP_MAX_RECAP_CHARS) : "";
  if (!headline || !recap) return null;

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets
        .map((b: any) => String(b).trim())
        .map((b: string) => recapSanitizeBulletPrices(b, evidence))
        .filter((b: string) => recapKeepBullet(b, evidence, pick.league))
        .filter(Boolean)
        .map((b: string) => (b.length > RECAP_MAX_BULLET_CHARS ? b.slice(0, RECAP_MAX_BULLET_CHARS).trimEnd() : b))
        .slice(0, RECAP_MAX_BULLETS)
    : [];

  return { headline, recap, bullets };
}

// ── per-game evidence fetchers (BDL box score + graded props) ────────────────
async function recapFetchMlbStats(gameId: number | null, cache: Map<string, any[]>): Promise<any[]> {
  if (gameId == null) return [];
  const key = `mlb-stats-${gameId}`;
  if (cache.has(key)) return cache.get(key)!;
  let rows: any[] = [];
  try {
    rows = await bdlGet("/mlb/v1/stats", { game_ids: [String(gameId)], per_page: "100" });
  } catch (e) {
    console.warn(`  [Recap] MLB stats fetch failed for game ${gameId}: ${(e as Error).message}`);
  }
  cache.set(key, rows);
  return rows;
}

// prop_results rows around the date (port of fetchGradedPropRowsAround) — used
// so a bullet can carry the betting lens with a REAL price only.
async function recapFetchPropRows(dateStr: string, cache: Map<string, any[]>): Promise<any[]> {
  if (cache.has(dateStr)) return cache.get(dateStr)!;
  const base = new Date(`${dateStr}T12:00:00Z`);
  const dates = [-1, 0, 1].map((off) => {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10);
  });
  let rows: any[] = [];
  try {
    rows = await sbGet("prop_results",
      `game_date=in.(${dates.join(",")})&select=player_name,prop_type,line_value,actual_value,result,bet,odds,matchup`);
  } catch (e) {
    console.warn(`  [Recap] prop_results fetch failed (lens omitted): ${(e as Error).message}`);
  }
  cache.set(dateStr, rows);
  return rows;
}

// Filter prop_results rows to one game (port of filterPropsForGame).
function recapFilterPropsForGame(propRows: any[], homeTeam: string, awayTeam: string): any[] {
  const normTeam = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const h = normTeam(homeTeam), a = normTeam(awayTeam);
  if (!h || !a) return [];
  const hLast = h.split(" ").pop()!, aLast = a.split(" ").pop()!;
  return (propRows || []).filter((r) => {
    const mm = normTeam(r.matchup);
    if (!mm) return false;
    return (mm.includes(h) || mm.includes(hLast)) && (mm.includes(a) || mm.includes(aLast));
  });
}

// ── upsert into game_recaps (skip if one exists — mirrors local dedup) ───────
async function writeRecap(args: {
  pick: any; league: string; gameDate: string; result: string;
  hScore: number; vScore: number; mlbGameId: number | null;
  statsCache: Map<string, any[]>; propsCache: Map<string, any[]>;
}): Promise<"recap" | "exists" | "skip" | "fail"> {
  const { pick, league, gameDate, result, hScore, vScore, mlbGameId, statsCache, propsCache } = args;
  if (!GEMINI_KEY) return "skip";
  const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;

  // Idempotency: a recap already on file (from the cloud or a prior local run)
  // is a no-op — and avoids a needless Gemini call. Same as the local writer.
  const existing = await sbGet("game_recaps",
    `game_date=eq.${gameDate}&league=eq.${encodeURIComponent(league)}&matchup=eq.${encodeURIComponent(matchup)}&select=id`);
  if (existing.length) return "exists";

  const mlbStats = league === "MLB" ? await recapFetchMlbStats(mlbGameId, statsCache) : null;
  const propRows = await recapFetchPropRows(gameDate, propsCache);
  const gradedProps = recapFilterPropsForGame(propRows, pick.homeTeam, pick.awayTeam);
  const evidence = recapBuildEvidence({
    league, homeTeam: pick.homeTeam, awayTeam: pick.awayTeam,
    homeScore: hScore, awayScore: vScore, mlbStats, gradedProps,
  });

  const recap = await recapGenerate({ pick, result, evidence });
  if (!recap) return "fail";

  // INSERT with on-conflict ignore on the (game_date, league, matchup) unique
  // constraint — a concurrent local run that beat us is harmless.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_recaps`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      game_date: gameDate, league, matchup, pick_text: pick.pick, result,
      headline: recap.headline, recap: recap.recap, bullets: recap.bullets || [],
    }),
  });
  return res.ok ? "recap" : "fail";
}

Deno.serve(async (req) => {
  if (!BDL_KEY) return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }),
    { status: 500, headers: { "Content-Type": "application/json" } });

  // ?date=YYYY-MM-DD re-grades ONE specific ET day (backfill/repair — used
  // Jul 2 2026 to heal rows the pre-ET-filter deploy cross-graded against
  // adjacent-day series games). Default: today + yesterday (late finals).
  const dateParam = new URL(req.url).searchParams.get("date");
  const dates = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? [dateParam!] : [estDate(0), estDate(-1)];
  const stats = { insert: 0, update: 0, noop: 0, fail: 0, skipped: 0,
    recap: 0, recap_exists: 0, recap_fail: 0 };
  // Per-run evidence caches shared across recaps (BDL box score + prop_results).
  const statsCache = new Map<string, any[]>();
  const propsCache = new Map<string, any[]>();

  // Pull MLB games + WC matches once (final-status only matters at grade time).
  // MLB games are ET-filtered per date: BDL indexes by UTC instant, so a late-ET game
  // (8pm+ ET) files under tomorrow's UTC date. Fetch BOTH UTC days per ET date and keep
  // only games whose real ET date matches — otherwise last night's late game (e.g. an
  // 8pm ET Padres@Cubs) grades onto TODAY's repeated matchup by name (phantom result).
  const etDateOf = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const mlbForET = async (etDate: string) => {
    const nx = new Date(etDate + "T00:00:00Z");
    nx.setUTCDate(nx.getUTCDate() + 1);
    const nxStr = nx.toISOString().slice(0, 10);
    const [a, b] = await Promise.all([
      bdlGet("/mlb/v1/games", { dates: [etDate], per_page: "50" }),
      bdlGet("/mlb/v1/games", { dates: [nxStr], per_page: "50" }),
    ]);
    const seen = new Set<string>();
    return [...((a as any[]) || []), ...((b as any[]) || [])].filter((g: any) => {
      if (!g || g.id == null || seen.has(String(g.id)) || !g.date) return false;
      if (etDateOf(g.date) !== etDate) return false;
      seen.add(String(g.id));
      return true;
    });
  };
  const [mlbGames, wcMatches] = await Promise.all([
    Promise.all(dates.map(mlbForET)).then((a) => a.flat()),
    bdlGet("/fifa/worldcup/v1/matches", { seasons: [String(WC_SEASON)], per_page: "100" }),
  ]);

  for (const date of dates) {
    const rows = await sbGet("daily_picks", `date=eq.${date}&select=id,date,picks`);
    const rowId = rows[0]?.id ?? null;            // game_results.pick_id is NOT NULL (the daily_picks row UUID)
    const picks: any[] = rows[0]?.picks ?? [];
    if (!picks.length) continue;

    // is_winners_pick = top 3 per league by (is_top_pick, then confidence).
    const winnerKeys = new Set<string>();
    const byLeague: Record<string, any[]> = {};
    for (const p of picks) (byLeague[String(p.league ?? "UNKNOWN").toUpperCase()] ||= []).push(p);
    for (const lg of Object.keys(byLeague)) {
      const ranked = byLeague[lg].slice().sort((a, b) => {
        const at = a.is_top_pick ? 1 : 0, bt = b.is_top_pick ? 1 : 0;
        if (at !== bt) return bt - at;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      });
      for (const p of ranked.slice(0, 3))
        winnerKeys.add(`${String(p.league ?? "").toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`);
    }
    const isWinner = (p: any) =>
      winnerKeys.has(`${String(p.league ?? "").toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`);

    for (const pick of picks) {
      const league = String(pick.league ?? "").toUpperCase();
      let result: string | null = null, vScore: number | null = null, hScore: number | null = null;
      let mlbGameId: number | null = null;

      if (league === "WC" || league === "SOCCER_WORLD_CUP" || pick.soccer_match_id) {
        const m = wcMatches.find((x: any) => String(x.id) === String(pick.soccer_match_id));
        if (!m || String(m.status).toLowerCase() !== "completed") { stats.skipped++; continue; }
        const reg = regulationScore(m);
        if (!reg) { stats.skipped++; continue; }
        result = gradeSoccer({ ...pick, homeTeam: m.home_team?.name, awayTeam: m.away_team?.name }, reg.home, reg.away);
        hScore = reg.home; vScore = reg.away;
      } else if (league === "MLB") {
        const g = mlbGames.find((x: any) => {
          // Scope to THIS pick's ET date so a repeated matchup on an adjacent day
          // (Padres@Cubs today vs last night) can't cross-match and grade the pick
          // against the wrong game.
          if (!x.date || etDateOf(x.date) !== date) return false;
          const gh = norm(x.home_team?.full_name ?? x.home_team?.name ?? "");
          const gv = norm(x.away_team?.full_name ?? x.away_team?.name ?? "");
          const ph = norm(pick.homeTeam ?? ""), pv = norm(pick.awayTeam ?? "");
          return (gh.includes(ph) || ph.includes(gh)) && (gv.includes(pv) || pv.includes(gv));
        });
        if (!g || !isFinalStatus(g.status)) { stats.skipped++; continue; }
        hScore = num(g.home_team_data?.runs); vScore = num(g.away_team_data?.runs);
        if (hScore == null || vScore == null) { stats.skipped++; continue; }
        mlbGameId = num(g.id);
        result = gradeGame(pick.pick, pick.homeTeam, pick.awayTeam, hScore, vScore);
      } else { stats.skipped++; continue; } // other leagues: not handled in the cloud grader yet

      if (result == null || hScore == null || vScore == null) { stats.skipped++; continue; }
      const outcome = await writeResult({
        pick_id: rowId, game_date: date, league, result,
        final_score: `${vScore}-${hScore}`, pick_text: pick.pick,
        matchup: `${pick.awayTeam} @ ${pick.homeTeam}`, is_winners_pick: isWinner(pick),
      });
      stats[outcome]++;

      // GROUNDED betting recap (game_recaps) — fired the moment the grade lands
      // so Home's headline carousel renders without waiting for the next local
      // run-all-results.js pass. Fires on insert/update AND on noop (an
      // already-graded game whose first recap attempt failed transiently): its
      // own game_recaps dedup makes that a cheap no-op once a recap exists, so
      // the cloud self-heals a dropped recap on the next grade run without the
      // laptop. Skip only outright grade-write failures. Never fatal to grading —
      // a recap throw can't stall the grader. The LOCAL recap path stays intact
      // as a backfill safety net.
      if (outcome === "insert" || outcome === "update" || outcome === "noop") {
        try {
          const r = await writeRecap({
            pick, league, gameDate: date, result, hScore, vScore, mlbGameId, statsCache, propsCache,
          });
          if (r === "recap") stats.recap++;
          else if (r === "exists") stats.recap_exists++;
          else if (r === "fail") stats.recap_fail++;
        } catch (e) {
          stats.recap_fail++;
          console.warn(`  [Recap] non-fatal failure for ${league} "${pick.pick}": ${(e as Error).message}`);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, dates, ...stats }),
    { headers: { "Content-Type": "application/json" } });
});
