#!/usr/bin/env node
// POST A REEL to X and Instagram in one go (Oct 29 2026, the stat desk plan: "reels go on X too. Video does better
// than images there"). The mp4 goes up to the private social-media bucket under reels/; X gets it through
// post-tweet-media's chunked video upload, Instagram as a Reel from a one-hour signed URL. Each side is logged
// (social_post_log thread_format "reel", ig_post_log kind "reel") and a side that is already logged is skipped,
// so a re-run after a failure only retries what failed. Refreshes the Instagram token when it is a week old,
// which keeps it alive now that the daily image job (com.gary.ig-post) is off.
//
//   node post-reel.mjs <file.mp4> --caption "Instagram caption" [--x-text "X text"] [--only x|ig] [--dry-run]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const FILE = args.find((a) => a.endsWith(".mp4"));
const CAPTION = opt("--caption"), X_TEXT = opt("--x-text") ?? CAPTION, ONLY = opt("--only"), DRY = args.includes("--dry-run");
if (!FILE || !existsSync(FILE) || !CAPTION) {
  console.error('usage: node post-reel.mjs <file.mp4> --caption "..." [--x-text "..."] [--only x|ig] [--dry-run]');
  process.exit(2);
}

const env = {};
for (const line of readFileSync("/Users/adam.preda/Gary2.0/gary2.0/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const IG = "https://graph.instagram.com", IG_USER = "17841479739346540";
const STATE = path.join(os.homedir(), ".config", "gary", "ig-state.json");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const name = path.basename(FILE, ".mp4").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
const object = `reels/${today}-${name}.mp4`;
const log = (...a) => console.log(new Date().toISOString(), "[reel]", ...a);

async function rest(q, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${q.split("?")[0]} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function upload() {
  const r = await fetch(`${SB}/storage/v1/object/social-media/${object}`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "video/mp4", "x-upsert": "true" }, body: readFileSync(FILE),
  });
  if (!r.ok) throw new Error(`upload ${object}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function postX() {
  const key = `REEL ${object}`;
  if ((await rest(`social_post_log?select=id&post_date=eq.${today}&pick_text=eq.${encodeURIComponent(key)}&hook_tweet_id=not.is.null`)).length) return log("X: already posted");
  await rest(`social_post_log?post_date=eq.${today}&pick_text=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
  await rest("social_post_log", { method: "POST", body: JSON.stringify({ post_date: today, slot: "reel", pick_text: key, thread_format: "reel" }) });
  const r = await fetch(`${SB}/functions/v1/post-tweet-media`, { method: "POST", headers: H, body: JSON.stringify({ text: X_TEXT, video_path: object }) });
  const j = await r.json();
  if (!j.success || !j.tweetId) {
    await rest(`social_post_log?post_date=eq.${today}&pick_text=eq.${encodeURIComponent(key)}`, { method: "DELETE" });
    throw new Error(`X: ${JSON.stringify(j).slice(0, 300)}`);
  }
  await rest(`social_post_log?post_date=eq.${today}&pick_text=eq.${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({
    hook_tweet_id: j.tweetId, thread_url: `https://x.com/BetwithGary/status/${j.tweetId}`, posted_at: new Date().toISOString(), post_text: X_TEXT,
  }) });
  log(`X: https://x.com/BetwithGary/status/${j.tweetId}`);
}

const keychain = () => execFileSync("security", ["find-generic-password", "-s", "ig-betwithgary", "-a", "access_token", "-w"], { encoding: "utf8" }).trim();
async function igToken() {
  let t = keychain(), state = {};
  try { state = JSON.parse(readFileSync(STATE, "utf8")); } catch {}
  if (Date.now() - (state.refreshed || 0) > 7 * 86_400_000) {
    const r = await fetch(`${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${t}`).then((x) => x.json());
    if (r.access_token) {
      execFileSync("security", ["add-generic-password", "-U", "-s", "ig-betwithgary", "-a", "access_token", "-w", r.access_token]);
      t = r.access_token;
      mkdirSync(path.dirname(STATE), { recursive: true });
      writeFileSync(STATE, JSON.stringify({ refreshed: Date.now(), expires_in: r.expires_in }));
    } else log(`instagram token refresh failed: ${JSON.stringify(r).slice(0, 200)}`);
  }
  return t;
}
async function ig(method, p, params, tok) {
  const qs = new URLSearchParams({ ...params, access_token: tok });
  const r = await fetch(`${IG}/${p}${method === "GET" ? `?${qs}` : ""}`, method === "GET" ? {} : { method, body: qs });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`instagram ${p}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return j;
}

async function postIG() {
  const slot = `ig_reel_${name}`.slice(0, 80);
  if ((await rest(`ig_post_log?select=id&post_date=eq.${today}&slot=eq.${slot}&kind=eq.reel&media_id=not.is.null`)).length) return log("Instagram: already posted");
  await rest(`ig_post_log?post_date=eq.${today}&slot=eq.${slot}&kind=eq.reel`, { method: "DELETE" });
  await rest("ig_post_log", { method: "POST", body: JSON.stringify({ post_date: today, slot, kind: "reel", caption: CAPTION }) });
  try {
    const s = await fetch(`${SB}/storage/v1/object/sign/social-media/${object}`, { method: "POST", headers: H, body: JSON.stringify({ expiresIn: 3600 }) }).then((x) => x.json());
    if (!s.signedURL) throw new Error(`sign ${object}: ${JSON.stringify(s).slice(0, 200)}`);
    const tok = await igToken();
    const { id } = await ig("POST", `${IG_USER}/media`, { media_type: "REELS", video_url: `${SB}/storage/v1${s.signedURL}`, caption: CAPTION, share_to_feed: "true" }, tok);
    let status = "";
    for (let i = 0; i < 60 && status !== "FINISHED"; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      status = (await ig("GET", id, { fields: "status_code" }, tok)).status_code;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`reel container ${id} ${status}`);
    }
    if (status !== "FINISHED") throw new Error(`reel container ${id} still ${status} after 5 minutes`);
    const pub = await ig("POST", `${IG_USER}/media_publish`, { creation_id: id }, tok);
    const { permalink } = await ig("GET", pub.id, { fields: "permalink" }, tok);
    await rest(`ig_post_log?post_date=eq.${today}&slot=eq.${slot}&kind=eq.reel`, { method: "PATCH", body: JSON.stringify({ media_id: pub.id, permalink, posted_at: new Date().toISOString() }) });
    log(`Instagram: ${permalink}`);
  } catch (e) {
    await rest(`ig_post_log?post_date=eq.${today}&slot=eq.${slot}&kind=eq.reel`, { method: "PATCH", body: JSON.stringify({ error: String(e).slice(0, 500) }) });
    throw e;
  }
}

const mb = statSync(FILE).size / 1e6;
if (DRY) {
  console.log(`DRY RUN ${FILE} (${mb.toFixed(1)} MB) → ${object}\nX: ${X_TEXT}\nInstagram: ${CAPTION}`);
} else {
  await upload();
  log(`uploaded ${object} (${mb.toFixed(1)} MB)`);
  let failed = false;
  for (const [side, run] of [["x", postX], ["ig", postIG]]) {
    if (ONLY && ONLY !== side) continue;
    try { await run(); } catch (e) { failed = true; log(String(e)); }
  }
  if (failed) process.exit(1);
}
