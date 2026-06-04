// gary2.0/src/services/insights/computers/beneficiary.js
//
// LANE: beneficiary
// "An injury opens a role; identify the next-man-up who benefits."
//
// Data path (documented BDL methods only):
//   1. Collect every slate team id from ctx.games (home_team.id + visitor_team.id)
//      and build teamId -> game so we know which game an injured player plays in.
//   2. ONE call: getInjuriesGeneric('baseball_mlb', { team_ids:[...] }) -> rows
//      { player:{ id, full_name, position, team:{ id, abbreviation } }, date,
//        return_date, type, detail, status, ... }. Keep only rows whose team is
//        on the slate AND whose status reads OUT (out / injured list / N-day IL)
//        AND that are recent enough to matter (date within 14 days, OR a future
//        return_date). Day-to-day / ambiguous statuses are skipped.
//        (Injury-labeling logic is LOCKED in CLAUDE.md — these fields are READ
//         ONLY here; we never relabel FRESH/PRICED-IN, just use dates for
//         relevance gating.)
//   3. For the injured player's game, getMlbLineups(gameId) ->
//        { [abbr]: { batters:[{ name, position, battingOrder, playerId }] } }.
//        The beneficiary = the batter in tonight's lineup at the SAME position
//        (entry.position === injured.position) who is NOT the injured player.
//        No lineup, or no position match -> skip silently (no guessing).
//   4. Optional enrichment: getMlbPlayerSeasonStats({ season, playerIds:[benId] })
//        for the replacement's season line (batting_avg / batting_ops).
//
// Row: category 'beneficiary'. value = the replacement's OPS when known, else
// 'FILL-IN'. tone NEUTRAL (EDGE when the replacement's season line is strong).
// One row per opened role. relevance: base 55, +10 when the replacement bats
// top-6 tonight; capped ~80 (context, not a measured edge).
//
// Defensive: any missing piece -> skip that role silently; never throws.

import { makeRow, TONES, pickVariant, pct3 } from '../shared.js';

// Tunables.
const RECENT_DAYS = 14;        // an injury this fresh is a live role change
const TOP_ORDER_SPOTS = 6;     // batting top-6 tonight = a meaningful role
const BASE_RELEVANCE = 55;
const TOP_ORDER_BOOST = 10;
const MAX_RELEVANCE = 80;
const STRONG_OPS = 0.800;      // a replacement at/above this rates EDGE tone

// Statuses that read as "out / on the IL" (skip ambiguous day-to-day strings).
const OUT_STATUS_RE = /out|injured\s*list|\bil\b|\d+\s*-?\s*day/i;
const DAY_TO_DAY_RE = /day[-\s]?to[-\s]?day|questionable|probable|gtd/i;

export async function computeBeneficiary(ctx) {
  const { games, season, bdl, helpers } = ctx;

  // 1. Slate team ids + teamId -> game lookup.
  const teamIds = [];
  const gameByTeamId = new Map();
  for (const game of games || []) {
    for (const teamId of [game?.home_team?.id, game?.visitor_team?.id]) {
      if (teamId == null) continue;
      teamIds.push(teamId);
      if (!gameByTeamId.has(teamId)) gameByTeamId.set(teamId, game);
    }
  }
  if (teamIds.length === 0) {
    console.log('[beneficiary] examined 0, emitted 0');
    return [];
  }

  // 2. ONE injuries call for the whole slate.
  let injuries = [];
  try {
    injuries = (await bdl.getInjuriesGeneric('baseball_mlb', { team_ids: teamIds })) || [];
  } catch (err) {
    console.error('[beneficiary] injuries fetch error:', err?.message || err);
    injuries = [];
  }

  // Keep impactful, recent absences on a slate team.
  const opened = [];
  for (const inj of injuries) {
    const teamId = inj?.player?.team?.id;
    if (teamId == null || !gameByTeamId.has(teamId)) continue;
    if (!isOutAndRecent(inj, ctx.date)) continue;
    const position = String(inj?.player?.position || '').trim();
    if (!position) continue; // need a position to find the replacement
    opened.push({ inj, teamId, position, game: gameByTeamId.get(teamId) });
  }

  // Lineup cache: several injuries can hit the same game; fetch each once.
  const lineupCache = new Map();
  const getLineups = async (gameId) => {
    if (gameId == null) return null;
    if (lineupCache.has(gameId)) return lineupCache.get(gameId);
    let lineups = null;
    try {
      lineups = await bdl.getMlbLineups(gameId);
    } catch (err) {
      console.error('[beneficiary] lineups fetch error:', err?.message || err);
    }
    lineupCache.set(gameId, lineups);
    return lineups;
  };

  const rows = [];
  const seenRoles = new Set(); // dedupe one row per (team, position)

  for (const role of opened) {
    const { inj, teamId, position, game } = role;
    const gameId = game?.id;
    if (gameId == null) continue;

    // 3. Tonight's lineup for the injured player's side.
    const lineups = await getLineups(gameId);
    if (!lineups || typeof lineups !== 'object') continue;

    const abbr = inj?.player?.team?.abbreviation
      || (teamId === game?.home_team?.id ? game?.home_team?.abbreviation : game?.visitor_team?.abbreviation);
    const side = abbr ? lineups[abbr] : null;
    const batters = Array.isArray(side?.batters) ? side.batters : [];
    if (!batters.length) continue;

    const injuredId = inj?.player?.id;
    // Beneficiary = batter at the SAME position who isn't the injured player.
    const replacement = batters.find((b) => (
      String(b?.position || '').trim() === position
      && b?.playerId != null
      && b.playerId !== injuredId
    ));
    if (!replacement) continue; // no position match -> skip silently

    const roleKey = `${teamId}|${position}`;
    if (seenRoles.has(roleKey)) continue; // MAX 1 row per opened role
    seenRoles.add(roleKey);

    // 4. Optional season-line enrichment for the replacement.
    let benOps = null;
    let benAvg = null;
    try {
      const seasonRows = (await bdl.getMlbPlayerSeasonStats({ season, playerIds: [replacement.playerId] })) || [];
      const rec = seasonRows.find((r) => r?.player?.id === replacement.playerId) || seasonRows[0];
      const ops = Number(rec?.batting_ops);
      const avg = Number(rec?.batting_avg);
      if (Number.isFinite(ops) && ops > 0) benOps = ops;
      if (Number.isFinite(avg) && avg > 0) benAvg = avg;
    } catch (err) {
      console.error('[beneficiary] season stats error:', err?.message || err);
    }

    const order = Number(replacement.battingOrder);
    const batsTop6 = Number.isFinite(order) && order >= 1 && order <= TOP_ORDER_SPOTS;
    const relevance = Math.min(
      MAX_RELEVANCE,
      BASE_RELEVANCE + (batsTop6 ? TOP_ORDER_BOOST : 0),
    );

    const starName = inj?.player?.full_name || 'A regular';
    const repName = replacement.name || 'A reserve';
    const teamLabel = abbr || inj?.player?.team?.display_name || 'his team';
    const recency = injuryRecencyPhrase(inj, ctx.date);
    const injType = String(inj?.type || '').trim();
    const orderPhrase = batsTop6 ? `bats ${ordinal(order)} tonight` : (Number.isFinite(order) && order > 0 ? `bats ${ordinal(order)} tonight` : 'is in tonight\'s lineup');
    const linePhrase = benOps != null
      ? ` and carries a ${pct3(benOps)} OPS${benAvg != null ? ` / ${pct3(benAvg)} AVG` : ''} this season`
      : '';

    const recencyClause = recency.replace(/;$/, ''); // bare clause (no trailing ';') for mid-sentence use
    const detailVariant = pickVariant([
      `${injType ? `${injType}; ` : ''}${recency} ${repName} ${orderPhrase}${linePhrase}.`,
      `${repName} slots in at ${position} (${orderPhrase})${linePhrase}. ${capitalize(recencyClause)}${injType ? ` (${injType}).` : '.'}`,
      `With ${starName} out (${injType || 'injury'}; ${recencyClause.toLowerCase()}), ${repName} draws the start at ${position} and ${orderPhrase}${linePhrase}.`,
    ], replacement.playerId);

    rows.push(makeRow({
      category: 'beneficiary',
      headline: `${starName} (${position}) is out for ${teamLabel} — ${repName} starts in his place tonight`,
      detail: detailVariant,
      game: helpers.gameLabel(game),
      value: benOps != null ? pct3(benOps) : 'FILL-IN',
      tone: benOps != null && benOps >= STRONG_OPS ? TONES.EDGE : TONES.NEUTRAL,
      relevance_score: relevance,
      player_id: replacement.playerId,
      team_id: teamId,
      game_id: gameId,
    }));
  }

  console.log(`[beneficiary] examined ${opened.length}, emitted ${rows.length}`);
  return rows;
}

/**
 * Anchor "now" to the SLATE date (noon UTC), not the wall clock, so recency
 * gating and the "X days" copy stay correct on --date backfill runs.
 */
function slateAnchorMs(dateStr) {
  const parsed = Date.parse(`${dateStr}T12:00:00Z`);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Is this injury an OUT-type absence that's recent enough to be a live role
 * change as of the slate date? OUT = status reads out/IL/N-day (and is not
 * merely day-to-day). Recent = inj.date parseable within RECENT_DAYS of the
 * slate date, OR a return_date after it.
 */
function isOutAndRecent(inj, slateDate) {
  const status = String(inj?.status || '');
  if (DAY_TO_DAY_RE.test(status)) return false;
  if (!OUT_STATUS_RE.test(status)) return false;

  const now = slateAnchorMs(slateDate);

  const injDate = Date.parse(inj?.date);
  if (Number.isFinite(injDate)) {
    const ageDays = (now - injDate) / 86400000;
    if (ageDays >= 0 && ageDays <= RECENT_DAYS) return true;
  }

  const ret = Date.parse(inj?.return_date);
  if (Number.isFinite(ret) && ret > now) return true;

  return false;
}

/** A plain-language recency clause for the detail (no FRESH/PRICED-IN vocab). */
function injuryRecencyPhrase(inj, slateDate) {
  const injDate = Date.parse(inj?.date);
  if (Number.isFinite(injDate)) {
    const ageDays = Math.max(0, Math.round((slateAnchorMs(slateDate) - injDate) / 86400000));
    if (ageDays === 0) return 'Hit the injury report today;';
    if (ageDays === 1) return 'On the injury report since yesterday;';
    return `On the injury report for ${ageDays} days;`;
  }
  return 'Out on the injury report;';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function capitalize(s) {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default { computeBeneficiary };
