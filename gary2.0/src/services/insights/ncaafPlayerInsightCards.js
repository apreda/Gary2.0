// PLAYER INTEL, for college — per-player breakdown packs on the SAME
// PlayerInsightPack contract the MLB and NFL builders ship (every field
// optional; iOS renders the sections a pack has and no others). NCAAF Picks
// page parity, founder Sep 3-4 2026: the NFL pack's contents, for the
// college leaders by role.
//
// Truth sources (verified live Sep 4 2026):
//   * BDL /ncaaf/v1/players/active — who is on the team NOW.
//   * BDL /ncaaf/v1/player_stats (seasons[]) — the per-game rows: who has
//     played and what he did. The season line is their SUM; the log is the
//     last five of them; the splits come from the same window.
//   * BDL /ncaaf/v1/games for the pair — one call per game — names the
//     opponent and the site of each logged game (college per-game rows carry
//     `game.home_team: null`). Without it the log is labeled by week.
// The season-totals endpoint is never read: before Week 1 its "2026" rows
// were full prior-season lines wearing this year's label.
//
// Candidates: each side's roster QB / RB / WR / TE — the passing leader
// (above the attempts floor), the rushing leader, the top three receivers,
// by this season's rows. Before a team's first game, LAST season's rows for
// the players on THIS season's roster, every section labeled with the year
// and the school he played for. Props: the day's posted college props for
// this player, this game.
//
// Fetch discipline: three BDL requests a minute account-wide, so the builder
// works games in kickoff order inside a time budget and skips games already
// packed today (the runner's additive write keeps them). NCAAF-owned: never
// reads an NFL feed (league isolation law). NEVER throws.

import { safeCall as safeCallShared } from './shared.js';
import { footballSeasonForDate } from './footballData.js';
import { toTeamResults } from '../agentic/tools/statRouters/footballTeamGames.js';
import { nameKey, playerName } from './ncaafNames.js';
import { runWithinBudget } from './ncaafLaneLedger.js';

const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'ncaafPlayerCards');

const SPORT_KEY = 'americanfootball_ncaaf';
const LOG_WINDOW = 5;
const MAX_PROPS = 4;
const RECEIVERS_PER_TEAM = 3;
/** A passing leader has to have thrown a real share — one game's worth. */
const MIN_PASS_ATTEMPTS = 15;
/** Rosters do not change inside a day; share them across the day's passes. */
const ROSTER_TTL_MINUTES = 360;
const SKILL = new Set(['QB', 'RB', 'FB', 'WR', 'TE']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sideName(team) {
  return team?.abbreviation || team?.college || team?.name || team?.full_name || null;
}

function fullName(team) {
  return team?.full_name || [team?.college, team?.name].filter(Boolean).join(' ') || sideName(team);
}

function position(p) {
  return String(p?.position_abbreviation || p?.position || '').toUpperCase();
}

function roleFor(pos) {
  if (pos === 'QB') return 'quarterback';
  if (pos === 'RB' || pos === 'FB') return 'rusher';
  return 'receiver';
}

function oddsText(value) {
  const n = finite(value);
  if (n == null) return null;
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

/** 253.33 -> "253.3", 225 -> "225". */
function perGame(total, games) {
  if (!games) return null;
  return String(Math.round((total / games) * 10) / 10);
}

function dayLabel(iso, { year = false } = {}) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return year ? `${base}, ${d.getUTCFullYear()}` : base;
}

// ── the per-game rows, summed ───────────────────────────────────────────────

const SUM_KEYS = [
  'passing_attempts', 'passing_completions', 'passing_yards', 'passing_touchdowns', 'passing_interceptions',
  'rushing_attempts', 'rushing_yards', 'rushing_touchdowns',
  'receptions', 'receiving_targets', 'receiving_yards', 'receiving_touchdowns',
];

function sumRows(rows) {
  const totals = Object.fromEntries(SUM_KEYS.map((k) => [k, 0]));
  for (const r of rows) for (const k of SUM_KEYS) totals[k] += finite(r?.[k]) ?? 0;
  totals.games = rows.length;
  const teams = [...new Set(rows.map((r) => r?.team?.abbreviation).filter(Boolean))];
  totals.team = teams.length === 1 ? teams[0] : null;
  return totals;
}

function passingUnit(t) {
  if (!t.passing_attempts) return null;
  return `${t.passing_yards} pass yds · ${t.passing_touchdowns} TD · ${t.passing_interceptions} INT · ${t.passing_attempts} att`;
}

function rushingUnit(t) {
  if (!t.rushing_yards && !t.rushing_attempts) return null;
  return [`${t.rushing_yards} rush yds`, t.rushing_attempts ? `${t.rushing_attempts} carries` : null, t.rushing_touchdowns ? `${t.rushing_touchdowns} TD` : null]
    .filter(Boolean).join(' · ');
}

function receivingUnit(t) {
  if (!t.receiving_yards && !t.receptions) return null;
  return [`${t.receptions} rec`, `${t.receiving_yards} rec yds`, t.receiving_touchdowns ? `${t.receiving_touchdowns} TD` : null]
    .filter(Boolean).join(' · ');
}

function seasonLine(totals, role, { season, prior, currentSeason, abbr }) {
  const units = { passing: passingUnit(totals), rushing: rushingUnit(totals), receiving: receivingUnit(totals) };
  const order = role === 'quarterback'
    ? ['passing', 'rushing', 'receiving']
    : role === 'rusher' ? ['rushing', 'receiving', 'passing'] : ['receiving', 'rushing', 'passing'];
  const lines = order.map((k) => units[k]).filter(Boolean);
  if (!lines.length) return null;
  const games = `${totals.games} game${totals.games === 1 ? '' : 's'}`;
  const school = prior && totals.team && totals.team !== abbr ? ` at ${totals.team}` : '';
  const label = prior
    ? `${season} season${school}, ${games} — prior season; he is on the ${currentSeason} ${abbr} roster`
    : `${season} season, ${games}`;
  return { line1: lines[0], line2: [lines.slice(1).join(' · ') || null, label].filter(Boolean).join(' — ') };
}

// ── the log ──────────────────────────────────────────────────────────────────

function statLineForGame(g, role) {
  if (role === 'quarterback') {
    const passing = `${finite(g.passing_completions) ?? 0}/${finite(g.passing_attempts) ?? 0}, ${finite(g.passing_yards) ?? 0} yds, `
      + `${finite(g.passing_touchdowns) ?? 0} TD, ${finite(g.passing_interceptions) ?? 0} INT`;
    const rush = finite(g.rushing_yards);
    return passing + (rush ? `, ${rush} rush yds` : '');
  }
  const bits = [];
  const car = finite(g.rushing_attempts);
  const rushTd = finite(g.rushing_touchdowns);
  if (car) bits.push(`${car} car ${finite(g.rushing_yards) ?? 0} yds${rushTd ? ` ${rushTd} TD` : ''}`);
  const rec = finite(g.receptions);
  const tgt = finite(g.receiving_targets);
  const recTd = finite(g.receiving_touchdowns);
  if (rec || tgt) bits.push(`${rec ?? 0} rec ${finite(g.receiving_yards) ?? 0} yds${recTd ? ` ${recTd} TD` : ''}${tgt ? ` (${tgt} tgt)` : ''}`);
  return bits.join(' · ') || null;
}

function roleStat(role) {
  if (role === 'quarterback') return { key: 'passing_yards', noun: 'pass yds/g' };
  if (role === 'rusher') return { key: 'rushing_yards', noun: 'rush yds/g' };
  return { key: 'receiving_yards', noun: 'rec yds/g' };
}

/** The player's rows newest first, each joined to the pair's index when it knows the game. */
function logFor(rows, gameIndex, prior) {
  return (rows || [])
    .map((r) => {
      const meta = gameIndex.get(String(r?.game?.id));
      const date = meta?.date || r?.game?.date || null;
      const label = meta
        ? `${meta.home ? 'vs' : 'at'} ${meta.opponent || '—'}`
        : (prior ? dayLabel(date, { year: true }) : (r?.game?.week != null ? `Wk ${r.game.week} · ${dayLabel(date)}` : dayLabel(date)));
      return { row: r, date, label: label || '—', home: meta ? meta.home : null };
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, LOG_WINDOW);
}

function formRows(log, role, { season, prior }) {
  if (!log.length) return null;
  const { key, noun } = roleStat(role);
  const label = prior ? `LAST ${log.length} — ${season} SEASON` : `LAST ${log.length}`;
  const total = log.reduce((sum, g) => sum + (finite(g.row[key]) ?? 0), 0);
  const rows = [{ label, value: `${perGame(total, log.length)} ${noun}`, detail: null }];
  for (const g of log) {
    const line = statLineForGame(g.row, role);
    if (line) rows.push({ label: g.label, value: line, detail: null });
  }
  return rows;
}

function splits(log, role) {
  const known = log.filter((g) => g.home != null);
  if (!known.length) return null;
  const { key, noun } = roleStat(role);
  const rows = [];
  for (const [label, home] of [['HOME', true], ['ROAD', false]]) {
    const mine = known.filter((g) => g.home === home);
    if (!mine.length) continue;
    const total = mine.reduce((sum, g) => sum + (finite(g.row[key]) ?? 0), 0);
    rows.push({ label, value: `${perGame(total, mine.length)} ${noun}`, detail: `${mine.length} game${mine.length === 1 ? '' : 's'}` });
  }
  return rows.length ? rows : null;
}

// ── props ────────────────────────────────────────────────────────────────────

function propsFor(entries, name, gameId) {
  const key = nameKey(name);
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (String(e?.sport || e?.league || '').toUpperCase() !== 'NCAAF') continue;
    if (String(e?.game_id ?? '') !== String(gameId)) continue;
    if (nameKey(e?.player) !== key) continue;
    const label = String(e?.prop ?? e?.prop_type ?? '').replace(/^player_/, '').replace(/_/g, ' ').trim().toUpperCase();
    const line = finite(e?.line);
    if (!label || line == null || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, line: String(line), odds: oddsText(e?.odds) || null, rate: null });
    if (out.length >= MAX_PROPS) break;
  }
  return out.length ? out : null;
}

// ── candidates ───────────────────────────────────────────────────────────────

function groupByPlayer(rows, ids) {
  const allowed = new Set(ids.map(String));
  const grouped = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(r?.player?.id);
    if (!allowed.has(id)) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(r);
  }
  return grouped;
}

/** QB1 above the floor, RB1, the top three receivers — by the summed rows. */
/**
 * The players a card gets built for: this side's production leaders, plus
 * ANYONE the day's rows named.
 *
 * The lanes name people the leaders list never reaches — an injured tackle on
 * the availability sheet, a backup quarterback on the watch — and on Sep 4 2026
 * that was 16 of the 20 college rows carrying a player id: every one of those
 * taps found no card. The roster's rows are already in hand here, so a named
 * player costs nothing extra to include, and a named player with no rows still
 * gets his identity card rather than an empty sheet.
 */
function leaders(roster, grouped, named = new Set()) {
  const withTotals = roster
    .map((p) => ({ player: p, pos: position(p), rows: grouped.get(String(p.id)) || [] }))
    .filter((x) => x.rows.length)
    .map((x) => ({ ...x, totals: sumRows(x.rows) }));
  const top = (pool, stat, count, floor = 1) => pool
    .filter((x) => x.totals[stat] >= floor)
    .sort((a, b) => b.totals[stat] - a.totals[stat])
    .slice(0, count);
  const picked = [
    ...top(withTotals.filter((x) => x.pos === 'QB'), 'passing_attempts', 1, MIN_PASS_ATTEMPTS),
    ...top(withTotals.filter((x) => x.pos === 'RB' || x.pos === 'FB'), 'rushing_yards', 1),
    ...top(withTotals.filter((x) => x.pos === 'WR' || x.pos === 'TE'), 'receiving_yards', RECEIVERS_PER_TEAM),
  ];
  if (!named.size) return picked;

  const already = new Set(picked.map((x) => String(x.player?.id)));
  for (const p of roster) {
    if (already.has(String(p?.id)) || !named.has(nameKey(playerName(p)))) continue;
    const rows = grouped.get(String(p.id)) || [];
    picked.push({ player: p, pos: position(p), rows, totals: sumRows(rows) });
    already.add(String(p?.id));
  }
  return picked;
}

/** This season's rows for the roster's skill players, else last season's for the same players. */
async function rowsFor(bdl, ids, season) {
  const current = await bdl.getNcaafPlayerGameStats({ playerIds: ids, season });
  if (Array.isArray(current) && current.length) return { rows: current, season, prior: false };
  const prior = await bdl.getNcaafPlayerGameStats({ playerIds: ids, season: season - 1 });
  return { rows: Array.isArray(prior) ? prior : [], season: season - 1, prior: true };
}

/** The pair's game index for a season, one call: game id -> opponent, site, date. */
async function pairIndex(bdl, awayTeam, homeTeam, season) {
  const games = await safeCall(
    () => bdl.getGames(SPORT_KEY, { team_ids: [awayTeam.id, homeTeam.id], seasons: [season], per_page: 100 }), [],
  );
  const index = new Map();
  for (const team of [awayTeam, homeTeam]) {
    for (const r of toTeamResults(games, team.id)) {
      if (r.gameId != null) index.set(`${team.id}:${r.gameId}`, { date: r.date, opponent: r.opponent, home: r.home });
    }
  }
  return index;
}

async function packsForGame({ game, date, currentSeason, bdl, propEntries, named }) {
  const awayTeam = game?.away_team ?? game?.visitor_team;
  const homeTeam = game?.home_team;
  if (!awayTeam?.id || !homeTeam?.id) return [];
  const gameLabelText = `${sideName(awayTeam)} @ ${sideName(homeTeam)}`;
  const packs = [];
  const indexBySeason = new Map();

  for (const [team, opponent] of [[awayTeam, homeTeam], [homeTeam, awayTeam]]) {
    let roster;
    try {
      roster = ((await bdl.getNcaafTeamPlayers(team.id, ROSTER_TTL_MINUTES)) || [])
        .filter((p) => p?.id != null && playerName(p) && SKILL.has(position(p)));
    } catch (err) {
      console.warn(`[ncaafPlayerCards] roster failed for ${sideName(team)}: ${err?.message || err} — side skipped`);
      continue;
    }
    if (!roster.length) continue;

    let window;
    try {
      window = await rowsFor(bdl, roster.map((p) => p.id), currentSeason);
    } catch (err) {
      console.warn(`[ncaafPlayerCards] per-game rows failed for ${sideName(team)}: ${err?.message || err} — side skipped`);
      continue;
    }
    const grouped = groupByPlayer(window.rows, roster.map((p) => p.id));
    const picked = leaders(roster, grouped, named);
    if (!picked.length) continue;

    if (!indexBySeason.has(window.season)) {
      indexBySeason.set(window.season, await pairIndex(bdl, awayTeam, homeTeam, window.season));
    }
    const index = indexBySeason.get(window.season);
    const teamIndex = new Map([...index].filter(([k]) => k.startsWith(`${team.id}:`)).map(([k, v]) => [k.split(':')[1], v]));
    const abbr = sideName(team);

    for (const { player, pos, rows, totals } of picked) {
      const name = playerName(player);
      const role = roleFor(pos);
      const log = logFor(rows, teamIndex, window.prior);
      const season = seasonLine(totals, role, { season: window.season, prior: window.prior, currentSeason, abbr });
      const form = formRows(log, role, { season: window.season, prior: window.prior });
      const split = splits(log, role);
      const props = propsFor(propEntries, name, game.id);
      // A pack with no grounded section is not a pack.
      if (!season && !form && !split && !props) continue;

      packs.push({
        date,
        league: 'NCAAF',
        player_id: String(player.id),
        player_name: name,
        team_abbr: abbr,
        game_id: String(game.id),
        payload: {
          type: role === 'quarterback' ? 'quarterback' : 'skill',
          name,
          team: abbr,
          position: pos || null,
          game: gameLabelText,
          opponent: { name: fullName(opponent), hand: null },
          season,
          formRows: form,
          splits: split,
          props,
          statsSectionTitle: 'THE SHEET',
        },
      });
    }
  }
  return packs;
}

/**
 * Build the day's college packs for the games not yet packed today, in
 * kickoff order, inside the lane budget.
 * @param {object} args { date, games, bdl, propEntries, done }
 * @returns {Promise<Array<{date,league,player_id,player_name,team_abbr,game_id,payload}>>}
 */
export async function buildNcaafPlayerInsightCards({ date, games, bdl, propEntries = [], done = new Set(), names = [] } = {}) {
  if (!bdl || !Array.isArray(games) || !games.length) return [];
  const currentSeason = footballSeasonForDate(date);
  const named = new Set((names || []).map(nameKey).filter((k) => k.length >= 5));
  const packs = await runWithinBudget({
    games, done, label: 'ncaafPlayerCards',
    work: (game) => packsForGame({ game, date, currentSeason, bdl, propEntries, named }),
  });
  console.log(`[ncaafPlayerCards] NCAAF ${date}: ${packs.length} pack(s)`);
  return packs;
}

export default { buildNcaafPlayerInsightCards };
