// gary2.0/src/services/insights/playerInsightCards.js
//
// Builds "Player Insight Cards" — per-player betting breakdown packs that power
// the iOS Hub's full-breakdown view (tap a player card -> this payload renders).
//
// ONE pack per distinct player_id surfaced in the day's stored insight rows
// (player-backed MLB rows only). A player is classified hitter-vs-pitcher by how
// he appears in getMlbLineups(gameId): a batting-order entry -> HITTER pack; a
// side's probable pitcher -> PITCHER pack. Packs are assembled entirely from the
// documented BDL + Baseball Savant methods, mirroring the heatCheck /
// hitterRegression / regressionWatch computers.
//
// Defensive contract (house rules): NEVER throws. Any missing data source skips
// that section (the field is simply omitted from the payload — iOS treats every
// field as optional). A player who cannot be classified, or whose game is not on
// the slate, is skipped with a warn. Copy is plain/factual — no hype, no bet
// instructions.
//
// Data shapes used (verified live against the BDL/Savant APIs):
//   * getMlbLineups(gameId) -> { [abbr]: { teamName, pitcher:{name,batsThrows,
//     playerId}|null, batters:[{name,position,battingOrder,batsThrows,playerId}] } }
//   * getMlbPlayersByIds([ids]) -> { [id]: {name,position,batsThrows,team,
//     teamAbbr,teamId} }
//   * getMlbPlayerSeasonStats({season,playerIds}) -> per-player season records
//     (batting_avg/obp/slg/ops/hr/rbi, pitching_era/whip/k_per_9, player:{id})
//   * getMlbPlayerSplits({playerId,season}) -> { byBreakdown, byArena, byDayMonth }
//     - hitter byBreakdown 'vs. Left'/'vs. Right' rows: avg/obp/slg/ops/at_bats/home_runs
//     - byDayMonth 'Last 15 Days' row: avg/ops/at_bats/walks (no plate_appearances)
//     - byArena rows keyed by venue display name: avg/ops/at_bats (hitter)
//   * getMlbPlayerVsPlayer({playerId,opponentTeamId}) -> rows with
//     opponent_player:{id,full_name}, at_bats/hits/home_runs/strikeouts/avg/obp/slg/ops
//   * getMlbHitterPitchTypeStats / getMlbPitcherPitchTypeStats({playerIds,season})
//     -> ARRAY of rows per pitch type: pitch_type/pitch_name/pitch_usage_percent/
//        whiff_percent/chase_percent/pa_count/ba/slg/total_bases/home_run_count
//   * getMlbPlayerProps(gameId) -> rows { player_id, prop_type, line_value,
//     market:{type,odds} }
//   * getBatterXStats(season)/getPitcherXStats(season) -> name-joined expected
//     stats (ba/est_ba/slg/est_slg/woba/est_woba ; era/xera for pitchers)

import { nameKey, pct3, round, parseBatsThrows } from './shared.js';
import { getBatterXStats, getPitcherXStats } from '../baseballSavantService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────────

const PITCH_MIN_USAGE = 8;        // opposing-starter pitch types shown >= this %
const PITCH_MIN_PA_THIN = 10;     // batter pa_count vs a pitch below this -> "thin"
const PITCH_MIN_PA_SIGNAL = 15;   // sample required to source a strength/weakness
const XBA_VERDICT_GAP = 0.020;    // |actual - expected| below this -> "in line"
const MIN_SAVANT_PA = 100;        // Savant join needs a real sample (drops name collisions)
const FORM_MIN_AB = 10;           // minimum recent-window AB to show form
const VENUE_MIN_AB = 12;          // minimum venue AB to show a venue split
const BVP_MIN_AB = 4;             // minimum career AB vs opp to show BvP
const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 3;
const MAX_PROPS = 4;

// Form ladder + prop hit-rate windows (June 11 build-out). All windows read
// getMlbPlayerGameRowsChrono — finals-only, spring-excluded, true chronology
// (the June 3 audit source) — and FAIL CLOSED below the row/AB minimums.
const FORM_L5_MIN_ROWS = 4;       // hitter "last 5" rung needs >= 4 games
const FORM_L10_MIN_ROWS = 8;      // hitter "last 10" rung needs >= 8 games
const RATE_WINDOW_HITTER = 10;    // prop hit-rate window, hitter (games)
const RATE_MIN_ROWS_HITTER = 6;
const RATE_WINDOW_PITCHER = 5;    // prop hit-rate window, pitcher (outings)
const RATE_MIN_ROWS_PITCHER = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build player insight card packs for a day's slate.
 *
 * @param {object} args
 * @param {string} args.date         YYYY-MM-DD
 * @param {string} args.league       e.g. 'MLB'
 * @param {Array}  args.connections  the day's stored insight rows (player_id/game_id/category)
 * @param {Array}  args.games        the BDL slate (getMlbGamesForDate shape)
 * @returns {Promise<Array<{date,league,player_id,player_name,team_abbr,game_id,payload}>>}
 */
export async function buildPlayerInsightCards({ date, league, connections, games } = {}) {
  // MLB only for now — every other league returns an empty pack list.
  if (String(league || '').toUpperCase() !== 'MLB') return [];

  const season = seasonForDate(date);
  const bdl = await loadBdl();
  if (!bdl) return [];

  const slate = Array.isArray(games) ? games.map(normalizeGame) : [];
  if (!slate.length) {
    console.log('[playerInsightCards] empty slate — nothing to build.');
    return [];
  }

  // Distinct player ids among the day's player-backed MLB rows.
  const playerIds = distinctPlayerIds(connections);
  if (!playerIds.length) {
    console.log('[playerInsightCards] no player-backed connections — nothing to build.');
    return [];
  }

  // Whole-slate batched reads (one call each).
  const playersById = await safeCall(() => bdl.getMlbPlayersByIds(playerIds), {});
  const seasonRows = await safeCall(
    () => bdl.getMlbPlayerSeasonStats({ season, playerIds }), [],
  );
  const seasonById = indexSeasonByPlayerId(seasonRows);
  const batterX = indexXByName(await safeCall(() => getBatterXStats(season), []));
  const pitcherX = indexXByName(await safeCall(() => getPitcherXStats(season), []));

  // Per-game memoized lineups + props (avoid re-fetching for co-located players).
  const lineupMemo = new Map();
  const propsMemo = new Map();
  const getLineups = (gameId) => memoLineups(bdl, lineupMemo, gameId);
  const getProps = (gameId) => memoProps(bdl, propsMemo, gameId);

  const packs = [];
  const stats = { examined: 0, hitter: 0, pitcher: 0, skipped: 0 };

  for (const playerId of playerIds) {
    stats.examined += 1;
    try {
      const pack = await buildOnePack({
        playerId, season, slate, bdl,
        playersById, seasonById, batterX, pitcherX,
        getLineups, getProps,
      });
      if (!pack) { stats.skipped += 1; continue; }
      if (pack.payload.type === 'pitcher') stats.pitcher += 1; else stats.hitter += 1;
      packs.push({
        date,
        league: 'MLB',
        player_id: String(playerId),
        player_name: pack.payload.name || null,
        team_abbr: pack.payload.team || null,
        game_id: pack.gameId != null ? String(pack.gameId) : null,
        payload: pack.payload,
      });
    } catch (err) {
      stats.skipped += 1;
      console.error(`[playerInsightCards] player ${playerId} error:`, err?.message || err);
    }
  }

  console.log(
    `[playerInsightCards] examined ${stats.examined}, built ${packs.length} ` +
      `(${stats.hitter} hitter / ${stats.pitcher} pitcher), skipped ${stats.skipped}.`,
  );
  return packs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-player pack assembly
// ─────────────────────────────────────────────────────────────────────────────

async function buildOnePack(args) {
  const {
    playerId, season, slate, bdl,
    playersById, seasonById, batterX, pitcherX, getLineups, getProps,
  } = args;

  // 1. Locate the player in a slate game's lineup -> classify hitter vs pitcher.
  const loc = await locatePlayer(playerId, slate, getLineups);
  if (!loc) return null; // not in any posted lineup -> cannot classify, skip

  const { game, gameId, sideAbbr, oppAbbr, role, lineupEntry, lineups } = loc;
  const header = playersById[playerId] || playersById[String(playerId)] || {};
  const seasonRec = seasonById.get(String(playerId)) || null;
  const gameLabel = gameAbbrLabel(game);

  const name = header.name || lineupEntry?.name || seasonRec?.player?.full_name || 'Player';
  const teamAbbr = header.teamAbbr || sideAbbr || null;
  const position = header.position || lineupEntry?.position || null;
  const { bats, throws } = parseBatsThrows(lineupEntry?.batsThrows || header.batsThrows || '');

  if (role === 'pitcher') {
    return buildPitcherPack({
      playerId, season, bdl, game, gameId, oppAbbr, name, teamAbbr, position,
      throws, seasonRec, pitcherX, getProps,
    });
  }
  return buildHitterPack({
    playerId, season, bdl, game, gameId, oppAbbr, name, teamAbbr, position,
    bats, seasonRec, batterX, lineups, gameLabel, getProps,
  });
}

// ─── HITTER ──────────────────────────────────────────────────────────────────

async function buildHitterPack(a) {
  const {
    playerId, season, bdl, game, gameId, oppAbbr, name, teamAbbr, position,
    bats, seasonRec, batterX, lineups, getProps,
  } = a;

  const payload = { type: 'hitter', name, game: gameAbbrLabel(game) };
  if (teamAbbr) payload.team = teamAbbr;
  if (position) payload.position = position;
  if (bats) payload.hand = bats;

  // Tonight's opposing probable starter (the other side's pitcher).
  const oppPitcher = lineups?.[oppAbbr]?.pitcher || null;
  if (oppPitcher?.name) {
    const { throws: oppThrows } = parseBatsThrows(oppPitcher.batsThrows || '');
    payload.opponent = { name: oppPitcher.name };
    if (oppThrows) payload.opponent.hand = oppThrows;
  }

  // Season display.
  const seasonDisplay = hitterSeasonDisplay(seasonRec);
  if (seasonDisplay) payload.season = seasonDisplay;

  // Splits (vs RHP / vs LHP) + form (Last 15) + venue, from one splits call.
  const splits = await safeCall(() => bdl.getMlbPlayerSplits({ playerId, season }), null);
  const platoon = hitterPlatoonSplits(splits);
  if (platoon.rows.length) payload.splits = platoon.rows;
  const form = hitterForm(splits);
  if (form) payload.form = form;
  const venue = hitterVenue(splits, game);
  if (venue) payload.venue = venue;

  // xstats vs expected (Savant name-join).
  const xrow = batterX.get(nameKey(name)) || batterX.get(lastNameKey(name));
  const xstats = hitterXStats(xrow);
  if (xstats.length) payload.xstats = xstats;

  // Pitch matchup: BATTER's numbers vs each pitch the opposing starter throws.
  let pitchMatchup = [];
  if (oppPitcher?.playerId != null) {
    const oppArsenal = await safeCall(
      () => bdl.getMlbPitcherPitchTypeStats({ playerIds: [oppPitcher.playerId], season }), [],
    );
    const batterPitches = await safeCall(
      () => bdl.getMlbHitterPitchTypeStats({ playerIds: [playerId], season }), [],
    );
    pitchMatchup = hitterPitchMatchup(asArray(oppArsenal), asArray(batterPitches));
    if (pitchMatchup.length) payload.pitchMatchup = pitchMatchup;
  }

  // Batter vs opposing probable (career), via PvP on the opponent team.
  let bvp = null;
  const oppTeamId = teamIdForAbbr(game, oppAbbr);
  if (oppPitcher?.playerId != null && oppTeamId != null) {
    const pvpRows = await safeCall(
      () => bdl.getMlbPlayerVsPlayer({ playerId, opponentTeamId: oppTeamId }), [],
    );
    bvp = hitterBvp(asArray(pvpRows), oppPitcher.playerId, oppPitcher.name);
    if (bvp) payload.bvp = bvp;
  }

  // Tonight's lines for this hitter.
  const props = hitterProps(await getProps(gameId), playerId);
  if (props.length) payload.props = props;

  // Form ladder + prop hit rates from the chrono game log (tonight excluded).
  const chrono = await safeCall(() => bdl.getMlbPlayerGameRowsChrono(playerId, season), []);
  const batRows = asArray(chrono).filter(
    (r) => String(r?.game_id) !== String(gameId) && num(r.at_bats) != null,
  );
  const formRows = hitterFormRows(batRows);
  if (formRows.length) payload.formRows = formRows;
  attachPropRates(props, batRows, RATE_STAT_HITTER,
    { window: RATE_WINDOW_HITTER, minRows: RATE_MIN_ROWS_HITTER });

  // Strengths / weaknesses (deterministic, derived from the above).
  const { strengths, weaknesses } = hitterStrengthsWeaknesses({
    name, platoon, xstats, form, seasonDisplay, bvp, pitchMatchup,
  });
  if (strengths.length) payload.strengths = strengths;
  if (weaknesses.length) payload.weaknesses = weaknesses;

  stripInternal(payload.pitchMatchup);
  return { payload, gameId };
}

// ─── PITCHER ─────────────────────────────────────────────────────────────────

async function buildPitcherPack(a) {
  const {
    playerId, season, bdl, game, gameId, oppAbbr, name, teamAbbr, position,
    throws, seasonRec, pitcherX, getProps,
  } = a;

  const payload = { type: 'pitcher', name, game: gameAbbrLabel(game) };
  if (teamAbbr) payload.team = teamAbbr;
  if (position) payload.position = position;
  if (throws) payload.hand = throws;

  // For a pitcher pack the "opponent" is the opposing TEAM (hand null).
  if (oppAbbr) payload.opponent = { name: oppAbbr, hand: null };

  // Season display (ERA/WHIP, K/9).
  const seasonDisplay = pitcherSeasonDisplay(seasonRec);
  if (seasonDisplay) payload.season = seasonDisplay;

  // Splits: vs RHB/LHB (pitching) + form (Last 15) + venue, from one splits call.
  const splits = await safeCall(() => bdl.getMlbPlayerSplits({ playerId, season }), null);
  const platoon = pitcherPlatoonSplits(splits);
  if (platoon.rows.length) payload.splits = platoon.rows;
  const form = pitcherForm(splits);
  if (form) payload.form = form;
  const venue = pitcherVenue(splits, game);
  if (venue) payload.venue = venue;

  // xstats: ERA vs xERA, opp BA vs xBA.
  const xrow = pitcherX.get(nameKey(name)) || pitcherX.get(lastNameKey(name));
  const xstats = pitcherXStats(xrow);
  if (xstats.length) payload.xstats = xstats;

  // Pitch matchup: his OWN arsenal (usage + opponent ba/slg/whiff per pitch).
  const arsenal = await safeCall(
    () => bdl.getMlbPitcherPitchTypeStats({ playerIds: [playerId], season }), [],
  );
  const pitchMatchup = pitcherPitchMatchup(asArray(arsenal));
  if (pitchMatchup.length) payload.pitchMatchup = pitchMatchup;

  // Tonight's lines for this pitcher (strikeouts etc).
  const props = pitcherProps(await getProps(gameId), playerId);
  if (props.length) payload.props = props;

  // Form ladder + prop hit rates from the chrono game log (tonight excluded).
  const chrono = await safeCall(() => bdl.getMlbPlayerGameRowsChrono(playerId, season), []);
  const pitched = asArray(chrono).filter(
    (r) => String(r?.game_id) !== String(gameId) && ipOuts(r.ip) > 0,
  );
  const formRows = pitcherFormRows(pitched);
  if (formRows.length) payload.formRows = formRows;
  attachPropRates(props, pitched, RATE_STAT_PITCHER,
    { window: RATE_WINDOW_PITCHER, minRows: RATE_MIN_ROWS_PITCHER });

  // Strengths / weaknesses for the pitcher.
  const { strengths, weaknesses } = pitcherStrengthsWeaknesses({
    name, platoon, xstats, form, pitchMatchup,
  });
  if (strengths.length) payload.strengths = strengths;
  if (weaknesses.length) payload.weaknesses = weaknesses;

  stripInternal(payload.pitchMatchup);
  return { payload, gameId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Player location / classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the slate game + side this player appears in, and whether he is a batter
 * (hitter pack) or a probable pitcher (pitcher pack). Returns null when the
 * player is in no posted lineup on the slate.
 */
async function locatePlayer(playerId, slate, getLineups) {
  const pid = String(playerId);
  for (const game of slate) {
    const gameId = game?.id;
    if (gameId == null) continue;
    const lineups = await getLineups(gameId);
    if (!lineups || typeof lineups !== 'object') continue;

    for (const abbr of Object.keys(lineups)) {
      const side = lineups[abbr];
      if (!side || typeof side !== 'object') continue;

      // Probable pitcher?
      if (side.pitcher && String(side.pitcher.playerId) === pid) {
        return {
          game, gameId, sideAbbr: abbr, oppAbbr: otherAbbr(lineups, abbr),
          role: 'pitcher', lineupEntry: side.pitcher, lineups,
        };
      }
      // Batter?
      const batters = Array.isArray(side.batters) ? side.batters : [];
      const b = batters.find((x) => String(x?.playerId) === pid);
      if (b) {
        return {
          game, gameId, sideAbbr: abbr, oppAbbr: otherAbbr(lineups, abbr),
          role: 'batter', lineupEntry: b, lineups,
        };
      }
    }
  }
  return null;
}

function otherAbbr(lineups, abbr) {
  const keys = Object.keys(lineups || {});
  return keys.find((k) => k !== abbr) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hitter section builders
// ─────────────────────────────────────────────────────────────────────────────

function hitterSeasonDisplay(rec) {
  if (!rec) return null;
  const avg = num(rec.batting_avg);
  const ops = num(rec.batting_ops);
  const hr = num(rec.batting_hr);
  const rbi = num(rec.batting_rbi);
  const line1Parts = [];
  if (avg != null) line1Parts.push(`${pct3(avg)} AVG`);
  if (ops != null) line1Parts.push(`${pct3(ops)} OPS`);
  const line2Parts = [];
  if (hr != null) line2Parts.push(`${hr} HR`);
  if (rbi != null) line2Parts.push(`${rbi} RBI`);
  const out = {};
  if (line1Parts.length) out.line1 = line1Parts.join(' · ');
  if (line2Parts.length) out.line2 = line2Parts.join(' · ');
  return (out.line1 || out.line2) ? out : null;
}

/**
 * vs RHP / vs LHP rows from the hitter's byBreakdown. Returns { rows, byHand }
 * where byHand maps 'R'/'L' -> the parsed split numbers for s/w derivation.
 */
function hitterPlatoonSplits(splits) {
  const out = { rows: [], byHand: {} };
  const rows = splits?.byBreakdown;
  if (!Array.isArray(rows)) return out;

  const map = [
    { hand: 'R', splitName: 'vs. Right', label: 'vs RHP' },
    { hand: 'L', splitName: 'vs. Left', label: 'vs LHP' },
  ];
  for (const { hand, splitName, label } of map) {
    const row = rows.find(
      (r) => r && nameKey(r.split_name) === nameKey(splitName) &&
        (r.category == null || r.category === 'batting'),
    );
    if (!row) continue;
    const avg = num(row.avg);
    const ops = num(row.ops);
    const ab = num(row.at_bats);
    const hr = num(row.home_runs);
    if (avg == null && ops == null) continue;
    const valueParts = [];
    if (avg != null) valueParts.push(`${pct3(avg)} AVG`);
    if (ops != null) valueParts.push(`${pct3(ops)} OPS`);
    const detailParts = [];
    if (hr != null) detailParts.push(`${hr} HR`);
    if (ab != null) detailParts.push(`${ab} AB`);
    const entry = { label, value: valueParts.join(' · ') };
    if (detailParts.length === 2) entry.detail = `${detailParts[0]} in ${detailParts[1]}`;
    else if (detailParts.length === 1) entry.detail = detailParts[0];
    out.rows.push(entry);
    out.byHand[hand] = { avg, ops, ab, hr };
  }
  return out;
}

function hitterForm(splits) {
  const row = last15Row(splits);
  if (!row) return null;
  const avg = num(row.avg);
  const ops = num(row.ops);
  const ab = num(row.at_bats);
  if (avg == null && ops == null) return null;
  if (ab != null && ab < FORM_MIN_AB) return null;
  const valueParts = [];
  if (avg != null) valueParts.push(`${pct3(avg)} AVG`);
  if (ops != null) valueParts.push(`${pct3(ops)} OPS`);
  const out = { label: (row.split_name || 'Last 15 Days').toUpperCase(), value: valueParts.join(' · ') };
  if (ab != null) out.detail = `${ab} AB`;
  return out;
}

function hitterVenue(splits, game) {
  const venueName = venueOf(game);
  if (!venueName) return null;
  const rows = splits?.byArena;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r) => nameKey(r?.split_name) === nameKey(venueName));
  if (!row) return null;
  const ab = num(row.at_bats);
  if (ab == null || ab < VENUE_MIN_AB) return null;
  const avg = num(row.avg);
  const ops = num(row.ops);
  if (avg == null && ops == null) return null;
  const valueParts = [];
  if (avg != null) valueParts.push(`${pct3(avg)} AVG`);
  if (ops != null) valueParts.push(`${pct3(ops)} OPS`);
  return {
    label: `At ${venueName}`,
    value: valueParts.join(' · '),
    detail: `${ab} AB`,
  };
}

function hitterXStats(xrow) {
  if (!xrow) return [];
  // Savant rows join by name; a tiny `pa` is almost always a last-name collision
  // with the wrong player (e.g. a 3-PA call-up). FAIL CLOSED below the floor.
  const pa = num(xrow.pa);
  if (pa == null || pa < MIN_SAVANT_PA) return [];
  const out = [];
  pushXStat(out, 'AVG vs xBA', num(xrow.ba), num(xrow.est_ba), XBA_VERDICT_GAP);
  pushXStat(out, 'SLG vs xSLG', num(xrow.slg), num(xrow.est_slg), XBA_VERDICT_GAP * 2);
  pushXStat(out, 'wOBA vs xwOBA', num(xrow.woba), num(xrow.est_woba), XBA_VERDICT_GAP);
  return out;
}

/**
 * One row per pitch the opposing starter throws >= PITCH_MIN_USAGE%, showing the
 * BATTER's numbers vs that pitch type. grade: strong (ba>=.280 or slg>=.500),
 * weak (ba<=.200 or whiff>=35), thin (batter pa_count < 10), else neutral.
 */
function hitterPitchMatchup(oppArsenal, batterPitches) {
  const batterByType = indexPitchesByType(batterPitches);
  const out = [];
  for (const arn of oppArsenal) {
    const usage = num(arn.pitch_usage_percent);
    if (usage == null || usage < PITCH_MIN_USAGE) continue;
    const type = arn.pitch_type;
    const bRow = batterByType.get(String(type));
    const entry = {
      pitch: arn.pitch_name || type || 'Pitch',
      usagePct: round(usage, 1),
    };
    const pa = bRow ? num(bRow.pa_count) : null;
    const ba = bRow ? num(bRow.ba) : null;
    const slg = bRow ? num(bRow.slg) : null;
    const whiff = bRow ? num(bRow.whiff_percent) : null;
    if (ba != null) entry.ba = pct3(ba);
    if (slg != null) entry.slg = pct3(slg);
    if (whiff != null) entry.whiffPct = round(whiff, 1);
    entry.grade = gradeBatterVsPitch(pa, ba, slg, whiff);
    // Internal (stripped before payload): batter sample vs this pitch, so the
    // strengths/weaknesses pass can require a bigger sample than the table grade.
    entry._pa = pa;
    out.push(entry);
  }
  // Order by the starter's usage (most-thrown first).
  out.sort((x, y) => (y.usagePct || 0) - (x.usagePct || 0));
  return out;
}

function gradeBatterVsPitch(pa, ba, slg, whiff) {
  if (pa == null || pa < PITCH_MIN_PA_THIN) return 'thin';
  if ((ba != null && ba >= 0.280) || (slg != null && slg >= 0.500)) return 'strong';
  if ((ba != null && ba <= 0.200) || (whiff != null && whiff >= 35)) return 'weak';
  return 'neutral';
}

function hitterBvp(pvpRows, oppPitcherId, oppPitcherName) {
  const row = pvpRows.find((r) => String(r?.opponent_player?.id) === String(oppPitcherId));
  if (!row) return null;
  const ab = num(row.at_bats);
  if (ab == null || ab < BVP_MIN_AB) return null;
  const hits = num(row.hits) ?? 0;
  const hr = num(row.home_runs);
  const k = num(row.strikeouts);
  const avg = num(row.avg);
  const ops = num(row.ops);
  const obp = num(row.obp);
  const name = oppPitcherName || row?.opponent_player?.full_name || 'opposing starter';

  const valueParts = [`${hits}-for-${ab}`];
  if (hr != null && hr > 0) valueParts.push(`${hr} HR`);
  const detailParts = [];
  if (avg != null) detailParts.push(`${pct3(avg)} AVG`);
  if (ops != null) detailParts.push(`${pct3(ops)} OPS`);
  else if (obp != null) detailParts.push(`${pct3(obp)} OBP`);
  if (k != null) detailParts.push(`${k} K`);
  const out = { label: `vs ${name} (career)`, value: valueParts.join(' · ') };
  if (detailParts.length) out.detail = detailParts.join(' · ');
  return out;
}

function hitterProps(propRows, playerId) {
  return formatProps(propRows, playerId, ['total_bases', 'hits', 'home_runs', 'runs_batted_in', 'rbi']);
}

/**
 * Derive up to 3 strengths and 3 weaknesses from the hitter's data. Deterministic
 * — strongest signals first across pitch-type rows, platoon gap, xstats, form,
 * and BvP. Plain copy, no bet instructions.
 */
function hitterStrengthsWeaknesses(ctx) {
  const { platoon, xstats, form, seasonDisplay, bvp, pitchMatchup } = ctx;
  const strengths = [];
  const weaknesses = [];

  // Pitch-type signals (only graded rows with a real sample feed s/w).
  for (const row of pitchMatchup) {
    if (num(row._pa) == null || num(row._pa) < PITCH_MIN_PA_SIGNAL) continue;
    if (row.grade === 'strong') {
      const bits = [];
      if (row.ba) bits.push(`${row.ba} BA`);
      if (row.slg) bits.push(`${row.slg} SLG`);
      strengths.push(`Handles ${row.pitch.toLowerCase()}s${bits.length ? ` — ${bits.join(', ')}` : ''}`);
    } else if (row.grade === 'weak') {
      const bits = [];
      if (row.ba) bits.push(`${row.ba} BA`);
      if (row.whiffPct != null) bits.push(`${row.whiffPct}% whiff`);
      weaknesses.push(`Struggles with ${row.pitch.toLowerCase()}s${bits.length ? ` — ${bits.join(', ')}` : ''}`);
    }
  }

  // Platoon gap (>= .150 OPS between the two sides).
  const r = platoon.byHand?.R;
  const l = platoon.byHand?.L;
  if (r?.ops != null && l?.ops != null) {
    const gap = r.ops - l.ops;
    if (gap >= 0.150) {
      strengths.push(`Hits righties hard — ${pct3(r.ops)} OPS vs RHP`);
      weaknesses.push(`Quieter vs lefties — ${pct3(l.ops)} OPS vs LHP`);
    } else if (gap <= -0.150) {
      strengths.push(`Hits lefties hard — ${pct3(l.ops)} OPS vs LHP`);
      weaknesses.push(`Quieter vs righties — ${pct3(r.ops)} OPS vs RHP`);
    }
  }

  // xstats verdicts.
  for (const x of xstats) {
    if (x.verdict === 'underperforming' && x.label === 'AVG vs xBA') {
      strengths.push(`Hitting into bad luck — ${x.expected} xBA vs ${x.actual} AVG`);
    } else if (x.verdict === 'overperforming' && x.label === 'AVG vs xBA') {
      weaknesses.push(`Outrunning his contact — ${x.actual} AVG on a ${x.expected} xBA`);
    }
  }

  // Form vs season OPS.
  if (form?.value && seasonDisplay?.line1) {
    const formOps = parseOpsFromValue(form.value);
    const seasonOps = parseOpsFromValue(seasonDisplay.line1);
    if (formOps != null && seasonOps != null) {
      if (formOps - seasonOps >= 0.120) strengths.push(`Hot bat — ${pct3(formOps)} OPS over the last 15 days`);
      else if (seasonOps - formOps >= 0.120) weaknesses.push(`Cooling off — ${pct3(formOps)} OPS over the last 15 days`);
    }
  }

  // BvP edge.
  if (bvp?.value) {
    const m = /^(\d+)-for-(\d+)/.exec(bvp.value);
    if (m) {
      const h = Number(m[1]); const ab = Number(m[2]);
      if (ab >= 6) {
        const ba = h / ab;
        if (ba >= 0.300) strengths.push(`Owns this matchup — ${bvp.value} career`);
        else if (ba <= 0.150) weaknesses.push(`Quiet history in this matchup — ${bvp.value} career`);
      }
    }
  }

  return {
    strengths: dedupeCap(strengths, MAX_STRENGTHS),
    weaknesses: dedupeCap(weaknesses, MAX_WEAKNESSES),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pitcher section builders
// ─────────────────────────────────────────────────────────────────────────────

function pitcherSeasonDisplay(rec) {
  if (!rec) return null;
  const era = num(rec.pitching_era);
  const whip = num(rec.pitching_whip);
  const k9 = num(rec.pitching_k_per_9);
  const line1Parts = [];
  if (era != null) line1Parts.push(`${round(era, 2).toFixed(2)} ERA`);
  if (whip != null) line1Parts.push(`${round(whip, 2).toFixed(2)} WHIP`);
  const out = {};
  if (line1Parts.length) out.line1 = line1Parts.join(' · ');
  if (k9 != null) out.line2 = `${round(k9, 1).toFixed(1)} K/9`;
  return (out.line1 || out.line2) ? out : null;
}

/**
 * Pitcher vs RHB / vs LHB from byBreakdown (pitching rows: opponent_avg, era,
 * innings_pitched). Many pitchers have no L/R breakdown populated — returns
 * empty rows then (defensive).
 */
function pitcherPlatoonSplits(splits) {
  const out = { rows: [], byHand: {} };
  const rows = splits?.byBreakdown;
  if (!Array.isArray(rows)) return out;

  const map = [
    { hand: 'R', splitName: 'vs. Right', label: 'vs RHB' },
    { hand: 'L', splitName: 'vs. Left', label: 'vs LHB' },
  ];
  for (const { hand, splitName, label } of map) {
    const row = rows.find(
      (r) => r && nameKey(r.split_name) === nameKey(splitName) &&
        (r.category == null || r.category === 'pitching'),
    );
    if (!row) continue;
    const oppAvg = num(row.opponent_avg);
    const era = num(row.era);
    const ip = num(row.innings_pitched);
    if (oppAvg == null && era == null) continue;
    const valueParts = [];
    if (oppAvg != null) valueParts.push(`${pct3(oppAvg)} opp AVG`);
    if (era != null) valueParts.push(`${round(era, 2).toFixed(2)} ERA`);
    const entry = { label, value: valueParts.join(' · ') };
    if (ip != null) entry.detail = `${formatIp(ip)} IP`;
    out.rows.push(entry);
    out.byHand[hand] = { oppAvg, era, ip };
  }
  return out;
}

function pitcherForm(splits) {
  const row = last15Row(splits);
  if (!row) return null;
  const era = num(row.era);
  const oppAvg = num(row.opponent_avg);
  const ip = num(row.innings_pitched);
  if (era == null && oppAvg == null) return null;
  const valueParts = [];
  if (era != null) valueParts.push(`${round(era, 2).toFixed(2)} ERA`);
  if (oppAvg != null) valueParts.push(`${pct3(oppAvg)} opp AVG`);
  const out = { label: (row.split_name || 'Last 15 Days').toUpperCase(), value: valueParts.join(' · ') };
  if (ip != null) out.detail = `${formatIp(ip)} IP`;
  return out;
}

function pitcherVenue(splits, game) {
  const venueName = venueOf(game);
  if (!venueName) return null;
  const rows = splits?.byArena;
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r) => nameKey(r?.split_name) === nameKey(venueName));
  if (!row) return null;
  const ip = num(row.innings_pitched);
  const era = num(row.era);
  const oppAvg = num(row.opponent_avg);
  if (ip == null || ip < 5) return null;
  if (era == null && oppAvg == null) return null;
  const valueParts = [];
  if (era != null) valueParts.push(`${round(era, 2).toFixed(2)} ERA`);
  if (oppAvg != null) valueParts.push(`${pct3(oppAvg)} opp AVG`);
  return {
    label: `At ${venueName}`,
    value: valueParts.join(' · '),
    detail: `${formatIp(ip)} IP`,
  };
}

function pitcherXStats(xrow) {
  if (!xrow) return [];
  // Same name-collision guard as the hitter side (Savant pitcher rows carry `pa`).
  const pa = num(xrow.pa);
  if (pa == null || pa < MIN_SAVANT_PA) return [];
  const out = [];
  // ERA vs xERA — for run prevention, LOWER actual than expected = overperforming.
  const era = num(xrow.era);
  const xera = num(xrow.xera);
  if (era != null && xera != null) {
    out.push({
      label: 'ERA vs xERA',
      actual: round(era, 2).toFixed(2),
      expected: round(xera, 2).toFixed(2),
      verdict: lowerIsBetterVerdict(era, xera, 0.30),
    });
  }
  pushXStat(out, 'Opp AVG vs xBA', num(xrow.ba), num(xrow.est_ba), XBA_VERDICT_GAP, true);
  return out;
}

/**
 * Pitcher's own arsenal rows: usage + opponent ba/slg/whiff per pitch. Graded
 * from the PITCHER's perspective — weak contact allowed = strong.
 * strong: opp ba<=.220 or whiff>=30. weak: opp ba>=.280 or slg>=.480. else neutral.
 */
function pitcherPitchMatchup(arsenal) {
  const out = [];
  for (const arn of arsenal) {
    const usage = num(arn.pitch_usage_percent);
    if (usage == null || usage < PITCH_MIN_USAGE) continue;
    const entry = {
      pitch: arn.pitch_name || arn.pitch_type || 'Pitch',
      usagePct: round(usage, 1),
    };
    const pa = num(arn.pa_count);
    const ba = num(arn.ba);
    const slg = num(arn.slg);
    const whiff = num(arn.whiff_percent);
    if (ba != null) entry.ba = pct3(ba);
    if (slg != null) entry.slg = pct3(slg);
    if (whiff != null) entry.whiffPct = round(whiff, 1);
    entry.grade = gradePitcherPitch(pa, ba, slg, whiff);
    entry._pa = pa; // internal (stripped before payload) — s/w sample gate
    out.push(entry);
  }
  out.sort((x, y) => (y.usagePct || 0) - (x.usagePct || 0));
  return out;
}

function gradePitcherPitch(pa, ba, slg, whiff) {
  if (pa == null || pa < PITCH_MIN_PA_THIN) return 'thin';
  if ((ba != null && ba <= 0.220) || (whiff != null && whiff >= 30)) return 'strong';
  if ((ba != null && ba >= 0.280) || (slg != null && slg >= 0.480)) return 'weak';
  return 'neutral';
}

function pitcherProps(propRows, playerId) {
  return formatProps(propRows, playerId, ['strikeouts', 'outs', 'earned_runs', 'hits_allowed', 'walks']);
}

function pitcherStrengthsWeaknesses(ctx) {
  const { platoon, xstats, form, pitchMatchup } = ctx;
  const strengths = [];
  const weaknesses = [];

  for (const row of pitchMatchup) {
    if (num(row._pa) == null || num(row._pa) < PITCH_MIN_PA_SIGNAL) continue;
    if (row.grade === 'strong') {
      const bits = [];
      if (row.whiffPct != null) bits.push(`${row.whiffPct}% whiff`);
      if (row.ba) bits.push(`${row.ba} opp BA`);
      strengths.push(`${capitalize(row.pitch)} misses bats${bits.length ? ` — ${bits.join(', ')}` : ''}`);
    } else if (row.grade === 'weak') {
      const bits = [];
      if (row.ba) bits.push(`${row.ba} opp BA`);
      if (row.slg) bits.push(`${row.slg} opp SLG`);
      weaknesses.push(`${capitalize(row.pitch)} gets hit${bits.length ? ` — ${bits.join(', ')}` : ''}`);
    }
  }

  // Platoon: lower opp AVG = better against that side.
  const r = platoon.byHand?.R;
  const l = platoon.byHand?.L;
  if (r?.oppAvg != null && l?.oppAvg != null) {
    const gap = r.oppAvg - l.oppAvg;
    if (gap >= 0.060) {
      strengths.push(`Tough on lefties — ${pct3(l.oppAvg)} opp AVG vs LHB`);
      weaknesses.push(`Vulnerable to righties — ${pct3(r.oppAvg)} opp AVG vs RHB`);
    } else if (gap <= -0.060) {
      strengths.push(`Tough on righties — ${pct3(r.oppAvg)} opp AVG vs RHB`);
      weaknesses.push(`Vulnerable to lefties — ${pct3(l.oppAvg)} opp AVG vs LHB`);
    }
  }

  // xstats.
  for (const x of xstats) {
    if (x.label === 'ERA vs xERA') {
      if (x.verdict === 'underperforming') strengths.push(`Better than his ERA shows — ${x.expected} xERA vs ${x.actual} ERA`);
      else if (x.verdict === 'overperforming') weaknesses.push(`Outrunning his contact — ${x.actual} ERA on a ${x.expected} xERA`);
    }
  }

  // Form vs nothing absolute — just flag a strong/weak recent ERA window.
  if (form?.value) {
    const era = parseEraFromValue(form.value);
    if (era != null) {
      if (era <= 2.50) strengths.push(`Sharp lately — ${era.toFixed(2)} ERA over the last 15 days`);
      else if (era >= 5.50) weaknesses.push(`Roughed up lately — ${era.toFixed(2)} ERA over the last 15 days`);
    }
  }

  return {
    strengths: dedupeCap(strengths, MAX_STRENGTHS),
    weaknesses: dedupeCap(weaknesses, MAX_WEAKNESSES),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Push an "actual vs expected" xstat row (higher-is-better metric by default). */
function pushXStat(out, label, actual, expected, gap, lowerIsBetter = false) {
  if (actual == null || expected == null) return;
  out.push({
    label,
    actual: pct3(actual),
    expected: pct3(expected),
    verdict: lowerIsBetter
      ? lowerIsBetterVerdict(actual, expected, gap)
      : higherIsBetterVerdict(actual, expected, gap),
  });
}

/** Higher actual than expected over the gap = overperforming (luck risk). */
function higherIsBetterVerdict(actual, expected, gap) {
  const d = actual - expected;
  if (d > gap) return 'overperforming';
  if (d < -gap) return 'underperforming';
  return 'in line';
}

/** Lower actual than expected over the gap = overperforming (run-prevention luck). */
function lowerIsBetterVerdict(actual, expected, gap) {
  const d = actual - expected;
  if (d < -gap) return 'overperforming';
  if (d > gap) return 'underperforming';
  return 'in line';
}

/**
 * Format up to MAX_PROPS posted lines for a player, preferring over/under markets
 * and the priority prop types passed. Returns [{label, line, odds}].
 */
function formatProps(propRows, playerId, priorityTypes) {
  const rows = (Array.isArray(propRows) ? propRows : []).filter(
    (r) => String(r?.player_id) === String(playerId),
  );
  if (!rows.length) return [];

  const ranked = [...rows].sort((a, b) => {
    const ap = priorityTypes.indexOf(String(a?.prop_type || '').toLowerCase());
    const bp = priorityTypes.indexOf(String(b?.prop_type || '').toLowerCase());
    const aw = ap === -1 ? 99 : ap;
    const bw = bp === -1 ? 99 : bp;
    if (aw !== bw) return aw - bw;
    // Prefer standard over/under markets over milestone/extreme-odds rows.
    return marketRank(a) - marketRank(b);
  });

  const out = [];
  const seen = new Set();
  for (const r of ranked) {
    const propType = String(r?.prop_type || '').toLowerCase();
    if (seen.has(propType)) continue;
    const line = num(r?.line_value);
    // _type is internal — attachPropRates joins on it, then strips it.
    const entry = { label: propLabel(propType), _type: propType };
    if (line != null) entry.line = String(line);
    const odds = r?.market?.odds;
    if (odds != null && Number.isFinite(Number(odds))) entry.odds = formatOdds(odds);
    if (entry.line == null && entry.odds == null) continue;
    seen.add(propType);
    out.push(entry);
    if (out.length >= MAX_PROPS) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Form ladders + prop hit rates (chrono game-log derived)
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2026-06-10..." -> "JUN 10" (null on anything unparseable). */
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${MONTHS_ABBR[mo - 1]} ${Number(m[3])}`;
}

/** BDL ip notation ("5.2" = 5 innings 2 outs) -> total outs. */
function ipOuts(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const whole = Math.trunc(n);
  const frac = Math.round((n - whole) * 10);
  return whole * 3 + (frac === 1 ? 1 : frac === 2 ? 2 : 0);
}

function outsToIp(outs) { return `${Math.trunc(outs / 3)}.${outs % 3}`; }

/**
 * Hitter form ladder: LAST GAME -> LAST 5 -> LAST 10, each its own labeled
 * row. The manual-research connection: the box-score line a bettor would
 * stitch together from three game logs, pre-aggregated. Rungs that fail
 * their row/AB minimums are simply omitted.
 */
function hitterFormRows(rows) {
  const out = [];
  const last = rows[rows.length - 1];
  if (last) {
    const ab = num(last.at_bats) ?? 0;
    const h = num(last.hits) ?? 0;
    const hr = num(last.hr) ?? 0;
    const rbi = num(last.rbi) ?? 0;
    const tb = num(last.total_bases) ?? 0;
    const bits = [`${h}-for-${ab}`];
    if (hr > 0) bits.push(`${hr} HR`);
    if (rbi > 0) bits.push(`${rbi} RBI`);
    if (hr === 0 && tb > 1) bits.push(`${tb} TB`);
    const entry = { label: 'LAST GAME', value: bits.join(' · ') };
    const d = shortDate(last._game?.date);
    if (d) entry.detail = d;
    out.push(entry);
  }
  for (const [label, n, minRows] of [['LAST 5 GAMES', 5, FORM_L5_MIN_ROWS], ['LAST 10 GAMES', 10, FORM_L10_MIN_ROWS]]) {
    const win = rows.slice(-n);
    if (win.length < minRows) continue;
    let ab = 0; let h = 0; let hr = 0; let rbi = 0;
    for (const r of win) {
      ab += num(r.at_bats) ?? 0; h += num(r.hits) ?? 0;
      hr += num(r.hr) ?? 0; rbi += num(r.rbi) ?? 0;
    }
    if (ab < win.length * 2) continue; // pinch-hit-thin window: fail closed
    const entry = { label, value: `${pct3(h / ab)} (${h}-for-${ab})` };
    const det = [];
    if (hr > 0) det.push(`${hr} HR`);
    if (rbi > 0) det.push(`${rbi} RBI`);
    if (det.length) entry.detail = det.join(' · ');
    out.push(entry);
  }
  return out;
}

/**
 * Pitcher form ladder: LAST OUTING -> LAST 3 -> LAST 5 with real ERA/WHIP
 * over the window (not an average of averages).
 */
function pitcherFormRows(rows) {
  const out = [];
  const last = rows[rows.length - 1];
  if (last) {
    const entry = {
      label: 'LAST OUTING',
      value: `${outsToIp(ipOuts(last.ip))} IP · ${num(last.er) ?? 0} ER · ${num(last.p_k) ?? 0} K`,
    };
    const d = shortDate(last._game?.date);
    if (d) entry.detail = d;
    out.push(entry);
  }
  for (const [label, n] of [['LAST 3 OUTINGS', 3], ['LAST 5 OUTINGS', 5]]) {
    const win = rows.slice(-n);
    if (win.length < n) continue;
    let outs = 0; let er = 0; let k = 0; let hits = 0; let bb = 0;
    for (const r of win) {
      outs += ipOuts(r.ip); er += num(r.er) ?? 0;
      k += num(r.p_k) ?? 0; hits += num(r.p_hits) ?? 0; bb += num(r.p_bb) ?? 0;
    }
    if (outs < 9) continue; // under 3 IP across the window: fail closed
    const ip = outs / 3;
    out.push({
      label,
      value: `${((er / ip) * 9).toFixed(2)} ERA · ${outsToIp(outs)} IP`,
      detail: `${k} K · ${((hits + bb) / ip).toFixed(2)} WHIP`,
    });
  }
  return out;
}

// prop_type -> per-game stat extractors. A type with no entry simply gets no
// rate (fail closed). Hitter and pitcher maps are separate so "strikeouts"
// can never read the wrong side of a two-way row.
const RATE_STAT_HITTER = {
  hits: (r) => num(r.hits) ?? 0,
  total_bases: (r) => num(r.total_bases) ?? 0,
  home_runs: (r) => num(r.hr) ?? 0,
  rbi: (r) => num(r.rbi) ?? 0,
  runs_batted_in: (r) => num(r.rbi) ?? 0,
  runs: (r) => num(r.runs) ?? 0,
  hits_runs_rbis: (r) => (num(r.hits) ?? 0) + (num(r.runs) ?? 0) + (num(r.rbi) ?? 0),
  stolen_bases: (r) => num(r.stolen_bases) ?? 0,
  strikeouts: (r) => num(r.k) ?? 0,
};
const RATE_STAT_PITCHER = {
  strikeouts: (r) => num(r.p_k) ?? 0,
  outs: (r) => ipOuts(r.ip),
  earned_runs: (r) => num(r.er) ?? 0,
  hits_allowed: (r) => num(r.p_hits) ?? 0,
  walks: (r) => num(r.p_bb) ?? 0,
};

/**
 * Mutates each prop entry with `rate` — "7/10 over" — counting the games in
 * the window where the stat finished ABOVE tonight's line. Strictly factual
 * (no lean implied); strips the internal _type either way.
 */
function attachPropRates(props, rows, statMap, { window, minRows }) {
  if (!Array.isArray(props) || !props.length) return;
  const win = rows.slice(-window);
  for (const p of props) {
    const type = p._type;
    delete p._type;
    if (win.length < minRows) continue;
    const statOf = statMap[type];
    const line = Number(p.line);
    if (!statOf || !Number.isFinite(line)) continue;
    const cleared = win.filter((r) => statOf(r) > line).length;
    p.rate = `${cleared}/${win.length} over`;
  }
}

function marketRank(r) {
  const t = String(r?.market?.type || '').toLowerCase();
  if (t.includes('over') || t.includes('under') || t === 'over_under') return 0;
  if (t === 'milestone') return 2;
  return 1;
}

function propLabel(propType) {
  const map = {
    total_bases: 'Total bases',
    hits: 'Hits',
    home_runs: 'Home runs',
    runs_batted_in: 'RBIs',
    rbi: 'RBIs',
    strikeouts: 'Strikeouts',
    outs: 'Outs',
    earned_runs: 'Earned runs',
    hits_allowed: 'Hits allowed',
    walks: 'Walks',
  };
  return map[propType] || propType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatOdds(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return String(odds);
  return n > 0 ? `+${n}` : String(n);
}

/** Index a pitch-type ARRAY (or keyed object) by pitch_type code. */
function indexPitchesByType(rows) {
  const map = new Map();
  for (const r of asArray(rows)) {
    const t = r?.pitch_type;
    if (t == null) continue;
    map.set(String(t), r);
  }
  return map;
}

/** Pull the 'Last 15 Days' row from byDayMonth (mirrors heatCheck's read). */
function last15Row(splits) {
  if (!splits || typeof splits !== 'object') return null;
  const buckets = Array.isArray(splits.byDayMonth) ? splits.byDayMonth : null;
  if (!buckets) return null;
  const byName = (n) => buckets.find((e) => nameKey(e?.split_name) === nameKey(n));
  return byName('Last 15 Days') || byName('Last 7 Days') || byName('Last 30 Days') || null;
}

function indexSeasonByPlayerId(rows) {
  const map = new Map();
  for (const rec of asArray(rows)) {
    const id = rec?.player?.id;
    if (id == null) continue;
    map.set(String(id), rec);
  }
  return map;
}

/** Index Savant xStats rows by full-name key and last-name key (CSV split). */
function indexXByName(rows) {
  const map = new Map();
  for (const r of asArray(rows)) {
    const last = r?.last_name || '';
    const first = r?.first_name || '';
    if (last) {
      map.set(nameKey(`${first} ${last}`), r);
      if (!map.has(nameKey(last))) map.set(nameKey(last), r);
    } else if (r?.name) {
      map.set(nameKey(r.name), r);
    }
  }
  return map;
}

function lastNameKey(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return nameKey(parts[parts.length - 1] || '');
}

/** Distinct player ids across player-backed insight rows. */
function distinctPlayerIds(connections) {
  const set = new Set();
  for (const c of asArray(connections)) {
    const pid = c?.player_id;
    if (pid == null || pid === '') continue;
    set.add(String(pid));
  }
  return [...set];
}

// BDL game objects expose `away_team` (MLB); alias `visitor_team` so helpers can
// read either (mirrors the orchestrator's alias). Non-mutating beyond filling the
// missing key.
function normalizeGame(g) {
  if (g && typeof g === 'object') {
    if (g.away_team && !g.visitor_team) g.visitor_team = g.away_team;
    if (g.visitor_team && !g.away_team) g.away_team = g.visitor_team;
  }
  return g;
}

/** "AWY @ HOM" using 3-letter abbreviations. */
function gameAbbrLabel(game) {
  const away = game?.visitor_team?.abbreviation || game?.away_team?.abbreviation
    || game?.visitor_team?.name || 'AWY';
  const home = game?.home_team?.abbreviation || game?.home_team?.name || 'HOM';
  return `${away} @ ${home}`;
}

function venueOf(game) {
  const v = game?.venue;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function teamIdForAbbr(game, abbr) {
  if (!abbr) return null;
  if (game?.home_team?.abbreviation === abbr) return game.home_team.id;
  if (game?.visitor_team?.abbreviation === abbr) return game.visitor_team.id;
  if (game?.away_team?.abbreviation === abbr) return game.away_team.id;
  return null;
}

/** Parse a ".950 OPS" token out of a "... · .950 OPS" display string. */
function parseOpsFromValue(s) {
  const m = /(-?\.?\d*\.?\d+)\s*OPS/i.exec(String(s || ''));
  return m ? Number(m[1]) : null;
}

/** Parse a "3.18 ERA" token out of a display string. */
function parseEraFromValue(s) {
  const m = /(\d+\.\d+)\s*ERA/i.exec(String(s || ''));
  return m ? Number(m[1]) : null;
}

/** Innings pitched display: BDL stores thirds as .1/.2 decimals (e.g. 64.2). */
function formatIp(ip) {
  const n = Number(ip);
  if (!Number.isFinite(n)) return String(ip);
  // Already in the baseball .0/.1/.2 convention — keep one decimal.
  return n.toFixed(1);
}

function capitalize(s) {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Remove internal (underscore-prefixed) helper keys before a payload ships. */
function stripInternal(rows) {
  if (!Array.isArray(rows)) return;
  for (const r of rows) {
    if (r && typeof r === 'object') delete r._pa;
  }
}

function dedupeCap(arr, cap) {
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!item) continue;
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/** Coerce to a finite Number or null. */
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a BDL pitch-type return (array OR keyed object) to an array. */
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

/** Run an async fn, returning a fallback on any throw (never propagates). */
async function safeCall(fn, fallback) {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch (err) {
    console.error('[playerInsightCards] data fetch error:', err?.message || err);
    return fallback;
  }
}

// Per-run memos so co-located players (same game) share one lineups/props fetch.
async function memoLineups(bdl, memo, gameId) {
  const key = String(gameId);
  if (memo.has(key)) return memo.get(key);
  const v = await safeCall(() => bdl.getMlbLineups(gameId), null);
  memo.set(key, v);
  return v;
}

async function memoProps(bdl, memo, gameId) {
  const key = String(gameId);
  if (memo.has(key)) return memo.get(key);
  const v = await safeCall(() => bdl.getMlbPlayerProps(gameId), []);
  memo.set(key, v);
  return v;
}

/** MLB season = the calendar year of the regular season. */
function seasonForDate(dateStr) {
  const y = Number(String(dateStr).slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

/** Lazy-load the BDL service so this module stays import-cheap for callers. */
async function loadBdl() {
  try {
    const mod = await import('../ballDontLieService.js');
    return mod.ballDontLieService || mod.default || null;
  } catch (err) {
    console.error('[playerInsightCards] failed to load ballDontLieService:', err?.message || err);
    return null;
  }
}

export default { buildPlayerInsightCards };
