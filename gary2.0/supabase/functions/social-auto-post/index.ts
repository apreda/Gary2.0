import { isSocialServiceRequest } from "../post-single-tweet/authorization.ts";
// social-auto-post — server-side @BetwithGary auto-poster (picks drip + metrics refresh)
// Cron: every 5 min. Refresh metrics when due, then publish one MLB/NFL game pick
// whose start is still 5–120 min away. An atomic four-minute guard prevents
// overlapping runs from publishing a burst. Other sports retain audience selection.
// (The noon personality post is RETIRED as of Jun 29 2026 — runPersonalityMode early-returns; dry-run preview only.)
// Daily recap restored Sep 4 2026: one post per sport, 10 AM ET with retries through 2 PM.
// (The verdict quote-tweets are RETIRED as of Aug 24 2026 — runVerdictMode early-returns; dry-run preview only.)
// (The /api/take-card and /api/pick-card-app routes are no longer used here.)
// Metrics: every run also refreshes impressions/likes/replies/retweets for posts from the last 6 days (KPI stays live 24/7).
//          Each row's numbers = SUM across all tweets in the thread = total thread reach.
//
// CONVERSION-FIRST REDESIGN (v11, Jun 16 2026) — see Desktop/Gary2.0/X_CONVERSION_STRATEGY.md:
//   - North Star is APP DOWNLOADS + retained users, NOT impressions/followers.
//   - ZERO emojis anywhere (removed the sport-emoji map and the TOP PICK badge).
//   - "Give the pick, hold the depth" withhold policy: the pick hook shows the BARE pick (no odds — founder, Aug 26) + ONE strongest falsifiable
//     factor; superseded Sep 13 by the required fact / bare pick / second fact layout.
//   - No hashtags. No "Full breakdown" promise. No in-thread App Store link (the buried link converted ~0; the bio +
//     pinned post carry the install path, and the profile out-converts an in-thread link). Pick thread = hook, plus a
//     "link in bio" handoff reply on the DAY'S FIRST thread ONLY (Jul 5: every-thread handoffs read generic-capper).
//   - Recap (10am) = ONE Gary-voiced morning-tape post: record in prose + one real result detail, mood-ladder register
//     (absorbed the retired personality post, Jul 5). Falls back to plain per-sport lines if the LLM fails.
//
// Query params: ?dry_run=1 (compose, don't post/log), ?force_mode=pick|recap|personality|verdict|arc|week_tape, ?preview=1 (dry-run: compose top pick ignoring timing), ?metrics_only=1
// LLM: Anthropic ONLY (ANTHROPIC_API_KEY secret; SOCIAL_ANTHROPIC_MODEL, default claude-sonnet-5).
//      Gemini is fully retired (founder, Aug 24 2026: "no more gemini for anything").
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchVerdicts, plainVerdict, buildVerdictPrompt, trimTweet, isValidVerdict } from "./verdicts.ts";
import { composeWeekTape } from "./weektape.ts";
import { composeRecaps, type RecapRow } from "./recap.ts";
import { composeGamePickHook } from "./gamePickHook.ts";
import { socialRunHealth } from "./health.js";
import { mergeSocialPickSources, hasLoggedTicket, publicationKey } from "./pickSources.js";
import { publishIntent, publicationStore } from "./publication.js";
import { barePick } from "./barepick.ts";
import { computeStanding } from "./pl.ts";
import { selectGameCoverage, coverageDeadlineOutcomes } from "./coverage.ts";
import { FULL_COVERAGE_VERSION, fullCoverageLeague } from "./coveragePolicy.js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// THE VENDOR (Aug 24 2026): Anthropic only. The Gemini project spent Aug
// 20-24 403-dunning on Google billing and every post silently degraded to
// the deterministic fallback; the founder retired the vendor outright.
// Sonnet matches the content brain the rest of production runs on.
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = Deno.env.get("SOCIAL_ANTHROPIC_MODEL") ?? "claude-sonnet-5";
// Base origin for the Vercel OG image routes (results-card, pick-card). Override (e.g. localhost) for dry-run rendering.
const CARD_BASE = Deno.env.get("CARD_BASE_URL") ?? "https://www.betwithgary.ai";
const sb = createClient(SB_URL, SERVICE_KEY);

// The founder's pregame deadline remains mandatory: no pick after its start.
// Sep 16 restores every MLB/NFL game; other sports keep audience selection.
const LEAD_MAX_MIN = 120;     // don't post more than 2h before first pitch (keeps the take timely)
const LEAD_MIN_MIN = 5;       // HARD DEADLINE: must be >= 5 min before first pitch, otherwise never post
// Other sports retain the September 12 audience policy,
// one root at a time, with schedule-based reservations and 30-minute spacing.
const RECAP_HOUR = 10;
// In-thread handoff (replaces the old buried App Store link CTA). No URL on purpose: the install path lives in the bio +
// pinned post, which out-convert an in-thread link, and a link in-thread suppresses reach. Rotated by post-of-day so the
// 2-3 daily threads never share an identical footer.
const APP_HANDOFF = [
  "The full read, and the rest of today's card, are in the app. Link in bio.",
  "Rest of the reasoning and the full slate are in the app. Link in bio.",
  "Tonight's other plays and the deeper look at this one are in the app. Link in bio.",
];
// Mood ladder (yesterday's win rate) — the emotional register for the daily personality post. Worried was merged into Beer.
const MOODS: Record<string, string> = {
  Fire: "on fire, hot streak, quietly confident but never cocky",
  Cooking: "cooking, the process is working, locked in and focused",
  Beer: "steady, it is what it is, grinding through a normal stretch",
  IceCold: "cold, a little frustrated but still analytical, trusting the work",
  Doomsday: "rough patch, owning the losses honestly with zero spin, quiet resolve to bounce back",
  Coin: "neutral, no games graded yesterday, looking ahead to today",
};
function moodFor(wins: number, losses: number): string {
  const total = wins + losses;
  if (!total) return "Coin";
  const pct = wins / total;
  return pct >= 0.8 ? "Fire" : pct >= 0.7 ? "Cooking" : pct >= 0.5 ? "Beer" : pct >= 0.4 ? "IceCold" : "Doomsday";
}

function etParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  // 0 = Sunday … 6 = Saturday, in ET — the week tape fires on Mondays.
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour === "24" ? "0" : p.hour), minute: parseInt(p.minute), weekday };
}

function yesterdayOf(today: string): string {
  return new Date(new Date(today + "T12:00:00Z").getTime() - 86400_000).toISOString().slice(0, 10);
}

// "2026-06-28" -> "June 28th" (ordinal suffix for the recap header).
type JsonSchema = Record<string, unknown>;

async function callAnthropicLLM(system: string, user: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system,
      // parseJsonBlock tolerates prose-wrapped JSON, but ask plainly anyway.
      messages: [{ role: "user", content: `${user}\n\nReturn ONLY the JSON object — no code fences, no commentary.` }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = (j.content ?? []).map((c: any) => c?.text ?? "").join("");
  if (!text) throw new Error("Anthropic returned empty output: " + JSON.stringify(j).slice(0, 300));
  return text;
}

// Anthropic only (founder, Aug 24 2026). responseSchema is accepted for
// call-site stability but shape is enforced by the prompt + parseJsonBlock.
async function callLLM(system: string, user: string, _responseSchema?: JsonSchema): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY secret not set");
  return await callAnthropicLLM(system, user);
}

function parseJsonBlock(text: string): any {
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in model output (likely truncated): " + text.slice(0, 200));
  return JSON.parse(m[0]);
}

// Strip em/en dashes the model may still emit, as a hard backstop to the voice rule. Keeps hyphens in odds (-174) and words.
function killDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ". ").replace(/\.\s*\./g, ".");
}

// Backstop for the zero-emoji rule: strip any emoji the model slips in, so a model miss can never ship one.
function killEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

// Clean a model-written line: dashes out, emoji out.
function clean(s: string): string {
  return killEmoji(killDashes(String(s ?? "").trim()));
}

async function postTweet(text: string, replyToId?: string): Promise<string> {
  const fn = replyToId ? "post-reply-tweet" : "post-single-tweet";
  const body: Record<string, string> = { text };
  if (replyToId) body.replyToId = replyToId;
  const r = await fetch(`${SB_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`${fn} failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

async function postQuote(text: string, quoteTweetId: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/post-quote-tweet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, quoteTweetId }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-quote-tweet failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

async function fetchMetricsBatch(ids: string[]): Promise<Record<string, any>> {
  const byId: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (!chunk.length) continue;
    const r = await fetch(`${SB_URL}/functions/v1/get-tweet-metrics`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tweetIds: chunk }),
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(`X metrics read failed: ${JSON.stringify(j).slice(0, 300)}`);
    if (j.success && Array.isArray(j.tweets)) for (const t of j.tweets) byId[t.id] = t;
  }
  return byId;
}

// Metrics throttle (Aug 5 2026): the newest metrics_updated_at stamp IS the "when did we last refresh" clock,
// so no extra state is needed and the throttle holds at any cron cadence.
const METRICS_MIN_INTERVAL_MIN = 45;
async function metricsRefreshedRecently(): Promise<boolean> {
  const { data, error } = await sb.from("social_post_log").select("metrics_updated_at")
    .not("metrics_updated_at", "is", null).order("metrics_updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(`METRICS_READ_FAILED: ${error.code}`);
  const last = data?.[0]?.metrics_updated_at;
  return !!last && (Date.now() - new Date(last).getTime()) < METRICS_MIN_INTERVAL_MIN * 60_000;
}

// Refresh impressions/likes/replies/retweets for recent posts so KPI tracking stays live without anyone in the loop.
// Each row's value = SUM across every tweet in its thread = total thread reach. Non-fatal by design.
async function refreshMetrics(): Promise<{ updated: number; checked: number }> {
  const since = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const { data: rows, error } = await sb.from("social_post_log").select("id, hook_tweet_id, reasoning_tweet_id, cta_tweet_id").gte("post_date", since).not("hook_tweet_id", "is", null);
  if (error) throw new Error(`METRICS_READ_FAILED: ${error.code}`);
  if (!rows?.length) return { updated: 0, checked: 0 };
  const allIds = new Set<string>();
  for (const row of rows) for (const id of [row.hook_tweet_id, row.reasoning_tweet_id, row.cta_tweet_id]) if (id) allIds.add(id);
  const byId = await fetchMetricsBatch([...allIds]);
  if (!Object.keys(byId).length) return { updated: 0, checked: rows.length };
  const nowIso = new Date().toISOString();
  let updated = 0;
  for (const row of rows) {
    const parts = [row.hook_tweet_id, row.reasoning_tweet_id, row.cta_tweet_id].filter(Boolean).map((id) => byId[id]).filter(Boolean);
    if (!parts.length) continue;
    const sum = (k: string) => parts.reduce((s: number, t: any) => s + (t[k] || 0), 0);
    // Aug 5 2026: persist the INTENT metrics too. get-tweet-metrics has always returned bookmarks,
    // user_profile_clicks and url_link_clicks; we were storing only impressions/likes/replies/retweets —
    // i.e. keeping exactly the numbers X_CONVERSION_STRATEGY.md calls noise and discarding the three it
    // calls the real scoreboard. url_link_clicks is organic-only and can legitimately be null, so it is
    // stored as null rather than coerced to 0 (0 clicks and "X did not report" are different facts).
    const anyLinkClicks = parts.some((t: any) => t.url_link_clicks !== null && t.url_link_clicks !== undefined);
    const legacy = {
      impressions: sum("impressions"), likes: sum("likes"), replies: sum("replies"), retweets: sum("retweets"),
      metrics_updated_at: nowIso,
    };
    const { error: upErr } = await sb.from("social_post_log").update({
      ...legacy,
      bookmarks: sum("bookmarks"), profile_clicks: sum("user_profile_clicks"),
      link_clicks: anyLinkClicks ? sum("url_link_clicks") : null,
    }).eq("id", row.id);
    if (upErr) throw new Error(`METRICS_WRITE_FAILED: ${upErr.code}`);
    updated++;
  }
  return { updated, checked: rows.length };
}

const VOICE_RULES = `You write posts for @BetwithGary as "Gary", a sharp, confident sports-betting handicapper who calls and sweats every game. Voice: the sharpest friend in the group chat. Sharp, honest, in it with you. ABSOLUTE RULE: the provided rationale/stats are GROUND TRUTH (it is 2026, past your training data). Never correct player-team assignments or import outside facts. Only ensure internal consistency (right stat to the right player to the right team). QUALIFIERS ARE PART OF THE FACT: words that scope a claim in the rationale ("recent", "over the last two weeks", "at home", "vs lefties", "this season") are load-bearing. Never drop, soften, or outgrow a qualifier — "cleaner recent bullpen form" must never become "owns the cleaner bullpen". Never add specificity the rationale does not state ("for the late innings", "tonight"). If the qualified claim does not fit the character budget, drop the claim entirely and use a different fact.
HARD RULES (breaking any one fails the post):
(1) ZERO emojis. Not one, ever. No sport emojis, no symbols, no arrows, nothing.
(2) NEVER use em dashes or en dashes. Use periods, commas, or parentheses. This is the number one AI tell.
(3) No hashtags, ever.
(4) No links or URLs, ever.
(5) No rule-of-three lists like "fast, clean, and reliable".
(6) No "it's not just X, it's Y" or "this isn't X, it's Y" constructions.
(7) Do not stack inflated adjectives (devastating, absolute, total, completely, massive, elite). State the number and let it land.
(8) No corny capper or hype lines, and no motivational filler. Banned: "Who's riding?", "Lock it in", "Let's get it", "tail me", "free money", "that is how you build a bankroll", "that's how it's done", "trust the process", "the work pays off", "we're cooking", and anything like them.
(9) No marketing or corporate voice. Do not use words like "transparently", "transparent", "premium", "elite", "expertly", "value play" as filler. Do not narrate in third-person brand voice ("Gary went 10-1", "we also had X cruise to a win"). Write in the FIRST PERSON as Gary ("I went 10-1", "my one miss was").
(10) Gary is a CHARACTER, never an AI. NEVER reveal or even hint that Gary is an AI, a model, an algorithm, automated, software, "trained", or running "simulations"/"data" — do NOT break the fourth wall, EVER. Phrases like "I modeled this", "my model", "my simulations", "my data", "as an AI", "I'm an AI" are BANNED. Gary is a real, sharp handicapper: he makes his calls, shows conviction, and owns his losses like a person would. Stay fully in character in every post.
(11) Every sentence must carry a concrete fact: a number, a player or team name, a result, or a genuine thought. If a sentence is empty glue or hype, delete it. Dry and specific beats smooth and padded.
STYLE: specific player names and real numbers. Lead with the single strongest, most concrete, checkable stat, never a vague claim. Use contractions (it's, that's, couldn't, had 'em). Sentence fragments are good. Do NOT write complete, balanced, essay-style sentences. Vary sentence length. Do not open consecutive sentences the same way. Sound like a text to a friend, not an article or a brand account.
RECURRING VOCABULARY (Gary's own bits; use AT MOST one per post and only where it fits naturally, never forced): his results ledger is always "the tape" ("It's on the tape", "Check the tape"). Closers he actually uses: "That's the play." (stamping a pick), "Never sweated it." (a win never in doubt), "Cashed. Next." (routine win), "I'll wear that one." (owning a loss), "Money back, nothing learned." (push), "The number's the number." (the stat is the argument), "Paid like it should've." (plus-money win), "Same read, next game." (loss, process was right).
Always return ONLY valid JSON as instructed.`;

// ── THE PROPS REPLY (founder, Aug 14 2026) ────────────────────────────────────
// Under every game tweet: "Gary's Prop Bets", the bare list for THAT game — no
// commentary, no reasons — HR threats included, then the classic app handoff.
// All of it in the one reply.

const PROP_LABELS: Record<string, string> = {
  home_runs: "to homer",             // phrased, not "over 0.5 home runs"
  total_bases: "total bases",
  hits: "hits",
  hits_runs_rbis: "H+R+RBI",
  rbi: "RBI",
  rbis: "RBI",
  runs: "runs",
  walks: "walks",
  stolen_bases: "stolen bases",
  pitcher_strikeouts: "strikeouts",
  pitcher_outs: "outs recorded",
  pitcher_earned_runs: "earned runs",
  pitcher_walks: "walks allowed",
  pitcher_hits_allowed: "hits allowed",
};

function propLine(p: any): string {
  const type = String(p?.prop ?? "").split(" ")[0];
  // NO PRICE TALK (founder, Aug 26): prop lines carry the bet, never the price.
  if (type === "home_runs") return `- ${p.player} ${PROP_LABELS.home_runs}`;
  const label = PROP_LABELS[type] ?? type.replace(/_/g, " ");
  const bet = String(p?.bet ?? "").toUpperCase();
  return `- ${p.player} ${bet} ${p.line} ${label}`;
}

// This game's props: CORE lanes first, HR threats after, deduped by player+prop.
// Matchup strings match the picks' own "Away @ Home" shorthand; on a doubleheader
// both use commence_time to keep game 1's props off game 2's thread.
function propsForGame(dayProps: any[], matchup: string, commence: string | undefined): any[] {
  let mine = dayProps.filter((p) => String(p?.matchup ?? "") === matchup);
  if (commence && mine.some((p) => p?.commence_time)) {
    const target = new Date(commence).getTime();
    mine = mine.filter((p) => !p?.commence_time || Math.abs(new Date(p.commence_time).getTime() - target) < 90 * 60_000);
  }
  const seen = new Set<string>();
  const out: any[] = [];
  for (const p of [...mine.filter((x) => x?.lane !== "HR"), ...mine.filter((x) => x?.lane === "HR")]) {
    const key = `${p?.player}|${p?.prop}|${p?.bet}`;
    if (!p?.player || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function buildPropsReply(gameProps: any[], handoff: string): string | null {
  if (!gameProps.length) return null;
  const header = "Gary's Prop Bets";
  const footer = `\n\n${handoff}`;
  let lines: string[] = [];
  for (const p of gameProps) {
    const candidate = [...lines, propLine(p)];
    const text = `${header}\n\n${candidate.join("\n")}${footer}`;
    if (text.length > 270) break;   // hard 280 limit, small margin
    lines = candidate;
  }
  if (!lines.length) return null;
  return `${header}\n\n${lines.join("\n")}${footer}`;
}

async function reconcilePublications(today: string, allowReplies: boolean) {
  const { data, error } = await sb.from("social_publication_intents").select("*")
    .neq("state", "completed").neq("state", "expired")
    .gte("post_date", new Date(Date.parse(today + "T12:00:00Z") - 7 * 86400000).toISOString().slice(0, 10))
    .order("created_at").limit(210);
  if (error) return [{ error: "PUBLICATION_READ_FAILED" }];
  const results = [];
  for (const row of data ?? []) {
    if (row.state === "prepared") {
      // Only regular selection may start a root; abandoned expired claims can close.
      if (Date.parse(row.log_payload.commence_time) - Date.now() >= LEAD_MIN_MIN * 60000) continue;
      results.push(await publishIntent(row, { store: publicationStore(sb), send: postTweet, allowSend: false }));
      continue;
    }
    try { results.push(await publishIntent(row, { store: publicationStore(sb), send: postTweet, allowSend: allowReplies })); }
    catch { results.push({ error: "PUBLICATION_RECOVERY_FAILED" }); }
  }
  return results;
}

async function runPickMode(today: string, nowMs: number, dryRun: boolean, preview = false) {
  const [{ data: dpRows, error: dpErr }, { data: weeklyRows, error: weeklyErr }] = await Promise.all([
    sb.from("daily_picks").select("picks").eq("date", today),
    sb.from("weekly_nfl_picks").select("week_start,picks").lte("week_start", today).order("week_start", { ascending: false }).limit(1),
  ]);
  if (dpErr) throw dpErr;
  // A weekly lookup outage remains visible while healthy daily games continue.
  const source_errors = weeklyErr ? ["WEEKLY_NFL_SOURCE_UNAVAILABLE"] : [];
  const picks: any[] = mergeSocialPickSources((dpRows ?? []).flatMap((row) => row.picks ?? []), weeklyRows?.[0], today);
  if (!picks.length) return { posted: false, reason: "no picks loaded yet", source_errors };

  // A failed props read is different from a game with no props. Do not
  // replace an unavailable props reply with alternate handoff copy.
  const { data: ppRows, error: ppError } = await sb.from("prop_picks").select("picks").eq("date", today);
  if (ppError) throw new Error(`PROPS_SOURCE_UNAVAILABLE: ${ppError.code}`);
  const dayProps: any[] = ppRows?.[0]?.picks ?? [];

  const { data: logRows, error: logErr } = await sb.from("social_post_log").select("pick_text, thread_format, publication_key, posted_at, league, slot, audience_selection").eq("post_date", today);
  if (logErr) throw logErr;
  const { data: intentRows, error: intentErr } = await sb.from("social_publication_intents").select("*").eq("post_date", today);
  if (intentErr) throw new Error("PUBLICATION_READ_FAILED");
  const existingIntents = new Map((intentRows ?? []).map((row) => [row.publication_key, row]));
  // Whitelist the ACTUAL pick-thread formats: with verdict/arc/wc rows in the same log, a blacklist would let
  // them consume the daily pick budget and suppress the handoff.
  const pickThreads = (logRows ?? []).filter((r) => ["standard", "top_pick"].includes(r.thread_format ?? ""));
  // Durable reservations serialize overlapping runs and protect each exact game.

  const MIN = 60_000;
  const unposted = picks.filter((p) => !hasLoggedTicket(p, pickThreads) &&
    (!existingIntents.has(publicationKey(p)) || existingIntents.get(publicationKey(p))?.state === "prepared"));

  // HARD DEADLINE (Aug 5 2026, founder's law): a pick is postable ONLY while first pitch is still at least
  // LEAD_MIN_MIN ahead of us. The deleted code did the opposite on two paths — `postable` kept any game that
  // had started within the last 20 minutes, and an `_live` branch reached back a FULL HOUR and told the model
  // "GAME JUST STARTED, frame the angle as live, just-underway energy". That is what shipped tweets like
  // "First pitch just went in Denver" 35 minutes after the Rays game began. A pick published after the game
  // starts reads as a retroactive call, so there is no grace period any more: miss the window, skip the pick.
  const [{ data: slate, error: slateError }, { data: history, error: historyError }] = await Promise.all([
    sb.from("daily_slate").select("league,away_team,home_team,bdl_game_id,commence_time,away_ranking,home_ranking,game_status").eq("date", today),
    picks.some(p => !fullCoverageLeague(p.league)) ? sb.from("social_post_log").select("league,slot,pick_text,posted_at,thread_format,impressions,profile_clicks,audience_selection")
      .gte("post_date", new Date(nowMs - 28 * 86400_000).toISOString().slice(0, 10)).lt("post_date", today)
      .in("thread_format", ["standard", "top_pick"]).order("posted_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
  ]);
  // Schedule status is required. Historical engagement is only a dependency
  // for audience-selected sports; MLB/NFL coverage never uses that ranking.
  if (slateError || !slate?.length) return { posted: false, reason: "AUDIENCE_SCHEDULE_UNAVAILABLE", source_errors: [...source_errors, "AUDIENCE_SCHEDULE_UNAVAILABLE"] };
  if (historyError) source_errors.push("AUDIENCE_HISTORY_UNAVAILABLE");
  const postable = unposted.filter(p => !/^pass\b/i.test(String(p.pick ?? "").trim()));
  const selection = { ...selectGameCoverage(historyError ? postable.filter(p => fullCoverageLeague(p.league)) : postable, slate, pickThreads, history ?? [], nowMs, picks),
    skipped_pass: unposted.filter(p => !postable.includes(p)).map(p => p.pick) };
  const selected = selection.queue;
  const { missed, skipped_pregame } = coverageDeadlineOutcomes(picks, pickThreads, intentRows ?? [], nowMs, slate);

  // A pick whose first pitch has already passed can NEVER post now. Say so loudly: the Aug 5 misses
  // (Astros -1.5, Cubs/Dodgers ML) disappeared with nothing in any log to notice them.
  if (missed.length) {
    console.error(`MISSED_PICKS ${today}: first pitch passed before these could post -> ${missed.join(" | ")}`);
  }

  // preview (dry-run only): compose an unposted pick ignoring timing to vet formatting.
  let queue = selected;
  if (!queue.length && preview && dryRun) {
    queue = [...unposted].slice(0, 1);
  }
  if (!queue.length) {
    return { posted: false, reason: selection.reason, audience: selection, missed, skipped_pregame, source_errors };
  }

  const maxConf = Math.max(...picks.map((p) => parseFloat(p.confidence ?? 0)));
  const results: any[] = [];
  let threadsSoFar = pickThreads.length;

  // Each pick composes and posts INDEPENDENTLY inside its own try/catch. Before Aug 5 a single failure (an
  // empty Gemini hook tripping the guard below, an X API blip) threw out of runPickMode and forfeited the
  // entire run — and the next attempt was a full hour later, by which point the game had usually started
  // and the pick was gone for good. Now a bad hook costs that one pick on this run, never the rest of the slate.
  for (const chosen of queue) {
   try {
    const prepared = existingIntents.get(publicationKey(chosen));
    if (prepared && !dryRun) {
      // An unsent older two-part payload must not bypass the Sep 13 layout.
      // Preserve its frozen receipt; already-sent roots reconcile separately.
      const parts = String(prepared.log_payload?.post_text ?? '').split('\n\n');
      if (parts.length !== 3 || parts.some(p => !p.trim()) || parts[1] !== barePick(String(chosen.pick))) {
        results.push({ posted: false, pick: chosen.pick, error: 'NO_SAFE_COPY: prepared post does not use the required three-part layout' });
        continue;
      }
      // Resume frozen copy without another model request, but reacquire the
      // shared cadence guard: another game may have claimed since this crashed.
      const { data: resumed, error: resumeError } = await sb.rpc("claim_social_publication", {
        p_date: today, p_key: prepared.publication_key,
        p_payload: prepared.log_payload, p_reply: prepared.reply_text,
      });
      if (resumeError) throw new Error("PUBLICATION_CLAIM_FAILED");
      if (!resumed?.length) {
        results.push({ posted: false, pick: chosen.pick, reason: "publication interval reserved" });
        break;
      }
      const publication = await publishIntent(resumed[0], { store: publicationStore(sb), send: postTweet });
      if (publication.posted) threadsSoFar++;
      results.push({ ...publication, pick: chosen.pick });
      if (publication.posted || publication.error?.includes('PUBLICATION_SEND_UNCERTAIN')) break;
      continue;
    }
    const conf = parseFloat(chosen.confidence ?? 0);
    const isTopPick = conf >= 0.8 && conf === maxConf;
    const league = (chosen.league ?? "MLB").toUpperCase();
    // NO PRICE TALK (founder, Aug 26): the injected line is the BARE pick —
    // the same founder-ruled shape replies use ("Yankees ML" — the spread or
    // total is part of the bet; the price is just today's number at one book).
    const pickLine = barePick(String(chosen.pick)); // clean machine-readable shorthand, no odds, no emoji

    // One primary writer reads the entire published rationale. September 16:
    // no whole-sentence, same-paragraph or phrase-classification gate.
    const hook = await composeGamePickHook({
      rationale: String(chosen.rationale ?? ""), pickLine,
      matchup: `${chosen.awayTeam} @ ${chosen.homeTeam}`, league,
      apiKey: ANTHROPIC_KEY, model: ANTHROPIC_MODEL,
    });
    // THE PROPS REPLY (founder, Aug 14 2026 — supersedes the Jul 5 first-thread-only handoff): every game
    // thread gets ONE reply — "Gary's Prop Bets", the bare list for THIS game (HR threats included, no
    // commentary), then the classic app handoff. A game with no props falls back to the old rule: the
    // day's first thread alone carries the handoff line.
    const matchupKey = `${chosen.awayTeam} @ ${chosen.homeTeam}`;
    const handoffLine = APP_HANDOFF[new Date().getDate() % APP_HANDOFF.length];
    const propsReply = buildPropsReply(propsForGame(dayProps, matchupKey, chosen.commence_time), handoffLine);
    const handoff = propsReply ?? (threadsSoFar === 0 ? handoffLine : null);

    // Jul 7 (founder): the top-pick CARD tweet is retired — all 5 daily picks post as the standard text
    // thread. isTopPick is retained in publication metadata; the copy carries facts.
    if (dryRun) {
      threadsSoFar++;
      results.push({ posted: false, dry_run: true, pick: chosen.pick, audience_selection: chosen.audience_selection, is_top_pick: isTopPick, lead_min: Math.round((new Date(chosen.commence_time).getTime() - nowMs) / MIN), hook, props_reply: propsReply, handoff: propsReply ? null : handoff });
      break;
    }

    const startEt = new Date(chosen.commence_time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" });
    const slot = parseInt(startEt) < 14 ? "morning" : parseInt(startEt) < 17 ? "afternoon" : parseInt(startEt) < 21 ? "evening" : "late";
    const { data: claims, error: claimError } = await sb.rpc("claim_social_publication", {
      p_date: today, p_key: publicationKey(chosen), p_reply: handoff,
      p_payload: { slot, league, pick_text: chosen.pick, confidence: conf || null,
        commence_time: chosen.commence_time, thread_format: isTopPick ? "top_pick" : "standard", post_text: hook,
        audience_selection: chosen.audience_selection ?? null },
    });
    if (claimError) throw new Error("PUBLICATION_CLAIM_FAILED");
    if (!claims?.length) { results.push({ posted: false, pick: chosen.pick, reason: "game or posting interval reserved, or other-sport cap reached" }); break; }
    const publication = await publishIntent(claims[0], { store: publicationStore(sb), send: postTweet });
    if (publication.posted) threadsSoFar++;
    results.push({ ...publication, pick: chosen.pick, lead_min: Math.round((new Date(chosen.commence_time).getTime() - Date.now()) / MIN) });
    // A reserved/uncertain send also occupies this interval. Recover its receipt
    // before another root; only composition failures advance to another game.
    break;
   } catch (e) {
    console.error(`pick post failed for ${chosen.pick}: ` + String(e));
    results.push({ posted: false, pick: chosen.pick, error: String(e) });
   }
  }
  return { posted: results.some((r) => r.posted), results, count_today: threadsSoFar, audience: { ...selection, queue: undefined }, missed, skipped_pregame, source_errors };
}

// VERDICT LOOP (Engine 0, Jul 2026): when a game Gary tweeted a pick for goes FINAL, quote-tweet HIS OWN
// pick tweet with a verdict. The quote surfaces the original timestamped call (native receipts) — the pick
// tweet carries the angle, the verdict grades it. Covers standard/top_pick threads from today AND yesterday
// (late finals grade after midnight ET).
// Verdict v3 (Jul 26 2026, founder; register iterated same day): "Hit." / "Miss." / "Push." + what
// happened in the game in tweet register — well under 100 characters, structure free (deliberately NO
// example line or template: his compression example was direction, not a shape to bake in). Written by
// a naked VERDICT_MODEL call GROUNDED in the full box-score report from grade-results ?evidence=1 — never
// ungrounded (no evidence yet -> skip, retry next hourly run; LLM error -> plainVerdict fallback).
// v2 history: the Jul 8-10 ungrounded naked experiment shipped capper slop ("Cashes easily as the
// Giants roll 9-2") because the model only knew the score; the cure was real facts, not style rules.
const VERDICT_CAP_PER_RUN = 4;

// Fetch the grounded game report for one verdict candidate. null = not available yet (endpoint
// down, game missing, BDL gap) — the caller skips and the next hourly run retries.
async function fetchGameEvidence(c: { postDate: string; matchup: string }): Promise<string | null> {
  try {
    const qs = `evidence=1&date=${encodeURIComponent(c.postDate)}&matchup=${encodeURIComponent(c.matchup)}`;
    const r = await fetch(`${SB_URL}/functions/v1/grade-results?${qs}`, {
      headers: { Authorization: `Bearer ${ANON_KEY}` },
    });
    const j = await r.json();
    return j.ok && j.evidence ? String(j.evidence) : null;
  } catch (e) {
    console.error(`evidence fetch failed for ${c.matchup} ${c.postDate}: ` + String(e));
    return null;
  }
}

// Naked model call: no system prompt, no persona — the grounded evidence in the user prompt is
// the entire contract. clean() (emoji/dash strip) + trimTweet stay as mechanical backstops.
// (Verdict lane is retired; this composes for ?dry_run=1 preview only. Anthropic, Aug 24 2026.)
async function nakedLLM(user: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2000, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = (j.content ?? []).map((c: any) => c?.text ?? "").join("");
  if (!text.trim()) throw new Error("Anthropic returned empty output");
  return text.trim();
}

// null = no grounded evidence yet, skip this candidate this run (never post ungrounded).
async function groundedVerdict(
  c: { pickText: string; matchup: string; result: string; finalScore: string; league: string; postDate: string },
): Promise<string | null> {
  const evidence = await fetchGameEvidence(c);
  if (!evidence) return null;
  try {
    const text = trimTweet(clean(await nakedLLM(buildVerdictPrompt(c, evidence))));
    // SHAPE GATE (Sep 1 2026): on Aug 16 this lane quote-tweeted the model's scratch work
    // ("1+9+1+4+1+5 = 75 characters… Let's check all constraints"). Anything that is not a
    // verdict falls back to the template, which cannot be wrong.
    if (!isValidVerdict(text, c.result)) {
      console.error(`VERDICT_SHAPE_REJECTED for ${c.pickText}: ${JSON.stringify(text.slice(0, 160))}`);
      return plainVerdict(c.result, c.finalScore);
    }
    return text;
  } catch (e) {
    console.error("grounded verdict LLM failed, using plain fallback: " + String(e));
    return plainVerdict(c.result, c.finalScore);
  }
}

async function runVerdictMode(today: string, dryRun: boolean) {
  // VERDICT RETIRED (founder, Aug 24 2026: "it still is doing the recap like
  // hit or miss tweets and i dont want those"). Same one-line shape as the
  // retired recap and personality posts: the live path returns before any
  // work, the dry-run below still composes so ?dry_run=1&force_mode=verdict
  // can preview, and one line reverts it. Context: with the Gemini vendor
  // 403-dunning, groundedVerdict degraded every verdict to a naked
  // "Hit. Final 4-2." quote-tweet — ten a night of exactly what he retired.
  if (!dryRun) return { posted: false, reason: "verdict post retired (founder, Aug 24 2026)" };
  const dates = [today, yesterdayOf(today)];
  const { data: logRows, error: logErr } = await sb.from("social_post_log")
    .select("id, post_date, league, pick_text, thread_format, hook_tweet_id, post_text")
    .in("post_date", dates);
  if (logErr) throw logErr;
  const { data: results, error: resErr } = await sb.from("game_results")
    .select("game_date, league, pick_text, result, final_score, matchup")
    .in("game_date", dates);
  if (resErr) throw resErr;
  const cands = matchVerdicts(
    (logRows ?? []) as any,
    (results ?? []).map((r: any) => ({ ...r, game_date: String(r.game_date) })),
    { cap: VERDICT_CAP_PER_RUN },
  );
  if (!cands.length) return { posted: false, reason: "no graded, unverdicted pick tweets" };

  const verdicts: any[] = [];
  for (const c of cands) {
    const text = await groundedVerdict(c);
    if (text === null) { verdicts.push({ pick: c.pickText, result: c.result, skipped: "no grounded evidence yet, retrying next run" }); continue; }
    if (dryRun) { verdicts.push({ pick: c.pickText, result: c.result, quoting: c.hookTweetId, text }); continue; }
    try {
      const id = await postQuote(text, c.hookTweetId);
      // " [verdict]" satisfies UNIQUE(post_date, pick_text) — the pick's own row already holds the bare key.
      // (Unchecked, this failed silently on Jul 5 and the missing dedup row duplicated both verdicts hourly.)
      const { error: insErr } = await sb.from("social_post_log").insert({
        post_date: c.postDate, slot: "verdict", league: c.league, pick_text: `${c.pickText} [verdict]`,
        thread_format: "verdict", hook_tweet_id: id, cta_tweet_id: c.hookTweetId,
        thread_url: `https://x.com/BetwithGary/status/${id}`, post_text: text,
      });
      if (insErr) throw new Error(`posted ${id} but log insert FAILED (dedup at risk): ${insErr.message}`);
      verdicts.push({ pick: c.pickText, result: c.result, thread_url: `https://x.com/BetwithGary/status/${id}` });
    } catch (e) {
      console.error(`verdict post failed for ${c.pickText}: ` + String(e));
      verdicts.push({ pick: c.pickText, result: c.result, error: String(e) });
    }
  }
  return { posted: verdicts.some((v) => v.thread_url), dry_run: dryRun || undefined, verdicts };
}

// SEASON ARC (Engine 0, Jul 2026): the pinned post promises "every pick, $100 flat, all season"; this mode
// posts the weekly standing as a REPLY under the pin (Monday noon ET). The pin itself is posted+pinned once,
// manually (GaryMarketing/ARC_PIN.md runbook), and anchored by a thread_format='arc_pin' log row.
const ARC_START = "2026-07-06";

async function runArcUpdateMode(today: string, dryRun: boolean) {
  const { data: pinRows } = await sb.from("social_post_log")
    .select("hook_tweet_id").eq("thread_format", "arc_pin")
    .order("posted_at", { ascending: false }).limit(1);
  const pinId = pinRows?.[0]?.hook_tweet_id;
  if (!pinId) return { posted: false, reason: "no arc_pin row yet (see GaryMarketing/ARC_PIN.md runbook)" };

  const weekAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const { data: recent } = await sb.from("social_post_log")
    .select("id").eq("thread_format", "arc_update").gte("post_date", weekAgo).limit(1);
  if (recent?.length && !dryRun) return { posted: false, reason: "arc update already posted this week" };

  const { data: rows, error } = await sb.from("game_results")
    .select("pick_text, result").gte("game_date", ARC_START);
  if (error) throw error;
  const s = computeStanding(rows ?? []);
  if (!s.w && !s.l && !s.p) return { posted: false, reason: "no graded picks since ARC_START yet" };

  const pushes = s.p ? ` with ${s.p} push${s.p === 1 ? "" : "es"}` : "";
  const text = `The tape since July 6th, every pick at $100 flat:\n\n${s.record}${pushes}\nNet: ${s.netLabel}\n\nEvery result stays up. Wins and losses.`;

  if (dryRun) return { posted: false, dry_run: true, standing: s, text };

  const tweetId = await postTweet(text, pinId);
  await sb.from("social_post_log").insert({
    post_date: today, slot: "pin", league: "ARC", pick_text: `ARC UPDATE ${today}`,
    thread_format: "arc_update", hook_tweet_id: tweetId,
    thread_url: `https://x.com/BetwithGary/status/${tweetId}`, post_text: text,
  });
  return { posted: true, standing: s, thread_url: `https://x.com/BetwithGary/status/${tweetId}` };
}

// THE DAILY RECAP — yesterday's game picks, ONE POST PER SPORT.
//
// Revived Jul 8 2026, retired Aug 21 2026 ("they dont do well at all"), and
// revived AGAIN Sep 4 2026 by the founder — split by sport this time: "this
// same tweet for MLB and then another one for NCAAF". One post carrying every
// league buried whichever sport a reader came for; each sport now gets its own
// tape with its own date line and its own record. Format:
//   September 3rd:
//
//   NCAAF: 3-1
//   - UAB +27.5 -118 ✅
//   - Georgia Tech -6.5 -110 ❌
//
//   The picks and full reasoning are in the app.
//
// Deterministic: no LLM, no mood, no opening commentary. Props excluded
// (founder: "just do game picks not props"). Composition lives in recap.ts;
// this function is the fetch, the per-sport dedup and the post.
async function runRecapMode(today: string, dryRun: boolean) {
  const y = yesterdayOf(today);

  // Game picks live in two tables: game_results carries MLB + college football
  // (and every other league), nfl_results carries the NFL with its own season
  // type. Preseason is dropped in composeRecaps, so an August NFL exhibition
  // never rides a tape that states a record.
  const [{ data: results, error }, { data: nflRows, error: nflError }] = await Promise.all([
    sb.from("game_results").select("league, result, pick_text, confidence").eq("game_date", y),
    sb.from("nfl_results").select("result, pick_text, confidence, season_type").eq("game_date", y),
  ]);
  if (error) throw error;
  if (nflError) throw nflError;

  const rows: RecapRow[] = [
    ...(results ?? []).map((r: any) => ({
      league: r.league, result: r.result, pick_text: r.pick_text, confidence: r.confidence,
    })),
    ...(nflRows ?? []).map((r: any) => ({
      league: "NFL", result: r.result, pick_text: r.pick_text, confidence: r.confidence,
      season_type: r.season_type,
    })),
  ];

  const posts = composeRecaps(rows, y);
  if (!posts.length) return { posted: false, reason: "no graded game results for yesterday yet" };

  if (dryRun) return { posted: false, dry_run: true, posts };

  // Dedup is PER SPORT: a run that posted MLB and then failed on NCAAF must
  // post only the college tape when it retries, never MLB twice.
  const { data: already } = await sb.from("social_post_log")
    .select("league").eq("post_date", today).eq("thread_format", "recap");
  const posted = new Set((already ?? []).map((r: any) => String(r.league ?? "").toUpperCase()));

  const sent: { league: string; thread_url: string }[] = [];
  const skipped: string[] = [];
  for (const post of posts) {
    if (posted.has(post.league)) { skipped.push(post.league); continue; }
    const tweetId = await postTweet(post.text);
    const { error: insErr } = await sb.from("social_post_log").insert({
      post_date: today, slot: "recap", league: post.league,
      pick_text: `DAILY RECAP ${post.league} ${today}`, thread_format: "recap",
      hook_tweet_id: tweetId, cta_tweet_id: null,
      thread_url: `https://x.com/BetwithGary/status/${tweetId}`, post_text: post.text,
    });
    // A posted tweet with no log row would repost tomorrow's run — fail loudly
    // rather than quietly risking a duplicate.
    if (insErr) throw new Error(`posted ${tweetId} (${post.league}) but log insert FAILED: ${insErr.message}`);
    sent.push({ league: post.league, thread_url: `https://x.com/BetwithGary/status/${tweetId}` });
  }

  if (!sent.length) return { posted: false, reason: `recap already posted today (${skipped.join(", ")})` };
  return { posted: true, sent, skipped };
}

// WEEK TAPE (Sep 1 2026, co-founder ruling after the marketing review): ONE post a week, Monday late
// morning ET — the completed Mon-Sun record across every league, plus the trailing 30 days. It is
// deterministic (weektape.ts): no model, no prose beyond the fixed lines. It exists because the record
// is the brand and, with the daily recap retired (Aug 21), nothing on the timeline ever stated the
// aggregate: verdicts are per-game receipts, and the pin promised a Monday standing that stopped Jul 7.
// Idempotent on its own log row (thread_format 'week_tape') inside the last six days, so a failed 11am
// run is retried by the next runs through mid-afternoon and never posts twice.
const WEEK_TAPE_HOUR = 11;

async function runWeekTapeMode(today: string, dryRun: boolean) {
  const weekAgo = new Date(new Date(today + "T12:00:00Z").getTime() - 6 * 86400_000).toISOString().slice(0, 10);
  const { data: recent, error: recentError } = await sb.from("social_post_log")
    .select("id").eq("thread_format", "week_tape").gte("post_date", weekAgo).limit(1);
  if (recentError) throw recentError;
  if (recent?.length && !dryRun) return { posted: false, reason: "week tape already posted this week" };

  const since = new Date(new Date(today + "T12:00:00Z").getTime() - 31 * 86400_000).toISOString().slice(0, 10);
  // NFL has its own results ledger, just as in the daily recap. A missing
  // source must stop publication rather than silently improve a partial record.
  const [{ data: rows, error }, { data: nflRows, error: nflError }] = await Promise.all([
    sb.from("game_results").select("game_date, league, result").gte("game_date", since).lt("game_date", today),
    sb.from("nfl_results").select("game_date, result, season_type").gte("game_date", since).lt("game_date", today),
  ]);
  if (error) throw error;
  if (nflError) throw nflError;
  const tape = composeWeekTape([
    ...(rows ?? []).map((r: any) => ({ ...r, game_date: String(r.game_date) })),
    ...(nflRows ?? []).map((r: any) => ({ ...r, league: "NFL", game_date: String(r.game_date) })),
  ], today);
  if (!tape) return { posted: false, reason: "no graded games in the completed week" };
  if (dryRun) return { posted: false, dry_run: true, week: tape.week, record: tape.record, text: tape.text };

  const tweetId = await postTweet(tape.text);
  const { error: insErr } = await sb.from("social_post_log").insert({
    post_date: today, slot: "week_tape", league: "TAPE", pick_text: `WEEK TAPE ${today}`, thread_format: "week_tape",
    hook_tweet_id: tweetId, thread_url: `https://x.com/BetwithGary/status/${tweetId}`, post_text: tape.text,
  });
  if (insErr) throw new Error(`posted ${tweetId} but log insert FAILED (dedup at risk): ${insErr.message}`);
  return { posted: true, week: tape.week, record: tape.record, text: tape.text, thread_url: `https://x.com/BetwithGary/status/${tweetId}` };
}

// Daily standalone CHARACTER post (Option A). Grounded in yesterday's mood + today's slate so it's earned, not random. No link, no hashtag.
async function runPersonalityMode(today: string, dryRun: boolean) {
  // RETIRED Jun 29 2026: the noon "words" character post (the "Ground out a 10 and 7 record... staring at
  // Brazil ML" tweet) is killed — the only daily public post is now the clean per-sport recap (runRecapMode).
  // Early-return keeps the noon slot quiet; the dry-run path below stays so it can still be previewed. To
  // revert, delete this line.
  if (!dryRun) return { posted: false, reason: "personality post retired (replaced by clean recap)" };
  const { data: existing } = await sb.from("social_post_log").select("id").eq("post_date", today).eq("thread_format", "personality").limit(1);
  if (existing?.length && !dryRun) return { posted: false, reason: "personality already posted today" };
  const y = yesterdayOf(today);
  const { data: results } = await sb.from("game_results").select("result").eq("game_date", y);
  const wins = (results ?? []).filter((r) => r.result === "won").length;
  const losses = (results ?? []).filter((r) => r.result === "lost").length;
  const mood = moodFor(wins, losses);
  const { data: dpRows } = await sb.from("daily_picks").select("picks").eq("date", today);
  const picks: any[] = dpRows?.[0]?.picks ?? [];
  const top = [...picks].sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0))[0];

  const user = `Write ONE standalone tweet as Gary (a sharp handicapper who calls and sweats every game, the sharpest friend in the group chat). This is a CHARACTER post, NOT a pick. No bet breakdown, no odds, no app link, no hashtag.
Gary's mood today: ${mood}. Yesterday's record was ${wins} and ${losses}. The register for this mood: ${MOODS[mood]}.
Today there ${picks.length === 1 ? "is" : "are"} ${picks.length} game${picks.length === 1 ? "" : "s"} on Gary's card${top ? `, and the one he keeps circling back to is ${top.pick}` : ""}.
Match this VOICE (a DIFFERENT day, copy the style not the facts): "Brutal beat last night. Had the Heat and they bricked a wide open three at the buzzer to flip it to a loss. Some nights the numbers are right and the rim still says no. Five on the card today."
Write something real: a confession, a reflection, a sharp aside about sweating every game, or honest ownership if yesterday went badly. It can occasionally be a genuine question to other bettors, but not usually. Sound like a person texting, contractions and fragments, not a brand. Stay fully in character (Gary is a handicapper, never an AI or a model). Under 240 characters. Return ONLY JSON: {"post": "..."}.`;
  const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
  const post = clean(out.post);
  if (dryRun) return { posted: false, dry_run: true, mood, record: `${wins}-${losses}`, post };
  const tweetId = await postTweet(post);
  await sb.from("social_post_log").insert({
    post_date: today, slot: "midday", pick_text: `PERSONALITY ${today}`, thread_format: "personality",
    hook_tweet_id: tweetId, thread_url: `https://x.com/BetwithGary/status/${tweetId}`,
  });
  return { posted: true, mood, record: `${wins}-${losses}`, thread_url: `https://x.com/BetwithGary/status/${tweetId}` };
}

Deno.serve(async (req) => {
  if (!isSocialServiceRequest(req, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return Response.json({ ok: false, error: "Service authorization required" }, { status: 403 });
  }
  let dryRun = false;
  let runKind = "scheduled";
  let publicationRecovery: any[] = [];
  // pg_cron success means the HTTP request was enqueued, not that X accepted
  // it. The retained pg_net response provides the real result to the read-only
  // marketing-readiness command and failure monitor. Degraded runs are HTTP 503.
  const respond = (body: any, init?: ResponseInit) => {
    const health = socialRunHealth({ ...body, publication_recovery: publicationRecovery });
    return Response.json({
      ...body, service: "social-auto-post", posting_policy: FULL_COVERAGE_VERSION, checked_at: new Date().toISOString(),
      dry_run: dryRun, run_kind: runKind, publication_recovery: publicationRecovery, health,
    }, { ...init, status: init?.status ?? (health.status === 'ok' ? 200 : 503) });
  };
  try {
    const url = new URL(req.url);
    const preview = url.searchParams.get("preview") === "1";
    dryRun = url.searchParams.get("dry_run") === "1" || preview;
    const force = url.searchParams.get("force_mode") ?? (preview ? "pick" : null);
    const metricsOnly = url.searchParams.get("metrics_only") === "1";
    runKind = force ? "manual" : metricsOnly ? "metrics" : "scheduled";

    const { date: today, hour, weekday } = etParts();
    const nowMs = Date.now();

    if (!dryRun) publicationRecovery = await reconcilePublications(today, !metricsOnly);

    // Refresh KPI metrics (keeps impressions/likes live 24/7). Never let it block posting.
    // Aug 5 2026: throttled to roughly once an hour instead of once per run. Picks now want a much faster
    // cron (every 15 min, so each pick gets several shots at its lead window) but metrics do not need that
    // resolution, and refreshing on every run would quadruple X API reads (~24/day -> ~96/day) against an
    // account that has already run out of X credits once. The throttle keys off the STORED timestamp, not
    // the clock minute, so it stays correct at any cron cadence — including the old hourly :45 schedule.
    let metrics: any = { updated: 0, checked: 0 };
    if (!dryRun) {
      try {
        metrics = (!metricsOnly && await metricsRefreshedRecently())
          ? { skipped: `refreshed within the last ${METRICS_MIN_INTERVAL_MIN}min` }
          : await refreshMetrics();
      } catch (e) { console.error("metrics refresh failed: " + String(e)); metrics = { error: String(e) }; }
    }
    if (metricsOnly) return respond({ metrics_only: true, metrics });

    // Verdict loop rides every unforced hourly run: finals detected within ~1hr, quote-tweeted.
    let verdict: any = undefined;
    if (!force) {
      try { verdict = await runVerdictMode(today, dryRun); }
      catch (e) { console.error("verdict mode failed: " + String(e)); verdict = { error: String(e) }; }
    }
    // Weekly arc standing RETIRED from the hourly path Jul 7 (founder: "dont do 8") — the pin stays up,
    // but no automated standing replies. force_mode=arc remains for a manual/dry-run standing if wanted.
    const arc: any = undefined;

    if (force === "verdict") {
      const verdict = await runVerdictMode(today, dryRun);
      console.log(JSON.stringify({ mode: "verdict", verdict }).slice(0, 500));
      return respond({ mode: "verdict", metrics, verdict });
    }

    if (force === "arc") {
      const arc = await runArcUpdateMode(today, dryRun);
      console.log(JSON.stringify({ mode: "arc", arc }).slice(0, 500));
      return respond({ mode: "arc", metrics, arc });
    }

    if (force === "week_tape") {
      const weekTape = await runWeekTapeMode(today, dryRun);
      console.log(JSON.stringify({ mode: "week_tape", weekTape }).slice(0, 500));
      return respond({ mode: "week_tape", metrics, weekTape });
    }

    if (force === "recap") {
      const recap = await runRecapMode(today, dryRun);
      console.log(JSON.stringify({ mode: "recap", recap }).slice(0, 500));
      return respond({ mode: "recap", metrics, recap });
    }

    if (force === "personality") {
      const personality = await runPersonalityMode(today, dryRun);
      console.log(JSON.stringify({ mode: "personality", personality }).slice(0, 500));
      return respond({ mode: "personality", metrics, personality });
    }

    // Aug 5 2026: modes no longer COMPETE for the hour. The old chain resolved ET hour 12 to the RETIRED
    // "personality" mode, so the whole noon hour posted nothing even though it sat inside the posting window —
    // that is why the Aug 5 12:45 run was silent while the Astros pick sat there eligible. Recap and picks are
    // independent now. runRecapMode is idempotent on its own dedup row, so attempting it on every run from
    // RECAP_HOUR through early afternoon is safe AND self-healing: if grading is not in yet at 10am (a common
    // "no graded game results for yesterday yet" skip), a later run posts it instead of losing the recap.
    let recap: any = undefined;
    if (!force && hour >= RECAP_HOUR && hour <= RECAP_HOUR + 4) {
      try { recap = await runRecapMode(today, dryRun); }
      catch (e) { console.error("recap mode failed: " + String(e)); recap = { error: String(e) }; }
    }

    // Monday week tape: same self-healing window shape as the recap (tries 11am-3pm ET, posts once).
    let weekTape: any = undefined;
    if (!force && weekday === 1 && hour >= WEEK_TAPE_HOUR && hour <= WEEK_TAPE_HOUR + 4) {
      try { weekTape = await runWeekTapeMode(today, dryRun); }
      catch (e) { console.error("week tape failed: " + String(e)); weekTape = { error: String(e) }; }
    }

    const result = await runPickMode(today, nowMs, dryRun, preview);
    console.log(JSON.stringify({ mode: "pick", verdict, recap, weekTape, arc, ...result }).slice(0, 500));
    return respond({ mode: "pick", metrics, verdict, recap, weekTape, arc, ...result });
  } catch (e) {
    console.error(String(e));
    return respond({ error: String(e) }, { status: 500 });
  }
});
