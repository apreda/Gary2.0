// Shared lib for the daily results card: live Winners fetch + $100 P/L + Chrome render + post.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---- env (parse gary2.0/.env) ----
function env() {
  const txt = fs.readFileSync(path.join(DIR, '..', '.env'), 'utf8');
  const e = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return e;
}
const E = env();
const SB = E.SUPABASE_URL, SKEY = E.SUPABASE_SERVICE_ROLE_KEY, AKEY = E.SUPABASE_ANON_KEY;

// ---- data ----
const money = (n) => (n == null ? '—' : (n >= 0 ? '+$' : '−$') + Math.abs(n).toFixed(2));
function profitOn100(odds, result) {
  if (result === 'push') return 0;
  if (result !== 'won') return -100;
  if (odds == null) return null;
  return odds > 0 ? odds : 10000 / Math.abs(odds);
}
// ET date helpers
function etDateStr(d = new Date(), offsetDays = 0) {
  const t = new Date(d.getTime() + offsetDays * 86400000);
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function dateLabels(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const month = dt.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const monthShort = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return {
    caption: `Results from ${month} ${ordinal(d)} ${y}`,      // tweet text
    cardShort: `${monthShort} ${d}, ${y}`,                     // "Jun 24, 2026"
    cardLong: `${month} ${ordinal(d)}, ${y}`,                  // "June 24th, 2026"
  };
}

async function sbGet(pathq) {
  const r = await fetch(`${SB}/rest/v1/${pathq}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!r.ok) throw new Error(`PostgREST ${r.status}: ${pathq.split('?')[0]}`);
  return r.json();
}
async function fetchWinners(ymd) {
  return sbGet(`game_results?game_date=eq.${ymd}&is_winners_pick=eq.true&select=league,result,pick_text,final_score,confidence&order=confidence.desc.nullslast`);
}
async function fetchYtdWinners() {
  const rows = await sbGet(`game_results?is_winners_pick=eq.true&select=result`);
  return { w: rows.filter((r) => r.result === 'won').length, l: rows.filter((r) => r.result === 'lost').length };
}

function buildCard(winners, ymd, ytd) {
  const picks = winners.map((r) => {
    const m = String(r.pick_text).match(/([+-]\d+)\s*$/);
    const odds = m ? parseInt(m[1]) : null;
    const name = String(r.pick_text).replace(/\s*[+-]\d+\s*$/, '').trim();
    const result = r.result;
    return { league: r.league, name, odds, final: r.final_score, result, profit: profitOn100(odds, result), profitLabel: money(profitOn100(odds, result)) };
  });
  const wins = picks.filter((p) => p.result === 'won').length;
  const losses = picks.filter((p) => p.result === 'lost').length;
  const net = picks.reduce((s, p) => s + (p.profit ?? 0), 0);
  const L = dateLabels(ymd);
  return { ymd, ...L, record: `${wins}-${losses}`, wins, losses, net, netLabel: money(net), picks, ytd };
}

function loadSource(designId) { return fs.readFileSync(path.join(DIR, 'designs-src', `${designId}.html`), 'utf8'); }
function bear() { return fs.readFileSync(path.join(DIR, 'assets', 'bear.txt'), 'utf8').trim(); }

function renderToPng(html, outName) {
  const htmlPath = path.join(DIR, 'out', `${outName}.html`);
  const pngPath = path.join(DIR, 'out', `${outName}.png`);
  fs.mkdirSync(path.join(DIR, 'out'), { recursive: true });
  fs.writeFileSync(htmlPath, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--window-size=1080,1350', `--screenshot=${pngPath}`,
    '--virtual-time-budget=8000', htmlPath], { stdio: 'ignore' });
  return pngPath;
}

// Post the card WORDLESS (media-only). The card already carries the date + the numbers, and a redundant date
// caption baits no engagement (replies are the #1 algo signal; a date label earns none). post-tweet-media allows
// a text-less tweet when an image is attached.
async function postCard(pngPath) {
  const b64 = fs.readFileSync(pngPath).toString('base64');
  const r = await fetch(`${SB}/functions/v1/post-tweet-media`, {
    method: 'POST', headers: { Authorization: `Bearer ${AKEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images_base64: [b64] }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-tweet-media failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.tweetId;
}

module.exports = { money, etDateStr, dateLabels, fetchWinners, fetchYtdWinners, buildCard, loadSource, bear, renderToPng, postCard };
