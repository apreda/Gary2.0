#!/usr/bin/env node
// THE FREE PICK POSTERS for Instagram (Adam, Oct 9 2026: "great graphic or just overall art of the image is
// what is most important... the Gary logo in a corner so they know... just cool posts").
//
// Two looks, both drawn from the day's free pick (streak_picks) and Gary's first reason (winners_reasons):
//   print  a screen-printed gig poster in the picked club's inks, the line set huge over a halftone light
//   night  a painted stadium (OpenAI image model) in both clubs' colors, the pick set big in the sky
// The app's own breakdown card (ads/2026-10-01-pick-video) is the second slide; these are the first.
//
//   node poster.mjs [YYYY-MM-DD] [--only print|night] [--no-upload]
// Writes out/<date>/{print,night}.png and uploads social-media/free-pick/<date>-{print,night}.png.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { colors, luminance, shortName } from "./teams.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const IMAGE_MODEL = "gpt-image-2.5-sunburst";
const REELS = path.join(process.env.HOME || "/Users/adam.preda", "Desktop", "Gary Reels");

const env = {};
for (const line of readFileSync("/Users/adam.preda/Gary2.0/gary2.0/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const log = (...a) => console.log(new Date().toISOString(), "[poster]", ...a);
const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

async function rest(q) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`rest ${q}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ── the pick, in poster words ────────────────────────────────────────────────

// College mascots of two words, so "Missouri Tigers" → "Missouri" but "Cal Golden Bears" → "Cal".
const TWO_WORD_MASCOTS = ["Fighting Illini", "Crimson Tide", "Golden Bears", "Tar Heels", "Sun Devils", "Red Raiders",
  "Blue Devils", "Yellow Jackets", "Nittany Lions", "Golden Gophers", "Horned Frogs", "Demon Deacons", "Scarlet Knights",
  "Mean Green", "Green Wave", "Golden Hurricane", "Rainbow Warriors", "Black Knights", "Red Wolves", "Thundering Herd",
  "Golden Eagles", "Blue Raiders", "Golden Flashes", "Wolf Pack", "Fighting Irish", "Ragin' Cajuns", "Black Bears",
  "Golden Panthers", "Blue Hens", "Golden Knights", "Mountain Hawks"];

function clubName(name, league) {
  if (league === "NCAAF") {
    const two = TWO_WORD_MASCOTS.find((m) => name.endsWith(` ${m}`));
    if (two) return name.slice(0, -two.length - 1);
    const words = name.split(" ");
    return words.length > 1 ? words.slice(0, -1).join(" ") : name;
  }
  return shortName(name, league);
}

export function describe(sp) {
  const league = sp.league;
  const [away, home] = String(sp.matchup).split(" @ ").map((s) => s.trim());
  const text = String(sp.pick_text).replace(/\s+@?\s*[+-]\d{3,}$/, "").trim();   // drop the price
  let subject, big, small = "", picked = null;
  if (sp.kind === "prop" && sp.player) {
    const m = String(sp.prop || "").match(/^(.*?)\s*(\d+(?:\.\d+)?)$/);
    subject = sp.player;
    big = `${String(sp.bet || "").toLowerCase().startsWith("u") ? "Under" : "Over"} ${m ? m[2] : ""}`.trim();
    small = m ? m[1] : sp.prop || "";
  } else if (/ ML$/.test(text)) {
    picked = text.replace(/ ML$/, "");
    subject = clubName(picked, league);
    big = "ML";
    small = "to win";
  } else if (/^(.*)\b(Over|Under) (\d+(?:\.\d+)?)$/i.test(text)) {
    const m = text.match(/^(.*)\b(Over|Under) (\d+(?:\.\d+)?)$/i);
    subject = `${clubName(away, league)}-${clubName(home, league)}`;
    big = `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${m[3]}`;
    small = league === "MLB" ? "total runs" : "total points";
  } else {
    const m = text.match(/^(.*) ([+-]\d+(?:\.\d+)?)$/);
    picked = m ? m[1] : text;
    subject = clubName(picked, league);
    big = m ? m[2] : "";
  }
  // Which club is ours and which is the other side (for the inks and the painting).
  const ours = picked && (home.includes(picked) || picked.includes(clubName(home, league))) ? home : away;
  const theirs = ours === home ? away : home;
  const oursColors = picked ? colors(ours, league, 0) : colors("", league, 0);
  const theirColors = colors(theirs, league, 1);
  const start = new Date(sp.commence_time);
  const et = (o) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...o }).format(start);
  const hour = Number(et({ hour: "numeric", hour12: false }));
  return {
    league, subject, big, small,
    matchup: `${clubName(away, league)} at ${clubName(home, league)}`,
    when: `${et({ weekday: "long" })} ${et({ hour: "numeric", minute: "2-digit" })} ET`,
    night: hour >= 17 || hour < 4,
    ours: { name: clubName(ours, league), ...oursColors },
    theirs: { name: clubName(theirs, league), ...theirColors },
  };
}

const firstSentence = (s) => (String(s || "").match(/^.*?[.!?](?=\s|$)/) || [String(s || "")])[0].trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── shared page parts ────────────────────────────────────────────────────────

const url = (p) => pathToFileURL(path.join(HERE, p)).href;
const FONTS = `
@font-face { font-family: "Shoulders"; src: url(${url("fonts/BigShouldersDisplay-900.ttf")}); font-weight: 900; }
@font-face { font-family: "ShouldersText"; src: url(${url("fonts/BigShouldersText-700.ttf")}); font-weight: 700; }
@font-face { font-family: "ShouldersText"; src: url(${url("fonts/BigShouldersText-500.ttf")}); font-weight: 500; }
html, body { margin: 0; width: 1080px; height: 1350px; overflow: hidden; }`;
// Shrinks each [data-fit] element's type until it fits its max width (long club names, props).
const FIT = `<script>
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll("[data-fit]")) {
    const max = Number(el.dataset.fit); let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > max && size > 40) { size -= 4; el.style.fontSize = size + "px"; }
  }
  document.body.dataset.ready = "1";
});
</script>`;

// ── look 1: the screen print ─────────────────────────────────────────────────

function printPage(p, reason) {
  const stock = "#D7D6D1";
  const lineInk = luminance(p.ours.primary) > 0.55 ? p.ours.secondary : p.ours.primary;
  const dotInk = luminance(p.ours.primary) < 0.02 ? p.ours.secondary : p.ours.primary;
  const wordInk = luminance(p.ours.secondary) < 0.25 && p.ours.secondary !== lineInk ? p.ours.secondary : "#1E1E1E";
  const bandInk = luminance(p.theirs.primary) > 0.3 ? p.theirs.secondary : p.theirs.primary;
  const bigSize = p.big.length > 5 ? 330 : 560;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
:root { --stock: ${stock}; --line: ${lineInk}; --dots: ${dotInk}; --word: ${wordInk}; --band: ${bandInk}; }
body { background: var(--stock); }
.poster { position: relative; width: 1080px; height: 1350px; overflow: hidden; background: var(--stock); }
.poster::after { content: ""; position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: .55;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.ink { position: absolute; mix-blend-mode: multiply; }
.flood { left: 300px; top: 230px; width: 920px; height: 920px; border-radius: 50%;
  background-image: radial-gradient(circle, var(--dots) 46%, transparent 48%); background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.85) 30%, rgba(0,0,0,.25) 58%, transparent 70%); }
.band { left: 0; right: 0; bottom: 0; height: 350px; background-color: var(--band);
  background-image: repeating-linear-gradient(90deg, rgba(215,214,209,.10) 0 4px, transparent 4px 108px); }
.word { left: 54px; top: 118px; font: 900 300px/0.8 "Shoulders"; color: var(--word); letter-spacing: -4px; white-space: nowrap; }
.big { left: 40px; top: ${p.big.length > 5 ? 430 : 360}px; font: 900 ${bigSize}px/0.8 "Shoulders"; color: var(--line); letter-spacing: -10px; white-space: nowrap; }
.small { left: 60px; top: 920px; font: 700 54px/1 "ShouldersText"; color: var(--word); }
.top { position: absolute; left: 60px; right: 60px; top: 52px; display: flex; justify-content: space-between; align-items: center;
  font: 700 34px/1 "ShouldersText"; color: var(--word); }
.top img { width: 64px; height: 64px; border-radius: 15px; }
.foot { position: absolute; left: 60px; right: 60px; bottom: 56px; color: var(--stock); font: 500 36px/1.2 "ShouldersText"; }
.foot .when { font-weight: 700; font-size: 46px; margin-bottom: 16px; }
.foot p { margin: 0; max-width: 940px; }
.foot .tag { margin-top: 22px; font-weight: 700; font-size: 30px; opacity: .85; }
</style></head><body><div class="poster">
  <div class="ink flood"></div>
  <div class="ink band"></div>
  <div class="ink word" data-fit="970">${esc(p.subject)}</div>
  <div class="ink big" data-fit="1000">${esc(p.big)}</div>
  ${p.small ? `<div class="ink small">${esc(p.small)}</div>` : ""}
  <div class="top"><span>${esc(p.matchup)}</span><img src="${url("gary-icon.png")}" alt=""></div>
  <div class="foot">
    <div class="when">${esc(p.when)}</div>
    ${reason ? `<p>${esc(reason)}</p>` : ""}
    <div class="tag">Gary's free pick</div>
  </div>
</div>${FIT}</body></html>`;
}

// ── look 2: the night game ───────────────────────────────────────────────────

function paintingPrompt(p) {
  const venue = p.league === "MLB"
    ? "an empty baseball park seen from behind home plate, the infield dirt and outfield grass"
    : "an empty American football stadium seen from low on the turf near midfield";
  const light = p.night
    ? "at night, floodlights blazing through light rain and haze"
    : "in late afternoon, low golden sun and long shadows, a little haze";
  return `Cinematic painted poster illustration of ${venue}, ${light}. ` +
    `The left side of the stands is washed in ${p.ours.words} light, the right side in ${p.theirs.words} light. ` +
    `Painterly gouache texture with visible brush strokes, bold simplified shapes, dramatic. Vertical composition: ` +
    `the top 45 percent is calm dark sky for headline text, the stadium and field fill the lower half. ` +
    `No text, no letters, no numbers, no logos, no people.`;
}

async function painting(p, file) {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt: paintingPrompt(p), size: "1024x1536", quality: "high", n: 1 }),
  });
  const j = await r.json();
  if (!r.ok || !j.data?.[0]?.b64_json) throw new Error(`image ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(j.data[0].b64_json, "base64"));
}

function nightPage(p, reason, art) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
:root { --sky: #060E17; --chalk: #F1F1EC; --haze: #A9BCD0; }
body { background: var(--sky); }
.poster { position: relative; width: 1080px; height: 1350px; overflow: hidden; background: var(--sky); }
.art { position: absolute; inset: 0; background: url(${pathToFileURL(art).href}) center bottom / cover no-repeat; }
.shade { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(6,14,23,.7) 0%, rgba(6,14,23,.15) 45%, transparent 60%, rgba(6,14,23,.75) 100%); }
.top { position: absolute; left: 64px; right: 64px; top: 58px; display: flex; justify-content: space-between; align-items: center;
  font: 700 34px/1 "ShouldersText"; color: var(--haze); }
.top img { width: 60px; height: 60px; border-radius: 14px; }
.pick { position: absolute; left: 58px; top: 165px; color: var(--chalk); font: 900 270px/.82 "Shoulders"; letter-spacing: -3px; text-shadow: 0 6px 40px rgba(0,0,0,.5); }
.pick div { white-space: nowrap; }
.vs { position: absolute; left: 66px; top: 650px; font: 700 52px/1 "ShouldersText"; color: var(--haze); text-shadow: 0 2px 16px rgba(0,0,0,.8); }
.fact { position: absolute; left: 64px; right: 64px; bottom: 64px; color: var(--chalk); font: 500 38px/1.2 "ShouldersText"; text-shadow: 0 2px 18px rgba(0,0,0,.9); }
.fact b { display: block; font-weight: 700; font-size: 30px; color: var(--haze); margin-top: 18px; }
</style></head><body><div class="poster">
  <div class="art"></div><div class="shade"></div>
  <div class="top"><span>${esc(p.when)}</span><img src="${url("gary-icon.png")}" alt=""></div>
  <div class="pick"><div data-fit="960">${esc(p.subject)}</div><div data-fit="960">${esc(p.big)}</div></div>
  <div class="vs">${esc(p.small ? `${p.small}, ${p.matchup}` : p.matchup)}</div>
  <div class="fact">${reason ? esc(reason) : ""}<b>Gary's free pick</b></div>
</div>${FIT}</body></html>`;
}

// ── render and ship ──────────────────────────────────────────────────────────

function render(html, dir, name) {
  const page = path.join(dir, `${name}.html`), png = path.join(dir, `${name}.png`);
  writeFileSync(page, html);
  const r = spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1080,1350", "--allow-file-access-from-files", "--virtual-time-budget=4000",
    `--screenshot=${png}`, pathToFileURL(page).href], { encoding: "utf8", timeout: 60_000 });
  if (!existsSync(png)) throw new Error(`chrome did not render ${name}: ${(r.stderr || "").slice(-300)}`);
  return png;
}

async function upload(file, object) {
  const up = await fetch(`${SB}/storage/v1/object/social-media/${object}`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: readFileSync(file),
  });
  if (!up.ok) throw new Error(`storage upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
}

export async function makePosters(day, { only = null, ship = true } = {}) {
  const [sp] = await rest(`streak_picks?game_date=eq.${day}&select=*`);
  if (!sp) throw new Error(`no free pick for ${day}`);
  const [wr] = await rest(`winners_reasons?candidate_id=eq.${sp.candidate_id}&select=reasons`);
  const top = wr?.reasons?.[0];
  const reason = top ? `${top.claim}. ${firstSentence(top.why)}` : "";
  const p = describe(sp);
  const dir = path.join(HERE, "out", day);
  mkdirSync(dir, { recursive: true });
  const made = {};
  if (!only || only === "print") made.print = render(printPage(p, reason), dir, "print");
  if (!only || only === "night") {
    const art = path.join(dir, `night-art-${sp.candidate_id}.png`);   // a new pick gets new art
    if (!existsSync(art)) await painting(p, art);
    made.night = render(nightPage(p, reason, art), dir, "night");
  }
  if (ship) for (const [k, f] of Object.entries(made)) {
    await upload(f, `free-pick/${day}-${k}.png`);
    try { copyFileSync(f, path.join(REELS, `free-pick-${day}-${k}.png`)); } catch {}   // Adam's copy
  }
  log(`${day}: ${sp.pick_text} → ${Object.keys(made).join(", ")}${ship ? " (uploaded)" : ""}`);
  return made;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || etDate();
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  makePosters(day, { only, ship: !args.includes("--no-upload") })
    .catch((e) => { log(`FAILED ${day}: ${e.message}`); process.exitCode = 1; });
}
