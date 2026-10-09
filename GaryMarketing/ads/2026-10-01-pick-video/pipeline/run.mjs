#!/usr/bin/env node
// THE FREE PICK CARD, every day (founder, Oct 2 2026: "post it as the product, not as text"; the video it
// replaced ran Oct 1-2).
//
// launchd (com.gary.free-pick-video) runs this every 2 minutes. When today's free pick (streak_picks) exists,
// has no card yet and its game is at least 35 minutes away, it:
//   1. records the app's own Winners unveil of that pick on the marketing simulator ("Gary CMO"), then
//      screenshots the breakdown, scrolling until the page stops moving;
//   2. measures the recording and the page (analyze.py);
//   3. draws the square card (card.py): the Gary A.I. header over the app's real breakdown screen, cropped
//      to the pick card and Gary's top reason;
//   4. uploads it to storage (social-media/free-pick/<date>.png) and marks free_pick_videos ready (or
//      'review' while config.json has autoPost false). Since Oct 4 2026 the X free pick posts as text only
//      and social-auto-post no longer reads this row; the card is for Instagram.
// Nothing to do → exits at once. Any failure marks the day 'failed'. One retry after a crash (a 'rendering'
// row older than 20 minutes). A copy of each card lands in ~/Desktop/Gary Reels for Adam.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, "..");
const WORK = path.join(PROJECT, "pipeline", "work");
const UDID = "AC0B9D9D-7E65-43DA-926A-262980E6DF63";          // "Gary CMO", iPhone 17 Pro Max, marketing only
const APP = "ai.betwithgary.app";
const REELS = path.join(process.env.HOME || "/Users/adam.preda", "Desktop", "Gary Reels");
const MIN_LEAD_MIN = 35;
const config = JSON.parse(readFileSync(path.join(HERE, "config.json"), "utf8"));

// ── env (the pick daemon's .env) ──────────────────────────────────────────────
const env = {};
for (const line of readFileSync("/Users/adam.preda/Gary2.0/gary2.0/.env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error("missing Supabase env"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

async function rest(pathq, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${pathq}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`REST ${pathq} ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const setVideo = (row) => rest("free_pick_videos?on_conflict=game_date", {
  method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
});

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed (${r.status}): ${(r.stderr || r.stdout || "").slice(-600)}`);
  return r.stdout;
}
const tour = (verb) => {
  const cont = run("xcrun", ["simctl", "get_app_container", UDID, APP, "data"]).trim();
  mkdirSync(path.join(cont, "tmp"), { recursive: true });
  writeFileSync(path.join(cont, "tmp", "gary-tour.txt"), verb + "\n");
  run("xcrun", ["simctl", "spawn", UDID, "notifyutil", "-p", "com.gary.tour"]);
};
const shot = (file) => run("xcrun", ["simctl", "io", UDID, "screenshot", file]);
const digest = (file) => createHash("sha1").update(readFileSync(file)).digest("hex");

// --test <YYYY-MM-DD> <candidate_id>: run the whole chain on a past day's pick (Winners reads that day), upload to
// free-pick/test-<date>.mp4, and leave free_pick_videos alone. Nothing posts.
const TEST = process.argv[2] === "--test" ? { day: process.argv[3], candidate: Number(process.argv[4]) } : null;

async function capture(candidateId) {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  spawnSync("xcrun", ["simctl", "boot", UDID]);
  run("xcrun", ["simctl", "bootstatus", UDID, "-b"]);
  spawnSync("xcrun", ["simctl", "status_bar", UDID, "override", "--time", "9:41", "--batteryState", "charged",
    "--batteryLevel", "100", "--cellularBars", "4", "--wifiBars", "3"]);
  spawnSync("xcrun", ["simctl", "terminate", UDID, APP]);
  run("xcrun", ["simctl", "launch", UDID, APP, "-tour.noPrompts", "YES"]);
  await sleep(7000);
  tour(TEST ? `lab day ${TEST.day}` : "lab day off");   // the live board (a past day only in a test)
  await sleep(1500);
  tour("tab 1");                             // Winners
  await sleep(6000);
  tour("lab reseal");                        // every pack sealed again
  await sleep(1500);
  const rec = path.join(WORK, "unveil.mp4");
  const recorder = spawn("xcrun", ["simctl", "io", UDID, "recordVideo", "--codec=h264", "--force", rec], { stdio: "ignore" });
  await sleep(1500);
  tour(`lab unveil ${candidateId}`);
  await sleep(14500);
  recorder.kill("SIGINT");
  await new Promise((r) => recorder.on("exit", r));
  await sleep(1200);
  const pages = [path.join(WORK, "page_00.png")];
  shot(pages[0]);
  for (let k = 1; k <= 8; k++) {
    tour("scroll 300");
    await sleep(1400);
    const f = path.join(WORK, `page_${String(k).padStart(2, "0")}.png`);
    shot(f);
    if (digest(f) === digest(pages[pages.length - 1])) break;   // the page stopped moving
    pages.push(f);
  }
  tour("lab close");
  if (!existsSync(rec)) throw new Error("no recording");
  // A still screen records as a few frames: the pack never opened. The free pick is on every viewer's board
  // (get_winners_board returns it to non-members); any other play is members-only, and this simulator's
  // account is not a member, so it shows "COMING SOON" (found in the Oct 1 dress rehearsal). Say so instead
  // of rendering nothing.
  const dur = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", rec]).trim());
  if (!(dur > 8)) throw new Error(`the unveil did not play (recording ${dur.toFixed(2)} s): candidate ${candidateId} not openable on the board`);
  return { rec, pages };
}

async function testRun() {
  const { rec, pages } = await capture(TEST.candidate);
  const out = await makeCard(rec, pages, `test-${TEST.day}`, TEST.day);
  log(`test card: ${out.objectPath} (${out.reasons} reasons) → ${out.final}`);
}

/** "FRI OCT 2" for a YYYY-MM-DD day. */
const dayLabel = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
  .replace(",", "").toUpperCase();

/** Measure the captures, draw the card, upload it. */
async function makeCard(rec, pages, name, day) {
  const propsFile = path.join(WORK, "measured.json"), pageFile = path.join(WORK, "page.png");
  log(run("python3", [path.join(HERE, "analyze.py"), rec, ...pages, "--out", propsFile, "--page-out", pageFile]).trim());
  // Oct 9 2026: the Instagram feed post (4:5, two reasons) and its story (9:16, three reasons).
  const final = path.join(WORK, `free-pick-${name}.png`);
  const story = path.join(WORK, `free-pick-${name}-story.png`);
  log(run("python3", [path.join(HERE, "card.py"), pageFile, propsFile, final, "--date", dayLabel(day), "--format", "feed"]).trim());
  log(run("python3", [path.join(HERE, "card.py"), pageFile, propsFile, story, "--date", dayLabel(day), "--format", "story"]).trim());
  const objectPath = `free-pick/${name}.png`;
  for (const [file, object] of [[final, objectPath], [story, `free-pick/${name}-story.png`]]) {
    const up = await fetch(`${SB}/storage/v1/object/social-media/${object}`, {
      method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
      body: readFileSync(file),
    });
    if (!up.ok) throw new Error(`storage upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
    try { mkdirSync(REELS, { recursive: true }); copyFileSync(file, path.join(REELS, path.basename(file))); } catch {}
  }
  const m = JSON.parse(readFileSync(propsFile, "utf8"));
  return { objectPath, final, reasons: m.page.reasonTops.length };
}

// --rerender <YYYY-MM-DD>: draw that day's card again from the captures already in work/ (after a card or
// analysis fix), upload it over the day's file and put it back in review. Nothing is recorded.
const RERENDER = process.argv[2] === "--rerender" ? process.argv[3] : null;

async function main() {
  if (TEST) return testRun();
  if (RERENDER) {
    const pages = readdirSync(WORK).filter((f) => /^page_\d+\.png$/.test(f)).sort().map((f) => path.join(WORK, f));
    const out = await makeCard(path.join(WORK, "unveil.mp4"), pages, RERENDER, RERENDER);
    const [row] = await rest(`free_pick_videos?game_date=eq.${RERENDER}&select=candidate_id,detail`);
    await setVideo({ game_date: RERENDER, candidate_id: row.candidate_id, status: "review", storage_path: out.objectPath,
      detail: { ...(row.detail || {}), reasons: out.reasons, rerendered: new Date().toISOString() } });
    log(`card redrawn ${out.objectPath} (${out.reasons} reasons), back in review`);
    return;
  }
  const today = etDate();
  const [sp] = await rest(`streak_picks?game_date=eq.${today}&select=candidate_id,commence_time,pick_text,matchup`);
  if (!sp) return;
  const [v] = await rest(`free_pick_videos?game_date=eq.${today}&select=status,candidate_id,updated_at,detail`);
  const attempts = Number(v?.detail?.attempts || 0);
  if (v && Number(v.candidate_id) === Number(sp.candidate_id)) {
    if (["ready", "review"].includes(v.status)) return;
    if (v.status === "failed" && attempts >= 2) return;
    if (v.status === "rendering" && Date.now() - Date.parse(v.updated_at) < 20 * 60_000) return;
  }
  const leadMin = (Date.parse(sp.commence_time) - Date.now()) / 60_000;
  if (leadMin < MIN_LEAD_MIN) { log(`free pick starts in ${Math.round(leadMin)} min; too late for a card`); return; }
  log(`free pick ${today}: ${sp.pick_text} (${sp.matchup}), candidate ${sp.candidate_id}, ${Math.round(leadMin)} min to start`);
  await setVideo({ game_date: today, candidate_id: sp.candidate_id, status: "rendering", storage_path: null,
    detail: { attempts: attempts + 1, started: new Date().toISOString() } });
  try {
    const { rec, pages } = await capture(sp.candidate_id);
    const { objectPath, reasons } = await makeCard(rec, pages, today, today);
    const status = config.autoPost ? "ready" : "review";
    await setVideo({ game_date: today, candidate_id: sp.candidate_id, status, storage_path: objectPath,
      detail: { attempts: attempts + 1, reasons, pick: sp.pick_text, finished: new Date().toISOString() } });
    log(`card ${status}: ${objectPath} (${reasons} reasons)`);
  } catch (e) {
    log(`FAILED: ${e.message}`);
    await setVideo({ game_date: today, candidate_id: sp.candidate_id, status: "failed", storage_path: null,
      detail: { attempts: attempts + 1, error: String(e.message).slice(0, 800), failed: new Date().toISOString() } });
    process.exitCode = 1;
  }
}

main().catch((e) => { log(`run failed: ${e.message}`); process.exitCode = 1; });
