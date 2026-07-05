// social-auto-post — server-side @BetwithGary auto-poster (picks drip + daily recap + metrics refresh)
// Cron: every hour at :45 UTC. Function decides by ET hour: 10 → recap, 11/14/17/20 → MLB pick slot.
// (The noon personality post is RETIRED as of Jun 29 2026 — runPersonalityMode early-returns; dry-run preview only.)
// World Cup is separate: EVERY hour also runs runWcCardMode, which tweets each WC game once in the window around its
// kickoff. The caption is a grounded stat hook (wcCaption) above the APP'S OWN SHARE CARD (/api/share-card, a
// verbatim HeadlineShareCardView rebuild — Jul 5: the tweet card IS the in-app share output); the full rationale
// threads as the REPLY, ending with a link-in-bio pointer. WC coverage is per-game, not per-slot.
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
// Query params: ?dry_run=1 (compose, don't post/log), ?force_mode=pick|recap|personality|wc|verdict|arc, ?preview=1 (dry-run: compose top pick ignoring timing), ?metrics_only=1
//   force_mode=wc → run ONLY the WC per-game card path (use with dry_run=1 to vet captions/cards without posting).
// LLM: Google Gemini (GEMINI_API_KEY secret; model override via GEMINI_MODEL, default gemini-3.5-flash)
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchVerdicts, avoidRepeat } from "./verdicts.ts";
import { computeStanding } from "./pl.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// Voice work gets its own model knob: SOCIAL_GEMINI_MODEL upgrades the WRITER (captions, verdicts, recap)
// without touching grade-results or anything else that shares the global GEMINI_MODEL secret.
const GEMINI_MODEL = Deno.env.get("SOCIAL_GEMINI_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
// Base origin for the Vercel OG image routes (results-card, pick-card). Override (e.g. localhost) for dry-run rendering.
const CARD_BASE = Deno.env.get("CARD_BASE_URL") ?? "https://www.betwithgary.ai";
const sb = createClient(SB_URL, SERVICE_KEY);

const SLOT_HOURS = [11, 14, 17, 20];
const RECAP_HOUR = 10;
const PERSONALITY_HOUR = 12;
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

// Is this pick a World Cup play? (league tag or sport key)
function isWc(p: any): boolean {
  const lg = String(p?.league ?? "").toUpperCase();
  const sp = String(p?.sport ?? "").toLowerCase();
  return lg === "WC" || sp.includes("world_cup") || sp.includes("soccer_world");
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
    await sb.from("social_post_log").update({
      impressions: sum("impressions"), likes: sum("likes"), replies: sum("replies"), retweets: sum("retweets"), metrics_updated_at: nowIso,
    }).eq("id", row.id);
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

async function runPickMode(today: string, nowMs: number, etHour: number, dryRun: boolean, preview = false) {
  const { data: dpRows, error: dpErr } = await sb.from("daily_picks").select("picks").eq("date", today);
  if (dpErr) throw dpErr;
  // WC is handled by runWcCardMode (every game tweeted, same-game picks grouped onto one card). Keep it out of the
  // single-pick-per-slot path so the two never double-post the same game.
  const picks: any[] = (dpRows?.[0]?.picks ?? []).filter((p) => !isWc(p));
  if (!picks.length) return { posted: false, reason: "no picks loaded yet" };

  const { data: logRows, error: logErr } = await sb.from("social_post_log").select("pick_text, thread_format").eq("post_date", today);
  if (logErr) throw logErr;
  // Whitelist the ACTUAL pick-thread formats: with verdict/arc/wc rows in the same log, a blacklist would let
  // them eat the 3/day cap (three verdicts would silently block the day's real picks) and suppress the handoff.
  const pickThreads = (logRows ?? []).filter((r) => ["standard", "top_pick"].includes(r.thread_format ?? ""));
  if (pickThreads.length >= 3 && !preview) return { posted: false, reason: "daily cap of 3 reached" };
  const postedSet = new Set(pickThreads.map((r) => r.pick_text));

  const MIN = 60_000;
  const nextSlot = SLOT_HOURS.find((h) => h > etHour);
  const unposted = picks.filter((p) => !postedSet.has(p.pick));
  const withTime = unposted.filter((p) => p.commence_time);
  const postable = withTime.filter((p) => new Date(p.commence_time).getTime() > nowMs - 20 * MIN);
  const eligible = postable.filter((p) => {
    const start = new Date(p.commence_time).getTime();
    const inWindow = start <= nowMs + 150 * MIN;
    let lastChance = false;
    if (nextSlot === undefined) lastChance = true;
    else {
      const nextRunMs = nowMs + (nextSlot - etHour) * 60 * MIN;
      lastChance = nextRunMs > start + 20 * MIN;
    }
    return inWindow || lastChance;
  });
  let chosen: any = null;
  if (eligible.length) {
    eligible.sort((a, b) => {
      const t = new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime();
      return t !== 0 ? t : (parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0));
    });
    chosen = eligible[0];
  } else {
    const anyFuture = withTime.some((p) => new Date(p.commence_time).getTime() > nowMs);
    if (!anyFuture) {
      const recent = unposted.filter((p) => p.commence_time && nowMs - new Date(p.commence_time).getTime() < 60 * MIN && nowMs - new Date(p.commence_time).getTime() > 0);
      recent.sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0));
      if (recent.length) chosen = { ...recent[0], _live: true };
    }
    // preview (dry-run only): ignore timing, just compose the highest-confidence unposted pick so we can vet formatting anytime.
    if (!chosen && preview && dryRun) {
      const sorted = [...unposted].sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0));
      if (sorted.length) chosen = sorted[0];
    }
    if (!chosen) return { posted: false, reason: "no postable game in range" };
  }

  const maxConf = Math.max(...picks.map((p) => parseFloat(p.confidence ?? 0)));
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
PICK: ${chosen.pick} | odds: ${chosen.odds ?? "see rationale"} | ${chosen.awayTeam} @ ${chosen.homeTeam} | league ${league} | starts ${chosen.time ?? chosen.commence_time} ET${chosen._live ? " (GAME JUST STARTED, frame the angle as live, just-underway energy)" : ""}
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
  const hook = `${angle}\n\n${pickLine}\n\n${edge}`;
  // Handoff reply on the DAY'S FIRST thread only (Jul 5 2026): a "link in bio" reply on every thread reads
  // generic-capper (the big personality accounts never do it) and /get clicks showed it converts ~0. One
  // deliberate handoff a day; the bio + pinned arc carry the install path the rest of the time.
  const wantHandoff = pickThreads.length === 0;
  const handoff = wantHandoff ? APP_HANDOFF[new Date().getDate() % APP_HANDOFF.length] : null;

  // TOP PICK = the day's ONE card tweet (Jul 5, founder): the highest-conviction play posts as the app's
  // actual share card (/api/share-card, full-bleed) with the hook as caption — visually unmistakable from
  // the standard text threads, and its verdict later quote-tweets the card itself. The caption drops the
  // pick shorthand line (the card carries the pick); the full hook is the text-only fallback.
  let cardUrl: string | null = null;
  if (isTopPick) {
    const nick = (s: string) => String(s ?? "").trim().split(/\s+/).pop() ?? "";
    const pl = String(chosen.pick).toLowerCase();
    const has = (team: string) => String(team ?? "").toLowerCase().split(/\s+/).some((w) => w.length > 2 && pl.includes(w));
    const opp = has(chosen.homeTeam) && !has(chosen.awayTeam) ? `vs ${nick(chosen.awayTeam)}`
      : has(chosen.awayTeam) && !has(chosen.homeTeam) ? `@ ${nick(chosen.homeTeam)}`
      : `${nick(chosen.awayTeam)} @ ${nick(chosen.homeTeam)}`;
    const timeLabel = chosen.commence_time ? new Date(chosen.commence_time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }) + " ET" : "";
    const od = fmtOdds(chosen.odds ?? String(chosen.pick).match(/([+-]\d{3,})\s*$/)?.[1] ?? "");
    const metaParts = [opp, timeLabel, od].filter(Boolean);
    cardUrl = `${CARD_BASE}/api/share-card?hero=${encodeURIComponent(shareHeroLines(String(chosen.pick)).join("|"))}&league=${encodeURIComponent(league)}&meta=${encodeURIComponent(metaParts.join(" · "))}`;
  }

  if (dryRun) return { posted: false, dry_run: true, chosen: chosen.pick, is_top_pick: isTopPick, hook, handoff, card_url: cardUrl };

  let hookId: string;
  if (cardUrl) {
    try {
      const ir = await fetch(cardUrl);
      if (!ir.ok) throw new Error(`card fetch ${ir.status}`);
      const b = new Uint8Array(await ir.arrayBuffer());
      let bin = ""; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
      const caption = `${angle}\n\n${edge}`;
      const r = await fetch(`${SB_URL}/functions/v1/post-tweet-media`, { method: "POST", headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: caption, images_base64: [btoa(bin)] }) });
      const j = await r.json();
      if (!j.success || !j.tweetId) throw new Error(`post-tweet-media failed: ${JSON.stringify(j).slice(0, 200)}`);
      hookId = j.tweetId;
    } catch (e) {
      console.error("top-pick card failed, posting text only: " + String(e));
      hookId = await postTweet(hook);
    }
  } else {
    hookId = await postTweet(hook);
  }
  const handoffId = handoff ? await postTweet(handoff, hookId) : null;
  const startEt = new Date(chosen.commence_time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" });
  const slot = parseInt(startEt) < 14 ? "morning" : parseInt(startEt) < 17 ? "afternoon" : parseInt(startEt) < 21 ? "evening" : "late";
  await sb.from("social_post_log").insert({
    post_date: today, slot, league, pick_text: chosen.pick, confidence: conf || null,
    commence_time: chosen.commence_time, thread_format: isTopPick ? "top_pick" : "standard",
    hook_tweet_id: hookId, reasoning_tweet_id: handoffId, cta_tweet_id: null,
    thread_url: `https://x.com/BetwithGary/status/${hookId}`, post_text: hook,
  });
  return { posted: true, pick: chosen.pick, thread_url: `https://x.com/BetwithGary/status/${hookId}`, count_today: pickThreads.length + 1 };
}

// VERDICT LOOP (Engine 0, Jul 2026): when a game Gary tweeted a pick for goes FINAL, quote-tweet HIS OWN
// pick tweet with a one-line verdict. Win = short swagger, loss = owned flat, push = shrug. The quote surfaces
// the original timestamped call (native receipts). Covers standard/top_pick threads from today AND yesterday
// (late finals grade after midnight ET); WC is excluded (runWcCardMode's finals recap owns it).
const VERDICT_CAP_PER_RUN = 4;

// Hand-written verdict banks. The model imitates examples far harder than it follows rules, so variety has
// to start HERE: each call samples a few lines at random instead of showing one fixed list (the fixed list
// made every verdict open with its first example). Registers mix sharp, dry, and callback; PLAIN IS A
// FEATURE — a flat factual line is a legitimate verdict, and half the bank is deliberately understated.
const VERDICT_BANK: Record<string, string[]> = {
  won: [
    "Never sweated it. Pirates by three.",
    "Cashed. That bullpen had no business holding a lead and it didn't.",
    "Quantrill went three innings, which is exactly why I was on Detroit. Tigers cash.",
    "Wire to wire. Never close.",
    "Paid like it should've. Dogs that keep games close cash tickets.",
    "7 to 1. Some nights the read writes itself.",
    "The runline was never in danger after the third.",
    "Final 6-2. On the tape.",
    "Held them to two hits. Good pitching beats a hot lineup, again.",
    "Cashed. Next.",
  ],
  lost: [
    "Scored twice all night. I'll wear that one.",
    "Had the right read and the wrong ninth inning. It stays on the tape.",
    "The bat I trusted went 0 for 5. That one's on me.",
    "Lost 4-3. Right side, wrong bounce. Same read, next game.",
    "No sugar on this one. They got outplayed start to finish.",
    "Didn't land. Final 2-1.",
    "I liked the pitching matchup and the pitching didn't show. On the tape.",
  ],
  push: [
    "Push. Money back, nothing learned.",
    "Landed exactly on the number. Push.",
    "Dead heat. We go again tomorrow.",
  ],
};
function sampleBank(result: string, n = 4): string[] {
  const pool = [...(VERDICT_BANK[result] ?? VERDICT_BANK.won)];
  const out: string[] = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function fallbackVerdict(result: string, finalScore: string): string {
  if (result === "won") return `Cashed.${finalScore ? ` Final ${finalScore}.` : ""}`;
  if (result === "push") return "Push. Money back.";
  return `Didn't land.${finalScore ? ` Final ${finalScore}.` : ""} On the tape like everything else.`;
}

async function verdictLine(c: { pickText: string; matchup: string; result: string; finalScore: string; league: string }, used: string[]): Promise<string> {
  try {
    const user = `Gary is quote-tweeting HIS OWN pick from earlier today, now that the game is final. Write the ONE short verdict line that goes above the quoted pick. Return ONLY JSON: {"verdict":"..."}.
PICK: ${c.pickText} | GAME: ${c.matchup} (${c.league}) | FINAL SCORE: ${c.finalScore || "n/a"} | RESULT: ${c.result.toUpperCase()}
${used.length ? `VERDICTS ALREADY POSTED TODAY (write something structurally DIFFERENT: a fresh opening, a different shape; never reuse their opening words or repeat a signature phrase from them):\n${used.slice(-6).map((u) => `- ${u}`).join("\n")}\n` : ""}Match this VOICE (different games, copy the register, NOT the openings; every verdict on the timeline must open differently):
${sampleBank(c.result).map((e) => `${c.result.toUpperCase()} example: "${e}"`).join("\n")}
Rules: under 180 characters. Past tense, first person. Reference the real final score or one real detail (calling back to the reason in the quoted pick is the best version). PLAIN IS FINE: a dry factual line is a valid verdict, do not force a quip. On a WIN no gloating cliches (banned: easy, free, told you, never a doubt). On a LOSS own it flat, no excuses, no apology tour. Never mention money or units wagered. Never invent a stat, streak, or detail not provided.`;
    const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
    const v = clean(out.verdict);
    return v || fallbackVerdict(c.result, c.finalScore);
  } catch (e) {
    console.error("verdictLine LLM failed, using fallback: " + String(e));
    return fallbackVerdict(c.result, c.finalScore);
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

  // Variety guard: recent verdict texts (from the log) + the ones composed in THIS run. Two verdicts stamped
  // with the same opener in one afternoon ("Never sweated it." twice, Jul 5) reads like a template bot.
  const used: string[] = (logRows ?? [])
    .filter((r: any) => r.thread_format === "verdict" && r.post_text)
    .map((r: any) => String(r.post_text));

  const verdicts: any[] = [];
  for (const c of cands) {
    const raw = await verdictLine(c, used);
    const fs = c.finalScore ? ` Final ${c.finalScore}.` : "";
    const fallbacks = c.result === "won"
      ? [`That one paid.${fs}`, `On the tape as a win.${fs}`, `Cashed.${fs}`]
      : c.result === "push"
        ? ["Push. Money back.", "Dead heat, money back.", "Push. Nothing learned."]
        : [`That one missed.${fs} I'll wear it.`, `Didn't land.${fs} On the tape like everything else.`, `Loss.${fs} It goes on the tape.`];
    const text = avoidRepeat(raw, used, fallbacks);
    used.push(text);
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

// WORLD CUP picks: tweet EVERY game. Gary's chosen play renders as the app's OWN pick card (CompactPickRow, rebuilt
// by the /api/pick-card-app OG route: gold GARY'S PICK eyebrow + bear, the pick as a big BarlowCondensed hero, teal
// league token + gold odds, GARY'S TAKE footer). ONE GAME pick per game posts as ONE card on ONE tweet — X crops
// multi-image tweets (a side+total game showed two half-cut cards), so we feature a single play; props get their own
// tweet later. The tight caption = the first sentence of Gary's REAL rationale; the REPLY threads the rest + link in bio.
// Runs every hour, posts each game once in the window around kickoff. Independent of the MLB slot path (sport isolation).
const WC_MAX_PER_RUN = 3;

// The APP SHARE CARD's stacked hero: the pick one word per line, trailing odds stripped, "ML" spelled out
// MONEYLINE — mirrors HeadlineShareCardView.heroLines exactly, so the tweeted card IS the in-app share output.
//  "Brazil ML -130" -> ["BRAZIL","MONEYLINE"]; "Under 2.5" -> ["UNDER","2.5"]; "South Korea ML" -> ["SOUTH","KOREA","MONEYLINE"]
function shareHeroLines(pickText: string): string[] {
  const words = String(pickText).replace(/\s*\(?[+-]\d{3,}\)?\s*$/, "").trim().split(/\s+/).filter(Boolean);
  return words.map((w) => (/^ml$/i.test(w) ? "MONEYLINE" : w.toUpperCase()));
}
// Meta-line opponent from the picked side ("@ Argentina" / "vs Austria"; totals show "Austria @ Argentina").
function wcOpp(p: any, away: string, home: string): string {
  const lower = String(p.pick).toLowerCase();
  if (lower.includes("over") || lower.includes("under") || (p.type ?? "").toLowerCase() === "total") return `${away} @ ${home}`;
  const first = (s: string) => (s ?? "").toLowerCase().split(/\s+/)[0] ?? "";
  if (home && first(home) && lower.includes(first(home))) return `vs ${away}`;
  if (away && first(away) && lower.includes(first(away))) return `@ ${home}`;
  return `${away} @ ${home}`;
}

// Split text into sentences (on a terminator followed by whitespace, so decimals like "1.63" never break).
function splitSentences(text: string): string[] {
  return String(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
// Split text into tweet-sized chunks (<= max chars), packing WHOLE SENTENCES so each tweet ends cleanly; hard
// word-splits any single sentence longer than max.
function splitTweets(text: string, max = 270): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => { if (cur) { out.push(cur); cur = ""; } };
  for (const s of splitSentences(text)) {
    if (s.length > max) {
      flush();
      let w = "";
      for (const word of s.split(/\s+/)) {
        if ((w ? w + " " + word : word).length <= max) w = w ? w + " " + word : word;
        else { if (w) out.push(w); w = word; }
      }
      cur = w; // remainder carries to pack with the next sentence
    } else if (!cur) cur = s;
    else if ((cur + " " + s).length <= max) cur += " " + s;
    else { flush(); cur = s; }
  }
  flush();
  return out;
}
// A GAME pick is a side/total (moneyline, total, spread, handicap) — NOT a player prop. Player props carry a player
// name or a prop-style type; everything else is a game-level bet. Props are excluded from the per-game card tweet.
function isGamePick(p: any): boolean {
  if (p?.player || p?.playerName || p?.prop_type) return false;
  const t = String(p?.type ?? "").toLowerCase();
  const propish = ["prop", "anytime", "goalscorer", "scorer", "shots", "shot", "passes", "saves", "assist", "tackle", "card", "player"];
  return !propish.some((x) => t.includes(x));
}
// Pick ONE play to feature for a game's single card. ALWAYS prefer a SIDE (moneyline / goal line / handicap / spread)
// over the TOTAL (over/under) — the total is tweeted ONLY when the game has no side pick at all. Confidence decides
// within the chosen tier (so among two sides, the more confident one wins; a high-confidence total never jumps a side).
function chooseGamePick(gPicks: any[]): any | null {
  const games = gPicks.filter(isGamePick);
  if (!games.length) return null;
  // A TOTAL = over/under total goals/points (same detection as wcHeroLines/wcOpp). Everything else game-level is a SIDE.
  const isTotal = (p: any) => {
    const txt = String(p?.pick ?? "").toLowerCase();
    return String(p?.type ?? "").toLowerCase() === "total" || txt.includes("over") || txt.includes("under");
  };
  const byConf = (a: any, b: any) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0);
  const sides = games.filter((p) => !isTotal(p));
  return [...(sides.length ? sides : games)].sort(byConf)[0];
}

// American-odds formatting: "200" -> "+200"; "-130" stays; "" -> "".
function fmtOdds(o: any): string {
  const s = String(o ?? "").trim();
  if (!s) return "";
  if (s.startsWith("+") || s.startsWith("-")) return s;
  const n = parseInt(s, 10);
  return isNaN(n) ? s : (n > 0 ? "+" : "") + n;
}
// Split a matchup string into its two team names (handles "A vs B", "A @ B", "A v B").
function twoTeams(s: string): string[] {
  return String(s ?? "").split(/\s+(?:@|vs\.?|v)\s+/i).map((t) => t.trim().toLowerCase()).filter(Boolean);
}
// Do two matchup strings refer to the same game? (cross-table key matching: daily_picks uses "A vs B", results/props use "A @ B")
function sameGame(a: string, b: string): boolean {
  const ta = twoTeams(a), tb = twoTeams(b);
  if (ta.length < 2 || tb.length < 2) return false;
  return ta.every((t) => tb.some((u) => u.includes(t) || t.includes(u)));
}
// Readable line for a WC PROP PICK (prop_picks JSON): "Florian Wirtz anytime goal +200", "Ayase Ueda over 1.5 shots".
function wcPropPickLine(p: any): string {
  const player = String(p.player ?? p.playerName ?? "").trim();
  const raw = String(p.prop ?? p.prop_type ?? "").trim();               // "anytime_goal 1" | "shots 1.5"
  const base = raw.replace(/\s*[\d.]+\s*$/, "").replace(/_/g, " ").trim(); // "anytime goal" | "shots"
  const lineNum = raw.match(/([\d.]+)\s*$/)?.[1] ?? String(p.line ?? "").trim();
  const bet = String(p.bet ?? "").toLowerCase().trim();
  const odds = fmtOdds(p.odds);
  const isAnytime = base.includes("anytime") || (base.includes("goal") && !lineNum);
  const label = isAnytime ? `${player} ${base}` : `${player} ${bet || "over"} ${lineNum} ${base}`;
  return `${label.replace(/\s+/g, " ").trim()}${odds ? " " + odds : ""}`;
}
// Readable line for a graded WC PROP RESULT (prop_results): "Ayase Ueda over 1.5 shots".
function wcPropResultLine(r: any): string {
  const base = String(r.prop_type ?? "").replace(/\s*[\d.]+\s*$/, "").replace(/_/g, " ").trim();
  const lineNum = String(r.prop_type ?? "").match(/([\d.]+)\s*$/)?.[1] ?? String(r.line_value ?? "").trim();
  const bet = String(r.bet ?? "over").toLowerCase().trim();
  const isAnytime = base.includes("anytime") || (base.includes("goal") && !lineNum);
  const label = isAnytime ? `${r.player_name} ${base}` : `${r.player_name} ${bet} ${lineNum} ${base}`;
  return label.replace(/\s+/g, " ").trim();
}

// WC card caption: the 1-2 sentence grounded hook that goes ABOVE the pick card — the single strongest REAL
// stat/fact from Gary's vetted rationale, then his casual lean on the play. The card already shows the pick,
// matchup, and odds. Falls back to the rationale's first sentence if the model fails, so the card always has a caption.
async function wcCaption(chosen: any, away: string, home: string): Promise<string> {
  const rationale = String(chosen?.rationale ?? "").replace(/^\s*gary'?s take\s*:?\s*/i, "").trim();
  const firstSentence = () => { const s = splitSentences(clean(rationale)); return s.length ? (s[0].length <= 280 ? s[0] : (splitTweets(s[0], 270)[0] ?? "")) : ""; };
  if (!rationale) return firstSentence();
  try {
    const user = `Write the ONE-OR-TWO sentence X caption that goes ABOVE Gary's pick CARD for a World Cup bet. The card already shows the pick, matchup, and odds, so DO NOT restate the odds or write a "teams . odds" line.
Return ONLY JSON: {"caption":"..."}.
PICK: ${chosen.pick} | ${away} at ${home} | World Cup
One or two sentences. Lead with the single strongest checkable stat or fact from the rationale below (a real number, an injury, or a recent result about THIS game), then a short casual stance that ends on the play, the way a sharp bettor texts a friend.
Match this VOICE (a DIFFERENT game, copy the style not the facts): "Morocco has conceded first in four straight, so I'm backing Croatia and the goal and a half."
ABSOLUTELY NO scene-setting about the stadium, city, skyline, "sets the stage", "showdown", "clash", or "chess match". Under 240 characters. Use only REAL facts from the rationale, never invent a number.
RATIONALE (ground truth, pull the real facts from here):
${rationale.slice(0, 4000)}`;
    const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
    const caption = clean(out.caption);
    return caption || firstSentence();
  } catch (e) {
    console.error("wcCaption LLM failed, using first sentence: " + String(e));
    return firstSentence();
  }
}

// FINALS-DRIVEN WC posting (Jun 29 2026). Runs hourly. Two kinds of tweet, both idempotent via social_post_log:
//   - wc_recap  : when a game goes FINAL, a text recap of that game's picks (game + props) with green-check / red-X.
//   - wc_picks  : the NEXT game's picks (game + props list) + the pick card. Fires for the day's first game near its
//                 kickoff, or for any later game once the PREVIOUS game is final. So games chain: each final tees up the next.
// dryRun returns the queued actions (with text) without posting. `all` is unused now (kept for the param signature).
async function runWcCardMode(today: string, nowMs: number, _etHour: number, dryRun: boolean, push = false) {
  const MIN = 60_000;
  const { data: dpRows, error: dpErr } = await sb.from("daily_picks").select("picks").eq("date", today);
  if (dpErr) throw dpErr;
  const wcGamePicks: any[] = (dpRows?.[0]?.picks ?? []).filter(isWc);
  if (!wcGamePicks.length) return { posted: false, reason: "no WC picks today" };

  const { data: ppRows } = await sb.from("prop_picks").select("picks").eq("date", today);
  const wcPropPicks: any[] = (ppRows?.[0]?.picks ?? []).filter((p: any) => {
    const sp = String(p?.sport ?? p?.league ?? "").toLowerCase();
    return sp === "wc" || sp.includes("world");
  });

  const { data: gradedGames } = await sb.from("game_results").select("matchup, pick_text, result").eq("league", "WC").eq("game_date", today);
  const { data: gradedProps } = await sb.from("prop_results").select("matchup, player_name, prop_type, line_value, bet, result").eq("game_date", today);

  const { data: logRows } = await sb.from("social_post_log").select("pick_text, thread_format, hook_tweet_id").eq("post_date", today).eq("league", "WC");
  const log = logRows ?? [];
  const recapLogged = (key: string) => log.some((r) => r.thread_format === "wc_recap" && sameGame(String(r.pick_text), key));
  const picksLogged = (key: string) => log.some((r) => r.thread_format === "wc_picks" && sameGame(String(r.pick_text), key));

  // Build the ordered game list (by kickoff).
  const gameKey = (p: any) => `${p.awayTeam ?? p.away ?? "?"} vs ${p.homeTeam ?? p.home ?? "?"}`;
  const gmap = new Map<string, any[]>();
  for (const p of wcGamePicks) { const k = gameKey(p); (gmap.get(k) ?? gmap.set(k, []).get(k)!).push(p); }
  type G = { key: string; away: string; home: string; start: number; gPicks: any[]; props: any[]; final: boolean };
  const list: G[] = [];
  for (const [key, gPicks] of gmap) {
    const ct = gPicks.find((p) => p.commence_time)?.commence_time;
    const start = ct ? new Date(ct).getTime() : 0;
    const [away, home] = key.split(" vs ");
    const props = wcPropPicks.filter((p) => sameGame(String(p.matchup ?? `${p.awayTeam ?? ""} @ ${p.homeTeam ?? ""}`), key));
    const final = (gradedGames ?? []).some((r) => sameGame(String(r.matchup), key));
    list.push({ key, away, home, start, gPicks, props, final });
  }
  list.sort((a, b) => a.start - b.start);

  const actions: any[] = [];

  // 1) RECAPS — any final game whose recap hasn't posted yet.
  for (const g of list) {
    if (!g.final || recapLogged(g.key)) continue;
    const gameLines = (gradedGames ?? []).filter((r) => sameGame(String(r.matchup), g.key))
      .map((r) => `${r.pick_text} ${r.result === "won" ? "✓" : "✗"}`);
    const propLines = (gradedProps ?? []).filter((r) => sameGame(String(r.matchup), g.key))
      .map((r) => `${wcPropResultLine(r)} ${r.result === "won" ? "✓" : "✗"}`);
    const lines = [...gameLines, ...propLines];
    if (!lines.length) continue; // graded row exists but nothing readable yet
    const allWon = !lines.some((l) => l.endsWith("✗"));
    const header = allWon ? "We just cashed the following:" : "Final results:";
    // Quote the game's own wc_picks tweet when it exists — the recap then carries the original timestamped call (receipts).
    const picksRow = log.find((r) => r.thread_format === "wc_picks" && sameGame(String(r.pick_text), g.key));
    actions.push({ type: "recap", game: g.key, quoteId: picksRow?.hook_tweet_id ?? null, text: `WC Picks all day long.\n\n${header}\n\n${lines.join("\n")}` });
  }

  // 2) NEXT PICKS — first game near kickoff, or any game once the previous one is final.
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (picksLogged(g.key) || g.final) continue;           // never tee up a game that's already over
    if (!push && g.start <= nowMs - 10 * MIN) continue;    // already underway — too late to tee up (push=1 overrides for manual catch-up)
    const firstReady = i === 0 && g.start <= nowMs + 150 * MIN;
    const prevFinal = i > 0 && list[i - 1].final;
    if (!firstReady && !prevFinal) continue;

    const chosen = chooseGamePick(g.gPicks);
    const timeLabel = new Date(g.start).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }) + " ET";
    const gameLines = g.gPicks.map((p) => {
      const od = (p.odds && !String(p.pick).includes(String(p.odds))) ? ` ${fmtOdds(p.odds)}` : "";
      return `${p.pick}${od}`.trim();
    });
    // TWO tweets per game: (1) the card + a 1-2 sentence grounded rationale hook; (2) a text-only reply with the full picks list.
    const caption = chosen ? await wcCaption(chosen, g.away, g.home) : "";
    const listText = `Up next, ${g.away} vs ${g.home}, ${timeLabel}:\n\n${[...gameLines, ...g.props.map(wcPropPickLine)].join("\n")}`;
    let cardUrl: string | null = null;
    if (chosen) {
      // The tweet card = the app's ACTUAL share card (founder Jul 5: "literally tweeting the pick card from
      // the app, not a picture of it") — /api/share-card is a verbatim HeadlineShareCardView(square) rebuild.
      const opp = wcOpp(chosen, g.away, g.home);
      const metaParts = [opp, timeLabel];
      // Odds ALWAYS ride the meta line on the card: shareHeroLines strips them from the hero, so the old
      // "skip if the pick text already has them" guard left them appearing nowhere (England@Mexico, Jul 5).
      const od = fmtOdds(chosen.odds ?? String(chosen.pick).match(/([+-]\d{3,})\s*$/)?.[1] ?? "");
      if (od) metaParts.push(od);
      cardUrl = `${CARD_BASE}/api/share-card?hero=${encodeURIComponent(shareHeroLines(String(chosen.pick)).join("|"))}&league=${encodeURIComponent("WORLD CUP")}&meta=${encodeURIComponent(metaParts.join(" · "))}`;
    }
    actions.push({ type: "picks", game: g.key, caption, listText, cardUrl, start: g.start });
  }

  if (dryRun) return { posted: false, dry_run: true, actions };
  if (!actions.length) return { posted: false, reason: "nothing due (no final-game recaps or next-game picks)" };

  const done: any[] = [];
  for (const a of actions.slice(0, WC_MAX_PER_RUN)) {
    try {
      let tweetId: string;
      let usedCard = false;
      if (a.type === "picks") {
        // Tweet 1 = the card + the 1-2 sentence rationale hook (caption). If the card or caption is missing, fall back to the list.
        const mainText = a.caption || a.listText;
        if (a.cardUrl) {
          try {
            const ir = await fetch(a.cardUrl);
            if (!ir.ok) throw new Error(`card fetch ${ir.status}`);
            const b = new Uint8Array(await ir.arrayBuffer());
            let bin = ""; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
            const img = btoa(bin);
            const r = await fetch(`${SB_URL}/functions/v1/post-tweet-media`, { method: "POST", headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: mainText, images_base64: [img] }) });
            const j = await r.json();
            if (!j.success || !j.tweetId) throw new Error(`post-tweet-media failed: ${JSON.stringify(j).slice(0, 200)}`);
            tweetId = j.tweetId; usedCard = true;
          } catch (e) {
            console.error("WC next-picks card failed, posting text only: " + String(e));
            tweetId = await postTweet(mainText);
          }
        } else {
          tweetId = await postTweet(mainText);
        }
        // Tweet 2 = text-only picks list, chained as a reply under the card (only when the card already carried the caption).
        if (a.caption && a.listText) {
          try { await postTweet(a.listText, tweetId); }
          catch (e) { console.error("WC picks-list reply failed: " + String(e)); }
        }
      } else {
        if (a.quoteId) {
          try { tweetId = await postQuote(a.text, a.quoteId); }
          catch (e) { console.error("wc recap quote failed, posting plain: " + String(e)); tweetId = await postTweet(a.text); }
        } else {
          tweetId = await postTweet(a.text);
        }
      }
      const startEt = a.start ? parseInt(new Date(a.start).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" })) : 12;
      const slot = startEt < 14 ? "morning" : startEt < 17 ? "afternoon" : startEt < 21 ? "evening" : "late";
      await sb.from("social_post_log").insert({
        post_date: today, slot, league: "WC",
        pick_text: `${a.game}${a.type === "recap" ? " [recap]" : ""}`,
        thread_format: a.type === "recap" ? "wc_recap" : "wc_picks",
        commence_time: a.start ? new Date(a.start).toISOString() : null,
        hook_tweet_id: tweetId, thread_url: `https://x.com/BetwithGary/status/${tweetId}`,
      });
      done.push({ type: a.type, game: a.game, card: usedCard, thread_url: `https://x.com/BetwithGary/status/${tweetId}` });
    } catch (e) {
      console.error(`WC ${a.type} post failed for ${a.game}: ` + String(e));
      done.push({ type: a.type, game: a.game, error: String(e) });
    }
  }
  return { posted: done.some((d) => d.thread_url), actions: done };
}

// Morning-tape voice samples, rotated by day-of-month so consecutive mornings never share a skeleton.
const RECAP_EXAMPLES = [
  `"Went 9 and 4 yesterday. The White Sox at plus 124 paid like it should've, and the one Cup match I trusted went sideways in stoppage. Back on the card this afternoon."`,
  `"An 11 and 3 day. Best of it was Cleveland at plus 132. Worst was watching the Reds give it away in the eighth. Today's card is up this morning."`,
  `"Went 5 and 9. No way around it, the bullpens I trusted didn't hold. The tape keeps every one of them. Back at it today."`,
];

async function runRecapMode(today: string, dryRun: boolean) {
  // MORNING TAPE (reworked Jul 5 2026): the 10am recap is now ONE Gary-voiced post (record in prose + one
  // real result detail), absorbing the retired personality post's mood ladder. The old dry per-sport
  // scoreboard ("MLB 8-7") averaged 27 impressions with zero engagement across 11 posts; per-pick receipts
  // drama now lives in the verdict loop and the weekly ledger in the arc pin, so this slot's job is the
  // CHARACTER take on yesterday. game_results is games-only (props live in prop_results). Falls back to the
  // plain per-sport lines if the LLM fails, so the receipts promise never silently skips a day.
  const { data: existing } = await sb.from("social_post_log").select("id").eq("post_date", today).eq("thread_format", "recap").limit(1);
  if (existing?.length && !dryRun) return { posted: false, reason: "recap already posted today" };
  const y = yesterdayOf(today);
  const { data: results, error } = await sb.from("game_results").select("league, result, pick_text, final_score").eq("game_date", y);
  if (error) throw error;
  const graded = (results ?? []).filter((r) => r.result === "won" || r.result === "lost");
  if (!graded.length) return { posted: false, reason: "no graded game results for yesterday yet" };
  const wins = graded.filter((r) => r.result === "won").length;
  const losses = graded.filter((r) => r.result === "lost").length;

  const byLeague = new Map<string, { w: number; l: number }>();
  for (const r of graded) {
    const rec = byLeague.get(r.league) ?? { w: 0, l: 0 };
    if (r.result === "won") rec.w++; else rec.l++;
    byLeague.set(r.league, rec);
  }
  const leagueLines = [...byLeague.entries()]
    .sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l) || a[0].localeCompare(b[0]))
    .map(([lg, rec]) => `${lg} ${rec.w}-${rec.l}`);
  const fallback = `Results from ${ordinalDate(y)}\n\n${leagueLines.join("\n")}`;

  const mood = moodFor(wins, losses);
  const dogWins = graded.filter((r) => r.result === "won" && /\+\d{3,}\)?\s*$/.test(String(r.pick_text))).slice(0, 3);
  const lossRows = graded.filter((r) => r.result === "lost").slice(0, 3);
  const fact = (r: any) => `${r.pick_text} (${r.result}${r.final_score ? `, final ${r.final_score}` : ""})`;

  let post = "";
  try {
    const user = `Write Gary's ONE morning post about yesterday's card. Return ONLY JSON: {"post":"..."}.
YESTERDAY (ground truth, use ONLY these facts and copy the numbers exactly):
Overall record: ${wins} and ${losses}. By league: ${leagueLines.join(", ")}.
${dogWins.length ? `Plus-money wins: ${dogWins.map(fact).join("; ")}.` : ""}
${lossRows.length ? `Losses include: ${lossRows.map(fact).join("; ")}.` : ""}
Gary's register this morning (from the record): ${MOODS[mood]}.
Shape: 2 to 4 short sentences, under 260 characters total. State the real record in prose (say "went 8 and 7", never "an 8-7 record"). Reference ONE concrete result from the facts above (a specific pick that cashed or died, with its real detail). Own losses flat, no spin; on good days stay dry, never gloat. It can end with a plain pointer like "Full card's graded in the app." on some days, or just end on the take. No link, no hashtag.
Match this VOICE (a DIFFERENT day, copy the register not the facts): ${RECAP_EXAMPLES[new Date().getDate() % RECAP_EXAMPLES.length]}`;
    const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
    post = clean(out.post);
  } catch (e) {
    console.error("recap LLM failed, using plain per-sport lines: " + String(e));
  }
  const text = post || fallback;

  if (dryRun) return { posted: false, dry_run: true, mood, record: `${wins}-${losses}`, text };

  const tweetId = await postTweet(text);
  await sb.from("social_post_log").insert({
    post_date: today, slot: "recap", league: "RECAP", pick_text: `DAILY RECAP ${today}`, thread_format: "recap",
    hook_tweet_id: tweetId, cta_tweet_id: null, thread_url: `https://x.com/BetwithGary/status/${tweetId}`, post_text: text,
  });
  return { posted: true, mood, record: `${wins}-${losses}`, text, thread_url: `https://x.com/BetwithGary/status/${tweetId}` };
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
    const push = url.searchParams.get("push") === "1"; // manual catch-up: post a WC game's next-picks even if it just kicked off (overrides the underway guard)
    const metricsOnly = url.searchParams.get("metrics_only") === "1";

    // Always refresh KPI metrics first (cheap; keeps impressions/likes live 24/7). Never let it block posting.
    let metrics: any = { updated: 0, checked: 0 };
    if (!dryRun) { try { metrics = await refreshMetrics(); } catch (e) { console.error("metrics refresh failed: " + String(e)); metrics = { error: String(e) }; } }
    if (metricsOnly) return Response.json({ metrics_only: true, metrics });

    if (!GEMINI_KEY) return Response.json({ error: "GEMINI_API_KEY secret not set — add it in Supabase dashboard → Project Settings → Edge Functions → Secrets", metrics }, { status: 500 });
    const { date: today, hour } = etParts();
    const nowMs = Date.now();
    const mode = force ?? (hour === RECAP_HOUR ? "recap" : hour === PERSONALITY_HOUR ? "personality" : SLOT_HOURS.includes(hour) ? "pick" : "none");

    // WC plays tweet per-game with a card EVERY hour (grouped by game), independent of the MLB single-pick slot cadence.
    // A normal (unforced) run does WC alongside the hour's mode; force_mode=wc runs only WC (dry-run vetting);
    // force_mode=pick|recap|personality leaves WC out so the existing single-mode paths/tests are unchanged.
    let wc: any = undefined;
    if (!force || force === "wc") {
      try { wc = await runWcCardMode(today, nowMs, hour, dryRun, push); }
      catch (e) { console.error("wc card mode failed: " + String(e)); wc = { error: String(e) }; }
    }
    if (force === "wc") { console.log(JSON.stringify({ mode: "wc", wc }).slice(0, 500)); return Response.json({ mode: "wc", metrics, wc }); }

    // Verdict loop rides every unforced hourly run (like WC): finals detected within ~1hr, quote-tweeted.
    let verdict: any = undefined;
    if (!force) {
      try { verdict = await runVerdictMode(today, dryRun); }
      catch (e) { console.error("verdict mode failed: " + String(e)); verdict = { error: String(e) }; }
    }
    // Season-arc standing posts under the pin every Monday at ET noon (the retired personality slot).
    let arc: any = undefined;
    if (!force && hour === 12 && new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }) === "Mon") {
      try { arc = await runArcUpdateMode(today, dryRun); }
      catch (e) { console.error("arc mode failed: " + String(e)); arc = { error: String(e) }; }
    }

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

    if (mode === "none") return Response.json({ posted: false, reason: `ET hour ${hour} is not a posting slot`, metrics, wc, verdict, arc });
    const result = mode === "recap" ? await runRecapMode(today, dryRun) : mode === "personality" ? await runPersonalityMode(today, dryRun) : await runPickMode(today, nowMs, hour, dryRun, preview);
    console.log(JSON.stringify({ mode, wc, verdict, arc, ...result }).slice(0, 500));
    return Response.json({ mode, metrics, wc, verdict, arc, ...result });
  } catch (e) {
    console.error(String(e));
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
