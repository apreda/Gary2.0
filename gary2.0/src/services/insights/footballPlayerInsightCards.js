// Builds football Player Insight Cards — per-player breakdown packs for the
// iOS full-breakdown sheet, riding the SAME PlayerInsightPack payload contract
// the MLB and World Cup builders ship (every field optional; iOS renders the
// sections a pack has and no others; type is a free string — the sheet is
// generic, only sort order inspects it).
//
// NFL (first-class): candidates are each slate game's depth-chart key players
// (QB/RB/WR/TE, depth <= 2 — getNflRosterDepth). Sections, every one a real
// feed value:
//   * season line   — league-wide advanced passing/rushing/receiving rows
//   * formRows      — last-5 completed-game log (batched, finals-only), the
//                     window labeled with its real season: August packs read
//                     the PRIOR season and say so, in-season packs the current
//   * splits        — home/road per-game yardage from the same log window
//   * status row    — the wire injury report, verbatim status
//   * props         — the game's posted player prop lines
//
// NFL-only (league isolation law): the college packs live in
// ncaafPlayerInsightCards.js with their own sources; the runner routes by league.
//
// Defensive contract (house rules): NEVER throws; a missing source drops the
// section, a player who cannot be grounded is skipped.

import { safeCall as safeCallShared } from './shared.js';
import { footballSeasonForDate } from './footballData.js';

const safeCall = (fn, fallback) => safeCallShared(fn, fallback, 'footballPlayerCards');

const MAX_PROPS = 4;

function isPreseasonDate(date) {
  return Number(String(date || '').slice(5, 7)) === 8;
}

function sideName(team) {
  return team?.abbreviation || team?.college || team?.name || team?.full_name || null;
}

function fullName(team) {
  return team?.full_name || team?.name || team?.college || team?.abbreviation || null;
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function oddsText(value) {
  const n = finite(value);
  if (n == null) return null;
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

// ─────────────────────────────────────────────────────────────────────────────
// NFL sections
// ─────────────────────────────────────────────────────────────────────────────

function roleFor(position) {
  const p = String(position || '').toUpperCase();
  if (p === 'QB') return 'quarterback';
  if (['RB', 'WR', 'TE', 'FB'].includes(p)) return 'skill';
  return 'skill';
}

/** Season line from the league-wide advanced stat row for this player. */
function nflSeasonLine(playerId, { passing, rushing, receiving }) {
  const pid = String(playerId);
  const passRow = passing.find((r) => String(r?.player?.id ?? r?.player_id) === pid);
  const rushRow = rushing.find((r) => String(r?.player?.id ?? r?.player_id) === pid);
  const recvRow = receiving.find((r) => String(r?.player?.id ?? r?.player_id) === pid);

  const bits = [];
  if (passRow) {
    const yds = finite(passRow.pass_yards ?? passRow.passing_yards);
    const tds = finite(passRow.pass_touchdowns ?? passRow.passing_touchdowns);
    const ints = finite(passRow.interceptions ?? passRow.passing_interceptions);
    const att = finite(passRow.attempts ?? passRow.passing_attempts);
    const line = [
      yds != null ? `${yds} pass yds` : null,
      tds != null ? `${tds} TD` : null,
      ints != null ? `${ints} INT` : null,
      att != null ? `${att} att` : null,
    ].filter(Boolean).join(' · ');
    if (line) bits.push(line);
  }
  if (rushRow) {
    const yds = finite(rushRow.rush_yards ?? rushRow.rushing_yards);
    const att = finite(rushRow.rush_attempts ?? rushRow.rushing_attempts);
    const tds = finite(rushRow.rush_touchdowns ?? rushRow.rushing_touchdowns);
    const line = [
      yds != null ? `${yds} rush yds` : null,
      att != null ? `${att} carries` : null,
      tds != null ? `${tds} TD` : null,
    ].filter(Boolean).join(' · ');
    if (line) bits.push(line);
  }
  if (recvRow) {
    const yds = finite(recvRow.rec_yards ?? recvRow.receiving_yards);
    const rec = finite(recvRow.receptions);
    const tgt = finite(recvRow.targets);
    const line = [
      rec != null ? `${rec} rec` : null,
      yds != null ? `${yds} rec yds` : null,
      tgt != null ? `${tgt} targets` : null,
    ].filter(Boolean).join(' · ');
    if (line) bits.push(line);
  }
  if (!bits.length) return null;
  return { line1: bits[0], line2: bits.slice(1).join(' — ') || null };
}

function hasSeasonProduction(playerId, { passing, rushing, receiving }) {
  const pid = String(playerId);
  return [...passing, ...rushing, ...receiving].some((row) => {
    if (String(row?.player?.id ?? row?.player_id) !== pid) return false;
    return ['attempts', 'passing_attempts', 'pass_yards', 'passing_yards',
      'rush_attempts', 'rushing_attempts', 'rush_yards', 'rushing_yards',
      'receptions', 'targets', 'rec_yards', 'receiving_yards']
      .some((key) => (finite(row[key]) ?? 0) > 0);
  });
}

async function seasonStats(bdl, season) {
  const [passing, rushing, receiving] = await Promise.all([
    safeCall(() => bdl.getNflAdvancedPassingStats({ season }), []),
    safeCall(() => bdl.getNflAdvancedRushingStats({ season }), []),
    safeCall(() => bdl.getNflAdvancedReceivingStats({ season }), []),
  ]);
  return Object.fromEntries(Object.entries({ passing, rushing, receiving })
    .map(([key, rows]) => [key, Array.isArray(rows) ? rows : []]));
}

function statLineForGame(g, role) {
  if (role === 'quarterback') {
    return `${g.pass_comp}/${g.pass_att}, ${g.pass_yds} yds, ${g.pass_tds} TD, ${g.ints} INT`
      + (g.rush_yds ? `, ${g.rush_yds} rush yds` : '');
  }
  const bits = [];
  if (g.rush_att) bits.push(`${g.rush_att} car ${g.rush_yds} yds${g.rush_tds ? ` ${g.rush_tds} TD` : ''}`);
  if (g.targets || g.receptions) bits.push(`${g.receptions} rec ${g.rec_yds} yds${g.rec_tds ? ` ${g.rec_tds} TD` : ''} (${g.targets} tgt)`);
  return bits.join(' · ') || null;
}

function nflFormRows(logs, role, windowSeason, windowIsPrior) {
  // summarizeNflPlayerGameLogs returns the per-game array under `games`.
  const games = Array.isArray(logs?.games) ? logs.games : [];
  if (!games.length) return null;
  const label = windowIsPrior ? `LAST ${games.length} — ${windowSeason} SEASON` : `LAST ${games.length}`;
  const avg = logs?.averages || {};
  const headValue = role === 'quarterback'
    ? (avg.pass_yds != null ? `${avg.pass_yds} pass yds/g` : null)
    : (finite(avg.rec_yds) ? `${avg.rec_yds} rec yds/g` : (finite(avg.rush_yds) ? `${avg.rush_yds} rush yds/g` : null));

  const rows = [];
  if (headValue) rows.push({ label, value: headValue, detail: null });
  for (const g of games) {
    const line = statLineForGame(g, role);
    if (!line) continue;
    rows.push({
      label: `${g.isHome ? 'vs' : 'at'} ${g.opponent || '—'}`,
      value: line,
      detail: null,
    });
  }
  return rows.length ? rows : null;
}

function nflSplits(logs, role, injuryReport) {
  const rows = [];
  const splits = logs?.splits;
  const statKey = role === 'quarterback' ? 'pass_yds' : 'rec_yds';
  const statNoun = role === 'quarterback' ? 'pass yds/g' : 'rec yds/g';
  const home = splits?.home; const away = splits?.away;
  if (home?.games > 0 && home?.[statKey] !== 'N/A') {
    rows.push({ label: 'HOME', value: `${home[statKey]} ${statNoun}`, detail: `${home.games} game${home.games === 1 ? '' : 's'}` });
  }
  if (away?.games > 0 && away?.[statKey] !== 'N/A') {
    rows.push({ label: 'ROAD', value: `${away[statKey]} ${statNoun}`, detail: `${away.games} game${away.games === 1 ? '' : 's'}` });
  }
  if (injuryReport) {
    const comment = String(injuryReport?.comment || '').trim();
    rows.push({
      label: 'STATUS',
      value: String(injuryReport?.status || '').trim() || null,
      detail: comment && !/^undisclosed$/i.test(comment) ? comment : null,
    });
  }
  return rows.length ? rows : null;
}

function nflProps(propRows, playerId) {
  const pid = String(playerId);
  const mine = (Array.isArray(propRows) ? propRows : [])
    .filter((p) => String(p?.player_id ?? p?.player?.id) === pid);
  const out = [];
  const seen = new Set();
  for (const p of mine) {
    const label = String(p?.prop_type ?? p?.market ?? p?.type ?? '').replace(/_/g, ' ').trim();
    const line = finite(p?.line_value ?? p?.line);
    if (!label || line == null || seen.has(label)) continue;
    seen.add(label);
    out.push({
      label: label.toUpperCase(),
      line: String(line),
      odds: oddsText(p?.market?.odds ?? p?.odds ?? p?.over_odds) || null,
      rate: null,
    });
    if (out.length >= MAX_PROPS) break;
  }
  return out.length ? out : null;
}

async function buildNflPacks({ date, bdl, games, onGameBuilt }) {
  const season = footballSeasonForDate(date);
  const pre = isPreseasonDate(date);
  // August: last real football is the prior regular season, and the window is
  // labeled that way. In season: the current one.
  const logSeason = pre ? season - 1 : season;

  // League-wide advanced rows — one call per unit for the whole slate. In
  // August the current season has no regular-season rows yet; the prior
  // season's ledger is the season line and the pack labels the form window.
  const statSeason = pre ? season - 1 : season;
  const primaryStats = await seasonStats(bdl, statSeason);
  // September Week 1 can be just as empty as August. Reuse one prior-season
  // fetch across the slate, only for rostered players with no current sample.
  let priorStatsPromise;
  const priorStats = () => (priorStatsPromise ??= seasonStats(bdl, season - 1));

  const teamIds = [...new Set(games.flatMap((g) => [
    (g.away_team ?? g.visitor_team)?.id, g.home_team?.id,
  ]).filter((id) => id != null))];
  const injuries = await safeCall(() => bdl.getNflPlayerInjuries(teamIds), []);
  const injuryByPlayer = new Map();
  for (const r of Array.isArray(injuries) ? injuries : []) {
    const pid = r?.player?.id;
    if (pid != null && !injuryByPlayer.has(String(pid))) injuryByPlayer.set(String(pid), r);
  }

  const packs = [];
  for (const game of games) {
    const firstPack = packs.length;
    const awayTeam = game.away_team ?? game.visitor_team;
    const homeTeam = game.home_team;
    if (!awayTeam?.id || !homeTeam?.id || game?.id == null) continue;

    const depth = await safeCall(
      () => bdl.getNflRosterDepth(fullName(homeTeam), fullName(awayTeam), season), null,
    );
    const sides = [
      { players: depth?.away || [], team: awayTeam, opponent: homeTeam },
      { players: depth?.home || [], team: homeTeam, opponent: awayTeam },
    ];
    const allIds = sides.flatMap((s) => s.players.map((p) => p?.id).filter((id) => id != null));
    if (!allIds.length) continue;

    const logs = await safeCall(
      () => bdl.getNflPlayerGameLogsBatch(allIds, logSeason, 5, 15, { seasonType: 2 }), {},
    );
    const needsPrior = pre ? [] : allIds.filter((id) => {
      const current = logs?.[id] ?? logs?.[String(id)];
      return !current?.games?.length && !hasSeasonProduction(id, primaryStats);
    });
    const priorIds = new Set(needsPrior.map(String));
    const [fallbackStats, fallbackLogs] = needsPrior.length ? await Promise.all([
      priorStats(),
      safeCall(() => bdl.getNflPlayerGameLogsBatch(needsPrior, season - 1, 5, 15, { seasonType: 2 }), {}),
    ]) : [null, null];
    const propRows = await safeCall(() => bdl.getNflPlayerProps(game.id), []);
    // Bare "AWY @ HOM" — the same join key MLB packs use (iOS matches every
    // token against team keywords, so a kick-time suffix would break the join).
    const gameLabelText = `${sideName(awayTeam)} @ ${sideName(homeTeam)}`;

    for (const side of sides) {
      for (const p of side.players) {
        if (p?.id == null || !p?.name) continue;
        const role = roleFor(p.position);
        const usePrior = priorIds.has(String(p.id));
        const windowSeason = usePrior ? season - 1 : logSeason;
        const selectedLogs = usePrior ? fallbackLogs : logs;
        const playerLogs = selectedLogs?.[p.id] ?? selectedLogs?.[String(p.id)] ?? null;
        const seasonLine = nflSeasonLine(p.id, usePrior ? fallbackStats : primaryStats);
        if (seasonLine) {
          const label = `${windowSeason} season${windowSeason !== season ? ' — prior season' : ''}`;
          seasonLine.line2 = [seasonLine.line2, label].filter(Boolean).join(' — ');
        }
        const formRows = nflFormRows(playerLogs, role, windowSeason, windowSeason !== season);
        const splits = nflSplits(playerLogs, role, injuryByPlayer.get(String(p.id)) || null);
        const props = nflProps(propRows, p.id);
        // A pack with no grounded section is not a pack.
        if (!seasonLine && !formRows && !splits && !props) continue;

        packs.push({
          date,
          league: 'NFL',
          player_id: String(p.id),
          player_name: p.name,
          team_abbr: sideName(side.team),
          game_id: String(game.id),
          payload: {
            type: role,
            name: p.name,
            team: sideName(side.team),
            position: p.position || null,
            game: gameLabelText,
            opponent: { name: fullName(side.opponent), hand: null },
            season: seasonLine,
            formRows,
            splits,
            props,
            statsSectionTitle: 'THE SHEET',
          },
        });
      }
    }
    const gamePacks = packs.slice(firstPack);
    if (gamePacks.length && onGameBuilt) await onGameBuilt(gamePacks, game);
  }
  return packs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the NFL player insight card packs for a day's slate.
 * @returns {Promise<Array<{date,league,player_id,player_name,team_abbr,game_id,payload}>>}
 */
export async function buildFootballPlayerInsightCards({ date, league, games, bdl, onGameBuilt } = {}) {
  const lg = String(league || '').toUpperCase();
  if (lg !== 'NFL') return [];
  if (!bdl || !Array.isArray(games) || !games.length) return [];

  const packs = await safeCall(() => buildNflPacks({ date, bdl, games, onGameBuilt }), []);

  console.log(`[footballPlayerCards] ${lg} ${date}: built ${packs.length} pack(s) across ${games.length} game(s).`);
  return packs;
}

export default { buildFootballPlayerInsightCards };
