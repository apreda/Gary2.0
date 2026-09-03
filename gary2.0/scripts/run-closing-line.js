#!/usr/bin/env node
/**
 * THE CLOSING-LINE READ runner (founder GO, Sep 3 2026): for every stored
 * game pick on a date (or a range), read the price Gary took against the
 * same ticket's price at first pitch and against the day's first price,
 * upsert pick_line_reads, and print the founder's read:
 *
 *   node scripts/run-closing-line.js                  # yesterday (ET)
 *   node scripts/run-closing-line.js 2026-09-01       # one date
 *   node scripts/run-closing-line.js 2026-09-01 2026-09-03
 *
 * Also runs after nightly grading from run-all-results.js. Gary never sees
 * any of it. NFL picks live in the weekly table and join by kickoff date.
 */
import '../src/loadEnv.js';
import { readPick, summarizeClosingLine, ticketPrices, pickSideOf, pickPointOf } from '../src/services/closingLine.js';

const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
const db = supabaseAdmin || supabase;

const SPORT_OF = { MLB: 'baseball_mlb', NFL: 'americanfootball_nfl', NCAAF: 'americanfootball_ncaaf' };

function etYesterday() {
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function dateRange(a, b) {
  const out = [];
  for (let t = new Date(`${a}T12:00:00Z`).getTime(); t <= new Date(`${b}T12:00:00Z`).getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * The pick carries no book name, so the book is inferred: the board whose
 * pick-side price equals the price Gary took, nearest 90 minutes before
 * first pitch; else the book with the most rows for the game.
 */
function inferBook(pick, snapshots, commenceTime) {
  const side = pickSideOf(pick);
  const betType = String(pick.type || '').toLowerCase() === 'spread' ? 'spread' : 'moneyline';
  const point = pickPointOf(pick);
  const price = Number(pick.odds);
  const start = commenceTime ? new Date(commenceTime).getTime() : NaN;
  const target = Number.isFinite(start) ? start - 90 * 60 * 1000 : NaN;
  const hits = (snapshots || []).filter((r) => {
    const p = side ? ticketPrices(r, side, betType, point) : null;
    return p && Number.isFinite(price) && p.mine === price;
  });
  if (hits.length) {
    const best = Number.isFinite(target)
      ? hits.slice().sort((a, b) => Math.abs(new Date(a.seen_at) - target) - Math.abs(new Date(b.seen_at) - target))[0]
      : hits[0];
    if (best.line_vendor) return String(best.line_vendor).toLowerCase();
  }
  const counts = new Map();
  for (const r of snapshots || []) counts.set(r.line_vendor ?? '', (counts.get(r.line_vendor ?? '') || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top || null;
}

export async function readClosingLines(dates) {
  const { data: days, error } = await db.from('daily_picks').select('date, picks').in('date', dates);
  if (error) throw error;
  const picks = [];
  for (const d of days || []) {
    for (const p of d.picks || []) {
      const league = String(p?.league || p?.sport || '').toUpperCase();
      if (!SPORT_OF[league] || league === 'NFL' || !p?.pick || p?.game_id == null) continue;
      picks.push({ ...p, game_date: d.date, league });
    }
  }
  // NFL: the weekly table, by the ET date of each kickoff.
  const { data: weeks, error: e5 } = await db.from('weekly_nfl_picks').select('picks').order('created_at', { ascending: false }).limit(6);
  if (e5) throw e5;
  for (const w of weeks || []) {
    for (const p of w.picks || []) {
      const gd = p?.commence_time ? new Date(p.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
      if (!gd || !dates.includes(gd) || !p?.pick) continue;
      const gid = p?.bdl_game_id ?? p?.game_id;
      if (gid == null) continue;
      picks.push({ ...p, game_date: gd, league: 'NFL', game_id: gid });
    }
  }
  if (!picks.length) return [];

  const { data: snaps, error: e2 } = await db.from('odds_snapshots')
    .select('sport, game_date, game_id, moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, line_vendor, seen_at')
    .in('game_date', dates);
  if (e2) throw e2;
  const bySportGame = new Map();
  for (const r of snaps || []) {
    const k = `${r.sport}|${r.game_date}|${String(r.game_id)}`;
    if (!bySportGame.has(k)) bySportGame.set(k, []);
    bySportGame.get(k).push(r);
  }
  const { data: results } = await db.from('game_results').select('game_date, game_id, pick_text, result').in('game_date', dates);
  const { data: nflRes } = await db.from('nfl_results').select('game_date, game_id, pick_text, result').in('game_date', dates);
  const resultOf = new Map([...(results || []), ...(nflRes || [])].map((r) => [`${r.game_date}|${String(r.game_id)}|${r.pick_text}`, r.result]));

  const rows = [];
  for (const p of picks) {
    const snapshots = bySportGame.get(`${SPORT_OF[p.league]}|${p.game_date}|${String(p.game_id)}`) || [];
    const commenceTime = p.commence_time || null;
    const book = inferBook(p, snapshots, commenceTime);
    const row = readPick({ ...p, bestLineBook: book, result: resultOf.get(`${p.game_date}|${String(p.game_id)}|${p.pick}`) ?? null }, snapshots, { commenceTime });
    if (!snapshots.length) row.notes = [row.notes, 'no snapshots'].filter(Boolean).join('; ');
    rows.push(row);
  }
  if (rows.length) {
    const { error: e3 } = await db.from('pick_line_reads').upsert(rows, { onConflict: 'game_date,league,game_id,pick_text' });
    if (e3) throw e3;
  }
  return rows;
}

const fmt = (r) => (r.n ? `${r.right}/${r.n} on the right side (${r.rate}%), mean ${r.mean_pts >= 0 ? '+' : ''}${r.mean_pts} pts` : 'none read');

export function printClosingLine(rows, label) {
  const s = summarizeClosingLine(rows);
  console.log(`\n📏 CLOSING LINE — ${label}: ${rows.length} picks, ${s.unread} unread`);
  console.log(`  pick → first pitch:  ${fmt(s.pickToClose)}`);
  console.log(`  open → first pitch:  ${fmt(s.openToClose)}`);
  console.log(`  favorites: pick→close ${fmt(s.favorites.pickToClose)} · open→close ${fmt(s.favorites.openToClose)}`);
  console.log(`  dogs:      pick→close ${fmt(s.dogs.pickToClose)} · open→close ${fmt(s.dogs.openToClose)}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const [a, b] = process.argv.slice(2);
  const dates = a ? dateRange(a, b || a) : [etYesterday()];
  const rows = await readClosingLines(dates);
  printClosingLine(rows, dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`);
  process.exit(0);
}
