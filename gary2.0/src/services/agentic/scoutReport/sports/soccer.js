/**
 * Soccer (2026 FIFA World Cup) scout report builder. Mirrors sports/mlb.js shape:
 * returns { text, verifiedTaleOfTape, injuries, tokenMenu }.
 *
 * World Cup injuries / suspensions / confirmed lineups / weather come from Flash
 * grounding (no structured injury feed), so injuries is empty here by design.
 */
import * as wc from '../../../fifaWorldCupService.js';
import * as apiFootball from '../../../apiFootballService.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';

function teamName(side) {
  if (typeof side === 'string') return side;
  return side?.full_name || side?.name || null;
}

// Average the rate stats across a team's COMPLETED matches this edition.
// Returns {} pre-tournament (no matches played) — Tale of Tape shows N/A then.
async function aggregateRateStats(teamId) {
  if (!teamId) return {};
  try {
    const matches = await wc.getMatches({ teamIds: [teamId] });
    const completed = matches.filter(m => m.status === 'completed');
    if (!completed.length) return {};
    const ids = completed.map(m => m.id);
    const allRows = await wc.getTeamMatchStats(ids);
    const stats = allRows.filter(s => s.team_id === teamId);
    if (!stats.length) return {};
    const avg = (f) => {
      const vals = stats.map(s => s[f]).filter(v => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
    };
    const sum = (f) => stats.map(s => s[f]).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
    const totalPasses = sum('passes_total');
    const accuratePasses = sum('passes_accurate');
    // xGA = the OPPONENT's xG in each of this team's matches. The API has no
    // expected_goals_against field, but the same team_match_stats response
    // carries the other team's row per match — average those.
    const oppXg = allRows
      .filter(s => s.team_id !== teamId && typeof s.expected_goals === 'number')
      .map(s => s.expected_goals);
    return {
      xg: avg('expected_goals'),
      xga: oppXg.length ? oppXg.reduce((a, b) => a + b, 0) / oppXg.length : undefined,
      possession_pct: avg('possession_pct'),
      shots: avg('shots_total'),
      shots_on_target: avg('shots_on_target'),
      big_chances: avg('big_chances'),
      corners: avg('corners'),
      pass_accuracy: totalPasses ? (accuratePasses / totalPasses) * 100 : undefined,
      count: stats.length, // matches in the sample — caller gates a thin sample (see merge)
    };
  } catch {
    return {};
  }
}

// ── Futures-implied strength ─────────────────────────────────────────────────
// Match-stat aggregates are empty until a team plays (opening matches read all
// N/A). Futures odds, by contrast, are published for every team before kickoff,
// so they give the Tale of the Tape always-available strength rows: "Advance %"
// (implied chance to escape the group) and "Title Odds" (outright price).

function americanToImplied(am) {
  const n = Number(am);
  if (!Number.isFinite(n) || n === 0) return undefined;
  return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
}

function decimalToAmerican(dec) {
  if (!Number.isFinite(dec) || dec <= 1) return undefined;
  return dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : `${Math.round(-100 / (dec - 1))}`;
}

function median(nums) {
  const xs = nums.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return undefined;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/** Decimal odds for a team's market across vendors → median (consensus). */
function consensusDecimal(futures, teamId, teamName, marketType) {
  const rows = futures.filter(
    (f) =>
      f.market_type === marketType &&
      (f.subject?.id === teamId || (teamName && f.subject?.name === teamName))
  );
  const decs = rows.map((f) =>
    Number.isFinite(f.decimal_odds)
      ? f.decimal_odds
      : (americanToImplied(f.american_odds) ? 1 / americanToImplied(f.american_odds) : undefined)
  );
  return median(decs);
}

/** Always-available strength stats for a team from futures markets. */
function futuresStrengthFor(futures, teamId, teamName) {
  if (!Array.isArray(futures) || !futures.length) return {};
  const qualDec = consensusDecimal(futures, teamId, teamName, 'qualify_from_group');
  const titleDec = consensusDecimal(futures, teamId, teamName, 'outright');
  const advance_pct = qualDec ? `${Math.round((1 / qualDec) * 100)}%` : undefined;
  const title_odds = titleDec ? decimalToAmerican(titleDec) : undefined;
  return { advance_pct, title_odds };
}

function standingsFor(standings, teamId) {
  const row = standings.find(s => s.team?.id === teamId);
  if (!row) return {};
  const gp = row.played || 0;
  return {
    group_position: row.position ?? undefined,
    points: row.points ?? undefined,
    // Pre-tournament (0 played) GF/GA must read N/A, not "0.0" — a zero reads
    // as "this team averages 0 goals" and nudges low-total reasoning.
    goals_for: gp > 0 ? row.goals_for / gp : undefined,
    goals_against: gp > 0 ? row.goals_against / gp : undefined,
    record: `${row.won ?? 0}-${row.drawn ?? 0}-${row.lost ?? 0}`,
    group: row.group?.name,
    played: gp,
  };
}

export async function buildSoccerScoutReport(game, options = {}) {
  const homeTeam = teamName(game.home_team) || 'Home';
  const awayTeam = teamName(game.away_team) || 'Away';
  const homeId = game.home_team_data?.id ?? game.home_team?.id ?? null;
  const awayId = game.away_team_data?.id ?? game.away_team?.id ?? null;
  console.log(`[Scout Report] Building WC report: ${homeTeam} vs ${awayTeam}`);

  const [standings, homeAgg, awayAgg, futures, homeForm, awayForm, homeTeamStats, awayTeamStats, h2h, homeSquad, awaySquad] = await Promise.all([
    wc.getGroupStandings().catch(() => []),
    aggregateRateStats(homeId),
    aggregateRateStats(awayId),
    wc.getFutures().catch(() => []),
    // Recent-international form (qualifiers + friendlies + Nations League) from
    // API-Football — the always-available CURRENT data that fills the tape and
    // grounds the rationale when the 2026 edition is empty (opening matchday).
    apiFootball.getRecentForm(homeTeam, 10).catch(() => null),
    apiFootball.getRecentForm(awayTeam, 10).catch(() => null),
    // Per-match performance aggregates (xG, possession, shots, SoT, corners, pass
    // acc) over recent fixtures — fills the tape rows BDL can't until 2026 plays.
    apiFootball.getRecentTeamStats(homeTeam, 6).catch(() => ({})),
    apiFootball.getRecentTeamStats(awayTeam, 6).catch(() => ({})),
    apiFootball.getH2H(homeTeam, awayTeam, 6).catch(() => ({ meetings: [], summary: null })),
    // Squad's leading contributors (goals/assists/shots) — a national team IS its
    // players, so who is fit and in form swings the match. Season totals; pair with
    // the injury list. Game picks were team-only before this (user call, Jun 18).
    apiFootball.getSquadStats(homeTeam).catch(() => ({})),
    apiFootball.getSquadStats(awayTeam).catch(() => ({})),
  ]);

  const homeStand = standingsFor(standings, homeId);
  const awayStand = standingsFor(standings, awayId);
  const homeFut = futuresStrengthFor(futures, homeId, homeTeam);
  const awayFut = futuresStrengthFor(futures, awayId, awayTeam);

  // Recent-form aggregates → tape rows. The 2026-edition standings win once a
  // team has actually played a tournament match; until then we fall back to
  // recent-international form (labeled as such in the report so it's never
  // passed off as 2026 tournament data).
  const recentSeasonStats = (form) => {
    if (!form?.l10) return {};
    return {
      goals_for: form.l10.gfPerMatch,
      goals_against: form.l10.gaPerMatch,
      recent_form: form.l5?.form || form.l10.form,
      recent_record: `${form.l10.w}-${form.l10.d}-${form.l10.l}`,
    };
  };
  const homeRF = recentSeasonStats(homeForm);
  const awayRF = recentSeasonStats(awayForm);

  // Merge order matters: API-Football recent-match aggregates (xG/possession/shots)
  // fill in FIRST, then BDL 2026-edition stats override them once the tournament is
  // underway (real tournament data wins), then standings/futures add their fields.
  // But a thin BDL sample (1-2 group matches) is noise, not signal — a single match's
  // xG must NOT clobber a 6-match API-Football aggregate. Gate the WC override on a
  // real sample (>= 3 matches, i.e. group stage complete); strip the count helper so
  // it doesn't leak into the tape.
  const { count: homeAggN = 0, ...homeAggStats } = homeAgg;
  const { count: awayAggN = 0, ...awayAggStats } = awayAgg;
  const homeProfile = { teamName: homeTeam, record: homeStand.record || homeRF.recent_record, seasonStats: {
    ...homeRF, ...homeTeamStats, ...homeStand, ...(homeAggN >= 3 ? homeAggStats : {}), ...homeFut,
    // Standings GF/GA divide by games played — a single 1-0 group win reads as
    // "1.0 GF/match" and would override the 10-match recent-form rate. Only trust
    // standings GF/GA once the group is complete (>= 3 played), else use recent form.
    goals_for: (homeStand.played >= 3 ? homeStand.goals_for : undefined) ?? homeRF.goals_for,
    goals_against: (homeStand.played >= 3 ? homeStand.goals_against : undefined) ?? homeRF.goals_against,
    recent_form: homeRF.recent_form,
  } };
  const awayProfile = { teamName: awayTeam, record: awayStand.record || awayRF.recent_record, seasonStats: {
    ...awayRF, ...awayTeamStats, ...awayStand, ...(awayAggN >= 3 ? awayAggStats : {}), ...awayFut,
    goals_for: (awayStand.played >= 3 ? awayStand.goals_for : undefined) ?? awayRF.goals_for,
    goals_against: (awayStand.played >= 3 ? awayStand.goals_against : undefined) ?? awayRF.goals_against,
    recent_form: awayRF.recent_form,
  } };

  // Honestly-labeled recent-form lines for the report text (Gary reads these).
  const formLine = (team, form) => {
    if (!form?.l10) return `${team}: recent form unavailable`;
    const f = form.l10;
    const recent = form.fixtures.slice(0, 5)
      .map(x => `${x.result} ${x.gf}-${x.ga} v ${x.opponent} (${x.league})`).join('; ');
    return `${team} — last ${f.played} internationals: ${f.w}W-${f.d}D-${f.l}L, ${f.gfPerMatch} GF/match, ${f.gaPerMatch} GA/match. Recent: ${recent}`;
  };
  // Per-match performance (xG, possession, shots) aggregated over recent fixtures.
  const statsLine = (team, ts) => {
    if (!ts) return null;
    const bits = [];
    if (ts.xg != null) bits.push(`${ts.xg} xG/match`);
    if (ts.possession_pct != null) bits.push(`${ts.possession_pct}% possession`);
    if (ts.shots != null) bits.push(`${ts.shots} shots/match (${ts.shots_on_target ?? '?'} on target)`);
    if (ts.corners != null) bits.push(`${ts.corners} corners/match`);
    if (ts.pass_accuracy != null) bits.push(`${ts.pass_accuracy}% pass accuracy`);
    return bits.length ? `${team} (last ${ts.sampleMatches}): ${bits.join(', ')}` : null;
  };
  const homeStatsLine = statsLine(homeTeam, homeTeamStats);
  const awayStatsLine = statsLine(awayTeam, awayTeamStats);
  // Squad's leading contributors (season totals) — who actually drives a result.
  const keyPlayersLine = (team, squad) => {
    const players = Object.values(squad || {}).filter(p => (p.appearances || 0) > 0);
    if (!players.length) return null;
    const top = players
      .sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.shots || 0) - (a.shots || 0) || (b.appearances || 0) - (a.appearances || 0))
      .slice(0, 5)
      .map(p => `${p.name}${p.position ? ` (${p.position})` : ''} ${p.goals}g/${p.assists}a${p.shots != null ? `/${p.shots}sh` : ''} in ${p.appearances} caps`);
    return `${team}: ${top.join('; ')}`;
  };
  const homeKeyPlayers = keyPlayersLine(homeTeam, homeSquad);
  const awayKeyPlayers = keyPlayersLine(awayTeam, awaySquad);

  const stage = game.soccer_stage || 'Group Stage';
  const groupLabel = game.soccer_group ? ` (${game.soccer_group})` : '';
  const ml = game.soccer_three_way_ml;
  // Heavy-favorite discipline (founder rule): a 3-way ML leg priced heavier than
  // -200 is never shown to Gary. He is told to bet only the EXACT odds listed, so
  // omitting the favorite's price makes a -900-style moneyline unpickable AT THE
  // SOURCE — the option never enters his menu, rather than being reacted to after a
  // bad pick. Draw + underdog legs always remain, and the favorite's strength stays
  // legible via the FULL Asian-handicap ladder (every goal line, below) and the prices
  // that ARE shown — so Gary backs a heavy favorite at a fair price on the goal line his
  // read supports, rather than being funneled to the underdog or the draw. -200 itself
  // stays pickable (drop only when strictly heavier than -200).
  const mlLine = (() => {
    if (!ml) return '3-way moneyline: pending';
    const num = (o) => Number(String(o).replace(/[+\s]/g, ''));
    const legs = [
      { label: homeTeam, odds: ml.home },
      { label: 'Draw', odds: ml.draw },
      { label: awayTeam, odds: ml.away },
    ].filter((l) => l.odds != null && Number.isFinite(num(l.odds)));
    const offered = legs.filter((l) => num(l.odds) >= -200);
    const dropped = legs.filter((l) => num(l.odds) < -200);
    if (!offered.length) return '3-way moneyline: pending';
    let line = `3-way moneyline: ${offered.map((l) => `${l.label} ${l.odds}`).join(' / ')}`;
    if (dropped.length) {
      line += `\n  (${dropped.map((l) => l.label).join(' & ')} ML not offered — priced heavier than -200, so the bare moneyline isn't on the menu for them. This is a structural constraint on the available prices, not a directional hint: back them via the Asian-handicap ladder below at whichever goal line your read supports, or take whichever side your analysis favors.)`;
    }
    return line;
  })();
  const groupRows = standings
    .filter(s => game.soccer_group ? s.group?.name === game.soccer_group : (s.team?.id === homeId || s.team?.id === awayId))
    .map(s => `${s.position}. ${s.team?.name} — ${s.points}pts (${s.won}-${s.drawn}-${s.lost}, GD ${s.goal_difference})`);

  const reportText = [
    `## MATCHUP: ${homeTeam} vs ${awayTeam}`,
    `FIFA World Cup 2026 — ${stage}${groupLabel}. Venue: ${game.venue || 'TBD'}.`,
    groupRows.length ? `\n### GROUP STANDINGS\n${groupRows.join('\n')}` : '',
    (homeForm?.l10 || awayForm?.l10)
      ? `\n### RECENT INTERNATIONAL FORM (current cycle — qualifiers, friendlies, Nations League; NOT 2026 tournament data, treat as recent form)\n${formLine(homeTeam, homeForm)}\n${formLine(awayTeam, awayForm)}`
      : '',
    (homeStatsLine || awayStatsLine)
      ? `\n### RECENT PERFORMANCE (per-match averages over recent fixtures — xG, possession, shots)\n${[homeStatsLine, awayStatsLine].filter(Boolean).join('\n')}`
      : '',
    (homeKeyPlayers || awayKeyPlayers)
      ? `\n### KEY PLAYERS (national-team season totals — goals/assists/shots in caps; NOT this-match form, and availability must be confirmed against injuries + lineups before leaning on any single name)\n${[homeKeyPlayers, awayKeyPlayers].filter(Boolean).join('\n')}`
      : '',
    h2h?.meetings?.length
      ? `\n### HEAD TO HEAD (recent meetings)\n${h2h.meetings.map(m => `${m.date}: ${m.home} ${m.score} ${m.away} (${m.league})`).join('\n')}`
      : '',
    `\n### RAW ODDS VALUES (use these EXACT numbers — never approximate odds)`,
    mlLine,
    (() => {
      const fmt = (v) => (Number(v) > 0 ? `+${v}` : `${v}`);
      const ladder = Array.isArray(game.soccer_spread_ladder) ? game.soccer_spread_ladder : [];
      if (ladder.length) {
        // The FULL handicap ladder — so Gary can shop the favorite/underdog across goal
        // lines for the price his read supports, not just one elected main line.
        const rungs = ladder.map((l) =>
          `  ${homeTeam} ${fmt(l.homeValue)} @ ${l.homeOdds} / ${awayTeam} ${fmt(l.awayValue)} @ ${l.awayOdds}`);
        return `Asian handicap lines (pick ANY goal line that fits your read — this is how you back the favorite or the underdog at a price you like):\n${rungs.join('\n')}`;
      }
      if (game.soccer_spread && Math.abs(Number(game.soccer_spread.homeValue)) <= 4.5) {
        return `Asian handicap (main line): ${homeTeam} ${fmt(game.soccer_spread.homeValue)} @ ${game.soccer_spread.homeOdds} / ${awayTeam} ${fmt(game.soccer_spread.awayValue)} @ ${game.soccer_spread.awayOdds}`;
      }
      return 'Asian handicap: NOT AVAILABLE — do not pick or cite a handicap line';
    })(),
    // Sanity floor (defense-in-depth behind extractMainTotal): a real match-goals
    // main line lives ~1.0-5.0. Anything outside is a ladder extreme — never feed
    // it to Gary, so he can't pick an absurd "Under 10".
    game.soccer_total && Number(game.soccer_total.line) >= 1.0 && Number(game.soccer_total.line) <= 5.0
      ? `Total goals (main line): ${game.soccer_total.line} — Over ${game.soccer_total.over} / Under ${game.soccer_total.under}`
      : 'Total goals: NOT AVAILABLE — do not pick or cite a total',
    `\n(Injuries, suspensions, confirmed lineups, and weather/altitude come from Flash grounding for this match.)`,
  ].filter(Boolean).join('\n');

  const injuries = { home: [], away: [] };
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(homeTeam, awayTeam, homeProfile, awayProfile, 'WC', injuries, [], []);

  return { text: reportText, verifiedTaleOfTape, injuries, tokenMenu: formatTokenMenu('WC') };
}
