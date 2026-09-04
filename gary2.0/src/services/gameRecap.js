/**
 * Game Recap — ESPN-style 2-4 sentence recap of a settled game Gary picked.
 * The headline describes the game itself; the body may explain the price Gary
 * took, how the game swung, and the bet's fate.
 *
 * One cheap content call per graded game pick (no grounding, no tools —
 * generateSolText cascade — codex-first since Sep 1 2026): the
 * model gets the pick + odds + graded result and the same evidence pack the
 * fact checker grades against (final score plus, for MLB, the BDL per-game
 * player stats we already pull at grading time). Every fact in the recap must
 * come from that evidence — the model is forbidden from inventing innings,
 * stats, or prices it wasn't given. Other leagues get the final score only, so
 * their recaps stay score-and-price stories. Mirrors src/services/factCheck.js.
 *
 * Rows land in `game_recaps` (see supabase/migrations/
 * 20260610_create_game_recaps.sql); the iOS app reads them under the anon role
 * to tell last night's story on the Home morning view.
 *
 * Callers: scripts/run-all-results.js (nightly, after results grading) and
 * scripts/run-game-recaps.js (manual/backfill).
 */

import { matchupIncludesBothTeams } from './teamIdentity.js';

const MAX_HEADLINE_CHARS = 90;
const MAX_RECAP_CHARS = 700;
// Room for a two-market bullet to carry both prices — "Ernie Clement 1 HR,
// 2 RBI (+300 · +150)" is 39, and a longer name needs the slack. The cap is a
// hard slice, so a tight ceiling would chop the second price off mid-token.
const MAX_BULLET_CHARS = 56;
const MAX_BULLETS = 4;
const BETTING_HEADLINE_RE =
  /\b(?:bet(?:s|ting)?|cash(?:ed|es|ing)?|cover(?:ed|s|ing)?|moneyline|spread|favorite|underdog|chalk|odds?|prices?)\b|\bML\b|\b(?:over|under)\s+\d+(?:\.\d+)?\b|(?<!\d)[+-]\d{2,4}\b/i;
const SCORE_ONLY_HEADLINE_RE =
  /\b(?:beat(?:s)?|defeat(?:s|ed)?|edge(?:s|d)?|top(?:s|ped)?|down(?:s|ed)?|win(?:s)?|won|lose(?:s)?|lost|fall(?:s)?)\b.*\b\d{1,2}\s*[-–]\s*\d{1,2}\s*$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt + content call
// ─────────────────────────────────────────────────────────────────────────────

function describeBetForPrompt(pick) {
  const parts = [pick.pick];
  if (pick.odds != null && String(pick.odds).trim()) {
    const raw = String(pick.odds).trim();
    const american = raw.startsWith('-') || raw.startsWith('+') ? raw : `+${raw}`;
    parts.push(`(odds ${american})`);
  }
  return parts.join(' ');
}

function buildPrompt({ pick, result, evidence }) {
  return (
    `You write a short, ESPN-style recap of a finished game FROM THE BETTING PERSPECTIVE — ` +
    `the voice of a sharp friend recapping last night: the drama, the prices, and how the bet fared, ` +
    `woven into one tight story.\n\n` +
    `GAME: ${pick.awayTeam} (away) @ ${pick.homeTeam} (home) — ${pick.league}\n` +
    `THE BET: ${describeBetForPrompt(pick)}\n` +
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
    `thing that decided it. 6-12 words. Lead with the team and what they actually did. First look ` +
    `for the most newsworthy VERIFIED individual performance in the evidence (home runs, RBI, ` +
    `strikeouts, a scoreless start); if there is none, use a verified team feat such as a shutout ` +
    `or a huge hit total. A score-only result is the last resort when the evidence truly contains ` +
    `nothing else. ` +
    `NO betting jargon ("dogs", "chalk", "cover", "cashes"), NO hype verbs ("explodes", "erupts", ` +
    `"power show", "roll"), NO odds or prices in the headline, NO cliches or clickbait. ` +
    `Good: "Tigers take down the Astros behind Colt Keith's three homers". ` +
    `Bad: "Tigers roll as +106 dogs behind Colt Keith power show". No ending period.\n` +
    `- "recap": the 2-4 sentence body.\n` +
    `- "bullets": 2-4 BETTING EVENTS that hit during the game — the markets that would have cashed: ` +
    `a home run, a strikeout / total prop, a goal scorer, the over/under total result, a player ` +
    `prop that landed. NOT the bettor's specific bet (the receipt covers that) — these are the ` +
    `game's notable betting moments either way. Each at most ${MAX_BULLET_CHARS} characters, facts ` +
    `STRICTLY from the evidence. Carry a price ONLY where that exact price is in the evidence ` +
    `("Matt Olson 2 HR (+340 to homer)" only if Olson's HR prop price is listed; else "Matt Olson ` +
    `2 HR"). The total is a fine bullet on its own: "Over 9.5 hit · 11 runs". Never invent a price, ` +
    `line, or stat.\n` +
    `- A bullet naming MORE THAN ONE market for the same player carries one price per market, in ` +
    `the same order the markets are named, in a single trailing parenthetical separated by " · ": ` +
    `"Ernie Clement 1 HR, 2 RBI (+300 · +150)". List a price only for the markets the evidence ` +
    `prices — if only the home run is priced, only that price rides ("Ernie Clement 1 HR, 2 RBI ` +
    `(+300)"), and the parenthetical is omitted entirely when neither is.\n` +
    `- Never state how many runs a home run drove in ("2-run HR", "three-run shot"). The evidence ` +
    `gives per-player totals, not which runs came from which swing — a batter with 1 HR and 2 RBI ` +
    `may have hit a two-run homer OR a solo homer plus a run-scoring out. Write the totals.\n\n` +
    `Output STRICT JSON only (no markdown fences, no prose):\n` +
    `{"headline":"...","recap":"...","bullets":["...","..."]}`
  );
}

/**
 * Pull the {headline, recap} object out of the model text. Tolerates ```json
 * fences and stray prose by scanning for the outermost {...} (same approach as
 * parseFactCheckResponse in factCheck.js). Returns null if nothing parses.
 */
function parseRecapResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const candidates = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1]) candidates.push(m[1].trim());
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Filter prop_results rows down to the ones belonging to one game, by matching
 * the row's matchup string ("Cardinals @ Mets") against the pick's home/away
 * team names. Suffix-aware whole-word matching handles both short and full
 * team-name styles, and a word both teams share ("Sox") can never stand in
 * for either side (leakage-audit finding 4, Aug 17).
 * Callers fetch the date's prop_results once and filter per game.
 */
export function filterPropsForGame(propRows, homeTeam, awayTeam) {
  return (propRows || []).filter((r) => matchupIncludesBothTeams(r.matchup, homeTeam, awayTeam));
}

/**
 * Enforce "no invented prices" deterministically: a bullet may only carry a
 * betting price (American odds like +115 / -130) that LITERALLY appears in the
 * evidence. Flash sometimes invents prop odds for sports it has strong priors on
 * — soccer shots/saves especially — despite the prompt forbidding it (verified:
 * a WC recap shipped "Harry Kane 7 shots (over 4 at +115)" with no such prop in
 * existence). WC games carry no props, so any odds there are fabricated.
 *
 * This is NOT a heuristic fabrication detector (which guesses and would block a
 * pick) — it removes only a price the evidence provably does not contain, so a
 * made-up line can never reach the card. A real graded-prop price IS in the
 * evidence, so it survives. A spread/total like "+2.5" is untouched: \d{2,4}
 * requires a 2-to-4-digit American price, so "+2.5" / "9.5" never match.
 */
export function sanitizeBulletPrices(bullet, evidence) {
  const ev = String(evidence || '');
  const inEv = (p) => ev.includes(p);
  let out = String(bullet);
  // Drop any (...) group containing a price the evidence lacks ("(over 4 at +115)").
  out = out.replace(/\s*\([^()]*\)/g, (grp) => {
    const prices = grp.match(/[+-]\d{2,4}\b/g) || [];
    return prices.some((p) => !inEv(p)) ? '' : grp;
  });
  // Drop a bare "at +115" / "at -130" whose price isn't in the evidence.
  out = out.replace(/\s*\bat\s+([+-]\d{2,4})\b/gi, (m, p) => (inEv(p) ? m : ''));
  // Strip any remaining stray fabricated price token.
  out = out.replace(/[+-]\d{2,4}\b/g, (p) => (inEv(p) ? p : ''));
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;)])/g, '$1').trim();
}

export function headlineNeedsRepair(headline) {
  const value = String(headline ?? '').trim();
  return !value || BETTING_HEADLINE_RE.test(value) || SCORE_ONLY_HEADLINE_RE.test(value);
}

const countWord = (n) => {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] ?? String(n);
};

const teamMatches = (candidate, team) => {
  const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = clean(candidate), b = clean(team);
  return !!a && !!b && (a.includes(b) || b.includes(a));
};

function evidenceHeadline(evidence) {
  const ev = String(evidence ?? '');
  const score = ev.match(
    /^FINAL SCORE:\s*(.*?) \(away\) (\d+)\s+—\s+(.*?) \(home\) (\d+)/m,
  );
  if (!score) return '';
  const [, away, awayRaw, home, homeRaw] = score;
  const awayScore = Number(awayRaw), homeScore = Number(homeRaw);
  if (awayScore === homeScore) return `${away} and ${home} finish ${awayScore}-${homeScore}`.slice(0, MAX_HEADLINE_CHARS);
  const winner = awayScore > homeScore ? away : home;
  const loser = awayScore > homeScore ? home : away;
  const winnerScore = Math.max(awayScore, homeScore);
  const loserScore = Math.min(awayScore, homeScore);

  const candidates = [];
  let section = '';
  for (const raw of ev.split('\n')) {
    const line = raw.trim();
    if (/^[A-Z][A-Z ']+:$/.test(line)) { section = line; continue; }
    if (!line.startsWith('- ')) continue;
    if (section === 'HOME RUNS:') {
      const m = line.match(/^- (.*?) \((.*?)\): (\d+) HR, (\d+) RBI/);
      if (!m || !teamMatches(m[2], winner)) continue;
      const hr = Number(m[3]), rbi = Number(m[4]);
      const power = hr === 1 ? 'home run' : `${countWord(hr)} home runs`;
      const full = rbi >= 2 ? `behind ${m[1]}'s ${power} and ${countWord(rbi)} RBI`
                            : `behind ${m[1]}'s ${power}`;
      candidates.push({ rank: 100 + hr * 25 + rbi * 3, tail: full,
        shortTail: `behind ${m[1]}'s ${power}` });
    } else if (section === 'PITCHING LINES:') {
      const m = line.match(/^- (.*?) \((.*?)\): ([\d.]+) IP,.*? (\d+) ER,.*? (\d+) K/);
      if (!m || !teamMatches(m[2], winner)) continue;
      const ip = Number(m[3]), er = Number(m[4]), strikeouts = Number(m[5]);
      if (ip < 5 || (strikeouts < 6 && er > 0)) continue;
      const tail = er === 0 && ip >= 6
        ? `behind ${countWord(Math.floor(ip))} scoreless innings from ${m[1]}`
        : `behind ${m[1]}'s ${countWord(strikeouts)} strikeouts`;
      candidates.push({ rank: 65 + strikeouts * 3 + ip - er * 5, tail, shortTail: tail });
    } else if (section === 'NOTABLE BATTING LINES:') {
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
  const verb = loserScore === 0 ? 'shut out' : margin >= 6 ? 'rout' : margin === 1 ? 'edge' : 'beat';
  const base = `${winner} ${verb} ${loser}`;
  const best = candidates.sort((a, b) => b.rank - a.rank)[0];
  if (best) {
    const full = `${base} ${best.tail}`;
    if (full.length <= MAX_HEADLINE_CHARS) return full;
    const short = `${base} ${best.shortTail}`;
    if (short.length <= MAX_HEADLINE_CHARS) return short;
  }
  return `${base} ${winnerScore}-${loserScore}`.slice(0, MAX_HEADLINE_CHARS);
}

/**
 * Enforce that Home's headline describes the game, not the bet. If the model
 * violates the rule, use only the grounded final score to create a replacement.
 */
export function gameOnlyHeadline(generatedHeadline, evidence) {
  const generated = String(generatedHeadline ?? '').trim().replace(/\.$/, '');
  if (!headlineNeedsRepair(generated)) {
    return generated.slice(0, MAX_HEADLINE_CHARS);
  }
  return evidenceHeadline(evidence);
}

/**
 * Generate the betting recap for one graded game pick. ONE Flash call, low
 * temperature, evidence only — no tools, no search, no fabrication.
 *
 * Evidence comes from buildGameEvidence() in factCheck.js — callers build it
 * once and can share it with factCheckPick(). When the evidence includes the
 * game's graded props (with real prices), the bullets may carry the betting
 * lens; otherwise they stay plain stat lines.
 *
 * @param {object} args
 * @param {object} args.pick     pick object from daily_picks (homeTeam, awayTeam, league, pick, odds)
 * @param {string} args.result   'won' | 'lost' | 'push'
 * @param {string} args.evidence evidence string from buildGameEvidence()
 * @returns {Promise<{headline: string, recap: string, bullets: string[]} | null>}
 */
export async function generateRecap({ pick, result, evidence }) {
  if (!pick?.pick || !evidence) return null;

  // CONTENT CASCADE (Aug 24 2026): recaps used to be a direct Gemini Flash
  // call, and when the Gemini project went 403-dunning (~Aug 20) this lane
  // died SILENTLY — game_recaps went dark for four days and the Home
  // headlines with it, while the backfill job kept exiting 0. Recaps now ride
  // generateSolText: the same content brain as every other content pass
  // (claude-sonnet-5 on the subscription bridge, $0 marginal), with the desk
  // fallback chain — Gemini included — behind it. One dead vendor can no
  // longer blank the Home page.
  const prompt = buildPrompt({ pick, result, evidence });
  let text;
  try {
    const { generateSolText } = await import('./insights/solText.js');
    text = await generateSolText(prompt, { maxTokens: 2000, effort: 'low' });
  } catch (e) {
    console.warn(`    [GameRecap] content cascade failed (${e.message}) — no recap this pass`);
    return null;
  }
  const parsed = parseRecapResponse(text);
  if (!parsed) return null;

  const headline = gameOnlyHeadline(parsed.headline, evidence);
  const recap = parsed.recap != null
    ? String(parsed.recap).trim().slice(0, MAX_RECAP_CHARS)
    : '';
  if (!headline || !recap) return null;

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets
        .map((b) => String(b).trim())
        .map((b) => sanitizeBulletPrices(b, evidence)) // strip any price the evidence can't source
        .filter(Boolean)
        .map((b) => (b.length > MAX_BULLET_CHARS ? b.slice(0, MAX_BULLET_CHARS).trimEnd() : b))
        .slice(0, MAX_BULLETS)
    : [];

  return { headline, recap, bullets };
}

/**
 * THE BOX LINE (founder, Aug 5 2026). The per-game stats above already carry
 * every batter's hit total — buildGameEvidence sums them into a TEAM HITS line
 * for the prompt and then drops them. This keeps runs + hits per side so the
 * headline card's box column can be a real box instead of two scores.
 *
 * Sides are matched by containing the club's FULL name inside the BDL team name
 * ("Boston Red Sox" contains "Red Sox"). The old join took the last word only —
 * so White Sox and Red Sox both keyed to "sox", collided, and the whole box was
 * dropped (that game was the single null on Aug 4 2026). A batter whose team
 * matches both sides or neither is skipped rather than guessed at.
 *
 * Returns null unless BOTH sides resolve — a half-built box is worse than none,
 * and the card treats null as "runs only".
 */
/**
 * THE FOOTBALL BOX LINE (founder, Sep 4 2026: the football headline card is
 * the MLB card "to a tee except HR are TD"). Baseball's box counts home runs;
 * football's counts touchdowns, from the provider's own player lines.
 *
 * A touchdown is counted ONCE: a passing touchdown and its receiving
 * touchdown are the same score, so only rushing + receiving are summed.
 * Defensive and special-teams scores are not in the player box, so this is
 * the game's OFFENSIVE touchdowns — a return score would leave the number one
 * light rather than invent one.
 *
 * Returns null unless BOTH sides resolve, the same rule the baseball box
 * follows: a half-built box is worse than none.
 */
export function buildFootballBoxLine({ playerStats, awayTeam, homeTeam, awayScore, homeScore }) {
  if (!Array.isArray(playerStats) || !playerStats.length) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const awayName = norm(awayTeam), homeName = norm(homeTeam);
  if (!awayName || !homeName || awayName === homeName) return null;

  // The provider spells a team several ways across its football feeds
  // ("Massachusetts", "Massachusetts Minutemen", "UMass"): match on either
  // string containing the other, the same join the baseball box uses.
  const matches = (team, side) => !!team && !!side && (team.includes(side) || side.includes(team));

  let awayTd = null, homeTd = null;
  for (const row of playerStats) {
    const team = norm(row?.team?.college ?? row?.team?.full_name ?? row?.team?.name ?? row?.team_name);
    const isAway = matches(team, awayName), isHome = matches(team, homeName);
    if (isAway === isHome) continue;               // ambiguous or unrecognised
    const td = (Number(row?.rushing_touchdowns) || 0) + (Number(row?.receiving_touchdowns) || 0);
    if (isAway) awayTd = (awayTd ?? 0) + td;
    else homeTd = (homeTd ?? 0) + td;
  }
  if (awayTd == null || homeTd == null) return null;

  // Six points a touchdown cannot exceed what the side actually scored — a
  // mis-joined roster would show up here rather than on the card.
  if (Number.isFinite(awayScore) && awayTd * 6 > awayScore) return null;
  if (Number.isFinite(homeScore) && homeTd * 6 > homeScore) return null;

  return {
    away: { runs: Number.isFinite(awayScore) ? awayScore : null, hits: null, hr: null, td: awayTd },
    home: { runs: Number.isFinite(homeScore) ? homeScore : null, hits: null, hr: null, td: homeTd },
  };
}

export function buildBoxLine({ mlbStats, awayTeam, homeTeam, awayScore, homeScore }) {
  if (!Array.isArray(mlbStats) || !mlbStats.length) return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const awayName = norm(awayTeam), homeName = norm(homeTeam);
  if (!awayName || !homeName || awayName === homeName) return null;

  let awayHits = null, homeHits = null, awayHr = 0, homeHr = 0;
  for (const s of mlbStats) {
    if (s?.at_bats == null) continue;              // batters only
    const team = norm(s.team_name);
    const isAway = team.includes(awayName), isHome = team.includes(homeName);
    if (isAway === isHome) continue;               // ambiguous or unrecognised
    const h = Number(s.hits) || 0;
    const hr = Number(s.hr) || 0;
    if (isAway) { awayHits = (awayHits ?? 0) + h; awayHr += hr; }
    else { homeHits = (homeHits ?? 0) + h; homeHr += hr; }
  }
  if (awayHits == null || homeHits == null) return null;

  return {
    away: { runs: Number.isFinite(awayScore) ? awayScore : null, hits: awayHits, hr: awayHr },
    home: { runs: Number.isFinite(homeScore) ? homeScore : null, hits: homeHits, hr: homeHr },
  };
}
