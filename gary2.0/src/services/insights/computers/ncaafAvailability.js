import { getNcaafGameContext } from '../../ncaafGameContext.js';
// THE AVAILABILITY container, for college — the week's reported injuries,
// suspensions and opt-outs per slate game (NCAAF Picks page parity, founder
// Sep 3-4 2026).
//
// Source contract: BDL publishes no college injury feed (ncaaf/v1/player_injuries
// is a 404), so the report comes from one grounded web search per game —
// and NOTHING the model says reaches the page unless the name is on a side's
// BDL active roster. The roster decides the side and the position; the
// model only reports the status, the note and where it read it. A name the
// roster does not know is dropped and counted, never printed. A status word
// outside the report vocabulary is dropped the same way. A failed search or
// an unparseable answer is no report, never an empty one.
//
// NCAAF-owned: this file never reads an NFL feed (league isolation law).

import { makeRow, TONES } from '../shared.js';
import { gamesWithRowsToday, runWithinBudget } from '../ncaafLaneLedger.js';

// The report vocabulary — the phrase the headline prints, its weight, and
// whether it ends the player's night. Anything else is not a status.
const STATUS = Object.freeze({
  'out for season': { phrase: 'out for the season', weight: 44, ending: true },
  'out for the season': { phrase: 'out for the season', weight: 44, ending: true },
  'season-ending': { phrase: 'out for the season', weight: 44, ending: true },
  out: { phrase: 'out', weight: 40, ending: true },
  suspended: { phrase: 'suspended', weight: 38, ending: true },
  'opted out': { phrase: 'opted out', weight: 38, ending: true },
  'opt out': { phrase: 'opted out', weight: 38, ending: true },
  doubtful: { phrase: 'doubtful', weight: 30, ending: true },
  questionable: { phrase: 'questionable', weight: 18, ending: false },
  'game-time decision': { phrase: 'a game-time decision', weight: 18, ending: false },
  probable: { phrase: 'probable', weight: 8, ending: false },
  limited: { phrase: 'limited', weight: 10, ending: false },
});
const POSITION_WEIGHT = Object.freeze({
  QB: 24, RB: 14, WR: 14, TE: 10, OL: 8, OT: 8, OG: 8, C: 8,
  DL: 8, DE: 8, DT: 6, EDGE: 8, LB: 6, CB: 8, S: 6, DB: 6, PK: 4, K: 4, P: 2,
});
const teamAbbr = team => team?.abbreviation || team?.college || team?.name || 'TEAM';

function statusEntry(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (STATUS[s]) return { key: s, ...STATUS[s] };
  if (/season/.test(s) && /out|done|end/.test(s)) return { key: 'out for season', ...STATUS['out for season'] };
  if (/opt/.test(s)) return { key: 'opted out', ...STATUS['opted out'] };
  return null;
}

async function reportForGame({ game, date, helpers, bdl }) {
  const context = await getNcaafGameContext({ game, date, bdl });
  if (!context.sides) return [];
  return ['away', 'home'].flatMap(side => {
    const report = context.sides[side];
    if (report.availability !== 'checked') return [];
    const team = side === 'home' ? game.home_team : game.away_team ?? game.visitor_team;
    return report.injuries.map(item => {
      const reportedStatus = /season[- ]ending|out for (?:the )season/i.test(item.description) && item.status === 'out' ? 'out for season' : item.status;
      const status = statusEntry(reportedStatus), player = item.player;
      const position = player.position_abbreviation || player.position || '';
      const sources = item.sources.map(id => report.sources.find(s => s.id === id)).filter(Boolean);
      const detail = `${item.description} ${sources.map(s => `${s.title || 'Source'} (${s.reported})`).join(' ')}`.trim();
      return makeRow({ category: 'injury', headline: `${item.name}${position ? ` (${position})` : ''} is ${status.phrase} for ${teamAbbr(team)}`,
        detail, game: helpers.gameLabel(game), value: status.key.toUpperCase(), tone: status.ending ? TONES.CAUTION : TONES.NEUTRAL,
        relevance_score: Math.min(90, 40 + status.weight), player_id: player.id, team_id: team.id, game_id: game.id,
        meta: { source: 'ncaaf_game_context_v1', status: status.key, position, reported: sources[0]?.reported,
          sources, outlet: sources[0]?.title, through: date, source_collected_at: context.observed_at, read: detail },
      });
    });
  });
}

/**
 * One row per roster-verified report on the slate, capped per game with the
 * most consequential first.
 */
export async function computeNcaafAvailability(ctx) {
  const { games, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'ncaaf') return [];
  if (!bdl || !(games || []).length) return [];

  const done = ctx.forceRefresh ? new Set() : await gamesWithRowsToday({ date, category: 'injury', source: 'ncaaf_game_context_v1' });
  const rows = await runWithinBudget({
    games, done, label: 'ncaafAvailability',
    work: (game) => reportForGame({ game, date, helpers, bdl }),
  });

  console.log(`[ncaafAvailability] NCAAF ${date}: ${rows.length} roster-verified report row(s)`);
  return rows;
}

export default { computeNcaafAvailability };
