// Grounded NFL availability lane — the injury report as the wire carries it.
//
// Source contract: BDL /nfl/v1/player_injuries for the slate's teams. Every
// row is a real report: player, team, status word, the reporter's own comment,
// and the report date. Nothing is inferred — no "expected back", no severity
// guesses, no depth-chart speculation beyond what the comment itself says.
// NFL-only: BDL publishes no NCAAF injury feed, and absence stays absent.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';

// Game-day rulings outrank the maybes, and the maybes outrank IR stashes —
// an August IR revert is roster housekeeping, not tonight's news (a FRESH
// star IR still surfaces through the recency and comment bonuses). Skill
// positions the betting public actually prices outrank special-teamers.
const STATUS_WEIGHT = Object.freeze({
  out: 40, doubtful: 30, questionable: 18, 'injured reserve': 12, ir: 12,
});
const POSITION_WEIGHT = Object.freeze({
  QB: 24, RB: 14, WR: 14, TE: 10, OT: 8, OG: 8, C: 8, OL: 8,
  EDGE: 8, DE: 8, DT: 6, LB: 6, CB: 8, S: 6, K: 4, P: 2,
});
const MAX_PER_GAME = 4;

function statusWeight(status) {
  return STATUS_WEIGHT[String(status || '').trim().toLowerCase()] ?? 8;
}

function positionWeight(abbr) {
  return POSITION_WEIGHT[String(abbr || '').trim().toUpperCase()] ?? 4;
}

function reportDay(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function playerName(p) {
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

// "is questionable for HOU" reads; "is ir for LV" does not.
function statusPhrase(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'ir' || s === 'injured reserve') return 'on injured reserve';
  return s;
}

/**
 * One row per reported player on tonight's slate, capped per game with the
 * most consequential reports first. The detail is the wire comment verbatim
 * plus the report date — the reader sees exactly what was reported and when,
 * never a summary that could drift from it.
 */
export async function computeFootballAvailability(ctx) {
  const { games, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'nfl') return [];

  const slate = (games || []).filter((g) => g?.id != null);
  const teamIds = [...new Set(slate.flatMap((g) => {
    const awayTeam = g?.away_team ?? g?.visitor_team;
    return [awayTeam?.id, g?.home_team?.id];
  }).filter((id) => id != null))];
  if (!teamIds.length) return [];

  let reports = [];
  try {
    reports = (await bdl.getNflPlayerInjuries(teamIds)) || [];
  } catch (err) {
    console.warn(`[footballAvailability] injuries fetch failed: ${err?.message || err}`);
    return [];
  }

  const byTeam = new Map();
  for (const report of reports) {
    const teamId = report?.player?.team?.id;
    if (teamId == null) continue;
    const list = byTeam.get(String(teamId)) || [];
    list.push(report);
    byTeam.set(String(teamId), list);
  }

  const rows = [];
  for (const game of slate) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    const gameReports = [
      ...(byTeam.get(String(awayTeam?.id)) || []),
      ...(byTeam.get(String(homeTeam?.id)) || []),
    ];

    const scored = gameReports
      .map((report) => {
        const name = playerName(report?.player);
        const status = String(report?.status || '').trim();
        if (!name || !status) return null;
        const comment = String(report?.comment || '').trim();
        const hasWire = comment.length > 0 && !/^undisclosed$/i.test(comment);
        const weight = statusWeight(status) + positionWeight(report?.player?.position_abbreviation)
          + (Date.parse(report?.date) > Date.now() - 7 * 86400000 ? 6 : 0)
          + (hasWire ? 8 : 0);   // a real reporter line beats a bare tag
        return { report, name, status, weight };
      })
      .filter(Boolean)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_PER_GAME);

    for (const { report, name, status, weight } of scored) {
      const player = report.player;
      const abbr = player?.team?.abbreviation || player?.team?.name || 'TEAM';
      const pos = player?.position_abbreviation || player?.position || '';
      const rawComment = String(report?.comment || '').trim();
      // A bare "Undisclosed" is a field value, not a wire line — the
      // structured sentence reads better than a one-word detail.
      const comment = /^undisclosed$/i.test(rawComment) ? '' : rawComment;
      const day = reportDay(report?.date);
      const ending = statusWeight(status) >= 30 || statusPhrase(status) === 'on injured reserve';

      rows.push(makeRow({
        category: 'injury',
        headline: `${name}${pos ? ` (${pos})` : ''} is ${statusPhrase(status)} for ${abbr}`,
        detail: comment
          ? `${comment}${day ? ` Reported ${day}.` : ''}`
          : `${abbr} lists ${name} as ${statusPhrase(status)} on the injury report.${day ? ` Reported ${day}.` : ''}`,
        game: helpers.gameLabel(game),
        value: status.toUpperCase(),
        tone: ending ? TONES.CAUTION : TONES.NEUTRAL,
        relevance_score: Math.min(90, 40 + weight),
        player_id: player?.id,
        team_id: player?.team?.id,
        game_id: game.id,
        meta: {
          source: 'balldontlie_player_injuries',
          status,
          position: pos || null,
          report_date: report?.date || null,
          through: date,
        },
      }));
    }
  }

  await attachLaneReads('footballAvailability', rows, detailFact, {
    ask: 'what this report actually changes about tonight — who absorbs the work if he sits, what the status word means this close to kickoff, and which side of the ball feels it',
  });

  console.log(`[footballAvailability] NFL ${date}: ${reports.length} report(s) -> ${rows.length} row(s)`);
  return rows;
}

export default { computeFootballAvailability };
