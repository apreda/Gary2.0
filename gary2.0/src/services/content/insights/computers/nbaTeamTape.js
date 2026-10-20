// gary2.0/src/services/content/insights/computers/nbaTeamTape.js
//
// LANE: nba_tape (NBA; the game page's BIG NUMBERS rail, Oct 20 2026: the NBA
// Picks page had almost nothing under the pick next to MLB, NFL and college).
// The two teams side by side on six numbers a fan reads: point differential,
// scoring, points allowed, threes, pace and rebounds. Each row names the leader
// first, its number is the row's value, and the other side follows.
//
// Source: BDL team_season_averages (base, advanced, opponent), regular season.
// This season once both teams have three games, last season before that, and
// every row says which. Deterministic numbers: the voice pass leaves them alone.
// Never throws; a team without a sheet drops the game.

import { makeRow, TONES } from '../shared.js';

const MIN_GAMES = 3;
const fmt = (v) => (Math.round(Number(v) * 10) / 10).toFixed(1);
const signed = (v) => (Number(v) > 0 ? `+${fmt(v)}` : fmt(v));
const seasonName = (s) => `${s}-${String(s + 1).slice(2)}`;

async function teamSheet(bdl, teamId, season) {
  const safe = (p) => Promise.resolve(p).catch(() => null);
  const [base, adv, opp] = await Promise.all([
    safe(bdl.getTeamBaseStats(teamId, season)),
    safe(bdl.getTeamSeasonAdvanced(teamId, season)),
    safe(bdl.getTeamOpponentStats(teamId, season)),
  ]);
  if (!base || !(Number(base.gp) > 0)) return null;
  const n = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  return { gp: Number(base.gp), pts: n(base.pts), fg3m: n(base.fg3m), reb: n(base.reb), pm: n(base.plus_minus), pace: n(adv?.pace), oppPts: n(opp?.opp_pts) };
}

// Each number: which side leads (higher, or lower for points allowed), and the sentence.
const STATS = [
  { key: 'pm', relevance: 66, lower: false, text: (l, lv, t, tv, scope) => `${l} outscored teams by ${fmt(lv)} a game ${scope}, ${t} ${Number(tv) >= 0 ? `by ${fmt(tv)}` : `was outscored by ${fmt(-tv)}`}`, value: (v) => signed(v),
    textNeg: (l, lv, t, tv, scope) => `${l} was outscored by ${fmt(-lv)} a game ${scope}, ${t} by ${fmt(-tv)}` },
  { key: 'pts', relevance: 64, lower: false, text: (l, lv, t, tv, scope) => `${l} scored ${fmt(lv)} points a game ${scope}, ${t} ${fmt(tv)}`, value: fmt },
  { key: 'oppPts', relevance: 62, lower: true, text: (l, lv, t, tv, scope) => `${l} allowed ${fmt(lv)} points a game ${scope}, ${t} ${fmt(tv)}`, value: fmt },
  { key: 'fg3m', relevance: 60, lower: false, text: (l, lv, t, tv, scope) => `${l} made ${fmt(lv)} threes a game ${scope}, ${t} ${fmt(tv)}`, value: fmt },
  { key: 'pace', relevance: 58, lower: false, text: (l, lv, t, tv, scope) => `${l} played at ${fmt(lv)} possessions a game ${scope}, ${t} ${fmt(tv)}`, value: fmt },
  { key: 'reb', relevance: 56, lower: false, text: (l, lv, t, tv, scope) => `${l} grabbed ${fmt(lv)} rebounds a game ${scope}, ${t} ${fmt(tv)}`, value: fmt },
];

export async function computeNbaTeamTape(ctx) {
  const { games, bdl, helpers, season } = ctx;
  const rows = [];
  let examined = 0;
  for (const game of games || []) {
    try {
      const home = game?.home_team, away = game?.visitor_team;
      if (game?.id == null || !home?.id || !away?.id) continue;
      examined++;
      let year = season;
      let [h, a] = await Promise.all([teamSheet(bdl, home.id, year), teamSheet(bdl, away.id, year)]);
      if (!(h?.gp >= MIN_GAMES && a?.gp >= MIN_GAMES)) {
        year = season - 1;
        [h, a] = await Promise.all([teamSheet(bdl, home.id, year), teamSheet(bdl, away.id, year)]);
      }
      if (!h || !a) continue;
      const scope = year === season ? 'this season' : 'last season';
      const label = helpers.gameLabel(game);
      for (const st of STATS) {
        const hv = h[st.key], av = a[st.key];
        if (hv == null || av == null) continue;
        const homeLeads = st.lower ? hv <= av : hv >= av;
        const [lead, lv, trail, tv] = homeLeads ? [home, hv, away, av] : [away, av, home, hv];
        const sentence = st.key === 'pm' && lv < 0 ? st.textNeg(lead.abbreviation, lv, trail.abbreviation, tv, scope)
          : st.text(lead.abbreviation, lv, trail.abbreviation, tv, scope);
        rows.push(makeRow({
          category: 'nba_tape',
          headline: sentence,
          detail: `${sentence}. ${seasonName(year)} regular season: ${home.abbreviation} over ${h.gp} games, ${away.abbreviation} over ${a.gp}.`,
          game: label,
          value: st.value(lv),
          tone: TONES.NEUTRAL,
          relevance_score: st.relevance,
          team_id: lead.id,
          game_id: game.id,
          meta: { stat: st.key, season: year, scope },
        }));
      }
    } catch (err) {
      console.error('[nbaTeamTape] game error:', err?.message || err);
    }
  }
  console.log(`[nbaTeamTape] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeNbaTeamTape };
