import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// gary-mention-reply — "Grok for Gary". Reactive @-mention reply bot for @BetwithGary.
// Polls new @mentions, composes a reply in Gary's voice that ALWAYS pivots to a REAL pick (from daily_picks,
// never invented), and posts it as a reply. Reactive only (replies to people who tag Gary) — never proactive.
// Trigger: pg_cron ~every 90s (live) or manually with ?dry=1 to preview replies WITHOUT posting.
// Spec: docs/superpowers/specs/2026-06-26-gary-mention-reply-bot-design.md

// ---------- env ----------
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const X_API_KEY = (Deno.env.get("X_API_KEY") || "").trim();
const X_API_SECRET = (Deno.env.get("X_API_SECRET") || "").trim();
const X_ACCESS_TOKEN = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
const X_ACCESS_SECRET = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();
const sb = createClient(SB_URL, SERVICE_KEY);

// ---------- caps / guardrails ----------
const MAX_MENTIONS_PER_RUN = 10;          // never process more than this in one run
const GLOBAL_HOURLY_CAP = 30;             // max live replies/hour (cost + spam safety)
const PER_USER_HOURLY_CAP = 2;            // max live replies per user/hour
const SKIP_OLDER_THAN_MS = 6 * 3600_000;  // ignore mentions older than 6h (cold-start safety)

// ---------- OAuth 1.0a (identical signing to post-tweet-media) ----------
async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
async function oauthHeader(method: string, url: string, params: Record<string, string>): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const all = { ...params, ...oauth };
  const sorted = Object.keys(all).sort().map((k) => `${percentEncode(k)}=${percentEncode(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const signingKey = `${percentEncode(X_API_SECRET)}&${percentEncode(X_ACCESS_SECRET)}`;
  oauth.oauth_signature = await hmacSha1(new TextEncoder().encode(signingKey), base);
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${percentEncode(k)}="${percentEncode(oauth[k])}"`).join(", ");
}
// GET with OAuth 1.0a: query params must be in the signature base AND encoded identically in the URL (use percentEncode for both).
async function xGet(baseUrl: string, params: Record<string, string>): Promise<any> {
  const header = await oauthHeader("GET", baseUrl, params);
  const qs = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const r = await fetch(qs ? `${baseUrl}?${qs}` : baseUrl, { headers: { Authorization: header } });
  const j = await r.json();
  if (!r.ok) throw new Error(`X GET ${baseUrl.split("/").slice(-1)[0]} ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

// ---------- Gemini (identical to social-auto-post) ----------
async function callLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      // thinkingLevel 'low' = a deliberate careful-reading pass (keeps each stat tied to the right player) without the
      // cost/latency of full reasoning. Same level the pick engine uses for its fact-retrieval/grounding work.
      generationConfig: { maxOutputTokens: 2000, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  // Exclude thinking parts (thought:true) so the reasoning trace never lands in the parsed answer.
  const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text).join("");
  if (!text) throw new Error("Gemini empty: " + JSON.stringify(j).slice(0, 300));
  return text;
}
// Extract the FIRST complete top-level {...} object (handles any trailing content after the JSON).
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { if (--depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}
function parseJsonBlock(text: string): any {
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  const obj = firstJsonObject(text);
  if (!obj) throw new Error("No JSON in model output: " + text.slice(0, 200));
  return JSON.parse(obj);
}
function killDashes(s: string): string { return s.replace(/\s*[—–]\s*/g, ". ").replace(/\.\s*\./g, "."); }
function killEmoji(s: string): string { return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim(); }
function clean(s: string): string { return killEmoji(killDashes(String(s ?? "").trim())); }

// ---------- voice (verbatim from social-auto-post) + reply-specific rules ----------
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
STYLE: specific player names and real numbers. Lead with the single strongest, most concrete, checkable stat, never a vague claim. Use contractions (it's, that's, couldn't, had 'em). Sentence fragments are good. Do NOT write complete, balanced, essay-style sentences. Vary sentence length. Do not open consecutive sentences the same way. Sound like a text to a friend, not an article or a brand account. Always return ONLY valid JSON as instructed.`;

const REPLY_RULES = `
YOU ARE "Gary AI" replying to a tweet that mentioned @BetwithGary on X. Your job is to give a SHARP, ACCURATE, data-backed ANSWER to what they actually asked, using ONLY the real vetted data below.

ACCURACY IS THE ENTIRE POINT:
- The PICKS and ANALYSIS+STATS below come from the app's database (vetted, accurate, current). They are GROUND TRUTH. Pull your numbers and reasoning straight from them.
- NEVER use your own training-data knowledge for any stat, number, line, record, injury, or matchup. NEVER invent or estimate a number. If the data below does not cover what they asked, answer only with what IS there, or say plainly you do not have that detail. Posting a wrong number is the one thing you must never do.

STYLE (sound like the analysis in the rationale, NOT like a personality):
- Answer the question directly and substantively. Lead with the strongest CONCRETE numbers from the data: ERA, xERA, WHIP, OPS, runs per game, K/BB, home/road splits, head-to-head, bullpen. Almost every sentence should carry a real number or a named player/team.
- Confident, specific, analytical. This is information delivery, not a character bit. Do NOT add proverbs, motivational lines, or "personality" filler (no "sentimentality is the enemy of profit", no "I sweat every game", no hype).
- 2 to 4 tight sentences.
- You do NOT have to mention or pivot to the pick. ANSWER WHAT THEY ASKED. You may state the pick if it directly fits, and a short dry aside or joke is allowed ONLY if it genuinely lands, but the real numbers always come first.

WHEN IT IS NOT A QUESTION:
- Many @ mentions are NOT questions, just a comment, a reaction, or a couple of words ("Hitting", "lol", "big game", "this guy cooks"). Do NOT force stats or a pick onto those, it reads like a non-sequitur. React naturally, like a person would, in one short line that actually fits what they said. Add a real stat or a play only if it genuinely fits.
- If there is truly nothing worth saying, set skip=true. Staying quiet beats a reply that makes no sense.

GUARDRAILS:
- If the tweet is about politics, a tragedy, harassment, hate, or anything not appropriate for a betting brand, do not engage the topic: one short friendly deflection, no bait, no insults.
- Do NOT call yourself an AI, a model, a bot, or "automated". You are Gary AI, a sharp data-driven handicapper.
- If there is genuinely nothing to answer (pure spam, a lone emoji, an unrelated mass tag), set skip=true.

Return ONLY JSON: {"reply":"<the answer, or empty>","skip":<true|false>,"reason":"<short reason for the log>"}`;

// LOOSE voice variant — minimal style rules; lets Gemini answer in its OWN natural style, still strictly grounded in the
// vetted data and still never claiming to be an AI. Used when ?style=loose (for the side-by-side). Not the live default.
const LOOSE_SYSTEM = `You are the assistant behind @BetwithGary on X (the brand is "Gary AI"), replying to someone who tagged the account. Answer naturally and helpfully, the way a sharp, knowledgeable sports-betting assistant would actually talk.

GROUND TRUTH: use ONLY the picks and the analysis/stats provided below for any fact, number, line, record, or matchup. They are from the app's vetted database. Never use your own training-data knowledge for stats, and never invent a number. If the data does not cover what they asked, say what you do have, or that you do not have that detail.

Keep it tweet-length (under about 280 characters), clear and direct. Answer the actual question. If the tweet is just a comment or a reaction, react naturally; you do not have to bring up a pick unless it fits.

Do not use emojis. Do not say you are an AI, a model, a bot, or automated. Do not engage politics, tragedy, or harassment (deflect lightly). If there is nothing worth replying to, set skip true.

Return ONLY JSON: {"reply":"<the answer, or empty>","skip":<true|false>,"reason":"<short reason>"}`;

// ---------- data ----------
function etToday(): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
async function todaysPicks(): Promise<any[]> {
  const { data } = await sb.from("daily_picks").select("picks").eq("date", etToday());
  return (data?.[0]?.picks ?? []) as any[];
}
// Clean a rationale for injection: drop the "Gary's Take" header, collapse whitespace, keep the real stats (cap length).
function rationaleForPrompt(s: string): string {
  return String(s ?? "").replace(/^\s*gary'?s take\s*:?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 1400);
}
function formatPicks(picks: any[]): string {
  const sorted = [...picks].sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0)).slice(0, 12);
  if (!sorted.length) return "(No picks have posted yet today. The card is still being finalized; point them to the app for today's plays.)";
  // Inject each pick's FULL vetted rationale (the real stats), not just the intro, so the bot can answer with real numbers.
  return sorted.map((p, i) => {
    const away = p.awayTeam ?? p.away ?? "";
    const home = p.homeTeam ?? p.home ?? "";
    const match = away && home ? `${away} @ ${home}` : (p.matchup ?? p.game ?? "");
    const odds = p.odds != null && p.odds !== "" ? ` (${p.odds})` : "";
    const rat = p.rationale ? `\n  ANALYSIS + STATS (vetted from the app DB, use THESE exact numbers): ${rationaleForPrompt(p.rationale)}` : "";
    return `${i === 0 ? "[TOP PLAY] " : ""}[${p.league ?? p.sport ?? "?"}] ${match} -- PICK: ${p.pick}${odds}${rat}`;
  }).join("\n\n");
}

async function composeReply(a: { mentionText: string; authorUsername: string; contextText: string; contextAuthor: string; picksBlock: string; loose?: boolean }): Promise<{ reply: string; skip: boolean; reason: string }> {
  const user = `The person @${a.authorUsername} tweeted: "${a.mentionText}"
${a.contextText ? `(They were replying to @${a.contextAuthor}: "${a.contextText}")` : ""}

The vetted picks + analysis for today (ground truth, never invent):
${a.picksBlock}

Write the reply now.`;
  const system = a.loose ? LOOSE_SYSTEM : (VOICE_RULES + "\n\n" + REPLY_RULES);
  const out = parseJsonBlock(await callLLM(system, user));
  const raw = String(out.reply ?? "").trim();
  // Loose mode keeps natural punctuation (em dashes ok); strict mode runs the full voice cleanup.
  const reply = a.loose ? killEmoji(raw) : clean(raw);
  return { reply, skip: !!out.skip, reason: String(out.reason ?? "") };
}

async function postReply(text: string, replyToId: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/post-reply-tweet`, {
    method: "POST", headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, replyToId }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-reply-tweet failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.tweetId as string;
}
async function logMention(m: any, username: string, status: string, replyText: string | null, replyTweetId: string | null = null): Promise<void> {
  await sb.from("bot_mention_log").upsert({
    mention_id: m.id, author_id: m.author_id, author_username: username,
    mention_text: String(m.text ?? "").slice(0, 500), status,
    reply_text: replyText ? replyText.slice(0, 500) : null, reply_tweet_id: replyTweetId,
    conversation_id: m.conversation_id ?? null,
  }, { onConflict: "mention_id" });
}

// ---------- main ----------
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let dry = url.searchParams.get("dry") === "1";
    const showAll = url.searchParams.get("all") === "1"; // dry-only: ignore the recency guard (for previewing replies to existing mentions)
    try { const b = await req.json(); if (b?.dry) dry = true; } catch { /* no body */ }

    if (!GEMINI_KEY) return Response.json({ ok: false, error: "GEMINI_API_KEY not set" }, { status: 500 });

    // Prompt test harness (no X, no post): ?test=<question> composes a reply to that question against today's real slate.
    const testQ = url.searchParams.get("test");
    if (testQ) {
      const loose = url.searchParams.get("style") === "loose";
      const picksBlock = formatPicks(await todaysPicks());
      const c = await composeReply({ mentionText: testQ, authorUsername: "tester", contextText: "", contextAuthor: "", picksBlock, loose });
      return Response.json({ ok: true, test: true, style: loose ? "loose" : "current", question: testQ, reply: c.reply, skip: c.skip, reason: c.reason });
    }

    if (!X_API_KEY) return Response.json({ ok: false, error: "X_API_* secrets not set" }, { status: 500 });

    // since_id watermark + CACHED Gary user id (so we don't call /2/users/me on every poll, 24/7)
    const { data: st } = await sb.from("bot_mention_state").select("since_id, gary_user_id").eq("id", 1).maybeSingle();
    const sinceId: string | undefined = st?.since_id ?? undefined;
    let garyId: string = st?.gary_user_id ?? "";
    let garyUsername = "BetwithGary";
    if (!garyId) {
      const me = await xGet("https://api.x.com/2/users/me", {}); // one-time: resolve + cache the id
      garyId = me?.data?.id ?? "";
      garyUsername = me?.data?.username ?? "BetwithGary";
      if (!garyId) return Response.json({ ok: false, error: "could not resolve @BetwithGary id", me }, { status: 500 });
      await sb.from("bot_mention_state").update({ gary_user_id: garyId }).eq("id", 1);
    }

    // fetch new mentions (+ author usernames + the tweets they're replying to, in one call via expansions)
    const params: Record<string, string> = {
      max_results: "20",
      "tweet.fields": "author_id,created_at,referenced_tweets,conversation_id",
      expansions: "author_id,referenced_tweets.id,referenced_tweets.id.author_id",
      "user.fields": "username",
    };
    if (sinceId) params.since_id = sinceId;
    const mres = await xGet(`https://api.x.com/2/users/${garyId}/mentions`, params);
    const mentions: any[] = mres?.data ?? [];
    const includes = mres?.includes ?? {};
    const usersById: Record<string, any> = Object.fromEntries((includes.users ?? []).map((u: any) => [u.id, u]));
    const tweetsById: Record<string, any> = Object.fromEntries((includes.tweets ?? []).map((t: any) => [t.id, t]));
    const newestId: string | undefined = mres?.meta?.newest_id;

    if (!mentions.length) {
      return Response.json({ ok: true, dry, gary: garyUsername, processed: 0, note: "no new mentions", sinceId });
    }

    // X returns newest-first. Take the NEWEST N, then reverse to oldest-first so replies post in chronological order.
    // (Taking the newest avoids getting stuck on a stale backlog on a cold start; since_id then advances past the rest.)
    const ordered = mentions.slice(0, MAX_MENTIONS_PER_RUN).reverse();
    const picksBlock = formatPicks(await todaysPicks());

    let globalReplies = 0;
    if (!dry) {
      const { count } = await sb.from("bot_mention_log").select("*", { count: "exact", head: true }).eq("status", "replied").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      globalReplies = count ?? 0;
    }

    const results: any[] = [];
    for (const m of ordered) {
      const username = usersById[m.author_id]?.username ?? "";
      const age = m.created_at ? Date.now() - Date.parse(m.created_at) : 0;
      if (age > SKIP_OLDER_THAN_MS && !(dry && showAll)) { results.push({ id: m.id, status: "skipped-old" }); continue; }
      if (m.author_id === garyId) { results.push({ id: m.id, status: "skipped-self" }); continue; }

      // The tweet this mention replies to / quotes (its parent) — for context AND the no-back-and-forth guards.
      const ref = (m.referenced_tweets ?? []).find((r: any) => r.type === "replied_to" || r.type === "quoted");
      const ctx = ref ? tweetsById[ref.id] : null;
      const contextText = ctx?.text ?? "";
      const contextAuthor = ctx ? (usersById[ctx.author_id]?.username ?? "") : "";

      // GUARD A: never reply to a reply to GARY'S OWN tweet — that is a back-and-forth, not a fresh question.
      if (ctx && ctx.author_id === garyId) {
        if (!dry) await logMention(m, username, "skipped", "reply-to-garys-tweet");
        results.push({ id: m.id, status: "skipped-reply-to-gary" });
        continue;
      }
      // GUARD B: at most ONE reply per conversation thread. If Gary already replied in this thread, stay quiet.
      if (m.conversation_id) {
        const { data: prior } = await sb.from("bot_mention_log").select("mention_id").eq("conversation_id", m.conversation_id).eq("status", "replied").limit(1).maybeSingle();
        if (prior) {
          if (!dry) await logMention(m, username, "skipped", "already-replied-in-thread");
          results.push({ id: m.id, status: "skipped-thread" });
          continue;
        }
      }

      if (!dry) {
        const { data: ex } = await sb.from("bot_mention_log").select("mention_id").eq("mention_id", m.id).maybeSingle();
        if (ex) { results.push({ id: m.id, status: "already" }); continue; }
        if (globalReplies >= GLOBAL_HOURLY_CAP) { await logMention(m, username, "skipped", "global-cap"); results.push({ id: m.id, status: "skipped-globalcap" }); continue; }
        const { count: uc } = await sb.from("bot_mention_log").select("*", { count: "exact", head: true }).eq("author_id", m.author_id).eq("status", "replied").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
        if ((uc ?? 0) >= PER_USER_HOURLY_CAP) { await logMention(m, username, "skipped", "user-cap"); results.push({ id: m.id, status: "skipped-usercap" }); continue; }
      }

      let composed;
      try {
        composed = await composeReply({ mentionText: m.text ?? "", authorUsername: username, contextText, contextAuthor, picksBlock });
      } catch (e) {
        if (!dry) await logMention(m, username, "error", "compose: " + String(e));
        results.push({ id: m.id, status: "error", error: String(e) });
        continue;
      }
      if (composed.skip || !composed.reply) {
        if (!dry) await logMention(m, username, "skipped", composed.reason || "model-skip");
        results.push({ id: m.id, status: "skipped-model", author: username, mention: m.text, reason: composed.reason });
        continue;
      }
      const replyText = composed.reply.slice(0, 480); // @BetwithGary is verified/Premium, so longer substantive replies are fine
      if (dry) { results.push({ id: m.id, status: "DRY", author: username, mention: m.text, context: contextText, reply: replyText }); continue; }

      try {
        const rid = await postReply(replyText, m.id);
        await logMention(m, username, "replied", replyText, rid);
        globalReplies++;
        results.push({ id: m.id, status: "replied", author: username, reply: replyText, replyTweetId: rid });
      } catch (e) {
        await logMention(m, username, "error", replyText);
        results.push({ id: m.id, status: "error", error: String(e) });
      }
    }

    if (!dry && newestId) {
      await sb.from("bot_mention_state").update({ since_id: newestId, updated_at: new Date().toISOString() }).eq("id", 1);
    }
    return Response.json({ ok: true, dry, gary: garyUsername, processed: results.length, sinceId, newestId, results });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
