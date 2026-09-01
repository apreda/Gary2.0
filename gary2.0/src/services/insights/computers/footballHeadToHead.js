// Grounded football head-to-head lane — the real prior meetings between the
// two franchises on today's slate, straight from the provider game index.
//
// Contract (both leagues): bdl.getGames(sportKey, { team_ids, seasons }) rows
// for the current and prior season, filtered locally to finals where BOTH
// sides are the slate pair. Every sentence is a played game: date, score,
// winner, and (NFL) whether the meeting was preseason or playoffs — an August
// exhibition is never dressed up as series history. No meetings, no row.
//
// MLB counterpart: computeHeadToHead (category 'head_to_head' — same kind, so
// both leagues' rows ride one iOS renderer).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { footballDataInternals } from '../footballData.js';

const SPORT_KEY = Object.freeze({
  nfl: 'americanfootball_nfl',
  ncaaf: 'americanfootball_ncaaf',
});

// Two slate games (4 team ids) per index call — the TEAM_CHUNK_SIZE precedent:
// 4 teams × ~2 seasons of games stays inside the endpoint page while cutting a
// full college Saturday's fan-out in half.
const GAMES_PER_CALL = 2;
const MAX_MEETINGS_SHOWN = 3;

const { finalFootballGame, nflSeasonTypeForGame } = footballDataInternals;

function etDate(raw) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function meetingLabel(dateStr) {
  const time = Date.parse(`${dateStr}T12:00:00Z`);
  if (!Number.isFinite(time)) return dateStr;
  return new Date(time).toLocaleDateString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function sideName(team) {
  return team?.abbreviation || team?.college || team?.name || team?.full_name || null;
}

/** The MLB card's keys for the series' dominant side (ties lean away). */
function cardContract({ awayTeam, homeTeam, awayWins, homeWins, ties = 0 }) {
  const awayDom = awayWins >= homeWins;
  const dom = awayDom ? awayTeam : homeTeam;
  const sub = awayDom ? homeTeam : awayTeam;
  const longName = (t) => t?.full_name || t?.name || sideName(t) || 'Team';
  return {
    kind: 'h2h',
    dominant: sideName(dom),
    dominant_name: longName(dom),
    opponent: sideName(sub),
    opponent_name: longName(sub),
    wins: awayDom ? awayWins : homeWins,
    losses: awayDom ? homeWins : awayWins,
    games: awayWins + homeWins + ties,
  };
}

function scoreOf(game, which) {
  const raw = which === 'home'
    ? (game?.home_team_score ?? game?.home_score)
    : (game?.visitor_team_score ?? game?.away_score);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * One row per slate game that has at least one completed prior meeting in the
 * current or previous season.
 */
export async function computeFootballHeadToHead(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  const sportKey = SPORT_KEY[league];
  if (!sportKey || !Number.isInteger(Number(season))) return [];

  const slate = (games || []).filter((g) => {
    const away = g?.away_team ?? g?.visitor_team;
    return g?.id != null && away?.id != null && g?.home_team?.id != null;
  });
  if (!slate.length) return [];

  // Chunked index fetches: every game either slate team played, both seasons.
  // Meetings are recovered locally by exact team-id pair, so a call's extra
  // rows (other opponents) are simply ignored.
  const historyRows = [];
  for (let i = 0; i < slate.length; i += GAMES_PER_CALL) {
    const group = slate.slice(i, i + GAMES_PER_CALL);
    const teamIds = [...new Set(group.flatMap((g) => [
      (g.away_team ?? g.visitor_team).id,
      g.home_team.id,
    ]))];
    try {
      const rows = await bdl.getGames(
        sportKey,
        // paginateAll (Sep 1 review): four NFL clubs × two seasons pass 100
        // rows by Week 1 — an un-paginated page silently drops the newest
        // meetings (the Aug 27 MLB blindness, in football clothes).
        { team_ids: teamIds, seasons: [Number(season), Number(season) - 1], per_page: 100, paginateAll: true },
        6,
      );
      if (Array.isArray(rows)) historyRows.push(...rows);
    } catch (err) {
      console.warn(`[footballHeadToHead] ${league.toUpperCase()} index chunk omitted: ${err?.message || err}`);
    }
  }
  if (!historyRows.length) return [];

  const seenGame = new Set();
  const finals = historyRows.filter((g) => {
    if (g?.id == null || seenGame.has(String(g.id))) return false;
    seenGame.add(String(g.id));
    if (!finalFootballGame(g)) return false;
    const day = etDate(g?.date ?? g?.datetime ?? g?.commence_time ?? g?.start_time_utc);
    return day != null && day < String(date);
  });

  const rows = [];
  for (const game of slate) {
    const awayTeam = game.away_team ?? game.visitor_team;
    const homeTeam = game.home_team;
    const pair = new Set([String(awayTeam.id), String(homeTeam.id)]);

    const meetings = finals
      .filter((g) => {
        const a = (g.away_team ?? g.visitor_team)?.id;
        const h = g.home_team?.id;
        return a != null && h != null && pair.has(String(a)) && pair.has(String(h)) && String(a) !== String(h);
      })
      .map((g) => {
        const gAway = g.away_team ?? g.visitor_team;
        const gHome = g.home_team;
        const awayScore = scoreOf(g, 'away');
        const homeScore = scoreOf(g, 'home');
        if (awayScore == null || homeScore == null || awayScore === homeScore && awayScore === 0) return null;
        const day = etDate(g?.date ?? g?.datetime ?? g?.commence_time ?? g?.start_time_utc);
        const seasonType = league === 'nfl' ? nflSeasonTypeForGame(g) : 2;
        const winnerId = awayScore === homeScore ? null
          : (awayScore > homeScore ? gAway.id : gHome.id);
        return {
          date: day,
          away: sideName(gAway),
          home: sideName(gHome),
          away_score: awayScore,
          home_score: homeScore,
          season: g?.season ?? null,
          season_type: seasonType,     // NFL: 1 preseason · 2 regular · 3 playoffs
          winner_team_id: winnerId,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (!meetings.length) continue;

    const awayName = sideName(awayTeam);
    const homeName = sideName(homeTeam);
    // PRESEASON NEVER COUNTS (founder law, Aug 21 2026; Sep 1 review): the
    // tally, the SERIES value, and the card's record read countable meetings
    // only. Exhibition meetings still print in the detail, labeled — they
    // are never dressed up as series history.
    const countable = meetings.filter((m) => m.season_type !== 1);
    const tallyPool = countable;
    const awayWins = tallyPool.filter((m) => String(m.winner_team_id) === String(awayTeam.id)).length;
    const homeWins = tallyPool.filter((m) => String(m.winner_team_id) === String(homeTeam.id)).length;
    const ties = tallyPool.length - awayWins - homeWins;

    const typeTag = (m) => (m.season_type === 1 ? ' (preseason)' : m.season_type === 3 ? ' (playoffs)' : '');
    const meetingLines = meetings.slice(0, MAX_MEETINGS_SHOWN).map((m) =>
      `${meetingLabel(m.date)}: ${m.away} ${m.away_score} at ${m.home} ${m.home_score}${typeTag(m)}`);

    const tallyLead = !countable.length
      ? 'Every meeting in the window was preseason — no series record to speak of'
      : awayWins === homeWins
        ? `The series is ${awayWins}-${homeWins}${ties ? `-${ties}` : ''} across the last two seasons`
        : `${awayWins > homeWins ? awayName : homeName} has taken ${Math.max(awayWins, homeWins)} of the last ${tallyPool.length}${ties ? ` (${ties} tie${ties === 1 ? '' : 's'})` : ''}`;

    rows.push(makeRow({
      category: 'headToHead',
      headline: `${awayName} and ${homeName} have met ${meetings.length === 1 ? 'once' : `${meetings.length} times`} since ${Number(season) - 1}`,
      detail: `${tallyLead}. ${meetingLines.join('. ')}.`,
      game: helpers.gameLabel(game),
      value: countable.length ? `${Math.max(awayWins, homeWins)}-${Math.min(awayWins, homeWins)}${ties ? `-${ties}` : ''} SERIES` : 'PRESEASON ONLY',
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(78, 40 + meetings.length * 6 + (countable.some((m) => m.season_type === 3) ? 10 : 0)),
      team_id: homeTeam.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_games',
        seasons: [Number(season) - 1, Number(season)],
        // THE CARD CONTRACT (founder, Sep 1 2026 — FOOTBALL = MLB SHAPE): the
        // iOS head-to-head row reads the MLB writer's keys (dominant side,
        // wins/losses, meetings with away_runs/home_runs/dom_won, oldest →
        // newest). Both key sets ride the row so nothing downstream breaks.
        // No countable meeting → no card contract (kind stays unset), so the
        // app's head-to-head section stays dark instead of printing exhibitions.
        ...(countable.length ? cardContract({ awayTeam, homeTeam, awayWins, homeWins, ties }) : {}),
        // The card's ledger is countable meetings only, oldest → newest;
        // every meeting (exhibitions labeled) stays under all_meetings.
        meetings: countable.slice().reverse().map((m) => ({
          ...m,
          away_runs: m.away_score,
          home_runs: m.home_score,
          dom_won: m.winner_team_id != null && String(m.winner_team_id) === String(awayWins >= homeWins ? awayTeam.id : homeTeam.id),
        })),
        all_meetings: meetings,
        tally: { away_wins: awayWins, home_wins: homeWins, ties, countable_only: countable.length > 0 },
      },
    }));
  }

  await attachLaneReads('footballHeadToHead', rows, detailFact, {
    ask: 'what the recent series actually looked like — how the meetings played out, whether the games were close or one-way, and what has changed for either side since the last one',
  });

  console.log(`[footballHeadToHead] ${league.toUpperCase()} ${date}: ${rows.length} row(s) from ${finals.length} indexed final(s)`);
  return rows;
}
