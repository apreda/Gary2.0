// The MLB dart board: every game still to start, its context in fan terms,
// both lineups (projected until they post) and the day's real prices for the
// three MLB dart categories. Sources are the morning board (`tomorrow_board`
// for today's date), `mlb_field_lineups` and the BDL markets. Parks reach
// Gary as prose, never as a factor.
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { getMlbSchedule } from '../mlbStatsApiService.js';
import { overPrice, fmtOdds, etClock, clubShort } from './dartsCommon.js';

const START_BUFFER_MS = 10 * 60 * 1000;
const PARK_WORDS = { hitter: "a hitter's park", pitcher: "a pitcher's park" };

const sameStart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) < 20 * 60 * 1000;
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function starterLine(s) {
  if (!s) return null;
  const bits = [`${s.full_name || s.name}${s.era != null ? `, ${s.era} ERA` : ''}`];
  if (s.l3?.gs) bits.push(`last ${s.l3.gs} starts ${s.l3.ip} IP, ${s.l3.er} ER, ${s.l3.k} K`);
  if (s.last_outing) bits.push(`last out ${s.last_outing.date} ${s.last_outing.at} ${s.last_outing.opp}: ${s.last_outing.ip} IP, ${s.last_outing.er} ER, ${s.last_outing.k} K`);
  if (s.rest?.days != null) bits.push(`${s.rest.days} days' rest`);
  return bits.join(' · ');
}

function offenseLine(p) {
  if (!p) return null;
  const bits = [];
  if (p.rs_per_game != null) bits.push(`${p.rs_per_game} runs a game`);
  if (p.runs_pg_l10 != null) bits.push(`${p.runs_pg_l10} over the last 10`);
  if (p.home_runs_l5 != null) bits.push(`${p.home_runs_l5} HR in the last 5 games`);
  if (p.first_inning_scored_l10 != null) bits.push(`scored in the 1st in ${p.first_inning_scored_l10} of the last 10`);
  if (p.bullpen_era_l14 != null) bits.push(`bullpen ${p.bullpen_era_l14} ERA over 14 days`);
  return bits.join(', ');
}

function weatherLine(w) {
  if (!w) return null;
  const bits = [];
  if (w.temp_f != null) bits.push(`${w.temp_f}°F`);
  if (w.wind_mph != null) bits.push(`wind ${w.wind_mph} mph`);
  if (w.precip_pct != null && w.precip_pct >= 20) bits.push(`${w.precip_pct}% chance of rain`);
  return bits.length ? bits.join(', ') : null;
}

/**
 * @returns {{ league:'MLB', games:number, text:string, candidates:Map, eligible:Record<string,string[]> }}
 * candidates: id → { kind set, fields to store per kind }
 */
export async function buildMlbDartsBoard({ supabase, date, now = Date.now(), used = {} }) {
  const { data: day, error } = await supabase
    .from('tomorrow_board').select('board, starters, run_profile, weather').eq('date', date).maybeSingle();
  if (error) throw new Error(`MLB darts: board read failed: ${error.message}`);
  if (!day) throw new Error(`MLB darts: no morning board for ${date} yet`);

  // A game the league has called off since the morning board is not on it.
  const schedule = await getMlbSchedule(date).catch(() => []);
  const calledOff = (r) => schedule.some((g) => /postpon|cancel|suspend/i.test(String(g.status?.detailedState || ''))
    && sameStart(g.gameDate, r.commence_time)
    && clubShort(g.teams?.home?.team?.name) === r.home_team);
  const games = (day.board || [])
    .filter((r) => r.league === 'MLB' && r.bdl_game_id != null && !calledOff(r))
    .filter((r) => Date.parse(r.commence_time) > now + START_BUFFER_MS)
    .filter((r) => !/final|progress|live|postpon|cancel|suspend/i.test(`${r.game_status || ''} ${r.status_detail || ''}`))
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));

  const { data: lineupRows, error: lineupErr } = await supabase
    .from('mlb_field_lineups').select('game_id, status, payload').eq('date', date);
  if (lineupErr) throw new Error(`MLB darts: lineups read failed: ${lineupErr.message}`);
  const lineupsById = new Map((lineupRows || []).map((r) => [String(r.game_id), r]));
  const starters = day.starters || [];
  const profiles = day.run_profile || [];
  const weather = day.weather || [];

  const candidates = new Map();
  const eligible = { hr: [], hits_run: [], first_inning: [] };
  const usedSet = (kind) => new Set((used[kind] || []).map(String));
  const usedHr = usedSet('hr');
  const usedHitsRun = usedSet('hits_run');
  const usedFirst = usedSet('first_inning');
  let batterSeq = 0;
  const blocks = [];

  for (const [gi, g] of games.entries()) {
    const gameId = String(g.bdl_game_id);
    const matchup = `${g.away_team} @ ${g.home_team}`;
    const lines = [];
    const head = [`GAME ${gi + 1} · ${matchup} · ${etClock(g.commence_time)}`];
    if (g.park?.name) head.push(PARK_WORDS[g.park.type] ? `${g.park.name}, ${PARK_WORDS[g.park.type]}` : g.park.name);
    lines.push(head.join(' · '));

    const market = [];
    if (g.total != null) market.push(`total ${g.total}`);
    if (g.ml_away != null && g.ml_home != null) market.push(`${g.away_abbr} ${fmtOdds(g.ml_away)} / ${g.home_abbr} ${fmtOdds(g.ml_home)}`);
    const wx = weatherLine(weather.find((w) => w.league === 'MLB' && sameStart(w.commence_time, g.commence_time) && String(w.matchup || '').includes(g.home_team)));
    if (wx) market.push(wx);
    if (market.length) lines.push(`Line: ${market.join(' · ')}`);

    const startersHere = starters.filter((s) => s.league === 'MLB' && sameStart(s.game_time, g.commence_time) && [g.away_abbr, g.home_abbr].includes(s.abbr));
    for (const abbr of [g.away_abbr, g.home_abbr]) {
      const s = starterLine(startersHere.find((x) => x.abbr === abbr));
      if (s) lines.push(`${abbr} starter: ${s}`);
    }
    if (g.arms_take) lines.push(`On the mound: ${String(g.arms_take).replace(/\s*\n+\s*/g, ' ')}`);

    for (const [side, abbr] of [['away', g.away_abbr], ['home', g.home_abbr]]) {
      const p = profiles.find((x) => x.league === 'MLB' && x.abbr === abbr);
      const o = offenseLine(p);
      const vs = g.vs_hand?.[side];
      const hand = vs?.faces === 'L' ? 'lefties' : vs?.faces === 'R' ? 'righties' : null;
      const vsText = hand && vs.ops_vs != null ? `, ${Number(vs.ops_vs).toFixed(3).replace(/^0/, '')} OPS against ${hand} (${Number(vs.ops_other).toFixed(3).replace(/^0/, '')} otherwise)` : '';
      if (o || vsText) lines.push(`${abbr} offense: ${o || ''}${vsText}`);
    }

    // First inning: the live market first, the morning board's copy second.
    let first = await bdl.getMlbFirstInningRunsMarket(g.bdl_game_id).catch(() => null);
    if (!first && g.nrfi) first = { overOdds: g.nrfi.over, underOdds: g.nrfi.under, vendor: g.nrfi.vendor };
    if (first && (first.overOdds != null || first.underOdds != null)) {
      const id = `F${gi + 1}`;
      lines.push(`[${id}] FIRST-INNING RUN: yes ${fmtOdds(first.overOdds)} / no ${fmtOdds(first.underOdds)}`);
      candidates.set(id, { id, kind: 'first_inning', gameId, matchup, commence: g.commence_time, yes: num(first.overOdds), no: num(first.underOdds), book: first.vendor });
      if (!usedFirst.has(gameId)) eligible.first_inning.push(id);
    }

    // Lineups and the batter markets.
    const lineup = lineupsById.get(gameId);
    const propRows = await bdl.getMlbPlayerProps(g.bdl_game_id);
    const byPlayer = new Map();
    for (const r of propRows) {
      const k = String(r.player_id);
      if (!byPlayer.has(k)) byPlayer.set(k, []);
      byPlayer.get(k).push(r);
    }
    for (const side of ['away', 'home']) {
      const team = lineup?.payload?.[side];
      if (!team?.fielders?.length) continue;
      const facing = team.facingPitcher;
      lines.push(`${clubShort(team.team)} lineup (${lineup.status === 'confirmed' ? 'posted' : 'projected'})${facing?.name ? ` against ${facing.name} (${facing.hand || '?'})` : ''}:`);
      for (const f of [...team.fielders].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))) {
        const rows = byPlayer.get(String(f.playerId)) || [];
        const hr = overPrice(rows, { propType: 'home_runs', line: 0.5 });
        const hits = overPrice(rows, { propType: 'hits', line: 1.5 });
        const run = overPrice(rows, { propType: 'runs_scored', line: 0.5 });
        const facts = [`${f.order}. ${f.name} ${f.pos || ''}`.trim(), `bats ${f.bats || '?'}`];
        if (f.ops) facts.push(`${String(f.ops).replace(/^0/, '')} OPS`);
        if (f.seasonHr != null) facts.push(`${f.seasonHr} HR`);
        if (f.heat && f.heat !== 'steady') facts.push(f.heat);
        const prices = [];
        if (hr) prices.push(`HOME RUN ${fmtOdds(hr.odds)}`);
        if (hits && run) prices.push(`2+ HITS ${fmtOdds(hits.odds)}, RUN ${fmtOdds(run.odds)}`);
        if (!prices.length) { lines.push(`  ${facts.join(' · ')}`); continue; }
        const id = `B${++batterSeq}`;
        lines.push(`  [${id}] ${facts.join(' · ')} · ${prices.join(' · ')}`);
        candidates.set(id, {
          id, gameId, matchup, commence: g.commence_time,
          player: f.name, playerId: String(f.playerId), team: team.team, position: f.pos || null,
          hr, hits, run,
        });
        if (hr && !usedHr.has(f.name)) eligible.hr.push(id);
        if (hits && run && !usedHitsRun.has(f.name)) eligible.hits_run.push(id);
      }
    }
    blocks.push(lines.join('\n'));
  }

  return {
    league: 'MLB',
    games: games.length,
    text: `## TODAY'S MLB BOARD\n\n${blocks.join('\n\n')}`,
    candidates,
    eligible,
  };
}

/** The darts row for one validated MLB throw. */
export function mlbDartRow(kind, c, { side = null } = {}) {
  const base = { league: 'MLB', kind, game_id: c.gameId, matchup: c.matchup, commence_time: c.commence };
  if (kind === 'first_inning') {
    const yes = side !== 'no';
    return { ...base, player: c.matchup, prop: 'first_inning_runs 0.5', bet: yes ? 'over' : 'under', odds: yes ? c.yes : c.no, book: c.book };
  }
  const shared = { ...base, player: c.player, player_id: c.playerId, team: c.team, position: c.position };
  if (kind === 'hr') return { ...shared, prop: 'home_runs 0.5', bet: 'over', odds: c.hr.odds, book: c.hr.book };
  return { ...shared, prop: 'hits 1.5 + runs_scored 0.5', bet: 'over', odds: c.hits.odds, odds_alt: c.run.odds, book: c.hits.book };
}
