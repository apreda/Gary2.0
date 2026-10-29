#!/usr/bin/env node
// THE WEEKLY RANKINGS CARD for @BetwithGary (founder GO, Oct 29 2026: the stat desk's "weekly Gary rankings on a
// designed card in team colors"). Every team in a league by point differential per game, from the final scores in
// team_games, drawn as one card and posted to X with the top three in the text. Template only: every number on
// the card and in the post is the scores' arithmetic.
//
// launchd (com.gary.stat-rankings) runs this Tuesdays 11:00 ET (NFL, after Monday Night Football) and Mondays
// 11:00 ET (NBA, once every team has played 10 games). A run that finds nothing to do exits at once; a week posts
// once (social_post_log claim, thread_format "stat").
//
//   node rankings.mjs [--league NFL|NBA] [--dry-run] [--force]     (no --league: both, each on its own day)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { colors, nickname } from "../ig-free-pick/teams.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2);
const ASKED = (args.includes("--league") ? args[args.indexOf("--league") + 1] : "ALL").toUpperCase();
const DRY = args.includes("--dry-run"), FORCE = args.includes("--force");

const env = {};
for (const line of readFileSync("/Users/adam.preda/Gary2.0/gary2.0/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const SB = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function rest(q, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${q.split("?")[0]} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const etDay = (d = new Date()) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
const fmt = (v) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Every team's record and point differential per game from final regular-season scores. */
export function standings(games) {
  const t = new Map();
  const team = (name) => t.get(name) ?? t.set(name, { name, g: 0, w: 0, l: 0, tie: 0, pf: 0, pa: 0 }).get(name);
  for (const x of games) {
    if (x.home_score == null || x.away_score == null) continue;
    for (const [name, own, opp] of [[x.home_team, x.home_score, x.away_score], [x.away_team, x.away_score, x.home_score]]) {
      const s = team(name);
      s.g++; s.pf += own; s.pa += opp;
      if (own > opp) s.w++; else if (own < opp) s.l++; else s.tie++;
    }
  }
  return [...t.values()].map((s) => ({ ...s, diff: (s.pf - s.pa) / s.g }))
    .sort((a, b) => b.diff - a.diff || (b.w / b.g) - (a.w / a.g));
}

function card(rows, label, LEAGUE) {
  const font = (f) => pathToFileURL(path.join(HERE, "fonts", f)).href;
  const max = Math.max(...rows.map((r) => Math.abs(r.diff)), 1);
  const half = Math.ceil(rows.length / 2);
  const rowH = Math.min(58, Math.floor(928 / half));
  const row = (r, i) => {
    const c = colors(r.name, LEAGUE).primary;
    const w = Math.max(2, Math.round((Math.abs(r.diff) / max) * 30));
    const rec = `${r.w}-${r.l}${r.tie ? `-${r.tie}` : ""}`;
    return `<div class="row" style="height:${rowH}px">
      <span class="rank">${i + 1}</span><span class="chip" style="background:${c}"></span>
      <span class="name">${esc(nickname(r.name, LEAGUE))}</span><span class="rec">${rec}</span>
      <span class="bar"><i class="${r.diff >= 0 ? "pos" : "neg"}" style="width:${w}px"></i></span>
      <span class="val ${r.diff >= 0 ? "" : "down"}">${fmt(r.diff).replace("-", "&minus;")}</span></div>`;
  };
  const col = (list, offset) => `<div class="col">${list.map((r, i) => row(r, i + offset)).join("")}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Bebas"; src: url(${font("BebasNeue-Regular.ttf")}); }
@font-face { font-family: "Inter"; src: url(${font("InterTight.ttf")}); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1080px; height: 1350px; background: #0B0A08; color: #F2EDE4; font-family: "Inter"; overflow: hidden;
  background-image: radial-gradient(900px 520px at 50% -120px, rgba(201,162,39,.24), rgba(201,162,39,0) 70%); }
header { padding: 60px 64px 0; position: relative; }
.label { font-weight: 600; font-size: 22px; letter-spacing: .22em; color: #C9A227; text-transform: uppercase; }
h1 { font-family: "Bebas"; font-weight: 400; font-size: 106px; line-height: .86; margin-top: 18px; }
h1 b { font-weight: 400; display: block; background: linear-gradient(180deg, #F0CD62, #C9A227); -webkit-background-clip: text; color: transparent; }
.icon { position: absolute; top: 56px; right: 64px; width: 88px; height: 88px; border-radius: 22px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 44px; padding: 28px 64px 0; }
.row { display: grid; grid-template-columns: 38px 6px minmax(0, 1fr) 58px 72px 66px; align-items: center; column-gap: 10px;
  border-bottom: 1px solid rgba(242,237,228,.08); }
.rank { font-family: "Bebas"; font-size: 30px; color: #7E776C; text-align: right; }
.chip { width: 6px; height: 30px; border-radius: 3px; box-shadow: 0 0 0 1px rgba(242,237,228,.22); }
.name { font-weight: 650; font-size: 24px; white-space: nowrap; }
.rec { font-weight: 500; font-size: 19px; color: #9C958A; font-variant-numeric: tabular-nums; text-align: right; }
.bar { position: relative; height: 12px; }
.bar::before { content: ""; position: absolute; left: 50%; top: -6px; bottom: -6px; width: 1px; background: rgba(242,237,228,.18); }
.bar i { position: absolute; top: 0; height: 12px; border-radius: 2px; }
.bar i.pos { left: 50%; background: linear-gradient(90deg, #C9A227, #F0CD62); }
.bar i.neg { right: 50%; background: #5E5850; }
.val { font-weight: 700; font-size: 24px; text-align: right; font-variant-numeric: tabular-nums; }
.val.down { color: #A39C90; }
footer { position: absolute; left: 64px; right: 64px; bottom: 40px; display: flex; justify-content: space-between;
  font-size: 19px; color: #8A8378; }
footer b { color: #C9A227; font-weight: 600; letter-spacing: .04em; }
</style></head><body>
<header><div class="label">${esc(label)}</div><h1>Point differential<b>per game</b></h1>
<img class="icon" src="${pathToFileURL(path.join(HERE, "gary-icon.png")).href}"></header>
<div class="grid">${col(rows.slice(0, half), 0)}${col(rows.slice(half), half)}</div>
<footer><span>Points scored minus points allowed, per game. Regular season.</span><b>betwithgary.ai</b></footer>
</body></html>`;
}

function render(html, name) {
  const dir = path.join(HERE, "out");
  mkdirSync(dir, { recursive: true });
  const page = path.join(dir, `${name}.html`), png = path.join(dir, `${name}.png`);
  writeFileSync(page, html);
  spawnSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1080,1350", "--allow-file-access-from-files", "--virtual-time-budget=4000",
    `--screenshot=${png}`, pathToFileURL(page).href], { encoding: "utf8", timeout: 60_000 });
  if (!existsSync(png)) throw new Error(`chrome did not render ${name}`);
  return png;
}

async function main(LEAGUE) {
  const today = etDate();
  const day = { NFL: "Tue", NBA: "Mon" }[LEAGUE];
  if (!day) throw new Error(`no rankings card for ${LEAGUE}`);
  if (!FORCE && etDay() !== day) return console.log(`${today} ${LEAGUE}: rankings post on ${day}`);
  const season = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
  const games = await rest(`team_games?select=game_id,game_date,home_team,away_team,home_score,away_score&league=eq.${LEAGUE}&season=eq.${season}&game_type=eq.REG&game_date=lt.${today}`);
  const final = games.filter((g) => g.home_score != null && g.away_score != null);
  const rows = standings(final);
  const fewest = Math.min(...rows.map((r) => r.g));
  const week = LEAGUE === "NFL" ? Math.max(...final.map((g) => Number(String(g.game_id).split("_")[1]) || 0)) : null;
  const expected = { NFL: 32, NBA: 30 }[LEAGUE];
  if (rows.length !== expected) return console.log(`${today} ${LEAGUE}: ${rows.length} teams in the scores, expected ${expected}; not posting`);
  if (!FORCE && LEAGUE === "NFL" && week < 3) return console.log(`${today} NFL: week ${week}, too early`);
  if (!FORCE && LEAGUE === "NBA" && fewest < 10) return console.log(`${today} NBA: a team has played ${fewest} games, waiting for 10`);

  const through = LEAGUE === "NFL" ? `Week ${week}` : new Date(`${final.map((g) => g.game_date).sort().pop()}T12:00:00Z`)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const claimKey = `STAT RANKINGS ${LEAGUE} ${LEAGUE === "NFL" ? `W${week}` : today}`;
  const done = await rest(`social_post_log?select=id&pick_text=eq.${encodeURIComponent(claimKey)}&limit=1`);
  if (done.length && !DRY) return console.log(`${today} ${LEAGUE}: ${claimKey} already posted`);

  const png = render(card(rows, `${LEAGUE} · through ${through}`, LEAGUE), `${LEAGUE.toLowerCase()}-${today}`);
  const top = rows.slice(0, 3).map((r, i) => `${i + 1}. ${nickname(r.name, LEAGUE)} ${fmt(r.diff)}`).join("\n");
  const text = `${LEAGUE} point differential per game, through ${through}:\n\n${top}\n\nAll ${rows.length} teams below.`;
  if (DRY) return console.log(`DRY RUN\n${text}\n${png}`);

  await rest("social_post_log", { method: "POST", body: JSON.stringify({
    post_date: today, slot: "stat_rankings", league: LEAGUE, pick_text: claimKey, thread_format: "stat",
    audience_selection: { source: "rankings", league: LEAGUE, through, headline: claimKey },
  }) });
  try {
    const r = await fetch(`${SB}/functions/v1/post-tweet-media`, { method: "POST", headers: H,
      body: JSON.stringify({ text, images_base64: [readFileSync(png).toString("base64")] }) });
    const j = await r.json();
    if (!j.success || !j.tweetId) throw new Error(`post-tweet-media: ${JSON.stringify(j).slice(0, 300)}`);
    await rest(`social_post_log?pick_text=eq.${encodeURIComponent(claimKey)}`, { method: "PATCH", body: JSON.stringify({
      hook_tweet_id: j.tweetId, thread_url: `https://x.com/BetwithGary/status/${j.tweetId}`, posted_at: new Date().toISOString(), post_text: text,
    }) });
    console.log(`${today} ${LEAGUE}: posted https://x.com/BetwithGary/status/${j.tweetId}`);
  } catch (e) {
    await rest(`social_post_log?pick_text=eq.${encodeURIComponent(claimKey)}`, { method: "DELETE" });
    throw e;
  }
}

let failed = false;
for (const league of ASKED === "ALL" ? ["NFL", "NBA"] : [ASKED]) {
  try { await main(league); } catch (e) { failed = true; console.error(new Date().toISOString(), league, String(e)); }
}
if (failed) process.exit(1);
