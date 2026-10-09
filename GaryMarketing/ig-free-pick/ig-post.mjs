#!/usr/bin/env node
// INSTAGRAM AUTO-POST for @betwithgary.ai (founder GO, Oct 9 2026: "set it up so you can post on instagram with
// these ... rotate each day ... today we do one post, tomorrow we do one NCAAF and one MLB game pick post").
//
// launchd (com.gary.ig-post) runs this every 5 minutes. Each run:
//   1. plans the day: the free pick (streak_picks); on Saturdays a college post and an MLB post instead, each the
//      free pick when it is in that league, else the rule pick fixed before the games (Adam's yes, Oct 9):
//        college = the college game Gary put the most money on in Winners (winners_board, largest stake)
//        MLB     = Gary's pick on the day's earliest MLB game
//   2. makes the posters (poster.mjs) for a rule pick; the free pick's come from the card job (run.mjs);
//   3. posts each planned pick once, from 10 AM ET until 15 minutes before its start:
//        feed  = the poster (styleFor: football rotates night/print by day, MLB is the print), and for the free
//                pick a second slide with the app's breakdown card (two reasons) when the card job has made it;
//        story = the free pick's app card with three reasons.
//   Caption (approved Oct 9): "Gary's free pick for tonight." / "The full breakdown is free in the app." / the
//   league tag; a rule pick reads "Gary's pick for tonight."; "today" for a start before 5 PM ET.
// Nothing to do → exits at once. ig_post_log claims each post before the send; a failed send deletes the claim
// and records the error in the log file. The token (Instagram Login, long-lived) lives in the Keychain
// (service ig-betwithgary) and is refreshed every 7 days.
//
//   node ig-post.mjs [--dry-run] [--date YYYY-MM-DD]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makePosters, styleFor } from "./poster.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IG = "https://graph.instagram.com";
const IG_USER = "17841479739346540";   // @betwithgary.ai
const STATE = path.join(os.homedir(), ".config", "gary", "ig-state.json");
const OPEN_HOUR_ET = 10;
const LAST_LEAD_MIN = 15;
const CARD_WAIT_LEAD_MIN = 60;   // the free pick waits for its app card until an hour before the start
const TAGS = { NFL: "#NFL", MLB: "#MLB", NCAAF: "#CollegeFootball" };

const env = {};
for (const line of readFileSync("/Users/adam.preda/Gary2.0/gary2.0/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const log = (...a) => console.log(new Date().toISOString(), "[ig]", ...a);
const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const etPart = (d, o) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...o }).format(d);

async function rest(q, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`rest ${q.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 || init.method === "DELETE" ? null : r.json();
}

// ── the token ────────────────────────────────────────────────────────────────

const keychain = (account) => execFileSync("security",
  ["find-generic-password", "-s", "ig-betwithgary", "-a", account, "-w"], { encoding: "utf8" }).trim();

async function token() {
  let t = keychain("access_token");
  let state = {};
  try { state = JSON.parse(readFileSync(STATE, "utf8")); } catch {}
  if (!DRY && Date.now() - (state.refreshed || 0) > 7 * 86_400_000) {
    const r = await fetch(`${IG}/refresh_access_token?grant_type=ig_refresh_token&access_token=${t}`).then((x) => x.json());
    if (r.access_token) {
      execFileSync("security", ["add-generic-password", "-U", "-s", "ig-betwithgary", "-a", "access_token", "-w", r.access_token]);
      t = r.access_token;
      mkdirSync(path.dirname(STATE), { recursive: true });
      writeFileSync(STATE, JSON.stringify({ refreshed: Date.now(), expires_in: r.expires_in }));
      log(`token refreshed (expires in ${Math.round((r.expires_in || 0) / 86400)} days)`);
    } else log(`token refresh failed: ${JSON.stringify(r).slice(0, 200)}`);
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

/** A container, waited on until Instagram has fetched and processed the image. */
async function container(params, tok) {
  const { id } = await ig("POST", `${IG_USER}/media`, params, tok);
  for (let i = 0; i < 20; i++) {
    const { status_code } = await ig("GET", id, { fields: "status_code" }, tok);
    if (status_code === "FINISHED") return id;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`container ${id} ${status_code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`container ${id} never finished`);
}

async function publish(creationId, tok) {
  const { id } = await ig("POST", `${IG_USER}/media_publish`, { creation_id: creationId }, tok);
  const { permalink } = await ig("GET", id, { fields: "permalink" }, tok);
  return { id, permalink };
}

// ── images: Instagram takes JPEG from a public URL ──────────────────────────

async function download(object, file) {
  const r = await fetch(`${SB}/storage/v1/object/social-media/${object}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) return false;
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return true;
}

/** PNG → JPEG, uploaded to ig/<object>.jpg, returned as a one-hour signed URL. */
async function jpegUrl(png, object) {
  const jpg = png.replace(/\.png$/, ".jpg");
  const r = spawnSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", png, "--out", jpg], { encoding: "utf8" });
  if (!existsSync(jpg)) throw new Error(`jpeg convert failed: ${r.stderr}`);
  const up = await fetch(`${SB}/storage/v1/object/social-media/ig/${object}.jpg`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: readFileSync(jpg),
  });
  if (!up.ok) throw new Error(`upload ig/${object}.jpg ${up.status}`);
  const s = await fetch(`${SB}/storage/v1/object/sign/social-media/ig/${object}.jpg`, {
    method: "POST", headers: H, body: JSON.stringify({ expiresIn: 3600 }),
  }).then((x) => x.json());
  if (!s.signedURL) throw new Error(`sign ig/${object}.jpg: ${JSON.stringify(s).slice(0, 200)}`);
  return `${SB}/storage/v1${s.signedURL}`;
}

// ── the day's plan ───────────────────────────────────────────────────────────

async function rulePick(day, league) {
  if (league === "NCAAF") {
    const [b] = await rest(`winners_board?game_date=eq.${day}&league=eq.NCAAF&kind=eq.game&scratched_at=is.null` +
      `&select=candidate_id&order=stake_units.desc&limit=1`);
    if (!b) return null;
    const [c] = await rest(`winners_candidates?id=eq.${b.candidate_id}&select=id,league,commence_time`);
    return c || null;
  }
  const [c] = await rest(`winners_candidates?game_date=eq.${day}&league=eq.${league}&kind=eq.game` +
    `&select=id,league,commence_time&order=commence_time.asc&limit=1`);
  return c || null;
}

async function plan(day) {
  const [fp] = await rest(`streak_picks?game_date=eq.${day}&select=candidate_id,league,commence_time,pick_text`);
  const free = fp && { slot: "ig_free_pick", free: true, candidate: null, league: fp.league, start: fp.commence_time };
  const saturday = etPart(new Date(`${day}T16:00:00Z`), { weekday: "short" }) === "Sat";
  if (!saturday) return free ? [free] : [];
  const posts = [];
  for (const league of ["NCAAF", "MLB"]) {
    const slot = `ig_${league.toLowerCase()}`;
    if (fp?.league === league) { posts.push({ ...free, slot }); continue; }
    const c = await rulePick(day, league);
    if (c) posts.push({ slot, free: false, candidate: c.id, league, start: c.commence_time });
  }
  if (free && !["NCAAF", "MLB"].includes(free.league)) posts.push(free);
  return posts;
}

function caption(post) {
  const when = Number(etPart(new Date(post.start), { hour: "numeric", hour12: false })) >= 17 ? "tonight" : "today";
  const head = post.free ? `Gary's free pick for ${when}.` : `Gary's pick for ${when}.`;
  return `${head}\n\nThe full breakdown is free in the app.\n\n${TAGS[post.league] || ""}`.trim();
}

// ── one post ─────────────────────────────────────────────────────────────────

async function claim(row) {
  const r = await fetch(`${SB}/rest/v1/ig_post_log`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(row),
  });
  return r.ok;   // a unique-key conflict means another run has it
}
const finish = (day, slot, kind, patch) => rest(`ig_post_log?post_date=eq.${day}&slot=eq.${slot}&kind=eq.${kind}`,
  { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=minimal" } });
const release = (day, slot, kind) => rest(`ig_post_log?post_date=eq.${day}&slot=eq.${slot}&kind=eq.${kind}`, { method: "DELETE" });

async function done(day, slot, kind) {
  const rows = await rest(`ig_post_log?post_date=eq.${day}&slot=eq.${slot}&kind=eq.${kind}&select=id`);
  return rows.length > 0;
}

async function runPost(day, post, now) {
  const leadMin = (Date.parse(post.start) - now) / 60_000;
  if (leadMin < LAST_LEAD_MIN) return;
  const dir = path.join(HERE, "out", day);
  mkdirSync(dir, { recursive: true });
  const style = styleFor(post.league, day);
  const tag = post.candidate ? `${post.candidate}-` : "";
  const poster = path.join(dir, `${tag}${style}.png`);

  if (!(await done(day, post.slot, "feed"))) {
    if (!existsSync(poster)) {
      if (post.free) { log(`${post.slot}: waiting for the card job's posters`); return; }
      await makePosters(day, { candidate: post.candidate });
    }
    const slides = [poster];
    if (post.free) {
      const card = path.join(dir, "app-card.png");
      if (await download(`free-pick/${day}.png`, card)) slides.push(card);
      else if (leadMin > CARD_WAIT_LEAD_MIN) { log(`${post.slot}: waiting for the app card`); return; }
    }
    const text = caption(post);
    if (DRY) { log(`DRY ${post.slot} feed: ${slides.map((s) => path.basename(s)).join(" + ")} | ${JSON.stringify(text)}`); }
    else if (await claim({ post_date: day, slot: post.slot, kind: "feed", candidate_id: post.candidate, league: post.league, style, caption: text })) {
      try {
        const tok = await token();
        const urls = [];
        for (const [i, s] of slides.entries()) urls.push(await jpegUrl(s, `${day}-${post.slot}-${i}`));
        let creation;
        if (urls.length === 1) creation = await container({ image_url: urls[0], caption: text }, tok);
        else {
          const children = [];
          for (const u of urls) children.push(await container({ image_url: u, is_carousel_item: "true" }, tok));
          creation = await container({ media_type: "CAROUSEL", children: children.join(","), caption: text }, tok);
        }
        const { id, permalink } = await publish(creation, tok);
        await finish(day, post.slot, "feed", { media_id: id, permalink, posted_at: new Date().toISOString() });
        log(`${post.slot} feed posted: ${permalink}`);
      } catch (e) {
        await release(day, post.slot, "feed");
        log(`${post.slot} feed FAILED: ${e.message}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  // The free pick's story: the app card with three reasons.
  if (post.free && !(await done(day, post.slot, "story"))) {
    const story = path.join(dir, "app-card-story.png");
    if (!(await download(`free-pick/${day}-story.png`, story))) return;
    if (DRY) { log(`DRY ${post.slot} story: app-card-story.png`); return; }
    if (!(await claim({ post_date: day, slot: post.slot, kind: "story", league: post.league }))) return;
    try {
      const tok = await token();
      const url = await jpegUrl(story, `${day}-${post.slot}-story`);
      const { id, permalink } = await publish(await container({ media_type: "STORIES", image_url: url }, tok), tok);
      await finish(day, post.slot, "story", { media_id: id, permalink, posted_at: new Date().toISOString() });
      log(`${post.slot} story posted`);
    } catch (e) {
      await release(day, post.slot, "story");
      log(`${post.slot} story FAILED: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  const now = Date.now();
  const day = args.includes("--date") ? args[args.indexOf("--date") + 1] : etDate();
  if (!DRY && Number(etPart(new Date(now), { hour: "numeric", hour12: false })) < OPEN_HOUR_ET) return;
  const posts = await plan(day);
  if (DRY) log(`plan ${day}: ${JSON.stringify(posts)}`);
  for (const post of posts) await runPost(day, post, DRY ? Date.parse(post.start) - 3 * 3600_000 : now);
}

main().catch((e) => { log(`run failed: ${e.message}`); process.exitCode = 1; });
