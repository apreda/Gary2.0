/**
 * Soccer (World Cup) stat fetchers — backed by fifaWorldCupService.
 *
 * Keys are WC_-prefixed (the MLB_ pattern) so they can never shadow other
 * sports' generic tokens in the merged FETCHERS map. The previous bare-key
 * version of this file silently overrode NBA's RECENT_FORM and NHL's
 * EXPECTED_GOALS for EVERY sport (soccer was spread last in index.js).
 *
 * Dispatch contract: fetchStats' soccer branch calls each fetcher with a ctx
 * object { matchId, homeTeamId, awayTeamId, homeTeam, awayTeam, seasons } and
 * expects a { homeValue, awayValue, comparison, source } result.
 *
 * Pre-tournament reality (before June 11, 2026): ZERO 2026 matches are
 * completed, so every in-tournament aggregate is empty. Fetchers return
 * explicit NOT-AVAILABLE sentinels instead of soft excuses — the model knows
 * the 2022 World Cup from training and must never fill 2026 gaps from memory.
 */
import * as wc from '../../../fifaWorldCupService.js';
import * as apiFootball from '../../../apiFootballService.js';

const SOURCE = 'FIFA World Cup API (BDL)';
const PRE_TOURNAMENT = (teamName) =>
  `${teamName}: no completed 2026 World Cup matches yet (pre-tournament). ` +
  `In-tournament form/xG/possession figures DO NOT EXIST for 2026 — do not cite any from memory. ` +
  `Qualifier/friendly data is not in this source; use grounding with explicit dates if needed.`;

// Completed 2026 matches for one team, oldest → newest.
async function completedMatchesFor(teamId, seasons = [wc.DEFAULT_SEASON]) {
  if (teamId == null) return [];
  const matches = await wc.getMatches({ teamIds: [teamId], seasons });
  return (matches || [])
    .filter(m => m.status === 'completed')
    .sort((a, b) => new Date(a.datetime || 0) - new Date(b.datetime || 0));
}

// "Jun 14: beat South Africa 2-1" — full-time result (incl. ET) for form reading.
function describeResult(m, teamId) {
  const isHome = m.home_team?.id === teamId;
  const us = isHome ? m.home_score : m.away_score;
  const them = isHome ? m.away_score : m.home_score;
  const opp = isHome ? m.away_team?.name : m.home_team?.name;
  const date = (m.datetime || '').split('T')[0];
  const verb = us > them ? 'beat' : us < them ? 'lost to' : 'drew with';
  const et = m.has_extra_time ? ' (AET)' : '';
  const pens = m.has_penalty_shootout ? ' (pens)' : '';
  return `${date}: ${verb} ${opp} ${us}-${them}${et}${pens}`;
}

// WC_TEAM_FORM / WC_RECENT_FORM — completed 2026 results per team.
// (The /match_team_form endpoint returns 0 rows even for completed matches,
// verified live against 2022 — form is derived from match results instead.)
async function teamFormSummary(ctx = {}) {
  const sides = [
    [ctx.homeTeamId, ctx.homeTeam || 'Home'],
    [ctx.awayTeamId, ctx.awayTeam || 'Away'],
  ];
  const edition = (ctx.seasons && ctx.seasons[0]) || wc.DEFAULT_SEASON;
  const values = [];
  for (const [teamId, name] of sides) {
    const done = await completedMatchesFor(teamId, ctx.seasons).catch(() => []);
    values.push(done.length === 0
      ? PRE_TOURNAMENT(name)
      : `${name} — ${edition} tournament results: ${done.map(m => describeResult(m, teamId)).join(' | ')}`);
  }
  return {
    homeValue: values[0],
    awayValue: values[1],
    comparison: `Completed ${edition} World Cup results only (full-time, incl. ET where played)`,
    source: SOURCE,
  };
}

// Shared aggregate over a team's completed matches: goals + match-stat averages.
async function aggregateTeamStats(teamId, seasons) {
  const done = await completedMatchesFor(teamId, seasons);
  if (done.length === 0) return null;

  let gf = 0, ga = 0;
  for (const m of done) {
    const isHome = m.home_team?.id === teamId;
    gf += (isHome ? m.home_score : m.away_score) ?? 0;
    ga += (isHome ? m.away_score : m.home_score) ?? 0;
  }

  const rows = await wc.getTeamMatchStats(done.map(m => m.id)).catch(() => []);
  const ours = (rows || []).filter(r => r.team_id === teamId);
  const avg = (field) => {
    const vals = ours.map(r => r[field]).filter(v => typeof v === 'number');
    return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };

  return {
    games: done.length,
    gfPerGame: gf / done.length,
    gaPerGame: ga / done.length,
    xg: avg('expected_goals'),
    possession: avg('possession_pct'),
    shots: avg('shots_total'),
    shotsOnTarget: avg('shots_on_target'),
    corners: avg('corners'),
  };
}

const fmt1 = (v) => (v != null ? v.toFixed(1) : '—');
const fmt2 = (v) => (v != null ? v.toFixed(2) : '—');

// WC_TEAM_MATCH_STATS / WC_POSSESSION_STATS / WC_EXPECTED_GOALS
async function teamMatchStatsSummary(ctx = {}) {
  const sides = [
    [ctx.homeTeamId, ctx.homeTeam || 'Home'],
    [ctx.awayTeamId, ctx.awayTeam || 'Away'],
  ];
  const values = [];
  for (const [teamId, name] of sides) {
    // PREFER API-Football (user call, Jun 18) — it's the only xG/xGA source and
    // carries a broader recent-international sample than BDL's 2026-only rows.
    // Fall back to BDL's tournament aggregate only when API-Football has nothing.
    const af = await apiFootball.getRecentTeamStats(name, 6).catch(() => ({}));
    if (af && af.sampleMatches) {
      values.push(`${name} (last ${af.sampleMatches} internationals): xG ${af.xg ?? 'N/A'}/gm, xGA ${af.xga ?? 'N/A'}/gm, ` +
        `possession ${af.possession_pct ?? 'N/A'}%, shots ${af.shots ?? 'N/A'}/gm (${af.shots_on_target ?? 'N/A'} on target), ` +
        `corners ${af.corners ?? 'N/A'}/gm, pass acc ${af.pass_accuracy ?? 'N/A'}%`);
      continue;
    }
    const agg = await aggregateTeamStats(teamId, ctx.seasons).catch(() => null);
    values.push(!agg
      ? PRE_TOURNAMENT(name)
      : `${name} (${agg.games} matches, 2026 only): xG ${fmt2(agg.xg)}/gm, possession ${fmt1(agg.possession)}%, ` +
        `shots ${fmt1(agg.shots)}/gm (${fmt1(agg.shotsOnTarget)} on target), corners ${fmt1(agg.corners)}/gm`);
  }
  return {
    homeValue: values[0],
    awayValue: values[1],
    comparison: 'Recent per-match averages — API-Football internationals preferred, BDL 2026 fallback',
    source: 'API-Football / BDL',
  };
}

// WC_GOALS_PER_MATCH / WC_GOALS_CONCEDED
async function goalsSummary(ctx = {}) {
  const sides = [
    [ctx.homeTeamId, ctx.homeTeam || 'Home'],
    [ctx.awayTeamId, ctx.awayTeam || 'Away'],
  ];
  const values = [];
  for (const [teamId, name] of sides) {
    // Prefer API-Football recent internationals (broader sample); BDL 2026 fallback.
    const f = await apiFootball.getRecentForm(name, 10).catch(() => null);
    const span = f && (f.l10 || f.l5);
    if (span) {
      values.push(`${name}: ${span.gfPerMatch} goals scored/gm, ${span.gaPerMatch} conceded/gm (last ${span.played} internationals)`);
      continue;
    }
    const agg = await aggregateTeamStats(teamId, ctx.seasons).catch(() => null);
    values.push(!agg
      ? PRE_TOURNAMENT(name)
      : `${name}: ${fmt2(agg.gfPerGame)} goals scored/gm, ${fmt2(agg.gaPerGame)} conceded/gm (${agg.games} matches, 2026 only)`);
  }
  return {
    homeValue: values[0],
    awayValue: values[1],
    comparison: 'Scoring rates — API-Football internationals preferred, BDL 2026 fallback',
    source: 'API-Football / BDL',
  };
}

// WC_GROUP_STANDINGS / WC_GROUP_STAGE_CONTEXT — scoped to this match's groups.
async function groupStandings(ctx = {}) {
  const rows = await wc.getGroupStandings().catch(() => []);
  if (!rows.length) {
    return {
      homeValue: 'Group standings not available from the API.',
      awayValue: '',
      comparison: 'Group standings',
      source: SOURCE,
    };
  }
  const groupOf = (teamId) => rows.find(r => r.team?.id === teamId)?.group?.name ?? null;
  const relevantGroups = new Set([groupOf(ctx.homeTeamId), groupOf(ctx.awayTeamId)].filter(Boolean));
  const scoped = relevantGroups.size > 0 ? rows.filter(r => relevantGroups.has(r.group?.name)) : rows;
  const anyPlayed = scoped.some(r => (r.played ?? 0) > 0);
  const table = scoped
    .map(r => `${r.group?.name} #${r.position} ${r.team?.name}: ${r.points}pts (GD ${r.goal_difference}, ${r.played}gp)`)
    .join(' | ');
  const note = anyPlayed ? '' : ' — NOTE: 0 matches played; positions reflect seeding only, not results.';
  return {
    homeValue: table + note,
    awayValue: '',
    comparison: `Group standings (${[...relevantGroups].join(', ') || 'all groups'})`,
    source: SOURCE,
  };
}

// WC_H2H_HISTORY — World Cup finals meetings across 2018/2022/2026 editions.
async function h2hHistory(ctx = {}) {
  const { homeTeamId, awayTeamId } = ctx;
  if (homeTeamId == null || awayTeamId == null) {
    return {
      homeValue: 'H2H unavailable — team ids missing.',
      awayValue: '',
      comparison: 'World Cup head-to-head',
      source: SOURCE,
    };
  }
  const editions = [2018, 2022, 2026];
  const matches = await wc.getMatches({ teamIds: [homeTeamId], seasons: editions }).catch(() => []);
  const meetings = (matches || [])
    .filter(m => m.status === 'completed')
    .filter(m => (m.home_team?.id === awayTeamId || m.away_team?.id === awayTeamId))
    .sort((a, b) => new Date(a.datetime || 0) - new Date(b.datetime || 0));
  if (meetings.length === 0) {
    return {
      homeValue: `No World Cup meetings between these teams in the ${editions.join('/')} editions. ` +
        `This source covers World Cup finals matches ONLY — do not cite all-time international H2H from memory; ` +
        `use grounding with explicit dates if broader history matters.`,
      awayValue: '',
      comparison: 'World Cup head-to-head',
      source: SOURCE,
    };
  }
  return {
    homeValue: meetings.map(m =>
      `${(m.datetime || '').split('T')[0]} (${m.stage?.name ?? 'WC'}): ${m.home_team?.name} ${m.home_score}-${m.away_score} ${m.away_team?.name}` +
      `${m.has_extra_time ? ' AET' : ''}${m.has_penalty_shootout ? ` (pens ${m.home_score_penalties}-${m.away_score_penalties})` : ''}`
    ).join(' | '),
    awayValue: '',
    comparison: `World Cup finals meetings, ${editions.join('/')} editions only`,
    source: SOURCE,
  };
}

// WC_LINEUPS / WC_AVAILABILITY — confirmed starting XI from BDL FIFA. Posts ~2-2.5h
// before kickoff, so it's available at the T-90 run (it was empty under the old fixed
// 10 AM run). The structured availability signal: who is ACTUALLY starting — better
// than grounding for the XI. Injury REASONS / suspensions still come from grounding.
async function lineupsSummary(ctx = {}) {
  if (!ctx.matchId) {
    return { homeValue: 'No match id available for lineup lookup.', awayValue: '', comparison: 'Confirmed starting XI', source: SOURCE };
  }
  const rows = await wc.getMatchLineups(ctx.matchId).catch(() => []);
  if (!rows || rows.length === 0) {
    return {
      homeValue: 'Confirmed lineups not posted yet (they post ~2h before kickoff). Use grounding for the latest availability/injury news; do not invent a lineup.',
      awayValue: '', comparison: 'Confirmed starting XI', source: SOURCE,
    };
  }
  const xiFor = (teamId) => rows
    .filter(r => r.team_id === teamId && r.is_starter)
    .map(r => `${r.player?.name ?? '?'}${r.position ? ` (${r.position})` : ''}`);
  const homeXI = xiFor(ctx.homeTeamId);
  const awayXI = xiFor(ctx.awayTeamId);
  return {
    homeValue: homeXI.length ? `Starting XI (${homeXI.length}): ${homeXI.join(', ')}` : 'Starting XI unavailable',
    awayValue: awayXI.length ? `Starting XI (${awayXI.length}): ${awayXI.join(', ')}` : 'Starting XI unavailable',
    comparison: 'Confirmed starting XI',
    source: SOURCE,
  };
}

// WC_INJURIES — reported squad injuries/unavailability (BDL FIFA player_injuries —
// API-Football has NO national-team injuries, it returns empty). Status is OUT / GTD /
// SUS with the injury type. Feeds lag, so Gary should still confirm late team news via
// grounding, and never read "no rows" as a guaranteed clean bill of health.
async function injuriesSummary(ctx = {}) {
  const sides = [ctx.homeTeam || 'Home', ctx.awayTeam || 'Away'];
  const all = await wc.getInjuries({}).catch(() => []);
  const out = [];
  for (const name of sides) {
    const n = String(name).toLowerCase().trim();
    const rows = (all || []).filter((r) => {
      const tn = (r?.team?.name || '').toLowerCase();
      const ab = (r?.team?.abbreviation || '').toLowerCase();
      return n && (tn === n || ab === n || tn.includes(n) || n.includes(tn));
    });
    if (!rows.length) {
      out.push(`${name}: no injuries listed by the feed — verify late team news via grounding (do NOT assume a clean bill of health).`);
    } else {
      out.push(`${name}: ${rows.slice(0, 12).map(r => `${r.player?.name} (${r.status}${r.injury_type ? ', ' + r.injury_type : ''})`).join('; ')}`);
    }
  }
  return { homeValue: out[0], awayValue: out[1], comparison: 'Reported injuries/unavailability (BDL FIFA — OUT/GTD/SUS); feeds lag, confirm late news with grounding', source: 'BDL FIFA' };
}

// WC_RECENT_INTL_FORM — last internationals (qualifiers + friendlies), result by
// result, plus L5/L10 W-D-L and goal rates. The broad recent sample that BDL's
// 2026-only rows can't give early in the tournament.
async function recentIntlFormSummary(ctx = {}) {
  const sides = [ctx.homeTeam || 'Home', ctx.awayTeam || 'Away'];
  const out = [];
  for (const name of sides) {
    const f = await apiFootball.getRecentForm(name, 10).catch(() => null);
    const span = f && (f.l10 || f.l5);
    if (!span) {
      out.push(`${name}: recent international form unavailable from the feed.`);
    } else {
      const recent = (f.fixtures || []).slice(0, 5).map(x => `${x.result} ${x.gf}-${x.ga} v ${x.opponent}`).join('; ');
      out.push(`${name}: last 5 — ${recent || 'n/a'}. L${span.played} ${span.w}-${span.d}-${span.l}, ${span.gfPerMatch} scored/gm, ${span.gaPerMatch} conceded/gm.`);
    }
  }
  return { homeValue: out[0], awayValue: out[1], comparison: 'Recent internationals (qualifiers + friendlies) — broader sample than 2026-only', source: 'API-Football' };
}

// WC_KEY_PLAYERS — the squad's leading contributors (API-Football national-team
// season stats): goals, assists, shot volume + position. Season totals, not this-
// match form — pair with grounding/injuries for who actually starts. National
// teams are built from these individuals, so who's available swings the match.
async function keyPlayersSummary(ctx = {}) {
  const sides = [ctx.homeTeam || 'Home', ctx.awayTeam || 'Away'];
  const out = [];
  for (const name of sides) {
    const squad = await apiFootball.getSquadStats(name).catch(() => ({}));
    const players = Object.values(squad || {}).filter(p => (p.appearances || 0) > 0);
    if (!players.length) { out.push(`${name}: squad stats unavailable from the feed.`); continue; }
    const top = players
      .sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.shots || 0) - (a.shots || 0) || (b.appearances || 0) - (a.appearances || 0))
      .slice(0, 6)
      .map(p => `${p.name}${p.position ? ` (${p.position})` : ''}: ${p.goals}g/${p.assists}a${p.shots != null ? `, ${p.shots} shots` : ''} in ${p.appearances} caps`);
    out.push(`${name}: ${top.join('; ')}`);
  }
  return { homeValue: out[0], awayValue: out[1], comparison: 'Leading squad contributors — national-team season totals (API-Football); confirm starters via grounding/injuries', source: 'API-Football' };
}

export const soccerFetchers = {
  WC_TEAM_FORM: teamFormSummary,
  WC_RECENT_FORM: teamFormSummary,
  WC_LINEUPS: lineupsSummary,
  WC_AVAILABILITY: lineupsSummary,
  WC_GROUP_STANDINGS: groupStandings,
  WC_GROUP_STAGE_CONTEXT: groupStandings,
  WC_TEAM_MATCH_STATS: teamMatchStatsSummary,
  WC_POSSESSION_STATS: teamMatchStatsSummary,
  WC_EXPECTED_GOALS: teamMatchStatsSummary,
  WC_GOALS_PER_MATCH: goalsSummary,
  WC_GOALS_CONCEDED: goalsSummary,
  WC_H2H_HISTORY: h2hHistory,
  WC_INJURIES: injuriesSummary,
  WC_RECENT_INTL_FORM: recentIntlFormSummary,
  WC_KEY_PLAYERS: keyPlayersSummary,
};
