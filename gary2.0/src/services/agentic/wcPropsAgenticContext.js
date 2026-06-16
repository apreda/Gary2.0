/**
 * World Cup player-props context builder.
 *
 * Returns the { propCandidates, playerStats, narrativeContext } contract the props
 * CLI/orchestrator expects (see run-agentic-props-cli.js). Grounding philosophy:
 * the prop ODDS are the market's player-level read (implied probability is the
 * single strongest signal for soccer props), supplemented by recent INTERNATIONAL
 * goals/assists/apps from API-Football and the team-level recent form. Gary grounds
 * each pick in role + form + price, never the price alone.
 */
import * as apiFootball from '../apiFootballService.js';

const impliedProb = (odds) => {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100);
};

const lastName = (name) => (name || '').toLowerCase().trim().split(/\s+/).pop();

export async function buildWcPropsAgenticContext(game, playerProps, options = {}) {
  const homeTeam = game.home_team || 'Home';
  const awayTeam = game.away_team || 'Away';

  // Group the normalized props by player.
  const byPlayer = new Map();
  for (const p of playerProps) {
    if (!byPlayer.has(p.player)) byPlayer.set(p.player, { player: p.player, team: p.team, props: [], recentForm: null });
    byPlayer.get(p.player).props.push({
      prop_type: p.prop_type,
      line: p.line,
      over_odds: p.over_odds,
      under_odds: p.under_odds,
      impliedOver: impliedProb(p.over_odds),
      impliedUnder: impliedProb(p.under_odds),
    });
  }
  const propCandidates = [...byPlayer.values()];

  // Grounding: recent international stats per squad + team recent form.
  const [homeSquad, awaySquad, homeForm, awayForm] = await Promise.all([
    apiFootball.getSquadStats(homeTeam).catch(() => ({})),
    apiFootball.getSquadStats(awayTeam).catch(() => ({})),
    apiFootball.getRecentForm(homeTeam, 10).catch(() => null),
    apiFootball.getRecentForm(awayTeam, 10).catch(() => null),
  ]);
  const squadFor = (team) => (team === homeTeam ? homeSquad : team === awayTeam ? awaySquad : {});
  const lookupStats = (player, team) => {
    const squad = squadFor(team) || {};
    if (squad[player.toLowerCase()]) return squad[player.toLowerCase()];
    const ln = lastName(player);
    return Object.values(squad).find((s) => lastName(s.name) === ln) || null;
  };

  // Attach intl form to each candidate (also surfaced in the playerStats text).
  for (const c of propCandidates) {
    const st = lookupStats(c.player, c.team);
    if (st) c.recentForm = { intlGoals: st.goals, intlAssists: st.assists, intlApps: st.appearances, intlShots: st.shots, position: st.position };
  }

  // Player-stats text Gary reads. Lead with implied probability + intl form.
  const fmtPct = (p) => (p == null ? '?' : `${Math.round(p * 100)}%`);
  const lines = propCandidates.map((c) => {
    const st = c.recentForm;
    const intl = st
      ? `recent intl: ${st.intlGoals}g/${st.intlAssists}a in ${st.intlApps} apps${st.intlShots != null ? `, ${st.intlShots} shots` : ''}${st.position ? ` (${st.position})` : ''}`
      : 'recent intl: n/a';
    const propBits = c.props
      .map((p) => {
        if (p.over_odds != null && p.under_odds != null) return `${p.prop_type} ${p.line}: O ${p.over_odds} (${fmtPct(p.impliedOver)}) / U ${p.under_odds} (${fmtPct(p.impliedUnder)})`;
        if (p.over_odds != null) return `${p.prop_type} ${p.line}+: ${p.over_odds} (${fmtPct(p.impliedOver)})`;
        return `${p.prop_type} ${p.line}`;
      })
      .join('; ');
    return `${c.player} (${c.team}) — ${intl}\n    props: ${propBits}`;
  });

  const playerStats = [
    `WORLD CUP PLAYER PROPS — ${homeTeam} vs ${awayTeam}`,
    `The % after each price is the market's IMPLIED probability — the strongest single player-level signal. Ground every pick in the player's role, minutes, and recent form, not the price alone. Favor attackers' shots/SoT and likely scorers' anytime-goal where form + role + price align.`,
    '',
    ...lines,
  ].join('\n');

  const formSummary = (t, f) => (f?.l10 ? `${t}: last ${f.l10.played} ${f.l10.w}-${f.l10.d}-${f.l10.l}, ${f.l10.gfPerMatch} GF/${f.l10.gaPerMatch} GA per match` : `${t}: form n/a`);
  const narrativeContext = `World Cup match. ${formSummary(homeTeam, homeForm)}. ${formSummary(awayTeam, awayForm)}. Prop markets cover anytime goal, shots, shots on target, assists, tackles, saves.`;

  return { propCandidates, playerStats, narrativeContext, gameSummary: {} };
}

export default { buildWcPropsAgenticContext };
