// PLAYER INTEL, for college — per-player breakdown packs on the SAME
// PlayerInsightPack contract the MLB and NFL builders ship (every field
// optional; iOS renders the sections a pack has and no others). NCAAF Picks
// page parity, founder Sep 3-4 2026: the NFL pack's contents, for the
// college leaders by role.
//
// Candidates: each slate side's active roster (BDL /ncaaf/v1/players/active)
// — the passing leader, the rushing leader, the top three receivers, by this
// season's numbers. Sections, every one a real feed value:
//   * season line — the player's season row (player_season_stats)
//   * formRows    — the last five finals (player_stats), each joined to the
//                   team's OWN game index for the opponent and the site; the
//                   window is labeled with its real season
//   * splits      — home/road per-game yardage from the same window
//   * props       — the day's posted college props for this player, this game
//
// Before a team's first game the current season has no rows, so the pack
// reads LAST season for the players on THIS season's roster and labels every
// section with the year — a transferred-out player never gets a pack.
//
// NCAAF-owned: never reads an NFL feed (league isolation law). NEVER throws:
// a missing source drops the section, an ungroundable player is skipped.

import { safeCall as safeCallShared } from './shared.js';
import { footballSeasonForDate } from './footballData.js';
import { toTeamResults } from '../agentic/tools/statRouters/footballTeamGames.js';
import { nameKey, playerName } from './ncaafNames.js';

const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'ncaafPlayerCards');

const SPORT_KEY = 'americanfootball_ncaaf';
const LOG_WINDOW = 5;
const MAX_PROPS = 4;
const RECEIVERS_PER_TEAM = 3;

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
  const v = Math.round((total / games) * 10) / 10;
  return String(v);
}

// ── season line ──────────────────────────────────────────────────────────────

function passingUnit(row) {
  const yds = finite(row?.passing_yards);
  const att = finite(row?.passing_attempts);
  if (!att || !yds) return null;
  const td = finite(row?.passing_touchdowns) ?? 0;
  const ints = finite(row?.passing_interceptions) ?? 0;
  return `${yds} pass yds · ${td} TD · ${ints} INT · ${att} att`;
}

function rushingUnit(row) {
  const yds = finite(row?.rushing_yards);
  const car = finite(row?.rushing_attempts);
  if (!yds && !car) return null;
  const td = finite(row?.rushing_touchdowns);
  return [`${yds ?? 0} rush yds`, car ? `${car} carries` : null, td ? `${td} TD` : null].filter(Boolean).join(' · ');
}

function receivingUnit(row) {
  const yds = finite(row?.receiving_yards);
  const rec = finite(row?.receptions);
  if (!yds && !rec) return null;
  const td = finite(row?.receiving_touchdowns);
  return [rec != null ? `${rec} rec` : null, `${yds ?? 0} rec yds`, td ? `${td} TD` : null].filter(Boolean).join(' · ');
}

function seasonLine(row, role, { season, prior, currentSeason }) {
  const units = {
    passing: passingUnit(row),
    rushing: rushingUnit(row),
    receiving: receivingUnit(row),
  };
  const order = role === 'quarterback'
    ? ['passing', 'rushing', 'receiving']
    : role === 'rusher' ? ['rushing', 'receiving', 'passing'] : ['receiving', 'rushing', 'passing'];
  const lines = order.map((k) => units[k]).filter(Boolean);
  if (!lines.length) return null;
  const label = prior
    ? `${season} season — prior season, he is on the ${currentSeason} active roster`
    : `${season} season`;
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

/** The player's finals, newest first, each joined to the team's game index. */
function logFor(rows, gameIndex) {
  return (rows || [])
    .map((r) => {
      const meta = gameIndex.get(String(r?.game?.id));
      if (!meta) return null;
      return { row: r, date: meta.date, opponent: meta.opponent, home: meta.home };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
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
    if (!line) continue;
    rows.push({ label: `${g.home ? 'vs' : 'at'} ${g.opponent || '—'}`, value: line, detail: null });
  }
  return rows;
}

function splits(log, role) {
  if (!log.length) return null;
  const { key, noun } = roleStat(role);
  const rows = [];
  for (const [label, home] of [['HOME', true], ['ROAD', false]]) {
    const mine = log.filter((g) => g.home === home);
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

/** This season's rows for the roster, else last season's for the same roster. */
async function seasonRowsFor(bdl, team, roster, season) {
  const ids = new Set(roster.map((p) => String(p.id)));
  const onRoster = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => ids.has(String(r?.player?.id)));
  const current = onRoster(await bdl.getNcaafPlayerSeasonStats({ teamId: team.id, season }));
  if (current.length) return { rows: current, season, prior: false };
  const prior = onRoster(await bdl.getNcaafPlayerSeasonStats({ playerIds: roster.map((p) => p.id), season: season - 1 }));
  return { rows: prior, season: season - 1, prior: true };
}

function leaders(roster, rows) {
  const byId = new Map(rows.map((r) => [String(r?.player?.id), r]));
  const withRow = roster.map((p) => ({ player: p, pos: position(p), row: byId.get(String(p.id)) })).filter((x) => x.row);
  const top = (pool, stat, count) => pool
    .map((x) => ({ ...x, v: finite(x.row[stat]) ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, count);
  return [
    ...top(withRow.filter((x) => x.pos === 'QB'), 'passing_attempts', 1),
    ...top(withRow.filter((x) => x.pos === 'RB' || x.pos === 'FB'), 'rushing_yards', 1),
    ...top(withRow.filter((x) => x.pos === 'WR' || x.pos === 'TE'), 'receiving_yards', RECEIVERS_PER_TEAM),
  ];
}

async function gameIndexFor(bdl, team, season) {
  const games = await safeCall(() => bdl.getGames(SPORT_KEY, { team_ids: [team.id], seasons: [season], per_page: 100 }), []);
  const index = new Map();
  for (const r of toTeamResults(games, team.id)) {
    if (r.gameId != null) index.set(String(r.gameId), { date: r.date, opponent: r.opponent, home: r.home });
  }
  return index;
}

/**
 * Build the day's college packs.
 * @param {object} args { date, games, bdl, propEntries }
 * @returns {Promise<Array<{date,league,player_id,player_name,team_abbr,game_id,payload}>>}
 */
export async function buildNcaafPlayerInsightCards({ date, games, bdl, propEntries = [] } = {}) {
  if (!bdl || !Array.isArray(games) || !games.length) return [];
  const currentSeason = footballSeasonForDate(date);
  const packs = [];

  for (const game of games) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (!awayTeam?.id || !homeTeam?.id || game?.id == null) continue;
    const gameLabelText = `${sideName(awayTeam)} @ ${sideName(homeTeam)}`;

    for (const [team, opponent] of [[awayTeam, homeTeam], [homeTeam, awayTeam]]) {
      let roster;
      try {
        roster = ((await bdl.getNcaafTeamPlayers(team.id)) || []).filter((p) => p?.id != null && playerName(p));
      } catch (err) {
        console.warn(`[ncaafPlayerCards] roster failed for ${sideName(team)}: ${err?.message || err} — side skipped`);
        continue;
      }
      if (!roster.length) continue;

      let window;
      try {
        window = await seasonRowsFor(bdl, team, roster, currentSeason);
      } catch (err) {
        console.warn(`[ncaafPlayerCards] season rows failed for ${sideName(team)}: ${err?.message || err} — side skipped`);
        continue;
      }
      const picked = leaders(roster, window.rows);
      if (!picked.length) continue;

      const gameIndex = await gameIndexFor(bdl, team, window.season);
      const gameRows = await safeCall(
        () => bdl.getNcaafPlayerGameStats({ playerIds: picked.map((x) => x.player.id), season: window.season }), [],
      );
      const rowsByPlayer = new Map();
      for (const r of Array.isArray(gameRows) ? gameRows : []) {
        const pid = String(r?.player?.id);
        if (!rowsByPlayer.has(pid)) rowsByPlayer.set(pid, []);
        rowsByPlayer.get(pid).push(r);
      }

      for (const { player, pos, row } of picked) {
        const name = playerName(player);
        const role = roleFor(pos);
        const log = logFor(rowsByPlayer.get(String(player.id)), gameIndex);
        const season = seasonLine(row, role, { season: window.season, prior: window.prior, currentSeason });
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
          team_abbr: sideName(team),
          game_id: String(game.id),
          payload: {
            type: role === 'quarterback' ? 'quarterback' : 'skill',
            name,
            team: sideName(team),
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
  }

  console.log(`[ncaafPlayerCards] NCAAF ${date}: ${packs.length} pack(s) across ${games.length} game(s)`);
  return packs;
}

export default { buildNcaafPlayerInsightCards };
