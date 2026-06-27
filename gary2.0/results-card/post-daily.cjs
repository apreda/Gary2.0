// Daily results-card poster. Runs at 11am ET (launchd). Fetches YESTERDAY's Winners, builds the $100 P/L
// card, picks the day's design from the rotation, renders it, and posts it to X with the date caption.
//   node post-daily.cjs          -> render + POST
//   node post-daily.cjs --dry    -> render only, do not post (prints the design + caption)
const fs = require('fs');
const path = require('path');
const L = require('./lib.cjs');
const { renderCard } = require('./render.cjs');

// 7-design rotation, one per day, cycling weekly. fullcolor = the full-bleed result-block LEAD design (founder's
// pick); the others (077 Ledger, 038 Gold Bar, 079 Poster, 080 Index Card, 088 Ransom Note, 099 Panini) share its
// minimal content (big league tag + pick + green/red money). The old grid 030 + 032 are retired (files kept as spares).
const ROTATION = ['fullcolor', '077', '038', '079', '080', '088', '099'];

(async () => {
  const dry = process.argv.includes('--dry');
  const ymd = L.etDateStr(new Date(), -1); // yesterday's ET slate
  // Idempotency: posted-once-per-results-day marker, so a launchd wake-from-sleep catch-up (or a re-run)
  // can never double-post the same day's results.
  const marker = path.join(__dirname, 'out', `.posted-${ymd}`);
  if (!dry && fs.existsSync(marker)) { console.log(`[results-card] ${ymd} already posted (marker present) — skipping.`); return; }
  const [winners, ytd] = await Promise.all([L.fetchWinners(ymd), L.fetchYtdWinners()]);
  if (!winners.length) { console.log(`[results-card] no Winners graded for ${ymd} — skipping (nothing to post).`); return; }

  const card = L.buildCard(winners, ymd, ytd);
  const dayIdx = Math.floor(Date.parse(`${ymd}T12:00:00Z`) / 86400000) % ROTATION.length;
  let designId = ROTATION[dayIdx];
  // Never post the same design two days running (handles a manual override day) — advance to the next if it repeats.
  const lastFile = path.join(__dirname, 'out', '.last-design');
  try { if (fs.readFileSync(lastFile, 'utf8').trim() === designId) designId = ROTATION[(dayIdx + 1) % ROTATION.length]; } catch { /* no prior day */ }
  const png = renderCard(designId, card);
  console.log(`[results-card] ${ymd} | design ${designId} | ${card.record} ${card.netLabel} | wordless (card shows ${card.cardShort})`);

  if (dry) { console.log('[results-card] --dry: rendered', png, '— not posting.'); return; }
  const tweetId = await L.postCard(png);
  fs.writeFileSync(marker, tweetId);     // results-day posted (idempotency)
  fs.writeFileSync(lastFile, designId);  // remember today's design so tomorrow doesn't repeat it
  console.log(`[results-card] POSTED https://x.com/BetwithGary/status/${tweetId}`);
})().catch((e) => { console.error('[results-card] FAILED:', e.message); process.exit(1); });
