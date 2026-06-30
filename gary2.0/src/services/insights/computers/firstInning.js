// gary2.0/src/services/insights/computers/firstInning.js
//
// LANE: firstInning  (category token emitted: first_inning)
// "NRFI / YRFI watch: how often have these teams' games produced a first-inning
//  run lately — and does tonight's matchup line up clean on one side of it?"
//
// Approach (MLB Stats API via mlbStatsApiService — the free statsapi feed the
// pipeline already uses for schedules/lineups/weather):
//   - getMlbSchedule(date) hydrates `linescore`, so every FINAL game on a past
//     date carries linescore.innings[0].home.runs / .away.runs (probed live
//     2026-06-10). We walk the last LOOKBACK_DAYS ET dates once (2-hr cached,
//     shared across all teams) and build, per MLBAM team id, the last
//     SAMPLE_GAMES finals with: did THEY score in the 1st, did they ALLOW a
//     1st-inning run, did the game see ANY 1st-inning run (the YRFI event).
//   - Slate teams are BDL objects; the join to MLBAM teams is by full-name
//     nameKey (display_name vs statsapi team.name) — abbreviations diverge
//     between the two providers, names don't.
//   - Matchup rows: both sides' games quiet in the 1st (yrfiRate <= NRFI_MAX)
//     -> NRFI row; both sides' games loud (>= YRFI_MIN) -> YRFI row. value is
//     the literal "NRFI" / "YRFI" token the grader branches on.
//   - Single-team rows (only when no matchup row fired for the game): a team
//     scoring first-inning runs in >= TEAM_HOT of its last N ("they strike
//     first", tone HOT) or in <= TEAM_COLD ("flat in the 1st", tone COLD),
//     value "k/N", team_id set so the grader can check THAT side's 1st.
//
// Starters' own first-inning runs allowed would need per-start play-by-play —
// not cheaply available, so this lane is team-side only (by design).
//
// Defensive: unmatched team, thin sample, missing linescore -> skip silently;
// never throws. One row max per game; slate-wide cap, relevance-ranked.

import {
  makeRow, TONES, pickVariant, nameKey, shiftDateStr, clampScore,
} from '../shared.js';
import mlbStatsApi from '../../mlbStatsApiService.js';

// Tunables.
const LOOKBACK_DAYS = 16;   // ET calendar dates walked to gather recent finals
const SAMPLE_GAMES = 10;    // per-team window ("last ~10")
const MIN_SAMPLE = 8;       // fail closed below this many sampled finals
const NRFI_MAX = 3;         // both sides' games saw a 1st-inning run in <= 3 of N -> NRFI
const YRFI_MIN = 7;         // both sides' games saw a 1st-inning run in >= 7 of N -> YRFI
const TEAM_HOT = 7;         // team scored in the 1st in >= 7 of N -> "strike first"
const TEAM_COLD = 1;        // team scored in the 1st in <= 1 of N -> "flat in the 1st"
const MAX_ROWS = 6;         // slate-wide cap, relevance-ranked

export async function computeFirstInning(ctx) {
  const { games, date, helpers } = ctx;
  let examined = 0;

  // 1. Walk recent ET dates once; collect finals with a 1st-inning linescore.
  const finals = [];
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const d = shiftDateStr(date, -back);
    if (!d) break;
    try {
      const sched = (await mlbStatsApi.getMlbSchedule(d)) || [];
      for (const g of sched) {
        if (g?.status?.detailedState !== 'Final') continue;
        const inn1 = g?.linescore?.innings?.[0];
        const homeR = Number(inn1?.home?.runs);
        const awayR = Number(inn1?.away?.runs);
        if (!Number.isFinite(homeR) || !Number.isFinite(awayR)) continue;
        finals.push({
          date: String(g.officialDate || g.gameDate || d).slice(0, 10),
          gamePk: g.gamePk,
          homeId: g?.teams?.home?.team?.id,
          awayId: g?.teams?.away?.team?.id,
          homeR1: homeR,
          awayR1: awayR,
        });
      }
    } catch (err) {
      console.error('[firstInning] schedule error:', err?.message || err);
    }
  }
  if (!finals.length) {
    console.log('[firstInning] examined 0, emitted 0 (no recent finals)');
    return [];
  }
  finals.sort((a, b) => b.date.localeCompare(a.date)); // newest first

  // Per MLBAM team id: the last SAMPLE_GAMES finals' 1st-inning facts.
  const byTeam = new Map();
  const push = (teamId, fact) => {
    if (teamId == null) return;
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    const list = byTeam.get(teamId);
    if (list.length < SAMPLE_GAMES) list.push(fact);
  };
  for (const f of finals) {
    push(f.homeId, { scored: f.homeR1 > 0, allowed: f.awayR1 > 0, any: f.homeR1 + f.awayR1 > 0 });
    push(f.awayId, { scored: f.awayR1 > 0, allowed: f.homeR1 > 0, any: f.homeR1 + f.awayR1 > 0 });
  }

  // 2. BDL slate team -> MLBAM team, joined by full-name key.
  let mlbamIdByName = new Map();
  try {
    const teams = (await mlbStatsApi.getMlbTeams()) || [];
    mlbamIdByName = new Map(teams.map((t) => [nameKey(t.name), t.id]));
  } catch (err) {
    console.error('[firstInning] teams error:', err?.message || err);
    return [];
  }
  const sampleFor = (bdlTeam) => {
    const mlbamId = mlbamIdByName.get(nameKey(bdlTeam?.display_name || bdlTeam?.full_name || bdlTeam?.name));
    const list = mlbamId != null ? byTeam.get(mlbamId) : null;
    return Array.isArray(list) && list.length >= MIN_SAMPLE ? list : null;
  };
  const rate = (list, key) => list.filter((f) => f[key]).length;

  // 3. One row max per live slate game.
  const rows = [];
  for (const game of games) {
    if (String(game?.status || '').toUpperCase().includes('FINAL')) continue;
    const gameId = game?.id;
    if (gameId == null) continue;
    examined++;
    const label = helpers.gameLabel(game);
    const home = game?.home_team;
    const away = game?.visitor_team;

    const homeSample = sampleFor(home);
    const awaySample = sampleFor(away);
    if (!homeSample || !awaySample) continue;

    const hAny = rate(homeSample, 'any');
    const aAny = rate(awaySample, 'any');
    const hN = homeSample.length;
    const aN = awaySample.length;

    // Matchup NRFI / YRFI rows.
    if (hAny <= NRFI_MAX && aAny <= NRFI_MAX) {
      const quiet = (hN - hAny) + (aN - aAny);
      rows.push(makeRow({
        category: 'firstInning',
        headline: `NRFI watch: quiet first innings on both sides of ${label}`,
        detail: pickVariant([
          `${home.abbreviation} games have seen a first-inning run in just ${hAny} of their last ${hN}; ${away.abbreviation} games in ${aAny} of ${aN}. That is ${quiet} clean opening frames between them.`,
          `Neither side has been scoring early — a 1st-inning run in only ${hAny} of ${hN} for ${home.abbreviation} and ${aAny} of ${aN} for ${away.abbreviation} games lately.`,
        ], gameId),
        game: label,
        value: 'NRFI',
        tone: TONES.COLD,
        relevance_score: clampScore(58 + (NRFI_MAX * 2 - hAny - aAny) * 4),
        game_id: gameId,
        meta: {
          kind: 'nrfi', side: 'NRFI',
          home_abbr: home.abbreviation, away_abbr: away.abbreviation,
          home_seq: homeSample.map((f) => (f.any ? 1 : 0)),
          away_seq: awaySample.map((f) => (f.any ? 1 : 0)),
          home_any: hAny, home_n: hN, away_any: aAny, away_n: aN,
        },
      }));
      continue;
    }
    if (hAny >= YRFI_MIN && aAny >= YRFI_MIN) {
      rows.push(makeRow({
        category: 'firstInning',
        headline: `YRFI watch: first innings have been live on both sides of ${label}`,
        detail: pickVariant([
          `${home.abbreviation} games have produced a first-inning run in ${hAny} of their last ${hN}; ${away.abbreviation} games in ${aAny} of ${aN}. Early runs have been the rule, not the exception.`,
          `Both sides keep scoring early — a 1st-inning run in ${hAny} of ${hN} for ${home.abbreviation} and ${aAny} of ${aN} for ${away.abbreviation} games lately.`,
        ], gameId),
        game: label,
        value: 'YRFI',
        tone: TONES.HOT,
        relevance_score: clampScore(58 + (hAny + aAny - YRFI_MIN * 2) * 4),
        game_id: gameId,
        meta: {
          kind: 'nrfi', side: 'YRFI',
          home_abbr: home.abbreviation, away_abbr: away.abbreviation,
          home_seq: homeSample.map((f) => (f.any ? 1 : 0)),
          away_seq: awaySample.map((f) => (f.any ? 1 : 0)),
          home_any: hAny, home_n: hN, away_any: aAny, away_n: aN,
        },
      }));
      continue;
    }

    // Single-team extreme (best one per game).
    const sides = [
      { team: home, sample: homeSample },
      { team: away, sample: awaySample },
    ];
    let best = null;
    for (const { team, sample } of sides) {
      const scored = rate(sample, 'scored');
      const n = sample.length;
      const seq = sample.map((f) => (f.scored ? 1 : 0));   // 1 = scored in the 1st
      if (scored >= TEAM_HOT) {
        const score = clampScore(50 + (scored - TEAM_HOT) * 6);
        if (!best || score > best.score) best = { team, scored, n, hot: true, score, seq };
      } else if (scored <= TEAM_COLD) {
        const score = clampScore(50 + (TEAM_COLD - scored) * 6);
        if (!best || score > best.score) best = { team, scored, n, hot: false, score, seq };
      }
    }
    if (best) {
      const name = best.team.full_name || best.team.display_name || best.team.abbreviation;
      rows.push(makeRow({
        category: 'firstInning',
        headline: best.hot
          ? `${best.team.abbreviation} strike first: 1st-inning runs in ${best.scored} of their last ${best.n}`
          : `${best.team.abbreviation} have gone quiet in the 1st: runs in ${best.scored} of their last ${best.n}`,
        detail: best.hot
          ? `${name} have put up a first-inning run in ${best.scored} of their last ${best.n} games — they jump on starters early and the YRFI side of their games has been doing the work.`
          : `${name} have scored in the first inning just ${best.scored} time${best.scored === 1 ? '' : 's'} in their last ${best.n} games — slow-starting lineup, and the 1st has been a free pass for opposing starters.`,
        game: label,
        value: `${best.scored}/${best.n}`,
        tone: best.hot ? TONES.HOT : TONES.COLD,
        relevance_score: best.score,
        team_id: best.team.id,
        game_id: gameId,
        meta: {
          kind: 'nrfi', side: best.hot ? 'TEAM_HOT' : 'TEAM_QUIET',
          team_abbr: best.team.abbreviation,
          team_seq: best.seq,
          team_scored: best.scored, team_n: best.n,
        },
      }));
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const capped = rows.slice(0, MAX_ROWS);
  console.log(`[firstInning] examined ${examined}, emitted ${capped.length}`);
  return capped;
}

export default { computeFirstInning };
