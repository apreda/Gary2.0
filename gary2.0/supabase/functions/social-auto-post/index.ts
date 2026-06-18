// social-auto-post — server-side @BetwithGary auto-poster (picks drip + daily recap + daily personality + metrics refresh)
// Cron: every hour at :45 UTC. Function decides by ET hour: 10 → recap, 12 → personality, 11/14/17/20 → pick slot, else exit.
// Metrics: every run also refreshes impressions/likes/replies/retweets for posts from the last 6 days (KPI stays live 24/7).
//          Each row's numbers = SUM across all tweets in the thread = total thread reach.
//
// CONVERSION-FIRST REDESIGN (v11, Jun 16 2026) — see Desktop/Gary2.0/X_CONVERSION_STRATEGY.md:
//   - North Star is APP DOWNLOADS + retained users, NOT impressions/followers.
//   - ZERO emojis anywhere (removed the sport-emoji map and the TOP PICK badge).
//   - "Give the pick, hold the depth" withhold policy: the pick hook shows the pick + odds + ONE strongest falsifiable
//     factor; the full breakdown and the rest of the day's slate stay in the app (that is the reason to download).
//   - No hashtags. No "Full breakdown" promise. No in-thread App Store link (the buried link converted ~0; the bio +
//     pinned post carry the install path, and the profile out-converts an in-thread link). Pick thread = hook + handoff.
//   - Recaps show wins AND losses openly (honest receipts build the trust that drives installs) + week-to-date record.
//
// Query params: ?dry_run=1 (compose, don't post/log), ?force_mode=pick|recap|personality, ?preview=1 (dry-run: compose top pick ignoring timing), ?metrics_only=1
// LLM: Google Gemini (GEMINI_API_KEY secret; model override via GEMINI_MODEL, default gemini-3.5-flash)
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
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

async function callLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8000, responseMimeType: "application/json" },
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

const VOICE_RULES = `You write posts for @BetwithGary as "Gary", an AI that models, calls, and sweats sports bets. Voice: the sharpest friend in the group chat. Sharp, honest, in it with you. ABSOLUTE RULE: the provided rationale/stats are GROUND TRUTH (it is 2026, past your training data). Never correct player-team assignments or import outside facts. Only ensure internal consistency (right stat to the right player to the right team).
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
(10) Gary is openly an AI. He can show conviction and own losses, but he must NEVER claim a personal cash wager ("I put three units on this", "I bet my own money") or a lived human experience he did not have ("I watched every minute"). Those are deceptive and not allowed.
(11) Every sentence must carry a concrete fact: a number, a player or team name, a result, or a genuine thought. If a sentence is empty glue or hype, delete it. Dry and specific beats smooth and padded.
STYLE: specific player names and real numbers. Lead with the single strongest, most concrete, checkable stat, never a vague claim. Use contractions (it's, that's, couldn't, had 'em). Sentence fragments are good. Do NOT write complete, balanced, essay-style sentences. Vary sentence length. Do not open consecutive sentences the same way. Sound like a text to a friend, not an article or a brand account. Always return ONLY valid JSON as instructed.`;

async function runPickMode(today: string, nowMs: number, etHour: number, dryRun: boolean, preview = false) {
  const { data: dpRows, error: dpErr } = await sb.from("daily_picks").select("picks").eq("date", today);
  if (dpErr) throw dpErr;
  const picks: any[] = dpRows?.[0]?.picks ?? [];
  if (!picks.length) return { posted: false, reason: "no picks loaded yet" };

  const { data: logRows, error: logErr } = await sb.from("social_post_log").select("pick_text, thread_format").eq("post_date", today);
  if (logErr) throw logErr;
  const pickThreads = (logRows ?? []).filter((r) => !["recap", "personality"].includes(r.thread_format ?? ""));
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
  const handoff = APP_HANDOFF[pickThreads.length % APP_HANDOFF.length];

  if (dryRun) return { posted: false, dry_run: true, chosen: chosen.pick, is_top_pick: isTopPick, hook, handoff };

  const hookId = await postTweet(hook);
  const handoffId = await postTweet(handoff, hookId);
  const startEt = new Date(chosen.commence_time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" });
  const slot = parseInt(startEt) < 14 ? "morning" : parseInt(startEt) < 17 ? "afternoon" : parseInt(startEt) < 21 ? "evening" : "late";
  await sb.from("social_post_log").insert({
    post_date: today, slot, league, pick_text: chosen.pick, confidence: conf || null,
    commence_time: chosen.commence_time, thread_format: isTopPick ? "top_pick" : "standard",
    hook_tweet_id: hookId, reasoning_tweet_id: handoffId, cta_tweet_id: null,
    thread_url: `https://x.com/BetwithGary/status/${hookId}`,
  });
  return { posted: true, pick: chosen.pick, thread_url: `https://x.com/BetwithGary/status/${hookId}`, count_today: pickThreads.length + 1 };
}

async function runRecapMode(today: string, dryRun: boolean) {
  const { data: existing } = await sb.from("social_post_log").select("id").eq("post_date", today).eq("thread_format", "recap").limit(1);
  if (existing?.length && !dryRun) return { posted: false, reason: "recap already posted today" };
  const y = yesterdayOf(today);
  const { data: results, error } = await sb.from("game_results").select("league, result, pick_text, matchup, final_score").eq("game_date", y);
  if (error) throw error;
  const wins = (results ?? []).filter((r) => r.result === "won");
  const losses = (results ?? []).filter((r) => r.result === "lost");
  if (!wins.length && !losses.length) return { posted: false, reason: "no graded results for yesterday yet" };

  // Running record: aggregate the last 7 days (through yesterday) for the "that puts the week at X-Y" line.
  const weekAgo = new Date(new Date(today + "T12:00:00Z").getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data: weekRows } = await sb.from("game_results").select("result").gte("game_date", weekAgo).lte("game_date", y);
  const weekWins = (weekRows ?? []).filter((r) => r.result === "won").length;
  const weekLosses = (weekRows ?? []).filter((r) => r.result === "lost").length;

  // OPEN RECEIPTS: name wins AND losses honestly. Transparency is the trust mechanism that converts skeptics into installers.
  // Hiding losing days is the single biggest distrust signal on betting X, so this never spins or omits a loss.
  const user = `Write ONE recap post as Gary, first person, like a real bettor texting the group chat the morning after. NOT a brand, NOT an article. Return ONLY JSON: {"recap": "..."}.

Match this VOICE exactly (this is a DIFFERENT day, copy the style and rhythm, not the facts):
"4-3 last night. Knicks moneyline was the easy one, never trailed. Caught the Rangers in regulation too. The one that stung was Lakers -4, up six late and gave it right back, lost by two. 31-24 on the month. Whole card's in the app if you want it."
Notice: short, fragments, contractions, owns the loss with a little feeling, names only the highlights not every pick, zero hype, zero marketing.

Now write today's, using these facts:
- I went ${wins.length}-${losses.length} yesterday. Week to date ${weekWins}-${weekLosses}.
- Open with the record (hyphen form, like "${wins.length}-${losses.length}").
- Mention only 1 or 2 standout WINS by pick with the odds or final score. Do NOT list every win, even on a big day. Brevity matters.
- Own the LOSSES by pick, like a person, with what went wrong if the data shows it. Never skip or spin a loss.
- Drop the week record in once, plainly.
- You may end with one short, plain line that the full card is in the app. No URL.
Hard: no emojis, no dashes, no hashtags, no links, no bullets, no motivational or marketing words, no "transparently". Contractions and fragments. Every sentence carries a real fact.

WINS:
${JSON.stringify(wins).slice(0, 3000)}

LOSSES:
${JSON.stringify(losses).slice(0, 3000)}`;
  const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
  const recapText = clean(out.recap);
  if (dryRun) return { posted: false, dry_run: true, record: `${wins.length}-${losses.length}`, week: `${weekWins}-${weekLosses}`, recap: recapText };
  const recapId = await postTweet(recapText);
  await sb.from("social_post_log").insert({
    post_date: today, slot: "recap", league: "RECAP", pick_text: `DAILY RECAP ${today}`, thread_format: "recap",
    hook_tweet_id: recapId, cta_tweet_id: null, thread_url: `https://x.com/BetwithGary/status/${recapId}`,
  });
  return { posted: true, recap: `${wins.length}-${losses.length}`, week: `${weekWins}-${weekLosses}`, thread_url: `https://x.com/BetwithGary/status/${recapId}` };
}

// Daily standalone CHARACTER post (Option A). Grounded in yesterday's mood + today's slate so it's earned, not random. No link, no hashtag.
async function runPersonalityMode(today: string, dryRun: boolean) {
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

  const user = `Write ONE standalone tweet as Gary (the AI that models, calls, and sweats every game, the sharpest friend in the group chat). This is a CHARACTER post, NOT a pick. No bet breakdown, no odds, no app link, no hashtag.
Gary's mood today: ${mood}. Yesterday's record was ${wins} and ${losses}. The register for this mood: ${MOODS[mood]}.
Today there ${picks.length === 1 ? "is" : "are"} ${picks.length} game${picks.length === 1 ? "" : "s"} on Gary's card${top ? `, and the one he keeps circling back to is ${top.pick}` : ""}.
Match this VOICE (a DIFFERENT day, copy the style not the facts): "Brutal beat last night. Had the Heat at 0.81 and they bricked a wide open three at the buzzer to flip it to a loss. I can model a lot of things. Can't model a guy forgetting how to shoot. Five on the card today."
Write something real and human: a confession, a reflection, a sharp aside about being an AI who still sweats games, or honest ownership if yesterday went badly. It can occasionally be a genuine question to other bettors, but not usually. Sound like a person texting, contractions and fragments, not a brand. Under 240 characters. Return ONLY JSON: {"post": "..."}.`;
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

    // Always refresh KPI metrics first (cheap; keeps impressions/likes live 24/7). Never let it block posting.
    let metrics: any = { updated: 0, checked: 0 };
    if (!dryRun) { try { metrics = await refreshMetrics(); } catch (e) { console.error("metrics refresh failed: " + String(e)); metrics = { error: String(e) }; } }
    if (metricsOnly) return Response.json({ metrics_only: true, metrics });

    if (!GEMINI_KEY) return Response.json({ error: "GEMINI_API_KEY secret not set — add it in Supabase dashboard → Project Settings → Edge Functions → Secrets", metrics }, { status: 500 });
    const { date: today, hour } = etParts();
    const nowMs = Date.now();
    const mode = force ?? (hour === RECAP_HOUR ? "recap" : hour === PERSONALITY_HOUR ? "personality" : SLOT_HOURS.includes(hour) ? "pick" : "none");
    if (mode === "none") return Response.json({ posted: false, reason: `ET hour ${hour} is not a posting slot`, metrics });
    const result = mode === "recap" ? await runRecapMode(today, dryRun) : mode === "personality" ? await runPersonalityMode(today, dryRun) : await runPickMode(today, nowMs, hour, dryRun, preview);
    console.log(JSON.stringify({ mode, ...result }).slice(0, 500));
    return Response.json({ mode, metrics, ...result });
  } catch (e) {
    console.error(String(e));
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
