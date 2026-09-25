// NFL PLAYER CONTEXT (founder GO, Sep 24 2026), the football half of the MLB
// game frames: every value on a player's sheet carries its week, date and the
// defense it came against; beside it his snaps, his share of the targets lately
// against his season, what tonight's defense has allowed to his position, and
// who is out around him. From nflverse (weekly player stats, snap counts,
// schedules), which Ball Don't Lie does not carry. Facts only, one per line.
import { RELEASE_BASE, fetchCsv } from './nflStreaksService.js';
import { normName } from './darts/dartsCommon.js';

const n = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => { const [, m, dd] = String(d || '').split('-').map(Number); return m ? `${MONTHS[m - 1]} ${dd}` : null; };

const memo = new Map();
const once = (key, fn) => { if (!memo.has(key)) memo.set(key, fn().catch(() => null)); return memo.get(key); };

/** One season's weekly player rows (nflverse stats_player_week), regular season. */
export const weeklyRows = (season) => once(`week|${season}`, async () => (await fetchCsv(`${RELEASE_BASE}/stats_player/stats_player_week_${season}.csv`)).filter((r) => r.season_type === 'REG'));

/** "season|week|TEAM" → game date, from the nflverse schedule. */
export const gameDays = () => once('days', async () => {
  const out = new Map();
  for (const g of await fetchCsv(`${RELEASE_BASE}/schedules/games.csv`)) {
    for (const t of [g.home_team, g.away_team]) out.set(`${g.season}|${Number(g.week)}|${t}`, g.gameday);
  }
  return out;
});

/** normalized name → [{ week, team, opp, snaps, teamSnaps }] newest first. */
export const snapCounts = (season) => once(`snaps|${season}`, async () => {
  const out = new Map();
  for (const r of await fetchCsv(`${RELEASE_BASE}/snap_counts/snap_counts_${season}.csv`)) {
    if (r.game_type !== 'REG' || !(n(r.offense_snaps) > 0)) continue;
    const k = normName(r.player);
    if (!out.has(k)) out.set(k, []);
    const pct = n(r.offense_pct);
    out.get(k).push({ week: n(r.week), team: r.team, opp: r.opponent, snaps: n(r.offense_snaps), teamSnaps: pct > 0 ? Math.round(n(r.offense_snaps) / pct) : null });
  }
  for (const list of out.values()) list.sort((a, b) => b.week - a.week);
  return out;
});

const GROUP = (pos) => (pos === 'WR' ? 'WR' : pos === 'TE' ? 'TE' : pos === 'RB' || pos === 'FB' ? 'RB' : pos === 'QB' ? 'QB' : null);

/** defense TEAM → { games, WR|TE|RB|QB: totals } from the offenses it faced. */
export const defenseByPosition = (season) => once(`def|${season}`, async () => {
  const out = new Map();
  for (const r of (await weeklyRows(season)) || []) {
    const g = GROUP(r.position);
    const d = r.opponent_team;
    if (!g || !d) continue;
    if (!out.has(d)) out.set(d, { weeks: new Set(), WR: {}, TE: {}, RB: {}, QB: {} });
    const t = out.get(d);
    t.weeks.add(n(r.week));
    const add = (k, v) => { t[g][k] = (t[g][k] || 0) + v; };
    add('targets', n(r.targets)); add('rec', n(r.receptions)); add('recYds', n(r.receiving_yards)); add('recTd', n(r.receiving_tds));
    add('carries', n(r.carries)); add('rushYds', n(r.rushing_yards)); add('rushTd', n(r.rushing_tds));
    add('passYds', n(r.passing_yards)); add('passTd', n(r.passing_tds)); add('int', n(r.passing_interceptions));
  }
  return out;
});

const TEAM_WORD = { WR: 'wide receivers', TE: 'tight ends', RB: 'running backs', QB: 'quarterbacks' };

/** "PHI defense against wide receivers, 2026 (2 games): 29 catches on 41 targets, 388 yards, 3 TD · 2025 (17 games): ..." */
export function defenseLine(cur, prev, defense, position, season) {
  const g = GROUP(position);
  if (!g || !defense) return null;
  const one = (map, label) => {
    const t = map?.get(defense);
    if (!t) return null;
    const x = t[g];
    const games = t.weeks.size;
    const bits = g === 'QB'
      ? [`${x.passYds || 0} passing yards`, `${x.passTd || 0} passing TD`, `${x.int || 0} INT`, `${x.rushYds || 0} rushing yards`]
      : g === 'RB'
        ? [`${x.carries || 0} carries for ${x.rushYds || 0} yards`, `${x.rushTd || 0} rushing TD`, `${x.rec || 0} catches for ${x.recYds || 0} yards`, `${x.recTd || 0} receiving TD`]
        : [`${x.rec || 0} catches on ${x.targets || 0} targets`, `${x.recYds || 0} yards`, `${x.recTd || 0} TD`];
    return `${label} (${games} game${games === 1 ? '' : 's'}): ${bits.join(', ')}`;
  };
  const parts = [one(cur, String(season)), one(prev, String(season - 1))].filter(Boolean);
  return parts.length ? `${defense} defense against ${TEAM_WORD[g]}, ${parts.join(' · ')}` : null;
}

/** A player's weekly rows this season, newest first (by name, any club). */
export async function playerWeeks(season, name) {
  const k = normName(name);
  return ((await weeklyRows(season)) || []).filter((r) => normName(r.player_display_name) === k).sort((a, b) => n(b.week) - n(a.week));
}

/** "Wk 2 Sep 14 vs DAL: 7 targets, 5 catches, 72 yards, 1 TD; 2 carries, 9 yards; 54 of 66 snaps" — newest first. */
export function nflGameLog(rows, { season, days, snaps = [], limit = 8 } = {}) {
  return (rows || []).slice(0, limit).map((r) => {
    const wk = n(r.week);
    const date = days?.get(`${season}|${wk}|${r.team}`);
    const bits = [];
    if (n(r.attempts)) bits.push(`${n(r.completions)} of ${n(r.attempts)} passing, ${n(r.passing_yards)} yards, ${n(r.passing_tds)} TD, ${n(r.passing_interceptions)} INT`);
    if (n(r.carries)) bits.push(`${n(r.carries)} carries, ${n(r.rushing_yards)} yards${n(r.rushing_tds) ? `, ${n(r.rushing_tds)} TD` : ''}`);
    if (n(r.targets) || n(r.receptions)) bits.push(`${n(r.targets)} targets, ${n(r.receptions)} catches, ${n(r.receiving_yards)} yards${n(r.receiving_tds) ? `, ${n(r.receiving_tds)} TD` : ''}`);
    const s = snaps.find((x) => x.week === wk);
    if (s) bits.push(`${s.snaps}${s.teamSnaps ? ` of ${s.teamSnaps}` : ''} snaps`);
    return `Wk ${wk}${date ? ` ${day(date)}` : ''} vs ${r.opponent_team}: ${bits.join('; ') || 'no touches'}`;
  });
}

/** "share of the team's targets: 31 of 104 over the last 3 games, 52 of 190 this season" (from nflverse target_share). */
export function targetShareLine(rows) {
  const list = (rows || []).filter((r) => n(r.targets) > 0 || n(r.target_share) > 0);
  if (list.length < 2) return null;
  const teamTargets = (r) => (n(r.target_share) > 0 ? Math.round(n(r.targets) / n(r.target_share)) : null);
  const sum = (xs) => xs.reduce((a, r) => ({ mine: a.mine + n(r.targets), team: a.team + (teamTargets(r) || 0) }), { mine: 0, team: 0 });
  const last3 = sum(list.slice(0, 3)), all = sum(list);
  if (!all.team) return null;
  return `his targets against the team's: ${last3.mine} of ${last3.team} over his last ${Math.min(3, list.length)} games, ${all.mine} of ${all.team} this season (${list.length} games)`;
}

/** "out around him: WR Ja'Marr Chase (out), TE ... (doubtful)" — his club's current report, himself excluded. */
export function outAroundLine(injuries, teamFull, name) {
  const mine = normName(name);
  const list = (injuries || []).filter((i) => (i?.player?.team?.full_name || i?.team?.full_name) === teamFull
    && normName(`${i?.player?.first_name || ''} ${i?.player?.last_name || ''}`) !== mine
    && /^(out|doubtful|questionable|ir|injured reserve|pup)/i.test(String(i?.status || '')));
  if (!list.length) return null;
  return `his club's report: ${list.slice(0, 10).map((i) => `${i.player?.position_abbreviation || i.player?.position || ''} ${i.player?.first_name} ${i.player?.last_name} (${String(i.status).toLowerCase()})`.trim()).join(', ')}`;
}

/** A club's regular season from the schedule: "11-6, 25.1 points a game, 19.2 allowed (17 games)"; null before a final. */
export async function teamSeasonLine(season, abbr) {
  const games = (await fetchCsv(`${RELEASE_BASE}/schedules/games.csv`).catch(() => []))
    .filter((g) => Number(g.season) === Number(season) && g.game_type === 'REG' && g.home_score !== '' && g.away_score !== '' && (g.home_team === abbr || g.away_team === abbr));
  if (!games.length) return null;
  let w = 0, l = 0, t = 0, pf = 0, pa = 0;
  for (const g of games) {
    const mine = g.home_team === abbr ? n(g.home_score) : n(g.away_score), theirs = g.home_team === abbr ? n(g.away_score) : n(g.home_score);
    pf += mine; pa += theirs;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
  }
  const k = games.length;
  return `${w}-${l}${t ? `-${t}` : ''}, ${(pf / k).toFixed(1)} points a game, ${(pa / k).toFixed(1)} allowed (${k} game${k === 1 ? '' : 's'})`;
}
