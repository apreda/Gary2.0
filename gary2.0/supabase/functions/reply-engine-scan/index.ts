// reply-engine-scan — Sub-A REPLY-BACK scanner (Jun 18 2026). Polls @BetwithGary's mentions (people replying to Gary's
// posts), matches each to the pick they're replying about, runs a Gemini safety-gate + voice draft, validates it, and
// QUEUES it into reply_queue as 'pending'. It NEVER posts (reply-engine-send does that, only on approval). Safe slice:
// Gary is the author of these threads, so the account-level outbound block does not apply (unlike Sub-B outbound).
// ?dry_run=1 = scan + draft but do not write the queue. Sub-B (outbound List) is deferred until the account is unblocked.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const sb = createClient(SB_URL, SERVICE_KEY);
const GARY_ID = "2001291581446631424"; // @BetwithGary numeric user id (from x-api-probe)

async function hmacSha1(key: Uint8Array, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)))));
}
function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/!/g, "%21").replace(/\*/g, "%2A").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
async function oauth(method: string, url: string, params: Record<string, string>): Promise<string> {
  const ck = (Deno.env.get("X_API_KEY") || "").trim(), cs = (Deno.env.get("X_API_SECRET") || "").trim();
  const at = (Deno.env.get("X_ACCESS_TOKEN") || "").trim(), ats = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();
  const o: Record<string, string> = { oauth_consumer_key: ck, oauth_nonce: crypto.randomUUID().replace(/-/g, ""), oauth_signature_method: "HMAC-SHA1", oauth_timestamp: Math.floor(Date.now() / 1000).toString(), oauth_token: at, oauth_version: "1.0" };
  const all = { ...params, ...o };
  const sorted = Object.keys(all).sort().map((k) => `${percentEncode(k)}=${percentEncode(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
  o.oauth_signature = await hmacSha1(new TextEncoder().encode(`${percentEncode(cs)}&${percentEncode(ats)}`), base);
  return "OAuth " + Object.keys(o).sort().map((k) => `${percentEncode(k)}="${percentEncode(o[k])}"`).join(", ");
}
async function signedGet(baseUrl: string, qp: Record<string, string>): Promise<any> {
  const qs = Object.keys(qp).sort().map((k) => `${percentEncode(k)}=${percentEncode(qp[k])}`).join("&");
  const auth = await oauth("GET", baseUrl, qp);
  const r = await fetch(`${baseUrl}?${qs}`, { headers: { Authorization: auth } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function callLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: 1500, responseMimeType: "application/json" } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}
function parseJson(t: string): any { try { return JSON.parse(t); } catch (_) {} const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error("no json"); return JSON.parse(m[0]); }
function clean(s: string): string {
  return String(s ?? "").replace(/\s*[—–]\s*/g, ". ").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]{2,}/g, " ").trim();
}
// Deterministic voice validator — last line of defense before a draft can be approved.
function validate(s: string): { ok: boolean; reason: string } {
  if (!s) return { ok: false, reason: "empty" };
  if (/https?:\/\/|\bwww\./i.test(s)) return { ok: false, reason: "contains link" };
  if (/#\w/.test(s)) return { ok: false, reason: "contains hashtag" };
  if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(s)) return { ok: false, reason: "contains emoji" };
  if (/[—–]/.test(s)) return { ok: false, reason: "contains dash" };
  if (/\b(tail me|who'?s riding|lock it in|free money|link in bio|download)\b/i.test(s)) return { ok: false, reason: "salesy/capper phrase" };
  if (/\bI (put|bet|wagered|dropped)\b.*\b(unit|units|\$|grand|on (this|it))\b/i.test(s)) return { ok: false, reason: "false cash-wager claim" };
  if (s.length > 270) return { ok: false, reason: "too long" };
  return { ok: true, reason: "ok" };
}

const SCAN_VOICE = `You are Gary (@BetwithGary), an AI that calls sports games, deciding whether to reply back to someone who replied to one of your posts, and if so writing that reply. Reply-backs are conversational: someone engaged your pick, you respond like the sharpest friend in the group chat.`;

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "1";
    const hours = parseInt(url.searchParams.get("hours") || "18", 10); // lookback window; override with ?hours= for testing
    const { data: cfg } = await sb.from("reply_engine_config").select("*").eq("id", 1).single();
    const dailyCap = cfg?.daily_cap ?? 10;

    // Pull recent mentions (replies to Gary's posts mention @BetwithGary automatically).
    const m = await signedGet(`https://api.x.com/2/users/${GARY_ID}/mentions`, {
      max_results: "30",
      "tweet.fields": "text,author_id,conversation_id,created_at,referenced_tweets",
      expansions: "author_id",
      "user.fields": "username",
    });
    if (m.status !== 200) return Response.json({ error: `mentions read ${m.status}`, detail: JSON.stringify(m.body).slice(0, 300) }, { status: 502 });
    const mentions: any[] = m.body?.data ?? [];
    const users: Record<string, string> = {};
    for (const u of m.body?.includes?.users ?? []) users[u.id] = u.username;

    const cutoff = Date.now() - hours * 3600_000; // default last ~18h; ?hours= overrides for testing
    const fresh = mentions.filter((t) => t.author_id !== GARY_ID && new Date(t.created_at).getTime() > cutoff);

    // Skip anything already queued (dedup by target_tweet_id).
    const ids = fresh.map((t) => t.id);
    const seen = new Set<string>();
    if (ids.length) {
      const { data: existing } = await sb.from("reply_queue").select("target_tweet_id").in("target_tweet_id", ids);
      for (const r of existing ?? []) seen.add(r.target_tweet_id);
    }

    const out: any[] = [];
    let queued = 0;
    for (const t of fresh) {
      if (seen.has(t.id)) continue;
      if (queued >= dailyCap) break;

      // Find which Gary post they replied to (conversation root = Gary's hook tweet) -> the pick it was about.
      const convId = t.conversation_id;
      let pickText: string | null = null;
      if (convId) {
        const { data: logRow } = await sb.from("social_post_log").select("pick_text").eq("hook_tweet_id", convId).limit(1).maybeSingle();
        pickText = logRow?.pick_text ?? null;
      }
      if (!pickText) { out.push({ id: t.id, status: "skipped", reason: "not a reply to a known Gary post" }); continue; }

      // Gate + draft in one call.
      const postDesc = /^DAILY RECAP|^PERSONALITY|^REPLY /.test(pickText) ? "one of Gary's posts (a recap or character post, not a single pick)" : `Gary's pick: ${pickText}`;
      const prompt = `Someone replied to ${postDesc}. They said: "${t.text}".\n\nFirst decide if Gary should reply back. SKIP (reply_worthy=false) if their reply is hostile, abusive, trolling, spam, a tout pitching their own picks/service, off-topic, or just an emoji or one empty word. Only reply to genuine takes, questions, agreement, or good-faith disagreement.\nIf reply_worthy, write Gary's reply-back: 1 to 2 sentences, under 200 characters, first person, casual, in voice. Engage what they actually said. Hold your reasoning or concede gracefully if they have a real point. At most ONE concrete stat or reason.\nDo NOT invent specifics you were not given (odds, where a line was set, stats, sources). You only know the pick text above and what they said. If you lack the exact number they are disputing, concede their point or keep it general. Never fabricate a justification.\nHARD RULES: no emojis, no em or en dashes, no hashtags, no links or URLs, no "download"/"in the app"/"link in bio", no corny capper lines ("tail me", "who's riding", "lock it in"), no inflated adjectives, and NEVER claim a personal cash wager. Return ONLY JSON: {"reply_worthy": true|false, "reason": "...", "reply": "..."}.`;
      let gate: any;
      try { gate = parseJson(await callLLM(SCAN_VOICE, prompt)); } catch (e) { out.push({ id: t.id, status: "error", reason: "draft failed: " + String(e).slice(0, 80) }); continue; }

      if (!gate.reply_worthy) { out.push({ id: t.id, status: "skipped", reason: gate.reason || "gated", their_text: t.text });
        if (!dryRun) await sb.from("reply_queue").insert({ sub_engine: "A", target_tweet_id: t.id, target_author: users[t.author_id] ?? null, target_text: t.text, conversation_id: convId, pick_text: pickText, draft: null, validator_ok: false, gate_reason: gate.reason || "gated", status: "skipped" });
        continue;
      }
      const draft = clean(gate.reply);
      const v = validate(draft);
      const row = { sub_engine: "A", target_tweet_id: t.id, target_author: users[t.author_id] ?? null, target_text: t.text, conversation_id: convId, pick_text: pickText, draft, validator_ok: v.ok, gate_reason: v.ok ? null : v.reason, status: v.ok ? "pending" : "skipped" };
      if (!dryRun) await sb.from("reply_queue").insert(row);
      out.push({ id: t.id, author: users[t.author_id], their_text: t.text, pick: pickText, draft, valid: v.ok, status: row.status });
      if (v.ok) queued++;
    }

    return Response.json({ scanned: mentions.length, fresh: fresh.length, queued, dry_run: dryRun, results: out });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
