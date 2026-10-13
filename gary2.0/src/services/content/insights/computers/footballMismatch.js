// THE MISMATCH — the one collision that decides the game.
//
// Founder brief (Aug 20): two NEW football sections beyond the MLB analogs,
// "a step or 2 beyond what ESPN would show, more fun than PPG". This lane
// answers the question a fan actually argues about: WHERE does this game get
// won? One row per game: the single largest unit gap between the sides,
// named as a collision ("Houston's pass rush against a Raiders line that
// takes 4.0 sacks a game"), with Gary's read on why it decides things.
//
// Source contract: the SAME aggregated team boxes footballTeamEdges reads —
// no ratings, no projections, no invented units. A gap only qualifies as THE
// mismatch when it clears 1.5x the teamEdges materiality threshold for its
// metric; a slate with no such gap simply has no mismatch row (absence stays
// absent). NFL + NCAAF.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import {
  aggregateFootballTeamStats,
  loadFootballTeamGameStats,
  loadFootballTeamSample,
} from '../footballData.js';

function clockText(seconds) {
  // Round the whole clock first: 1619.5 seconds is 27:00, never 26:60.
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function fixed(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9])0+$/g, '');
}

function teamName(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

// Plain nouns for the headline (MLB's shape: subject, number, what, the
// comparison — no dash pre-context; founder, Sep 21 2026).
const LABELS = Object.freeze({
  sacksPerGame: 'sacks taken a game',
  turnoversPerGame: 'turnovers a game',
  rushingYardsPerGame: 'rush yards a game',
  passingYardsPerGame: 'pass yards a game',
  yardsPerPlay: 'yards a snap',
  pointsAllowedPerGame: 'points allowed a game',
  thirdDownPct: 'on third down',
  possessionSecondsPerGame: 'of possession a game',
});
const PCT_KEYS = new Set(['thirdDownPct']);
// One unambiguous clause per side for the fact sheet, so a write-up can
// never mistake a team's own third-down rate for what its defense allowed.
const PHRASES = Object.freeze({
  sacksPerGame: (t, v) => `${t} took ${v} sacks a game`,
  turnoversPerGame: (t, v) => `${t} committed ${v} turnovers a game`,
  rushingYardsPerGame: (t, v) => `${t} ran for ${v} rushing yards a game`,
  passingYardsPerGame: (t, v) => `${t} threw for ${v} passing yards a game`,
  yardsPerPlay: (t, v) => `${t} averaged ${v} yards a snap on offense`,
  pointsAllowedPerGame: (t, v) => `${t}'s defense allowed ${v} points a game`,
  thirdDownPct: (t, v) => `${t}'s offense converted ${v}% of its own third downs`,
  possessionSecondsPerGame: (t, v) => `${t} held the ball ${v} a game`,
});

// The collision vocabulary: for each measurable, how the WINNING side and the
// LOSING side of the gap read as football units. Same keys/thresholds as
// footballTeamEdges so the two lanes can never disagree about materiality.
const COLLISIONS = Object.freeze([
  Object.freeze({
    key: 'sacksPerGame', better: 'low', decimals: 2,
    threshold: { nfl: 0.5 },
    leagues: new Set(['nfl']),
    frame: (winner, loser, wv, lv) =>
      `${winner}'s protection against a ${loser} front: ${loser} takes ${lv} sacks a game to ${winner}'s ${wv}`,
    unit: 'SACKS TAKEN / G',
  }),
  Object.freeze({
    key: 'turnoversPerGame', better: 'low', decimals: 2,
    threshold: { nfl: 0.35, ncaaf: 0.35 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s ball security against ${loser}'s giveaways: ${lv} turnovers a game to ${winner}'s ${wv}`,
    unit: 'TURNOVERS / G',
  }),
  Object.freeze({
    key: 'rushingYardsPerGame', better: 'high', decimals: 1,
    threshold: { nfl: 15, ncaaf: 20 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s ground game against ${loser}'s: ${wv} rush yards a game to ${lv}`,
    unit: 'RUSH YPG',
  }),
  Object.freeze({
    key: 'passingYardsPerGame', better: 'high', decimals: 1,
    threshold: { nfl: 20, ncaaf: 25 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s passing attack against ${loser}'s: ${wv} pass yards a game to ${lv}`,
    unit: 'PASS YPG',
  }),
  Object.freeze({
    key: 'yardsPerPlay', better: 'high', decimals: 2,
    threshold: { nfl: 0.4, ncaaf: 0.5 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s explosiveness against ${loser}'s: ${wv} yards a snap to ${lv}`,
    unit: 'YDS / PLAY',
  }),
  Object.freeze({
    key: 'pointsAllowedPerGame', better: 'low', decimals: 1,
    threshold: { nfl: 3, ncaaf: 4 },
    frame: (winner, loser, wv, lv) =>
      `${winner}'s defense against ${loser}'s: ${winner} allows ${wv} a game, ${loser} ${lv}`,
    unit: 'PTS ALLOWED / G',
  }),
  Object.freeze({
    key: 'thirdDownPct', better: 'high', decimals: 1,
    threshold: { nfl: 5, ncaaf: 6 },
    frame: (winner, loser, wv, lv) =>
      `${winner} on the money downs: ${wv}% on third down to ${loser}'s ${lv}%`,
    unit: '3RD DOWN %',
  }),
  Object.freeze({
    key: 'possessionSecondsPerGame', better: 'high', decimals: 0,
    threshold: { nfl: 120, ncaaf: 150 },
    display: clockText,
    frame: (winner, loser, wv, lv) =>
      `${winner}'s clock control: ${wv} of possession a game to ${loser}'s ${lv}`,
    unit: 'POSSESSION',
  }),
]);

// A gap must beat the teamEdges threshold by this factor to be THE mismatch.
const MISMATCH_FACTOR = 1.5;

export async function computeFootballMismatch(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (!['nfl', 'ncaaf'].includes(league)) return [];

  const sample = await loadFootballTeamSample({ bdl, league, season, date, games });
  const statsByTeam = aggregateFootballTeamStats(sample.rows, { league });
  // A prior-season sample says so in every sentence (see loadFootballTeamSample).
  const priorTag = sample.prior ? ` (${sample.season} season)` : '';
  // Last season's number rides the fact sheet, as on the team-edges lane
  // (founder, Sep 22 2026: a two-game rate is not who a team is; the read
  // needs last season beside it). Optional: a failed fetch costs the
  // sentence, never the row.
  let priorByTeam = new Map();
  if (!sample.prior) {
    try {
      const priorRows = await loadFootballTeamGameStats({ bdl, league, season: Number(sample.season) - 1, date, games });
      priorByTeam = aggregateFootballTeamStats(priorRows, { league });
    } catch (err) {
      console.warn(`[footballMismatch] prior-season sample unavailable: ${err?.message || err}`);
    }
  }

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    const awayStats = statsByTeam.get(String(awayTeam?.id));
    const homeStats = statsByTeam.get(String(homeTeam?.id));
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id || !awayStats || !homeStats) continue;
    if (awayStats.games < 1 || homeStats.games < 1) continue;

    let best = null;
    for (const metric of COLLISIONS) {
      if (metric.leagues && !metric.leagues.has(league)) continue;
      const threshold = metric.threshold?.[league];
      if (!Number.isFinite(threshold)) continue;
      const awayValue = Number(awayStats[metric.key]);
      const homeValue = Number(homeStats[metric.key]);
      if (!Number.isFinite(awayValue) || !Number.isFinite(homeValue)) continue;
      const gap = Math.abs(awayValue - homeValue);
      const severity = gap / threshold;
      if (severity < MISMATCH_FACTOR) continue;
      if (!best || severity > best.severity) {
        best = { metric, awayValue, homeValue, gap, severity };
      }
    }
    if (!best) continue;

    const { metric, awayValue, homeValue } = best;
    const awayLeads = metric.better === 'low' ? awayValue < homeValue : awayValue > homeValue;
    const winner = awayLeads ? awayTeam : homeTeam;
    const loser = awayLeads ? homeTeam : awayTeam;
    const winnerValue = awayLeads ? awayValue : homeValue;
    const loserValue = awayLeads ? homeValue : awayValue;
    const show = metric.display || ((v) => fixed(v, metric.decimals));

    const label = LABELS[metric.key] || metric.unit.toLowerCase();
    const sfx = PCT_KEYS.has(metric.key) ? '%' : '';
    const sampleWord = (n) => `${n} game${n === 1 ? '' : 's'}`;
    const awayPrior = priorByTeam.get(String(awayTeam.id));
    const homePrior = priorByTeam.get(String(homeTeam.id));
    const priorLine = (() => {
      const a = awayPrior?.[metric.key], h = homePrior?.[metric.key];
      if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(h)) || !(awayPrior?.games >= 1) || !(homePrior?.games >= 1)) return '';
      const at = show(a), ht = show(h);
      if (at == null || ht == null) return '';
      return ` Last season ${teamName(awayTeam)} was at ${at}${sfx} over ${sampleWord(awayPrior.games)} and ${teamName(homeTeam)} at ${ht}${sfx} over ${sampleWord(homePrior.games)}.`;
    })();
    rows.push(makeRow({
      category: 'mismatch',
      headline: `${teamName(winner)}: ${show(winnerValue)}${sfx} ${label} to ${teamName(loser)}'s ${show(loserValue)}${sfx}${priorTag}`,
      detail: `The widest gap between these two is ${label.replace(/^(on|of) /, '')}: ${(PHRASES[metric.key] || ((t, v) => `${t} ${v}`))(teamName(awayTeam), show(awayValue))} over ${sampleWord(awayStats.games)}; ${(PHRASES[metric.key] || ((t, v) => `${t} ${v}`))(teamName(homeTeam), show(homeValue))} over ${sampleWord(homeStats.games)}${sample.prior ? ', last regular season' : ' this season'}.${priorLine}`,
      game: helpers.gameLabel(game),
      value: `${show(winnerValue)} VS ${show(loserValue)}`,
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(90, Math.round(56 + best.severity * 8)),
      team_id: winner.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_team_stats',
        metric: metric.key,
        unit: metric.unit,
        league: league.toUpperCase(),
        season: sample.season,
        prior_season: sample.prior,
        severity: Number(best.severity.toFixed(2)),
        away: { team_id: awayTeam.id, abbreviation: teamName(awayTeam), value: awayValue, games: awayStats.games },
        home: { team_id: homeTeam.id, abbreviation: teamName(homeTeam), value: homeValue, games: homeStats.games },
        ...(priorLine ? { last_season: { season: Number(sample.season) - 1,
          away: { value: Number(awayPrior[metric.key]), games: awayPrior.games },
          home: { value: Number(homePrior[metric.key]), games: homePrior.games } } } : {}),
        through: date,
      },
    }));
  }

  await attachLaneReads('footballMismatch', rows, detailFact, {
    perGame: 3,
    ask: 'why THIS collision decides the game — how the stronger unit actually attacks the weaker one, what the weaker side has to do to hide it, and what it means for how the game plays out',
  });

  console.log(`[footballMismatch] ${league.toUpperCase()} ${date}: ${rows.length} mismatch row(s)`);
  return rows;
}

export default { computeFootballMismatch };
