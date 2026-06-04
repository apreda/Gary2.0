// gary2.0/src/services/insights/computers/nbaBeneficiary.js
//
// LANE: beneficiary (NBA — injury lane)
// "A rotation player is OUT (or questionable) for a slate team — surface the
//  absence and whatever context the injury report itself carries (it often
//  names who absorbs the minutes)."
//
// Approach (all data from documented BDL methods only):
//   - Collect the BDL team ids for both sides of every slate game and fetch
//     getInjuriesGeneric('basketball_nba', { team_ids }) ONCE for the slate.
//   - Keep rows whose status reads OUT / DOUBTFUL (the strong absence) or
//     QUESTIONABLE / GTD (kept as lower-relevance WATCH rows because in a
//     Finals series a questionable star moves the line). Everything else
//     (PROBABLE, ACTIVE, day-to-day-with-no-doubt) is skipped.
//   - There is NO NBA lineup/replacement feed on this surface, so we do NOT
//     invent who replaces the injured player. The row is the absence plus the
//     report's own `description` text (trimmed to ~140 chars), which frequently
//     states the timeline or the next man up.
//
// Data path / field names (verified live + mirrored from nbaPicksHandler.js):
//   * getInjuriesGeneric('basketball_nba', { team_ids:[...] }) -> Array of:
//       { player:{ id, full_name, position, team:{ id, abbreviation, full_name } },
//         status, description, return_date, date }.
//     `status` is free text ("Out", "Day-To-Day", "Questionable", ...).
//
// Defensive contract: never throws; returns [] when data is missing; emits a
// one-line summary log at the end so 0-row runs are diagnosable.

import {
  makeRow, TONES, pickVariant,
} from '../shared.js';

// Tunables.
const DESC_MAX = 140;              // trim the report's own text to this length
const OUT_RELEVANCE = 70;          // confirmed absence (OUT / DOUBTFUL)
const WATCH_RELEVANCE = 55;        // questionable / GTD — a watch row

/** Classify a free-text injury status into out | watch | skip. */
function classifyStatus(statusRaw) {
  const s = String(statusRaw || '').toLowerCase();
  if (!s) return 'skip';
  // Watch-tier first so ambiguous free text can't fall through to "out", and
  // \bout\b word-bounded so a status merely CONTAINING "out" doesn't match.
  if (/(questionable|game[\s-]*time|gtd|day[\s-]*to[\s-]*day)/.test(s)) return 'watch';
  if (/(out for season|\bout\b|doubtful|inactive)/.test(s)) return 'out';
  return 'skip';
}

/** Trim a description to DESC_MAX chars on a word boundary, no trailing dangle. */
function trimDesc(desc) {
  const text = String(desc || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= DESC_MAX) return text;
  const cut = text.slice(0, DESC_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]\s*$/, '')}…`;
}

export async function computeNbaBeneficiary(ctx) {
  const { games, bdl, helpers } = ctx;
  const rows = [];
  let examined = 0;

  // Map team id -> the slate game it belongs to, so each injury row can be
  // attributed to a game_id and a "AWY @ HOM" label.
  const teamToGame = new Map();
  for (const game of games || []) {
    for (const team of [game?.home_team, game?.visitor_team]) {
      if (team?.id != null && !teamToGame.has(team.id)) {
        teamToGame.set(team.id, game);
      }
    }
  }
  const teamIds = [...teamToGame.keys()];
  if (teamIds.length === 0) {
    console.log('[nbaBeneficiary] examined 0, emitted 0');
    return rows;
  }

  let injuries = [];
  try {
    injuries = (await bdl.getInjuriesGeneric('basketball_nba', { team_ids: teamIds })) || [];
  } catch (err) {
    console.error('[nbaBeneficiary] injury fetch error:', err?.message || err);
    injuries = [];
  }

  for (const inj of Array.isArray(injuries) ? injuries : []) {
    try {
      const player = inj?.player;
      const playerId = player?.id;
      if (playerId == null) continue;

      // Attribute to a slate team; skip injuries for teams not on tonight's slate.
      const teamId = player?.team?.id ?? inj?.team?.id;
      const game = teamId != null ? teamToGame.get(teamId) : null;
      if (!game) continue;
      examined++;

      const kind = classifyStatus(inj?.status);
      if (kind === 'skip') continue;

      const name = player?.full_name || 'A rotation player';
      const teamAbbr = player?.team?.abbreviation || game?.home_team?.abbreviation || '';
      const label = helpers.gameLabel(game);
      const desc = trimDesc(inj?.description);
      const statusText = String(inj?.status || '').trim();

      const headline = kind === 'out'
        ? `${name} is OUT${teamAbbr ? ` for ${teamAbbr}` : ''}`
        : `${name} is ${statusText || 'questionable'}${teamAbbr ? ` for ${teamAbbr}` : ''}`;

      // Detail ADDS the report's own context; never restates the headline alone.
      const tail = desc ? ` — ${desc}` : (inj?.return_date ? ` — listed return ${inj.return_date}.` : '.');
      const variants = kind === 'out'
        ? [
          `${name}${teamAbbr ? ` (${teamAbbr})` : ''} is ruled out${tail}`,
          `Absence to track: ${name} is out for ${teamAbbr || 'his team'}${tail}`,
          `${name} will not play${tail}`,
        ]
        : [
          `${name} carries a ${statusText || 'questionable'} tag${tail}`,
          `Watch the report: ${name} is ${statusText || 'questionable'}${tail}`,
          `${name}'s status is unsettled (${statusText || 'questionable'})${tail}`,
        ];

      rows.push(makeRow({
        category: 'beneficiary',
        headline,
        detail: pickVariant(variants, String(playerId)),
        game: label,
        value: kind === 'out' ? 'OUT' : (statusText || 'QUESTIONABLE'),
        tone: TONES.NEUTRAL,
        relevance_score: kind === 'out' ? OUT_RELEVANCE : WATCH_RELEVANCE,
        player_id: playerId,
        team_id: teamId,
        game_id: game?.id,
      }));
    } catch (err) {
      console.error('[nbaBeneficiary] row error:', err?.message || err);
    }
  }

  console.log(`[nbaBeneficiary] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeNbaBeneficiary };
