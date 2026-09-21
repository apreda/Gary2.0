// Grounded NFL/NCAAF team edges.
//
// Source contract: BDL /{league}/v1/team_stats rows for the exact current
// football season, strictly before today's slate date. We compute simple
// per-game comparisons from those boxes. No ratings, projections, roster
// assumptions, SP+, FPI, EPA, havoc, or missing-data substitution appears here.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import {
  aggregateFootballTeamStats,
  loadFootballTeamGameStats,
  loadFootballTeamSample,
} from '../footballData.js';

// Reader-facing dates are words, never digits (design.md, Sep 21 2026).
export function humanDate(iso) {
  const t = Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return String(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(t);
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Possession renders as minutes, not raw seconds — "31:24 per game".
function clockText(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mins = Math.floor(n / 60);
  const secs = Math.round(n % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const METRICS = Object.freeze([
  Object.freeze({
    key: 'rushingYardsPerGame',
    category: 'trenches',
    label: 'rushing yards per game',
    short: 'YPG',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 15, ncaaf: 20 },
    headline: (leader, gap) => `${leader} is +${gap} rush yards per game`,
  }),
  Object.freeze({
    key: 'passingYardsPerGame',
    category: 'situational',
    label: 'team passing yards per game',
    short: 'YPG',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 20, ncaaf: 25 },
    headline: (leader, gap) => `${leader}'s passing game is +${gap} yards per game`,
  }),
  Object.freeze({
    key: 'pointsPerGame',
    category: 'pace_script',
    label: 'points per game',
    short: 'PPG',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 3, ncaaf: 4 },
    headline: (leader, gap) => `${leader} is scoring +${gap} points per game`,
  }),
  Object.freeze({
    key: 'turnoversPerGame',
    category: 'turnover_edge',
    label: 'turnovers committed per game',
    short: 'TO',
    decimals: 2,
    better: 'low',
    threshold: { nfl: 0.35, ncaaf: 0.35 },
    headline: (leader, gap) => `${leader} commits ${gap} fewer turnovers per game`,
  }),
  Object.freeze({
    key: 'yardsPerPlay',
    category: 'explosive_play',
    label: 'yards per play',
    short: 'Y/P',
    decimals: 2,
    better: 'high',
    threshold: { nfl: 0.4, ncaaf: 0.5 },
    headline: (leader, gap) => `${leader} owns a +${gap} yards-per-play gap`,
  }),
  Object.freeze({
    key: 'pointsAllowedPerGame',
    category: 'pace_script',
    label: 'points allowed per game',
    short: 'PPG',
    decimals: 1,
    better: 'low',
    threshold: { nfl: 3, ncaaf: 4 },
    headline: (leader, gap) => `${leader}'s defense gives up ${gap} fewer points per game`,
  }),
  Object.freeze({
    key: 'thirdDownPct',
    category: 'situational',
    label: 'third-down conversion rate',
    short: '%',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 5, ncaaf: 6 },
    headline: (leader, gap) => `${leader}'s third-down conversion rate is ${gap} percentage points higher`,
  }),
  Object.freeze({
    key: 'possessionSecondsPerGame',
    category: 'pace_script',
    label: 'time of possession per game',
    short: 'TOP',
    decimals: 0,
    better: 'high',
    display: clockText,
    threshold: { nfl: 120, ncaaf: 150 },
    headline: (leader, gap) => `${leader} holds the ball ${gap} longer per game`,
  }),
  Object.freeze({
    // Red-zone scoring rate is scores over trips, summed across the sample —
    // not an average of per-game rates. NCAAF team boxes carry no red-zone
    // fields, so the lane is NFL-only rather than estimated.
    key: 'redZonePct',
    category: 'red_zone',
    label: 'red-zone scoring rate',
    short: '%',
    decimals: 1,
    better: 'high',
    leagues: new Set(['nfl']),
    threshold: { nfl: 8 },
    headline: (leader, gap) => `${leader}'s red-zone scoring rate is ${gap} percentage points higher`,
  }),
  Object.freeze({
    key: 'redZoneTripsPerGame',
    category: 'red_zone',
    label: 'red-zone trips per game',
    short: 'TRIPS',
    decimals: 2,
    better: 'high',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.7 },
    headline: (leader, gap) => `${leader} gets inside the 20 ${times(gap)} per game`,
  }),
  Object.freeze({
    // Penalties are the one discipline fact both leagues' boxes carry.
    key: 'penaltyYardsPerGame',
    category: 'situational',
    label: 'penalty yards per game',
    short: 'YDS',
    decimals: 1,
    better: 'low',
    threshold: { nfl: 12, ncaaf: 15 },
    headline: (leader, gap) => `${leader} gives away ${gap} fewer penalty yards per game`,
  }),
  Object.freeze({
    key: 'fourthDownAttemptsPerGame',
    category: 'situational',
    label: 'fourth-down attempts per game',
    short: 'ATT/G',
    decimals: 2,
    better: 'high',
    threshold: { nfl: 0.6, ncaaf: 0.8 },
    headline: (leader, gap) => `${leader} goes for it ${times(gap)} per game on fourth down`,
  }),
  Object.freeze({
    key: 'fourthDownPct',
    category: 'situational',
    label: 'fourth-down conversion rate',
    short: '%',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 15, ncaaf: 18 },
    headline: (leader, gap) => `${leader}'s fourth-down conversion rate is ${gap} percentage points higher`,
  }),
  Object.freeze({
    key: 'firstDownsPerGame',
    category: 'situational',
    label: 'first downs per game',
    short: 'FD',
    decimals: 1,
    better: 'high',
    threshold: { nfl: 2.5, ncaaf: 3 },
    headline: (leader, gap) => `${leader} moves the chains ${times(gap)} per game`,
  }),
  Object.freeze({
    key: 'yardsPerPass',
    category: 'situational',
    label: 'yards per pass attempt',
    short: 'Y/A',
    decimals: 2,
    better: 'high',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.7 },
    headline: (leader, gap) => `${leader} averages +${gap} yards every time it drops back`,
  }),
  Object.freeze({
    key: 'yardsPerRushAttempt',
    category: 'trenches',
    label: 'yards per rush attempt',
    short: 'Y/C',
    decimals: 2,
    better: 'high',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.5 },
    headline: (leader, gap) => `${leader} gets +${gap} more yards a carry`,
  }),
  Object.freeze({
    key: 'offensivePlaysPerGame',
    category: 'pace_script',
    label: 'offensive plays per game',
    short: 'PLAYS',
    decimals: 1,
    better: 'high',
    leagues: new Set(['nfl']),
    threshold: { nfl: 5 },
    headline: (leader, gap) => `${leader} runs +${gap} more plays per game`,
  }),
  Object.freeze({
    // Interceptions and lost fumbles are stored separately, so the giveaway
    // that actually differs can be named instead of one lumped turnover count.
    key: 'interceptionsThrownPerGame',
    category: 'turnover_edge',
    label: 'interceptions thrown per game',
    short: 'INT',
    decimals: 2,
    better: 'low',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.4 },
    headline: (leader, gap) => `${leader} throws ${gap} fewer picks per game`,
  }),
  Object.freeze({
    key: 'fumblesLostPerGame',
    category: 'turnover_edge',
    label: 'fumbles lost per game',
    short: 'FUM',
    decimals: 2,
    better: 'low',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.35 },
    headline: (leader, gap) => `${leader} puts ${gap} fewer fumbles on the ground per game`,
  }),
  Object.freeze({
    key: 'sackYardsLostPerGame',
    category: 'pass_rush',
    label: 'sack yards lost per game',
    short: 'YDS',
    decimals: 1,
    better: 'low',
    leagues: new Set(['nfl']),
    threshold: { nfl: 5 },
    headline: (leader, gap) => `${leader}'s pocket leaks ${gap} fewer yards per game`,
  }),
  Object.freeze({
    // In the official NFL team box schema, `sacks` lives with the passing
    // offense and records sacks taken. We name that fact literally here.
    key: 'sacksPerGame',
    category: 'pass_rush',
    label: 'sacks taken per game',
    short: 'SACKS',
    decimals: 2,
    better: 'low',
    leagues: new Set(['nfl']),
    threshold: { nfl: 0.5 },
    headline: (leader, gap) => `${leader}'s offense takes ${gap} fewer sacks per game`,
  }),
]);

function finite(value) {
  return value != null && Number.isFinite(Number(value));
}

function fixed(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9])0+$/g, '');
}

function teamName(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

/** "2 more times" / "1 more time" — a count headline must agree with its number. */
function times(gap) {
  return `${gap} more time${String(gap) === '1' ? '' : 's'}`;
}

function sampleWord(n) {
  return `${n} game${n === 1 ? '' : 's'}`;
}

function relevance(metric, gap, league) {
  const threshold = metric.threshold?.[league] || 1;
  return Math.min(92, Math.round(50 + (gap / threshold) * 10));
}

function evidenceMeta({ metric, league, season, date, away, home, awayValue, homeValue }) {
  return {
    source: 'balldontlie_team_stats',
    metric: metric.key,
    league: league.toUpperCase(),
    season,
    through: date,
    away: {
      team_id: away.team.id,
      abbreviation: teamName(away.team),
      value: Number(awayValue),
      games: away.stats.games,
    },
    home: {
      team_id: home.team.id,
      abbreviation: teamName(home.team),
      value: Number(homeValue),
      games: home.stats.games,
    },
  };
}

// THE PLAYS THEMSELVES (founder, Sep 21 2026: the explosive-play write-up
// should say what the explosive plays were). For each side's most recent
// game in the sample, the 20-yard-plus plays from BDL's play log, named.
// Bounded per run so the BDL gate can't stall the stage; a game the cache
// already holds costs nothing.
const EXPLOSIVE_YARDS = 20;
const PLAY_FETCH_BUDGET = 16;

function latestGameForTeam(rows, teamId) {
  let best = null;
  for (const row of rows || []) {
    const tid = row?.team?.id ?? row?.team_id;
    if (String(tid) !== String(teamId)) continue;
    const gid = row?.game?.id ?? row?.game_id;
    const date = row?.game?.date ?? row?.game_date ?? '';
    if (gid == null) continue;
    if (!best || String(date) > String(best.date)) best = { id: gid, date };
  }
  return best;
}

function playLine(play) {
  const yards = Number(play?.stat_yardage);
  const text = String(play?.short_text || play?.text || '').replace(/\s+/g, ' ').trim();
  const kind = /pass|reception|catch/i.test(play?.type_text || '') ? 'pass' : /rush|run/i.test(play?.type_text || '') ? 'run' : 'play';
  const who = text.length > 90 ? `${text.slice(0, 87).trimEnd()}…` : text;
  return `${yards}-yard ${kind}${play?.scoring_play ? ' for a touchdown' : ''}${who ? ` (${who})` : ''}`;
}

async function explosivePlaysLine({ bdl, rows, team, budget }) {
  const game = latestGameForTeam(rows, team?.id);
  if (!game || budget.left <= 0 || typeof bdl?.getNflPlays !== 'function') return '';
  budget.left -= 1;
  const plays = await bdl.getNflPlays(game.id);
  const abbr = String(team?.abbreviation || '').toUpperCase();
  // Scrimmage plays only: kickoff and punt returns, penalties and turnover
  // returns carry yardage in the same field but are not explosive offense.
  const scrimmage = (p) => /pass|rush|reception|touchdown/i.test(p?.type_text || '')
    && !/kickoff|punt|penalty|return|field goal|extra point|interception|fumble|sack/i.test(p?.type_text || '');
  const mine = (plays || []).filter((p) => {
    const t = p?.team?.abbreviation || p?.team;
    return String(t || '').toUpperCase() === abbr && scrimmage(p) && Number(p?.stat_yardage) >= EXPLOSIVE_YARDS;
  });
  if (!mine.length) return ` ${abbr} had no play of ${EXPLOSIVE_YARDS}+ yards in its last game.`;
  const top = [...mine].sort((a, b) => Number(b.stat_yardage) - Number(a.stat_yardage)).slice(0, 3);
  return ` ${abbr} had ${mine.length} play${mine.length === 1 ? '' : 's'} of ${EXPLOSIVE_YARDS}+ yards in its last game, led by ${top.map(playLine).join('; ')}.`;
}

/**
 * Produce only comparisons that clear a sport-specific materiality threshold.
 * Missing either side's current-season sample drops that fact, not the game.
 */
export async function computeFootballTeamEdges(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (!['nfl', 'ncaaf'].includes(league)) return [];

  const sample = await loadFootballTeamSample({ bdl, league, season, date, games });
  const raw = sample.rows;
  const statsByTeam = aggregateFootballTeamStats(raw, { league });
  // A prior-season sample says so in every sentence (see loadFootballTeamSample).
  const priorTag = sample.prior ? ` (${sample.season} season)` : '';
  const through = (() => {
    const d = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(d) ? new Date(d - 86400000).toISOString().slice(0, 10) : date;
  })();
  const throughText = humanDate(through);
  // Last season's number rides every fact sheet (founder, Sep 21 2026: the
  // write-up can "talk about the teams as a whole... or what that looked
  // like last year"), so a one-game sample has a comparison. Optional: a
  // failed prior fetch costs the sentence, never the row.
  let priorByTeam = new Map();
  const priorSeason = Number(sample.season) - (sample.prior ? 0 : 1);
  if (!sample.prior) {
    try {
      const priorRows = await loadFootballTeamGameStats({ bdl, league, season: priorSeason, date, games });
      priorByTeam = aggregateFootballTeamStats(priorRows, { league });
    } catch (err) {
      console.warn(`[footballTeamEdges] prior-season sample unavailable: ${err?.message || err}`);
    }
  }
  const rows = [];
  const playBudget = { left: league === 'nfl' ? PLAY_FETCH_BUDGET : 0 };
  const playLines = new Map();   // team id -> the named explosive plays

  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    const awayStats = statsByTeam.get(String(awayTeam?.id));
    const homeStats = statsByTeam.get(String(homeTeam?.id));
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id || !awayStats || !homeStats) continue;
    if (awayStats.games < 1 || homeStats.games < 1) continue;
    const awayPrior = priorByTeam.get(String(awayTeam.id));
    const homePrior = priorByTeam.get(String(homeTeam.id));

    const sides = {
      away: { team: awayTeam, stats: awayStats },
      home: { team: homeTeam, stats: homeStats },
    };

    for (const metric of METRICS) {
      if (metric.leagues && !metric.leagues.has(league)) continue;
      const awayValue = awayStats[metric.key];
      const homeValue = homeStats[metric.key];
      if (!finite(awayValue) || !finite(homeValue)) continue;
      const gap = Math.abs(Number(awayValue) - Number(homeValue));
      if (gap < (metric.threshold?.[league] ?? Infinity)) continue;

      const awayLeads = metric.better === 'low'
        ? Number(awayValue) < Number(homeValue)
        : Number(awayValue) > Number(homeValue);
      const leader = awayLeads ? sides.away : sides.home;
      const other = awayLeads ? sides.home : sides.away;
      const show = metric.display || ((v) => fixed(v, metric.decimals));
      const pct = metric.short === '%' ? '%' : '';
      const gapText = show(gap);
      const awayText = show(awayValue);
      const homeText = show(homeValue);
      if (gapText == null || awayText == null || homeText == null) continue;
      const leaderText = awayLeads ? awayText : homeText;
      const otherText = awayLeads ? homeText : awayText;
      // Last season, both sides, when the prior sample carries this metric.
      let playsLine = '';
      if (metric.key === 'yardsPerPlay' && !sample.prior) {
        for (const team of [awayTeam, homeTeam]) {
          if (!playLines.has(String(team.id))) {
            try { playLines.set(String(team.id), await explosivePlaysLine({ bdl, rows: raw, team, budget: playBudget })); }
            catch (err) { playLines.set(String(team.id), ''); console.warn(`[footballTeamEdges] plays unavailable for ${teamName(team)}: ${err?.message || err}`); }
          }
        }
        playsLine = `${playLines.get(String(awayTeam.id)) || ''}${playLines.get(String(homeTeam.id)) || ''}`;
      }
      const priorLine = (() => {
        const a = awayPrior?.[metric.key], h = homePrior?.[metric.key];
        if (!finite(a) || !finite(h) || !(awayPrior?.games >= 1) || !(homePrior?.games >= 1)) return '';
        const at = show(a), ht = show(h);
        if (at == null || ht == null) return '';
        return ` Last season ${teamName(awayTeam)} was at ${at}${pct} over ${sampleWord(awayPrior.games)} and ${teamName(homeTeam)} at ${ht}${pct} over ${sampleWord(homePrior.games)}.`;
      })();

      rows.push(makeRow({
        category: metric.category,
        // MLB's headline shape — subject, number, what, the comparison — no
        // dash pre-context (founder, Sep 21 2026: "MLB is correct. Let's just
        // use the logic there").
        headline: `${teamName(leader.team)}: ${leaderText}${pct} ${metric.label} to ${teamName(other.team)}'s ${otherText}${pct}${priorTag}`,
        detail:
          `${teamName(awayTeam)} is at ${awayText}${pct} ${metric.label} over ${sampleWord(awayStats.games)}; ` +
          `${teamName(homeTeam)} is at ${homeText}${pct} over ${sampleWord(homeStats.games)}. ` +
          (sample.prior
            ? `Those are last season's regular-season numbers; this season has no finals for these clubs yet.`
            : `Those are this season's games through ${throughText}.`) + priorLine + playsLine,
        game: helpers.gameLabel(game),
        // Subtracting two percentages produces percentage points, not a
        // conversion rate or a relative percentage increase.
        value: metric.short === '%' ? `${gapText} PP` : `${gapText} ${metric.short}`,
        tone: TONES.EDGE,
        relevance_score: relevance(metric, gap, league),
        team_id: leader.team.id,
        game_id: game.id,
        meta: {
          ...evidenceMeta({
            metric,
            league,
            season: sample.season,
            date: through,
            away: sides.away,
            home: sides.home,
            awayValue,
            homeValue,
          }),
          prior_season: sample.prior,
        },
      }));
    }
  }

  await attachLaneReads('footballTeamEdges', rows, detailFact, {
    perGame: 3,
    ask: 'what this statistical gap actually means for how the game gets played — who dictates the style, how it collides with the other side\'s identity, and where the sample could mislead',
  });

  console.log(`[footballTeamEdges] ${league.toUpperCase()} ${date}: ${raw.length} BDL team boxes${sample.prior ? ` (${sample.season} season — ${season} has no finals for these clubs yet)` : ''} -> ${rows.length} row(s)`);
  return rows;
}

export default { computeFootballTeamEdges };
