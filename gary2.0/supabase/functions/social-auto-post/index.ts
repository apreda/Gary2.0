// social-auto-post — server-side @BetwithGary auto-poster (picks drip + daily recap + metrics refresh)
// Cron: every 15 min (was hourly at :45 UTC until Aug 5 2026). Every run: refresh metrics, run the verdict
// loop, attempt the morning recap (idempotent, 10a-2p ET), then post every pick whose FIRST PITCH is still
// 5-120 min away. Posting is game-paced, not clock-paced — see the LEAD_* constants below.
// (The noon personality post is RETIRED as of Jun 29 2026 — runPersonalityMode early-returns; dry-run preview only.)
// (The /api/take-card and /api/pick-card-app routes are no longer used here.)
// Metrics: every run also refreshes impressions/likes/replies/retweets for posts from the last 6 days (KPI stays live 24/7).
//          Each row's numbers = SUM across all tweets in the thread = total thread reach.
//
// CONVERSION-FIRST REDESIGN (v11, Jun 16 2026) — see Desktop/Gary2.0/X_CONVERSION_STRATEGY.md:
//   - North Star is APP DOWNLOADS + retained users, NOT impressions/followers.
//   - ZERO emojis anywhere (removed the sport-emoji map and the TOP PICK badge).
//   - "Give the pick, hold the depth" withhold policy: the pick hook shows the pick + odds + ONE strongest falsifiable
//     factor; the full breakdown and the rest of the day's slate stay in the app (that is the reason to download).
//   - No hashtags. No "Full breakdown" promise. No in-thread App Store link (the buried link converted ~0; the bio +
//     pinned post carry the install path, and the profile out-converts an in-thread link). Pick thread = hook, plus a
//     "link in bio" handoff reply on the DAY'S FIRST thread ONLY (Jul 5: every-thread handoffs read generic-capper).
//   - Recap (10am) = ONE Gary-voiced morning-tape post: record in prose + one real result detail, mood-ladder register
//     (absorbed the retired personality post, Jul 5). Falls back to plain per-sport lines if the LLM fails.
//
// Query params: ?dry_run=1 (compose, don't post/log), ?force_mode=pick|recap|personality|verdict|arc, ?preview=1 (dry-run: compose top pick ignoring timing), ?metrics_only=1
// LLM: Google Gemini (GEMINI_API_KEY secret; model override via GEMINI_MODEL, default gemini-3.5-flash)
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchVerdicts, plainVerdict, buildVerdictPrompt, trimTweet } from "./verdicts.ts";
import { computeStanding } from "./pl.ts";
import { selectPicks, type Slot } from "./window.ts";
import { marqueeScore } from "./marquee.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// Verdict v3.3 (Jul 29 2026, founder: "for the tweets we can use Gemini — whatever model gets the
// job done for cheap"): verdicts run a NAKED Gemini call (VERDICT_MODEL secret, default 3.6 Flash).
// v3-v3.2 ran gpt-5.6-sol; the register contract and box-score grounding are unchanged —
// brain that makes the picks, zero system prompt, zero persona — grounded by the full game report
// from grade-results ?evidence=1. See buildVerdictPrompt in verdicts.ts for the approved contract.
const VERDICT_MODEL = Deno.env.get("VERDICT_MODEL") ?? "gemini-3.6-flash";
// Voice work gets its own model knob: SOCIAL_GEMINI_MODEL upgrades the WRITER (captions, verdicts, recap)
// without touching grade-results or anything else that shares the global GEMINI_MODEL secret.
const GEMINI_MODEL = Deno.env.get("SOCIAL_GEMINI_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
// Base origin for the Vercel OG image routes (results-card, pick-card). Override (e.g. localhost) for dry-run rendering.
const CARD_BASE = Deno.env.get("CARD_BASE_URL") ?? "https://www.betwithgary.ai";
const sb = createClient(SB_URL, SERVICE_KEY);

// Jul 7 (founder): 5 pick threads/day in the standard text format.
//
// Aug 5 2026 REWRITE (founder: "those cannot go out after the game starts... that's like making a pick after
// the game starts. It looks like we're retroactively making a pick"). Posting is now GAME-PACED, not
// clock-paced. The old design ran one post per hourly slot, which failed three ways:
//   1. A clustered slate could not be covered. Aug 5 had four picks first-pitching inside 60 minutes
//      (2:10 / 2:20 / 2:35 / 3:10) — at one post per hour, two were late no matter what.
//   2. ET hour 12 resolved to the RETIRED "personality" mode and posted nothing at all — a dead noon slot.
//   3. A single failed run forfeited its pick for a full hour, by which point the game had started and the
//      pick was dropped forever (Aug 5: Astros -1.5 and Cubs/Dodgers ML were never tweeted).
// Now every run posts every pick whose first pitch sits inside the lead window, up to MAX_POSTS_PER_RUN,
// and each pick composes/posts independently so one LLM hiccup cannot take the others down with it.
const POST_HOURS_START = 8;   // ET hour the poster starts considering picks
const POST_HOURS_END = 23;    // ...and stops (inclusive)
const LEAD_MAX_MIN = 120;     // don't post more than 2h before first pitch (keeps the take timely)
const LEAD_MIN_MIN = 5;       // HARD DEADLINE: must be >= 5 min before first pitch, otherwise never post
const MAX_POSTS_PER_RUN = 3;  // burst guard; the 115-min-wide window always contains >=1 run, even hourly
const PICKS_PER_DAY = 5;
// Slots held back per day-part so a clustered afternoon can never eat the whole day (founder, Aug 5 2026:
// "there are still people up on the West Coast, and we still want to get to them"). Reservations only bind
// when games actually exist later — an all-afternoon getaway day still posts a full slate. See window.ts.
const SLOT_RESERVE: Record<Slot, number> = { morning: 0, afternoon: 1, evening: 2, late: 1 };
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
  return { date: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour === "24" ? "0" : p.hour), minute: parseInt(p.minute) };
}

function yesterdayOf(today: string): string {
  return new Date(new Date(today + "T12:00:00Z").getTime() - 86400_000).toISOString().slice(0, 10);
}

// "2026-06-28" -> "June 28th" (ordinal suffix for the recap header).
function ordinalDate(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const day = d.getUTCDate();
  const suffix = (day % 100 >= 11 && day % 100 <= 13) ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${month} ${day}${suffix}`;
}

async function callLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      // Pro models THINK before answering and the thoughts bill against maxOutputTokens — without capping
      // thinking, long social prompts burn the whole budget and return empty (every call fell to fallback).
      generationConfig: { maxOutputTokens: 8000, responseMimeType: "application/json", ...(GEMINI_MODEL.includes("pro") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  if (!text) throw new Error("Gemini returned empty output: " + JSON.stringify(j).slice(0, 300));
  return text;
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
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`${fn} failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}

async function postQuote(text: string, quoteTweetId: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/post-quote-tweet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
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
      headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tweetIds: chunk }),
    });
    const j = await r.json();
    if (j.success && Array.isArray(j.tweets)) for (const t of j.tweets) byId[t.id] = t;
  }
  return byId;
}

// Metrics throttle (Aug 5 2026): the newest metrics_updated_at stamp IS the "when did we last refresh" clock,
// so no extra state is needed and the throttle holds at any cron cadence.
const METRICS_MIN_INTERVAL_MIN = 45;
let warnedMissingCols = false; // one log line per cold start, not one per row
async function metricsRefreshedRecently(): Promise<boolean> {
  const { data } = await sb.from("social_post_log").select("metrics_updated_at")
    .not("metrics_updated_at", "is", null).order("metrics_updated_at", { ascending: false }).limit(1);
  const last = data?.[0]?.metrics_updated_at;
  return !!last && (Date.now() - new Date(last).getTime()) < METRICS_MIN_INTERVAL_MIN * 60_000;
}

// Refresh impressions/likes/replies/retweets for recent posts so KPI tracking stays live without anyone in the loop.
// Each row's value = SUM across every tweet in its thread = total thread reach. Non-fatal by design.
async function refreshMetrics(): Promise<{ updated: number; checked: number }> {
  const since = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const { data: rows, error } = await sb.from("social_post_log").select("id, hook_tweet_id, reasoning_tweet_id, cta_tweet_id").gte("post_date", since).not("hook_tweet_id", "is", null);
  if (error || !rows?.length) return { updated: 0, checked: 0 };
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
    // Deploy-order safety: this function ships before migration 20260805201000_social_post_log_intent_metrics
    // can be applied (the repo's migration history is out of sync with remote, so `db push` is blocked and the
    // DDL is applied by hand). Until those three columns exist, PostgREST rejects the whole UPDATE with 42703
    // and metrics would stop refreshing entirely. So: try the full write, and fall back to the legacy column
    // set if the columns are not there yet. The moment the DDL lands, intent metrics start recording on their
    // own with no redeploy. Remove the fallback once the columns are confirmed in production.
    const { error: upErr } = await sb.from("social_post_log").update({
      ...legacy,
      bookmarks: sum("bookmarks"), profile_clicks: sum("user_profile_clicks"),
      link_clicks: anyLinkClicks ? sum("url_link_clicks") : null,
    }).eq("id", row.id);
    if (upErr) {
      // PGRST204 = PostgREST cannot find the column in its schema cache (what a write to a not-yet-created
      // column actually returns; Postgres's own 42703 only surfaces on reads, so both are accepted here).
      if (upErr.code !== "PGRST204" && upErr.code !== "42703") {
        throw new Error(`social_post_log update failed (${upErr.code}): ${upErr.message}`);
      }
      if (!warnedMissingCols) {
        console.warn("intent-metric columns missing (bookmarks/profile_clicks/link_clicks) — apply migration 20260805201000; storing legacy metrics only");
        warnedMissingCols = true;
      }
      await sb.from("social_post_log").update(legacy).eq("id", row.id);
    }
    updated++;
  }
  return { updated, checked: rows.length };
}

const VOICE_RULES = `You write posts for @BetwithGary as "Gary", a sharp, confident sports-betting handicapper who calls and sweats every game. Voice: the sharpest friend in the group chat. Sharp, honest, in it with you. ABSOLUTE RULE: the provided rationale/stats are GROUND TRUTH (it is 2026, past your training data). Never correct player-team assignments or import outside facts. Only ensure internal consistency (right stat to the right player to the right team).
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

async function runPickMode(today: string, nowMs: number, dryRun: boolean, preview = false) {
  const { data: dpRows, error: dpErr } = await sb.from("daily_picks").select("picks").eq("date", today);
  if (dpErr) throw dpErr;
  const picks: any[] = dpRows?.[0]?.picks ?? [];
  if (!picks.length) return { posted: false, reason: "no picks loaded yet" };

  const { data: logRows, error: logErr } = await sb.from("social_post_log").select("pick_text, thread_format").eq("post_date", today);
  if (logErr) throw logErr;
  // Whitelist the ACTUAL pick-thread formats: with verdict/arc/wc rows in the same log, a blacklist would let
  // them eat the 3/day cap (three verdicts would silently block the day's real picks) and suppress the handoff.
  const pickThreads = (logRows ?? []).filter((r) => ["standard", "top_pick"].includes(r.thread_format ?? ""));
  if (pickThreads.length >= PICKS_PER_DAY && !preview) return { posted: false, reason: `daily cap of ${PICKS_PER_DAY} reached` };
  const postedSet = new Set(pickThreads.map((r) => r.pick_text));

  const MIN = 60_000;
  const unposted = picks.filter((p) => !postedSet.has(p.pick));

  // HARD DEADLINE (Aug 5 2026, founder's law): a pick is postable ONLY while first pitch is still at least
  // LEAD_MIN_MIN ahead of us. The deleted code did the opposite on two paths — `postable` kept any game that
  // had started within the last 20 minutes, and an `_live` branch reached back a FULL HOUR and told the model
  // "GAME JUST STARTED, frame the angle as live, just-underway energy". That is what shipped tweets like
  // "First pitch just went in Denver" 35 minutes after the Rays game began. A pick published after the game
  // starts reads as a retroactive call, so there is no grace period any more: miss the window, skip the pick.
  const { queue: selected, missed, eligibleCount, budget, reserved } = selectPicks(unposted, {
    nowMs,
    leadMinMin: LEAD_MIN_MIN,
    leadMaxMin: LEAD_MAX_MIN,
    maxPerRun: MAX_POSTS_PER_RUN,
    dailyCap: PICKS_PER_DAY,
    postedToday: pickThreads.length,
    reserve: SLOT_RESERVE,
    marqueeScore,
  });

  // A pick whose first pitch has already passed can NEVER post now. Say so loudly: the Aug 5 misses
  // (Astros -1.5, Cubs/Dodgers ML) disappeared with nothing in any log to notice them.
  if (missed.length) {
    console.error(`MISSED_PICKS ${today}: first pitch passed before these could post -> ${missed.join(" | ")}`);
  }

  // preview (dry-run only): ignore timing, just compose the highest-confidence unposted pick so we can vet formatting anytime.
  let queue = selected;
  if (!queue.length && preview && dryRun) {
    queue = [...unposted].sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0)).slice(0, 1);
  }
  if (!queue.length) {
    const reason = !eligibleCount
      ? "no pick inside the lead window"
      : reserved
      ? `cap spent; ${reserved} slot(s) held for later day-parts`
      : `daily cap of ${PICKS_PER_DAY} reached`;
    return { posted: false, reason, eligible: eligibleCount, budget, reserved, missed };
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
    const conf = parseFloat(chosen.confidence ?? 0);
    const isTopPick = conf >= 0.8 && conf === maxConf;
    const league = (chosen.league ?? "MLB").toUpperCase();
    // De-dupe odds: many pick strings already embed the odds (e.g. "Dodgers ML -174"). Only append (odds) when not present.
    const oddsStr = (chosen.odds && !String(chosen.pick).includes(String(chosen.odds))) ? ` (${chosen.odds})` : "";
    const pickLine = `${chosen.pick}${oddsStr}`; // clean machine-readable shorthand, no emoji

    // WITHHOLD POLICY: the hook is angle + the pick line + ONE strongest falsifiable factor. The full breakdown and the rest
    // of the slate stay in the app (that is the reason to download). The model writes the angle and the single edge; we inject
    // the pick line verbatim so it is always clean shorthand and never carries an emoji.
    const user = `Write the hook for a single bet. Return ONLY JSON: {"angle": "...", "edge": "..."}.
PICK: ${chosen.pick} | odds: ${chosen.odds ?? "see rationale"} | ${chosen.awayTeam} @ ${chosen.homeTeam} | league ${league} | starts ${chosen.time ?? chosen.commence_time} ET
${isTopPick ? "This is Gary's highest-conviction play on the whole board today. Let the angle and the edge carry that certainty in his voice. Do NOT use any label, badge, or the words 'top pick'.\n" : ""}Match this VOICE (a DIFFERENT game, copy the casual style not the facts):
ANGLE example: "Pirates are down to a backup catcher who's never taken an MLB at-bat, and he let guys run wild in the minors, 84% on steals."
EDGE example: "He's catching a Dodgers lineup built to run, swiped a bag in nine straight. I'm laying the runline."
Notice: casual, contractions, one concrete number, ends on a stance, no fancy adjectives.

ANGLE: a punchy 1 to 2 line story angle tied to a real detail in the rationale (a scratch, a matchup edge, a rest or bullpen situation, a trend). Under roughly 200 characters. No pick, no odds, no link.
EDGE: the ONE single strongest, most specific, FALSIFIABLE factor from the rationale or stats (a concrete number or a named situational edge). One or two sentences. End on a short casual stance about the play (for example "I'm laying the runline." or "I'll take the over."). Do NOT list multiple stats. Hold the rest of the reasoning back for the app. No call to action, no link.

RATIONALE:
${chosen.rationale ?? ""}

STATS:
${JSON.stringify(chosen.statsData ?? []).slice(0, 4000)}

INJURIES:
${JSON.stringify(chosen.injuries ?? []).slice(0, 1500)}`;
    const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
    const angle = clean(out.angle);
    const edge = clean(out.edge);
    // BROKEN-TWEET GUARD (Aug 4 2026, founder: "our tweets seem to be broken").
    // Root cause: Gemini's JSON contract is satisfied (valid JSON, so callLLM/
    // parseJsonBlock never throw) but occasionally returns {"angle":"","edge":""}
    // or omits the keys — an empty-but-well-formed response. Nothing downstream
    // checked for that, so the hook silently built as "\n\nPICK LINE\n\n" and
    // posted live with no analytical text (confirmed in social_post_log: ~1 in
    // 5 recent standard posts, e.g. "Minnesota Twins ML -140" on 2026-08-04).
    // Real angle/edge content is always a full sentence or more; anything this
    // short is the empty-response failure mode, not a legitimately terse write.
    // Throwing here (before postTweet) keeps the broken tweet off the timeline —
    // social_post_log is only written AFTER a successful postTweet, so the pick
    // stays unposted. Aug 5: the throw is now caught per-pick by the loop, so it
    // costs this one pick this run and the next run retries it — it no longer
    // takes the whole slate down (that is how Astros -1.5 and Cubs ML were lost).
    if (angle.length < 15 || edge.length < 15) {
      throw new Error(`Empty hook content from LLM for "${chosen.pick}" — angle="${angle}" edge="${edge}", refusing to post`);
    }
    const hook = `${angle}\n\n${pickLine}\n\n${edge}`;
    // Handoff reply on the DAY'S FIRST thread only (Jul 5 2026): a "link in bio" reply on every thread reads
    // generic-capper (the big personality accounts never do it) and /get clicks showed it converts ~0. One
    // deliberate handoff a day; the bio + pinned arc carry the install path the rest of the time.
    const handoff = threadsSoFar === 0 ? APP_HANDOFF[new Date().getDate() % APP_HANDOFF.length] : null;

    // Jul 7 (founder): the top-pick CARD tweet is retired — all 5 daily picks post as the standard text
    // thread. isTopPick still shapes the language (conviction carries in the words, never a badge).
    if (dryRun) {
      threadsSoFar++;
      results.push({ posted: false, dry_run: true, pick: chosen.pick, is_top_pick: isTopPick, lead_min: Math.round((new Date(chosen.commence_time).getTime() - nowMs) / MIN), hook, handoff });
      continue;
    }

    const hookId = await postTweet(hook);
    const handoffId = handoff ? await postTweet(handoff, hookId) : null;
    const startEt = new Date(chosen.commence_time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" });
    const slot = parseInt(startEt) < 14 ? "morning" : parseInt(startEt) < 17 ? "afternoon" : parseInt(startEt) < 21 ? "evening" : "late";
    await sb.from("social_post_log").insert({
      post_date: today, slot, league, pick_text: chosen.pick, confidence: conf || null,
      commence_time: chosen.commence_time, thread_format: isTopPick ? "top_pick" : "standard",
      hook_tweet_id: hookId, reasoning_tweet_id: handoffId, cta_tweet_id: null,
      thread_url: `https://x.com/BetwithGary/status/${hookId}`, post_text: hook,
    });
    threadsSoFar++;
    results.push({ posted: true, pick: chosen.pick, lead_min: Math.round((new Date(chosen.commence_time).getTime() - nowMs) / MIN), thread_url: `https://x.com/BetwithGary/status/${hookId}` });
   } catch (e) {
    console.error(`pick post failed for ${chosen.pick}: ` + String(e));
    results.push({ posted: false, pick: chosen.pick, error: String(e) });
   }
  }
  return { posted: results.some((r) => r.posted), results, count_today: threadsSoFar, missed };
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
async function nakedLLM(user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VERDICT_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 2000 },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = (j.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => p.text && !p.thought)
    .map((p: any) => p.text)
    .join("");
  if (!text.trim()) throw new Error("Gemini returned empty output");
  return text.trim();
}

// null = no grounded evidence yet, skip this candidate this run (never post ungrounded).
async function groundedVerdict(
  c: { pickText: string; matchup: string; result: string; finalScore: string; league: string; postDate: string },
): Promise<string | null> {
  const evidence = await fetchGameEvidence(c);
  if (!evidence) return null;
  try {
    return trimTweet(clean(await nakedLLM(buildVerdictPrompt(c, evidence))));
  } catch (e) {
    console.error("grounded verdict LLM failed, using plain fallback: " + String(e));
    return plainVerdict(c.result, c.finalScore);
  }
}

async function runVerdictMode(today: string, dryRun: boolean) {
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

// REVIVED Jul 8 2026 (founder): full per-sport list of every GAME pick from yesterday — no LLM, no
// personality, no mood. Deterministic template only ("no personality needed because its simple
// instructions"). Format:
//   July 7th:
//
//   MLB: 7-0
//   - Dodgers -1.5 ✅
//   - Braves ML ❌
//   ...
// Props excluded (founder: "just do game picks not props"). Closes with the app plug + 1-2 hashtags
// (founder, Jul 8 — an explicit exception to the account's usual zero-hashtag rule, THIS SURFACE ONLY).
// Hashtags are drawn from whichever leagues actually appear that day, so they stay genuinely relevant
// instead of static filler.
async function runRecapMode(today: string, dryRun: boolean) {
  const { data: existing } = await sb.from("social_post_log").select("id").eq("post_date", today).eq("thread_format", "recap").limit(1);
  if (existing?.length && !dryRun) return { posted: false, reason: "recap already posted today" };
  const y = yesterdayOf(today);
  const { data: results, error } = await sb.from("game_results").select("league, result, pick_text, confidence").eq("game_date", y);
  if (error) throw error;
  const graded = (results ?? []).filter((r) => r.result === "won" || r.result === "lost" || r.result === "push");
  if (!graded.length) return { posted: false, reason: "no graded game results for yesterday yet" };

  const marker = (result: string) => result === "won" ? "✅" : result === "lost" ? "❌" : "(push)";
  const bySport = new Map<string, { won: number; lost: number; picks: any[] }>();
  for (const r of graded) {
    const rec = bySport.get(r.league) ?? { won: 0, lost: 0, picks: [] };
    if (r.result === "won") rec.won++; else if (r.result === "lost") rec.lost++;
    rec.picks.push(r);
    bySport.set(r.league, rec);
  }
  const sortedEntries = [...bySport.entries()].sort((a, b) => b[1].picks.length - a[1].picks.length || a[0].localeCompare(b[0]));
  const sections = sortedEntries.map(([league, rec]) => {
    const lines = [...rec.picks]
      .sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0))
      .map((p) => `- ${p.pick_text} ${marker(p.result)}`);
    return `${league}: ${rec.won}-${rec.lost}\n${lines.join("\n")}`;
  });
  // MORNING TAPE (rebuilt Aug 5 2026). The file header has claimed since Jul 5 that this post is "ONE
  // Gary-voiced morning-tape post: record in prose + one real result detail, mood-ladder register", with the
  // plain per-sport list as the FALLBACK when the LLM fails. That was never true in code: runRecapMode had no
  // LLM call at all, so the fallback list was the only thing that ever shipped — opening on a bare date stamp,
  // closing on a generic CTA and a hashtag. It is the worst-performing recurring format on the account
  // (212 avg impressions vs 548 for picks), and hashtags suppress reach on X besides.
  //
  // The founder's reasons for keeping this post are brand reasons, and they are good ones: full transparency
  // on wins AND losses, visible proof Gary picks every single game, and a pull into the app for the full card.
  // So the LEDGER stays exactly as complete as it was — every pick, every result, nothing hidden on a bad day.
  // What changes is that a human-sounding line now leads it, so the honesty is the hook instead of a date.
  // The win/loss markers stay: in a results ledger they are scannable structure, not hype decoration.
  const totals = graded.reduce((a, r) => (r.result === "won" ? { ...a, w: a.w + 1 } : r.result === "lost" ? { ...a, l: a.l + 1 } : a), { w: 0, l: 0 });
  const mood = moodFor(totals.w, totals.l);
  let lead = "";
  try {
    const out = parseJsonBlock(await callLLM(VOICE_RULES, `Write the opening line of Gary's morning results post. Return ONLY JSON: {"lead": "..."}.

Yesterday (${ordinalDate(y)}) Gary went ${totals.w}-${totals.l}. Register for this record: ${MOODS[mood]}.
The full ledger is printed directly beneath your line, so do NOT list picks, records, or repeat the date.

LEAD: one or two sentences owning yesterday honestly. If it was a losing day, say so plainly with zero spin
and zero excuses. If it was a winning day, do not gloat. Reference ONE concrete thing that actually happened
below. Under roughly 180 characters. No link, no call to action, no hashtag.

RESULTS:
${graded.map((r) => `${r.pick_text}: ${r.result}`).join("\n")}`));
    lead = clean(out.lead);
  } catch (e) {
    console.error("recap lead failed, falling back to the plain ledger: " + String(e));
  }
  // Same guard class as the pick hook: a well-formed but empty LLM response must not ship a headless post.
  const header = lead.length >= 15 ? `${lead}\n\n${ordinalDate(y)}:` : `${ordinalDate(y)}:`;
  const text = `${header}\n\n${sections.join("\n\n")}\n\nEvery game, every day. The full card is in the app.`;

  if (dryRun) return { posted: false, dry_run: true, text };

  const tweetId = await postTweet(text);
  await sb.from("social_post_log").insert({
    post_date: today, slot: "recap", league: "RECAP", pick_text: `DAILY RECAP ${today}`, thread_format: "recap",
    hook_tweet_id: tweetId, cta_tweet_id: null, thread_url: `https://x.com/BetwithGary/status/${tweetId}`, post_text: text,
  });
  return { posted: true, text, thread_url: `https://x.com/BetwithGary/status/${tweetId}` };
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
  try {
    const url = new URL(req.url);
    const preview = url.searchParams.get("preview") === "1";
    const dryRun = url.searchParams.get("dry_run") === "1" || preview;
    const force = url.searchParams.get("force_mode") ?? (preview ? "pick" : null);
    const metricsOnly = url.searchParams.get("metrics_only") === "1";

    const { date: today, hour } = etParts();
    const nowMs = Date.now();

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
    if (metricsOnly) return Response.json({ metrics_only: true, metrics });

    if (!GEMINI_KEY) return Response.json({ error: "GEMINI_API_KEY secret not set — add it in Supabase dashboard → Project Settings → Edge Functions → Secrets", metrics }, { status: 500 });

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
      return Response.json({ mode: "verdict", metrics, verdict });
    }

    if (force === "arc") {
      const arc = await runArcUpdateMode(today, dryRun);
      console.log(JSON.stringify({ mode: "arc", arc }).slice(0, 500));
      return Response.json({ mode: "arc", metrics, arc });
    }

    if (force === "recap") {
      const recap = await runRecapMode(today, dryRun);
      console.log(JSON.stringify({ mode: "recap", recap }).slice(0, 500));
      return Response.json({ mode: "recap", metrics, recap });
    }

    if (force === "personality") {
      const personality = await runPersonalityMode(today, dryRun);
      console.log(JSON.stringify({ mode: "personality", personality }).slice(0, 500));
      return Response.json({ mode: "personality", metrics, personality });
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

    if (hour < POST_HOURS_START || hour > POST_HOURS_END) {
      return Response.json({ posted: false, reason: `ET hour ${hour} is outside the posting window`, metrics, verdict, recap, arc });
    }
    const result = await runPickMode(today, nowMs, dryRun, preview);
    console.log(JSON.stringify({ mode: "pick", verdict, recap, arc, ...result }).slice(0, 500));
    return Response.json({ mode: "pick", metrics, verdict, recap, arc, ...result });
  } catch (e) {
    console.error(String(e));
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
