// reply-with-pick — LIGHT v1 reply engine (Jun 18 2026). Given a target tweet, reads it, finds which of today's games
// it is about, and drafts a SHORT in-voice reply that engages the tweet + states Gary's relevant pick + one reason.
// Human-in-the-loop: ?dry_run=1 composes without posting (preview, then approve). No poller, no list, no queue,
// no autonomous posting. No app-link / "download" in replies (a reply is a conversation, not an ad).
// Body: { tweetId?, pick?, sampleTweetText? }  ·  ?dry_run=1 = compose only.
//   tweetId         target tweet to read + reply to (required to POST live)
//   pick            optional: force a specific pick string instead of auto-matching
//   sampleTweetText optional (dry-run testing): simulate a target tweet's text without a real tweetId
// Reuses the OAuth 1.0a signer from post-reply-tweet/x-api-probe, daily_picks, Gemini, and post-reply-tweet.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const sb = createClient(SB_URL, SERVICE_KEY);

async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
async function generateOAuthHeader(method: string, url: string, params: Record<string, string>, ck: string, cs: string, at: string, ats: string): Promise<string> {
  const o: Record<string, string> = { oauth_consumer_key: ck, oauth_nonce: crypto.randomUUID().replace(/-/g, ""), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now() / 1000).toString(), oauth_token: at, oauth_version: "1.0" };
  const all = { ...params, ...o };
  const sorted = Object.keys(all).sort().map((k) => `${percentEncode(k)}=${percentEncode(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const sig = await hmacSha1(new TextEncoder().encode(`${percentEncode(cs)}&${percentEncode(ats)}`), base);
  o.oauth_signature = sig;
  return "OAuth " + Object.keys(o).sort().map((k) => `${percentEncode(k)}="${percentEncode(o[k])}"`).join(", ");
}
async function readTweetText(id: string): Promise<string | null> {
  const ck = (Deno.env.get("X_API_KEY") || "").trim(), cs = (Deno.env.get("X_API_SECRET") || "").trim();
  const at = (Deno.env.get("X_ACCESS_TOKEN") || "").trim(), ats = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();
  const base = `https://api.x.com/2/tweets/${id}`;
  const qp = { "tweet.fields": "text" };
  const qs = Object.keys(qp).sort().map((k) => `${percentEncode(k)}=${percentEncode((qp as any)[k])}`).join("&");
  const auth = await generateOAuthHeader("GET", base, qp, ck, cs, at, ats);
  const r = await fetch(`${base}?${qs}`, { headers: { Authorization: auth } });
  const j = await r.json().catch(() => null);
  return j?.data?.text ?? null;
}

function etDate(): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date())) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
async function callLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 2000, responseMimeType: "application/json" } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}
function parseJsonBlock(t: string): any { try { return JSON.parse(t); } catch (_) {} const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error("no JSON: " + t.slice(0, 160)); return JSON.parse(m[0]); }
function killDashes(s: string): string { return s.replace(/\s*[—–]\s*/g, ". ").replace(/\.\s*\./g, "."); }
function killEmoji(s: string): string { return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]{2,}/g, " ").trim(); }
function clean(s: string): string { return killEmoji(killDashes(String(s ?? "").trim())); }

// Find which of today's picks the tweet is about, by team-name overlap.
function matchPick(text: string, picks: any[]): any {
  const t = (text || "").toLowerCase();
  let best: any = null, bestScore = 0;
  for (const p of picks) {
    const toks = new Set<string>();
    for (const f of [p.awayTeam, p.homeTeam]) {
      if (!f) continue;
      const full = String(f).toLowerCase(); toks.add(full);
      for (const w of full.split(/\s+/)) if (w.length >= 4) toks.add(w);
    }
    let sc = 0;
    for (const tok of toks) if (t.includes(tok)) sc++;
    if (sc > bestScore) { bestScore = sc; best = p; }
  }
  return bestScore > 0 ? best : null;
}

const REPLY_VOICE = `You are Gary (@BetwithGary), an AI that calls sports games, replying inside a live conversation on X. Write ONE short reply: 1 to 2 sentences, under 200 characters. Engage with what they said (agree, add to it, or respectfully counter), then state your play and ONE concrete reason (a real number or a situational edge). First person, casual, contractions, like a sharp bettor in the group chat. ABSOLUTE RULES: no emojis, no em or en dashes, no hashtags, no links or URLs, no "download" / "in the app" / "link in bio" (this is a reply in a conversation, NOT an ad), no corny capper lines ("tail me", "who's riding", "lock it in", "free money"), and NO inflated adjectives (devastating, absolute, total, completely, massive, elite, gutted) — just state the number and let it land. Keep to ONE reason, not a list. Gary is openly an AI that models and calls games but NEVER claims a personal cash wager or a lived human experience he did not have. Return ONLY JSON: {"reply": "..."}.`;

Deno.serve(async (req: Request) => {
  try {
    const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
    const body = await req.json().catch(() => ({}));
    const tweetId: string | undefined = body.tweetId;
    const pickHint: string | undefined = body.pick;
    const sampleTweetText: string | undefined = body.sampleTweetText;

    const today = etDate();
    const { data: dp } = await sb.from("daily_picks").select("picks").eq("date", today);
    const picks: any[] = dp?.[0]?.picks ?? [];
    if (!picks.length) return Response.json({ error: `no picks loaded for ${today}` }, { status: 400 });

    let targetText: string | null = sampleTweetText ?? null;
    if (tweetId && !targetText) targetText = await readTweetText(tweetId);

    let chosen: any = null;
    if (pickHint) chosen = picks.find((p) => p.pick === pickHint) ?? { pick: pickHint };
    else if (targetText) chosen = matchPick(targetText, picks);
    if (!chosen && !targetText) chosen = [...picks].sort((a, b) => parseFloat(b.confidence ?? 0) - parseFloat(a.confidence ?? 0))[0];
    if (!chosen) return Response.json({ posted: false, reason: "no pick relevant to this tweet (Gary has no play on that game today)", target_text: targetText, picks_today: picks.map((p) => p.pick) });

    const oddsStr = (chosen.odds && !String(chosen.pick).includes(String(chosen.odds))) ? ` (${chosen.odds})` : "";
    const pickLine = `${chosen.pick}${oddsStr}`;
    const user = `${targetText ? `They tweeted: "${targetText}"\n\n` : ""}Your play on this game: ${pickLine}. League ${chosen.league ?? ""}. Matchup ${chosen.awayTeam ?? ""} at ${chosen.homeTeam ?? ""}.\nPull ONE reason from this rationale (do not dump it all):\n${(chosen.rationale ?? "").slice(0, 1200)}\n\nWrite the reply now.`;
    const reply = clean(parseJsonBlock(await callLLM(REPLY_VOICE, user)).reply);

    if (dryRun) return Response.json({ dry_run: true, matched_pick: pickLine, target_text: targetText, reply });
    if (!tweetId) return Response.json({ error: "tweetId required to post a live reply" }, { status: 400 });

    const pr = await fetch(`${SB_URL}/functions/v1/post-reply-tweet`, { method: "POST", headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: reply, replyToId: tweetId }) });
    const pj = await pr.json();
    if (!pj.success || !pj.tweetId) return Response.json({ error: "post-reply-tweet failed", details: pj }, { status: 502 });
    await sb.from("social_post_log").insert({ post_date: today, slot: "reply", pick_text: `REPLY ${chosen.pick}`, thread_format: "reply", hook_tweet_id: pj.tweetId, thread_url: `https://x.com/BetwithGary/status/${pj.tweetId}` });
    return Response.json({ posted: true, reply, reply_tweet_id: pj.tweetId, in_reply_to: tweetId, url: `https://x.com/BetwithGary/status/${pj.tweetId}` });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
