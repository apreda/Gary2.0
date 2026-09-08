// gary2.0/src/services/insights/computers/firstInning.js
//
// LANE: firstInning  (category token emitted: first_inning)
// Observed first-inning scoring frequency and named season pitching samples.
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
// Optional named pitcher season splits are historical context, not a claim
// about who will pitch or how tonight's opening inning will go.
//
// Defensive: unmatched team, thin sample, missing linescore -> skip silently;
// never throws. One row max per game; slate-wide cap, relevance-ranked.

import {
  makeRow, TONES, nameKey, shiftDateStr, clampScore,
} from '../shared.js';
import mlbStatsApi from '../../mlbStatsApiService.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { firstInningResearchDetail, observedCount, RESEARCH_FACTS_VERSION } from '../researchFacts.js';

// ── NRFI engine (founder GO, Jul 27 2026) ───────────────────────────────────
// Two enrichments per surfaced game, both facts: tonight's live 1st-inning
// number (BDL markets catalog) and each probable starter's own first-inning
// season split (Stats API situational sitCode i01). Failures skip silently.

/** A team must appear in exactly one verified game on this date. Counting all
 * appearances before reading probables prevents a doubleheader's second starter
 * from replacing its first, including when one game has no probable yet. */
async function probablesByTeam(date) {
  try {
    const resp = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher`);
    if (!resp.ok) return new Map();
    const j = await resp.json();
    const out = new Map(), appearances = new Map();
    for (const g of (j?.dates || []).flatMap(day => day?.games || [])) {
      const teams = g?.teams;
      for (const side of ['home', 'away']) {
        const t = teams?.[side], opponent = teams?.[side === 'home' ? 'away' : 'home'];
        if (t?.team?.id == null) continue;
        appearances.set(t.team.id, (appearances.get(t.team.id) || 0) + 1);
        if (g.officialDate === date && g.gamePk != null && opponent?.team?.id != null
          && opponent.team.id !== t.team.id && t?.probablePitcher?.id != null) {
          out.set(t.team.id, { name: t.probablePitcher.fullName, id: t.probablePitcher.id,
            opponentId: opponent.team.id, side, gamePk: g.gamePk, date });
        }
      }
    }
    for (const [teamId, count] of appearances) if (count !== 1) out.delete(teamId);
    return out;
  } catch { return new Map(); }
}

/** One starter's first-inning season split — "8.47 ERA, .329 BA against (17 IP)". */
async function firstInningSplit(pitcherId, season) {
  try {
    const resp = await fetch(`https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=statSplits&sitCodes=i01&group=pitching&season=${season}`);
    if (!resp.ok) return null;
    const j = await resp.json();
    const s = j?.stats?.[0]?.splits?.[0]?.stat;
    if (!s || !s.inningsPitched || parseFloat(s.inningsPitched) < 5) return null; // thin split says nothing
    return { era: s.era, avg: s.avg, ip: s.inningsPitched, hr: observedCount(s.homeRuns) };
  } catch { return null; }
}

/**
 * Evidence + meta for one game: the live 0.5 number and both starters'
 * first-inning splits. Everything optional — absent pieces just don't print.
 */
async function nrfiEnrichment({ game, season, probables }) {
  const meta = { season };
  try {
    const market = await ballDontLieService.getMlbFirstInningRunsMarket(game?.id);
    if (market && (market.overOdds != null || market.underOdds != null)) {
      meta.price = { over: market.overOdds, under: market.underOdds, vendor: market.vendor };
    }
  } catch { /* price optional */ }
  try {
    const sp = [];
    const mlbamId = side => probables.mlbamIdByName?.get(nameKey(game?.[side]?.display_name || game?.[side]?.full_name || game?.[side]?.name));
    for (const side of ['home_team', 'visitor_team']) {
      const teamMlbamId = mlbamId(side);
      const opponentMlbamId = mlbamId(side === 'home_team' ? 'visitor_team' : 'home_team');
      const prob = teamMlbamId != null ? probables.byTeam.get(teamMlbamId) : null;
      const gameSide = side === 'home_team' ? 'home' : 'away';
      if (!prob || opponentMlbamId == null || prob.opponentId !== opponentMlbamId || prob.side !== gameSide) continue;
      const split = await firstInningSplit(prob.id, season);
      if (!split) continue;
      sp.push({ side: gameSide, name: prob.name, mlbam_player_id: prob.id, mlbam_game_id: prob.gamePk,
        game_date: prob.date, ...split });
    }
    if (sp.length) meta.sp_first_inning = sp;
  } catch { /* splits optional */ }
  return { meta };
}

/** Provider first pitch as an ISO instant, or null when absent/unparseable. */
function firstPitch(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace('.000Z', 'Z') : null;
}

/** Same-date order: first pitch, then game number. 0 = no provable order. */
function compareOrder(a, b) {
  if (a.gameDate && b.gameDate && a.gameDate !== b.gameDate) return a.gameDate < b.gameDate ? -1 : 1;
  if (a.gameNumber != null && b.gameNumber != null && a.gameNumber !== b.gameNumber) return a.gameNumber - b.gameNumber;
  return 0;
}

const sampleGame = ({ gamePk, date, gameDate, gameNumber }) => ({ gamePk, date, gameDate, gameNumber });

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
  const finalsById = new Map(), conflictingTeams = new Set();
  for (let back = 1; back <= LOOKBACK_DAYS; back++) {
    const d = shiftDateStr(date, -back);
    if (!d) break;
    try {
      const sched = (await mlbStatsApi.getMlbSchedule(d)) || [];
      for (const g of sched) {
        if (g?.status?.detailedState !== 'Final') continue;
        const gamePk = observedCount(g.gamePk);
        if (gamePk === null || gamePk === 0) continue;
        const inn1 = g?.linescore?.innings?.[0];
        const homeR = observedCount(inn1?.home?.runs);
        const awayR = observedCount(inn1?.away?.runs);
        const officialDate = typeof g.officialDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.officialDate)
          ? g.officialDate : null;
        const fact = {
          date: officialDate, gamePk,
          // First pitch and game number are the provider's own order evidence for
          // a doubleheader; a game id is not.
          gameDate: firstPitch(g.gameDate),
          gameNumber: observedCount(g.gameNumber),
          homeId: observedCount(g?.teams?.home?.team?.id),
          awayId: observedCount(g?.teams?.away?.team?.id),
          homeR1: homeR,
          awayR1: awayR,
        };
        const previous = finalsById.get(gamePk);
        if (previous && ['date', 'gameDate', 'gameNumber', 'homeId', 'awayId', 'homeR1', 'awayR1'].some(key => previous[key] !== fact[key])) {
          for (const teamId of [previous.homeId, previous.awayId, fact.homeId, fact.awayId]) {
            if (teamId != null) conflictingTeams.add(teamId);
          }
        } else if (!previous) finalsById.set(gamePk, fact);
      }
    } catch (err) {
      console.error('[firstInning] schedule error:', err?.message || err);
    }
  }
  const finals = [...finalsById.values()].filter(f => f.date && f.date < date && f.date >= shiftDateStr(date, -LOOKBACK_DAYS)
    && f.homeId != null && f.awayId != null && f.homeId !== f.awayId && f.homeR1 !== null && f.awayR1 !== null);
  if (!finals.length) {
    console.log('[firstInning] examined 0, emitted 0 (no recent finals)');
    return [];
  }
  finals.sort((a, b) => b.date.localeCompare(a.date) || compareOrder(b, a) || b.gamePk - a.gamePk);

  // A team whose same-date games cannot be ordered by first pitch or game
  // number has no provable "last N" window; it is suppressed, not guessed.
  const datesByTeam = new Map();
  for (const f of finals) {
    for (const teamId of [f.homeId, f.awayId]) {
      const key = `${teamId}|${f.date}`;
      const list = datesByTeam.get(key) || [];
      list.push(f);
      datesByTeam.set(key, list);
    }
  }
  for (const [key, list] of datesByTeam) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      if (compareOrder(list[i - 1], list[i]) === 0) conflictingTeams.add(Number(key.split('|')[0]));
    }
  }

  // Per MLBAM team id: the last SAMPLE_GAMES finals' 1st-inning facts.
  const byTeam = new Map();
  const push = (teamId, fact) => {
    if (teamId == null) return;
    if (!byTeam.has(teamId)) byTeam.set(teamId, []);
    const list = byTeam.get(teamId);
    if (list.length < SAMPLE_GAMES) list.push(fact);
  };
  for (const f of finals) {
    const source = { gamePk: f.gamePk, date: f.date, gameDate: f.gameDate, gameNumber: f.gameNumber };
    push(f.homeId, { ...source, scored: f.homeR1 > 0, allowed: f.awayR1 > 0, any: f.homeR1 + f.awayR1 > 0 });
    push(f.awayId, { ...source, scored: f.awayR1 > 0, allowed: f.homeR1 > 0, any: f.homeR1 + f.awayR1 > 0 });
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
    if (conflictingTeams.has(mlbamId)) return null;
    const list = mlbamId != null ? byTeam.get(mlbamId) : null;
    return Array.isArray(list) && list.length >= MIN_SAMPLE ? list : null;
  };
  const rate = (list, key) => list.filter((f) => f[key]).length;

  // NRFI-engine context, once per run: tonight's probables (Stats API) —
  // the per-game price/split fetches happen only for games that surface.
  const season = parseInt(String(date).slice(0, 4), 10) || new Date().getFullYear();
  const probables = { byTeam: await probablesByTeam(date), mlbamIdByName };

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

    // Matchup NRFI / YRFI rows — enriched with tonight's live number and the
    // starters' own first-inning season splits (facts; absent pieces skip).
    if (hAny <= NRFI_MAX && aAny <= NRFI_MAX) {
      const enr = await nrfiEnrichment({ game, season, probables });
      rows.push(makeRow({
        category: 'firstInning',
        headline: `NRFI watch: quiet first innings on both sides of ${label}`,
        detail: '', // filled from validated metadata below
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
          home_sample_games: homeSample.map(sampleGame),
          away_sample_games: awaySample.map(sampleGame),
          ...enr.meta,
        },
      }));
      continue;
    }
    if (hAny >= YRFI_MIN && aAny >= YRFI_MIN) {
      const enr = await nrfiEnrichment({ game, season, probables });
      rows.push(makeRow({
        category: 'firstInning',
        headline: `YRFI watch: first innings have been live on both sides of ${label}`,
        detail: '', // filled from validated metadata below
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
          home_sample_games: homeSample.map(sampleGame),
          away_sample_games: awaySample.map(sampleGame),
          ...enr.meta,
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
      const enr = await nrfiEnrichment({ game, season, probables });
      rows.push(makeRow({
        category: 'firstInning',
        headline: best.hot
          ? `${best.team.abbreviation} strike first: 1st-inning runs in ${best.scored} of their last ${best.n}`
          : `${best.team.abbreviation} have gone quiet in the 1st: runs in ${best.scored} of their last ${best.n}`,
        detail: '', // filled from validated metadata below
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
          team_sample_games: sampleFor(best.team).map(sampleGame),
          ...enr.meta,
        },
      }));
    }
  }

  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const capped = rows.flatMap(row => {
    const detail = firstInningResearchDetail(row.meta);
    if (!detail) return [];
    row.detail = detail;
    row.meta = { ...row.meta, research_facts_version: RESEARCH_FACTS_VERSION,
      computed_detail: detail, computed_detail_kind: 'measured_research', evidence: detail, read: detail };
    return [row];
  }).slice(0, MAX_ROWS);

  console.log(`[firstInning] examined ${examined}, emitted ${capped.length}`);
  return capped;
}

export default { computeFirstInning };
