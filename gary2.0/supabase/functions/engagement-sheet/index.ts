import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// engagement-sheet — Engine 2 (Jul 5 2026). Every morning: 8-10 drafted Gary replies under big open-reply
// sports accounts' fresh tweets, served as a token-gated mobile page the founder opens from his phone.
// He taps "Open on X", pastes the draft, sends — manual distribution the API reply-ban can't do for us.
//   GET ?token=SECRET                → the sheet page (HTML, today's rows)
//   GET ?token=SECRET&generate=1     → rebuild today's sheet (X recent-search → score → Gemini drafts)
//   GET ?token=SECRET&generate=1&dry_run=1 → build + return JSON without writing rows
// Deployed --no-verify-jwt (a phone browser sends no JWT); SHEET_TOKEN secret is the gate.
// Targets live in the engagement_targets table (founder-editable, no redeploys). Outbound ONLY — replies
// to Gary's own posts @-mention him, so gary-mention-reply already answers those.
// Spec: docs/superpowers/specs/2026-07-05-social-growth-three-engines-design.md §6.

// ---------- env ----------
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("SOCIAL_GEMINI_MODEL") ?? Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const X_API_KEY = (Deno.env.get("X_API_KEY") || "").trim();
const X_API_SECRET = (Deno.env.get("X_API_SECRET") || "").trim();
const X_ACCESS_TOKEN = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
const X_ACCESS_SECRET = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();
const SHEET_TOKEN = (Deno.env.get("SHEET_TOKEN") || "").trim();
const sb = createClient(SB_URL, SERVICE_KEY);

// ---------- caps ----------
const SHEET_MAX = 10;          // rows on the page
const DRAFT_CANDIDATES = 14;   // score this many, keep the first SHEET_MAX non-skipped drafts
const MIN_ENG = 5;             // weighted engagement floor (likes + 2*replies + 3*rts)
const WINDOW_MS = 6 * 3600_000; // only tweets from the last 6h

// ---------- OAuth 1.0a (identical signing to gary-mention-reply / post-tweet-media) ----------
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
async function xGet(baseUrl: string, params: Record<string, string>): Promise<any> {
  const header = await oauthHeader("GET", baseUrl, params);
  const qs = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");
  const r = await fetch(qs ? `${baseUrl}?${qs}` : baseUrl, { headers: { Authorization: header } });
  const j = await r.json();
  if (!r.ok) throw new Error(`X GET ${baseUrl.split("/").slice(-1)[0]} ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

// ---------- Gemini ----------
async function callLLM(system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 2000, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = (j.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text).join("");
  if (!text) throw new Error("Gemini returned empty output");
  return text;
}
function parseJsonBlock(text: string): any {
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in model output: " + text.slice(0, 200));
  return JSON.parse(m[0]);
}
function killDashes(s: string): string { return s.replace(/\s*[—–]\s*/g, ". ").replace(/\.\s*\./g, "."); }
function killEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/[ \t]{2,}/g, " ").trim();
}
function clean(s: string): string { return killEmoji(killDashes(String(s ?? "").trim())); }

function etDate(d = new Date()): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

// ---------- voice (verbatim from social-auto-post / gary-mention-reply) ----------
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
(9) No marketing or corporate voice. Do not narrate in third-person brand voice. Write in the FIRST PERSON as Gary.
(10) Gary is a CHARACTER, never an AI. NEVER reveal or even hint that Gary is an AI, a model, an algorithm, automated, software, "trained", or running "simulations"/"data". Phrases like "I modeled this", "my model", "my simulations", "my data", "as an AI" are BANNED. Stay fully in character.
(11) Every sentence must carry a concrete fact: a number, a player or team name, a result, or a genuine thought. Dry and specific beats smooth and padded.
STYLE: specific player names and real numbers. Use contractions. Sentence fragments are good. Vary sentence length. Sound like a text to a friend, not an article or a brand account. Always return ONLY valid JSON as instructed.`;

const SHEET_RULES = `
You draft ONE reply that Gary will post MANUALLY from his phone under a BIG sports account's tweet. The reply's only job is to make sharp bettors who read the thread tap Gary's profile because the reply was the smartest thing under the tweet.
HARD RULES for these replies:
- UNDER 240 characters. One or two sentences.
- Substantive and specific to THIS tweet. Never generic ("great point", "big game tonight" = failure).
- No @mentions. Never mention the app, a page, a card, a record, or tell anyone to follow, check, or tail anything. Zero promotion. The profile does the converting.
- Counter-takes are welcome. Confident disagreement earns more profile taps than agreement.
- If a GARY PICK is provided below, it is ground truth: you may use at most ONE real number from its rationale and may state Gary's lean naturally ("I'm on Detroit tonight" style).
- If NO pick is provided: react ONLY to what the tweet itself says. An opinion, a counter-take, or a genuinely sharp question. Do NOT cite any stat, record, or fact that is not in the tweet.
- If there is nothing genuine to add, return {"skip": true}.
Return ONLY JSON: {"reply":"..."} or {"skip":true}.`;

// ---------- generate ----------
type Cand = { id: string; author: string; name: string; text: string; eng: number; createdMs: number; matched: any | null };

function teamWords(team: string): string[] {
  return String(team ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
}

async function generate(dryRun: boolean) {
  const today = etDate();

  const { data: dpRows } = await sb.from("daily_picks").select("picks").eq("date", today);
  const picks: any[] = (dpRows?.[0]?.picks ?? []).filter((p: any) => p.awayTeam && p.homeTeam);

  const { data: targets, error: tErr } = await sb.from("engagement_targets").select("handle").eq("active", true);
  if (tErr) throw tErr;
  const handles = (targets ?? []).map((t: any) => String(t.handle));
  if (!handles.length) return { generated: 0, reason: "no active engagement_targets" };

  // Chunk handles into (from:a OR from:b ...) queries under X's 512-char query limit.
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const h of handles) {
    const q = [...cur, h].map((x) => `from:${x}`).join(" OR ");
    if (q.length > 420 && cur.length) { chunks.push(cur); cur = [h]; } else cur.push(h);
  }
  if (cur.length) chunks.push(cur);

  const startTime = new Date(Date.now() - WINDOW_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
  const tweets: any[] = [];
  const users: Record<string, any> = {};
  for (const chunk of chunks) {
    const j = await xGet("https://api.x.com/2/tweets/search/recent", {
      query: `(${chunk.map((h) => `from:${h}`).join(" OR ")}) -is:reply -is:retweet`,
      max_results: "50",
      start_time: startTime,
      "tweet.fields": "public_metrics,created_at,author_id",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    for (const u of j.includes?.users ?? []) users[u.id] = u;
    for (const t of j.data ?? []) tweets.push(t);
  }

  // Score: weighted engagement, tripled when the tweet talks about a team on today's card.
  const cands: Cand[] = [];
  for (const t of tweets) {
    const m = t.public_metrics ?? {};
    const eng = (m.like_count ?? 0) + 2 * (m.reply_count ?? 0) + 3 * (m.retweet_count ?? 0);
    if (eng < MIN_ENG) continue;
    const lower = String(t.text ?? "").toLowerCase();
    const matched = picks.find((p: any) =>
      [...teamWords(p.awayTeam), ...teamWords(p.homeTeam)].some((w) => lower.includes(w))) ?? null;
    const u = users[t.author_id] ?? {};
    cands.push({
      id: String(t.id), author: String(u.username ?? ""), name: String(u.name ?? ""),
      text: String(t.text ?? ""), eng, createdMs: new Date(t.created_at).getTime(), matched,
    });
  }
  cands.sort((a, b) => (b.eng * (b.matched ? 3 : 1)) - (a.eng * (a.matched ? 3 : 1)));
  const seen = new Set<string>();
  const picked: Cand[] = [];
  for (const c of cands) {
    if (seen.has(c.author)) continue; // one per author per day
    seen.add(c.author);
    picked.push(c);
    if (picked.length >= DRAFT_CANDIDATES) break;
  }

  const rows: any[] = [];
  for (const c of picked) {
    if (rows.length >= SHEET_MAX) break;
    try {
      const user = `TARGET TWEET by @${c.author} (${c.name}):\n"${c.text.slice(0, 600)}"\n\n${c.matched
        ? `GARY PICK on this game (ground truth): ${c.matched.pick}${c.matched.odds ? ` (${c.matched.odds})` : ""} | ${c.matched.awayTeam} @ ${c.matched.homeTeam} | ${String(c.matched.league ?? "").toUpperCase()}\nRATIONALE (real, use at most ONE number from it):\n${String(c.matched.rationale ?? "").slice(0, 1500)}`
        : "NO GARY PICK relates to this tweet. React only to the tweet's own content."}`;
      const out = parseJsonBlock(await callLLM(VOICE_RULES + "\n" + SHEET_RULES, user));
      if (out.skip) continue;
      const draft = clean(out.reply);
      if (!draft || draft.length > 255) continue;
      rows.push({
        sheet_date: today, author: c.author, author_name: c.name, tweet_id: c.id,
        tweet_text: c.text.slice(0, 500), eng: c.eng, matched_pick: c.matched?.pick ?? null,
        draft, url: `https://x.com/${c.author}/status/${c.id}`,
      });
    } catch (e) {
      console.error(`draft failed for @${c.author}: ${String(e)}`);
    }
  }

  if (dryRun) return { dry_run: true, candidates: cands.length, sheet: rows };

  await sb.from("engagement_sheet").delete().eq("sheet_date", today);
  if (rows.length) {
    const { error: insErr } = await sb.from("engagement_sheet").insert(rows);
    if (insErr) throw insErr;
  }
  return { generated: rows.length, candidates: cands.length, date: today };
}

// ---------- view ----------
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function view(token: string): Promise<Response> {
  const today = etDate();
  const { data: rows } = await sb.from("engagement_sheet").select("*").eq("sheet_date", today).order("eng", { ascending: false });
  const items = (rows ?? []).map((r: any, i: number) => `
    <article class="item" data-id="${esc(r.tweet_id)}">
      <div class="head">
        <span class="n">${i + 1}</span>
        <span class="who">@${esc(r.author)}</span>
        <span class="eng">${r.eng} eng</span>
        ${r.matched_pick ? `<span class="pick">on the card: ${esc(r.matched_pick)}</span>` : ""}
      </div>
      <p class="their">${esc(r.tweet_text)}</p>
      <p class="draft" id="d-${esc(r.tweet_id)}">${esc(r.draft)}</p>
      <div class="row">
        <a class="btn open" href="${esc(r.url)}" target="_blank" rel="noopener">Open on X</a>
        <button class="btn copy" data-t="${esc(r.tweet_id)}">Copy reply</button>
        <label class="done-l"><input type="checkbox" class="done-c" data-t="${esc(r.tweet_id)}"> sent</label>
      </div>
    </article>`).join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Gary's Sheet</title><style>
  :root{color-scheme:dark}
  body{background:#0B0A09;color:#ECE9E4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:22px 16px 80px;line-height:1.45}
  .wrap{max-width:560px;margin:0 auto}
  .kick{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.2em;color:#C9A227}
  h1{font-size:26px;margin:6px 0 2px}
  .sub{color:#9A948A;font-size:13.5px;margin:0 0 22px}
  .item{border:1px solid rgba(236,233,228,.1);background:#131110;border-radius:14px;padding:14px;margin-bottom:14px}
  .item.off{opacity:.32}
  .head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .n{color:#9A948A}.who{color:#ECE9E4;font-weight:700}.eng{color:#9A948A}.pick{color:#C9A227}
  .their{color:#9A948A;font-size:13.5px;margin:9px 0;white-space:pre-line}
  .draft{font-size:15.5px;margin:0 0 12px;border-left:2px solid #C9A227;padding-left:10px;white-space:pre-line}
  .row{display:flex;gap:10px;align-items:center}
  .btn{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;letter-spacing:.05em;border:1px solid rgba(236,233,228,.2);background:none;color:#ECE9E4;border-radius:8px;padding:8px 12px;text-decoration:none;cursor:pointer}
  .btn.open{border-color:rgba(201,162,39,.5);color:#C9A227}
  .done-l{margin-left:auto;color:#9A948A;font-size:12.5px;display:flex;gap:6px;align-items:center}
  .empty{color:#9A948A;border:1px dashed rgba(236,233,228,.15);border-radius:14px;padding:22px;text-align:center}
  .foot{margin-top:26px;font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .foot a{color:#C9A227}
</style></head><body><div class="wrap">
  <div class="kick">GARY A.I. · DAILY ENGAGEMENT SHEET</div>
  <h1>${today}</h1>
  <p class="sub">${(rows ?? []).length} targets. Open, paste, send, check it off. Tweak any draft that doesn't feel like you. Never add a link.</p>
  ${items || `<div class="empty">Nothing on the sheet yet today.<br>Tap regenerate below once the morning picks are in.</div>`}
  <div class="foot"><a href="?token=${encodeURIComponent(token)}&generate=1&redirect=1">regenerate the sheet</a></div>
</div><script>
  document.querySelectorAll(".copy").forEach(function(b){b.addEventListener("click",function(){
    var t=document.getElementById("d-"+b.dataset.t).textContent;
    navigator.clipboard.writeText(t).then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy reply"},1500)});
  })});
  document.querySelectorAll(".done-c").forEach(function(c){
    var k="sheet-done-"+c.dataset.t;
    if(localStorage.getItem(k)){c.checked=true;c.closest(".item").classList.add("off")}
    c.addEventListener("change",function(){
      if(c.checked){localStorage.setItem(k,"1");c.closest(".item").classList.add("off")}
      else{localStorage.removeItem(k);c.closest(".item").classList.remove("off")}
    });
  });
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!SHEET_TOKEN || token !== SHEET_TOKEN) {
      return new Response("Not found", { status: 401 });
    }
    if (url.searchParams.get("generate") === "1") {
      const result = await generate(url.searchParams.get("dry_run") === "1");
      if (url.searchParams.get("redirect") === "1") {
        return new Response(null, { status: 303, headers: { Location: `${url.pathname}?token=${encodeURIComponent(token)}` } });
      }
      console.log(JSON.stringify(result).slice(0, 400));
      return Response.json(result);
    }
    return await view(token);
  } catch (e) {
    console.error(String(e));
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
