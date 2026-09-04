/** Home feature helpers and exact-ticket Winners qualification.
 * Dogs and marquee games remain Home features; neither grants admission.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ET = 'America/New_York';
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The founder's named big games (winnersBigGames.json), re-read on every call so a commit is live at the next batch. */
export function loadBigGameOverrides() {
  try {
    const o = JSON.parse(readFileSync(path.join(HERE, 'winnersBigGames.json'), 'utf8'));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/** ET calendar parts for an instant: { date: 'YYYY-MM-DD', dow: 0-6 (Sun=0), minutes: minutes after midnight }. */
export function etParts(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const dows = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour) % 24;
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: ET }),
    dow: dows[parts.weekday] ?? null,
    minutes: hour * 60 + Number(parts.minute),
  };
}

const num = (v) => (v == null || v === '' ? NaN : Number(v));

/** A dog for the first-dog rule: a moneyline bet at plus money. Spreads and run lines never qualify. */
export function isPlusMoneyMoneyline(pick) {
  if (!pick) return false;
  const type = String(pick.type || '').toLowerCase();
  if (type && type !== 'moneyline') return false;
  if (!type && /[+-]\d+\.5/.test(String(pick.pick || ''))) return false;
  const odds = num(pick.odds);
  return Number.isFinite(odds) && odds > 0;
}

/**
 * Is this pick the league's first plus-money moneyline of the day?
 * `storedPicks` = the picks already stored for that league and date (the
 * runner reads them just before it stores this one). This game's own earlier
 * rows never count against it.
 */
export function isFirstDogOfDay(pick, storedPicks = []) {
  if (!isPlusMoneyMoneyline(pick)) return false;
  const gid = pick.game_id != null ? String(pick.game_id) : null;
  return !(storedPicks || []).some((p) => isPlusMoneyMoneyline(p) && (gid == null || String(p.game_id ?? '') !== gid));
}

const teamKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A founder-named big game for the date and league: "Away @ Home" (either name matches loosely). */
export function namedBigGame(overrides, dateEt, league, game) {
  const entry = overrides?.[dateEt]?.[String(league || '').toUpperCase()];
  if (!entry || !game) return false;
  const [away, home] = String(entry).split('@').map((s) => s.trim());
  if (!away || !home) return false;
  const h = teamKey(game.home_team || game.homeTeam);
  const a = teamKey(game.away_team || game.awayTeam);
  return (h.includes(teamKey(home)) || teamKey(home).includes(h)) && (a.includes(teamKey(away)) || teamKey(away).includes(a));
}

/**
 * The day's big game, per league. `game` is the pick's game (commence_time,
 * home/away names, rankings); `slate` is every game that league plays that
 * ET date (NCAAF needs it to compare rankings; the others need only the game).
 *
 * @returns {boolean}
 */
export function isBigGame({ league, game, slate = [], dateEt = null, overrides = null }) {
  if (!game) return false;
  const lg = String(league || '').toUpperCase();
  const when = etParts(game.commence_time || game.gameTime || game.date);
  const date = dateEt || when?.date || null;
  if (overrides && date && namedBigGame(overrides, date, lg, game)) return true;
  if (!when) return false;
  if (lg === 'MLB') {
    // Sunday Night Baseball: the Sunday game with first pitch 7:00-9:00 PM ET.
    return when.dow === 0 && when.minutes >= 19 * 60 && when.minutes < 21 * 60;
  }
  if (lg === 'NFL') {
    // National window: Sunday night (kickoff 8 PM ET or later), any Monday or Thursday game.
    if (when.dow === 0) return when.minutes >= 20 * 60;
    return when.dow === 1 || when.dow === 4;
  }
  // NCAAF needs the whole day's slate to compare rankings; a one-game list
  // (an exact-game child run) cannot decide it — only a named game can.
  if (lg === 'NCAAF') return (slate || []).length > 1 && ncaafBigGameId(slate) === String(game.id ?? game.game_id ?? '');
  return false;
}

const rankOf = (v) => {
  const n = num(v);
  return Number.isFinite(n) && n >= 1 && n <= 25 ? n : null;
};

/**
 * NCAAF: the game with both teams ranked and the lowest combined ranking
 * (tie → the later kickoff). No ranked-vs-ranked game → the game holding the
 * highest-ranked team. No ranked team → null.
 */
export function ncaafBigGameId(slate = []) {
  const rows = (slate || []).map((g) => ({
    id: String(g.id ?? g.game_id ?? ''),
    h: rankOf(g.homeRanking ?? g.home_ranking),
    a: rankOf(g.awayRanking ?? g.away_ranking),
    t: new Date(g.commence_time || g.gameTime || 0).getTime() || 0,
  }));
  const both = rows.filter((r) => r.h && r.a).sort((x, y) => (x.h + x.a) - (y.h + y.a) || y.t - x.t);
  if (both.length) return both[0].id;
  const one = rows.filter((r) => r.h || r.a).sort((x, y) => Math.min(x.h ?? 99, x.a ?? 99) - Math.min(y.h ?? 99, y.a ?? 99) || y.t - x.t);
  return one.length ? one[0].id : null;
}

/** Qualification only. The admissions ledger enforces capacity and publication. */
export function winnersDecision({ verdict = null } = {}) {
  return verdict === 'STRONG' ? { on_board: true, reason: 'review' } : { on_board: false, reason: null };
}
