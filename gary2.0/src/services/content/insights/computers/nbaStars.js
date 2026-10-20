// gary2.0/src/services/content/insights/computers/nbaStars.js
//
// LANE: nba_stars (NBA; THE STARS at the top of the game page, the NBA's
// counterpart to MLB's starting pitchers and the NFL's quarterbacks; Oct 20
// 2026). Each team's lead player tonight is the one the books give the highest
// points line, the same rule the Darts menu and the page's plates use. The row
// carries both players' lines; its detail is the take Gary's voice pass writes.
//
// Sources: BDL player props (main over/under points line) and game logs: this
// season once a player has three games, last season before that, labeled.
// Never throws; a game without a priced player on both sides is skipped.

import { makeRow, TONES } from '../shared.js';
import { mainLines } from '../nbaPlayerInsightCards.js';

const one = (v) => Math.round(v * 10) / 10;
const avg = (games, f) => { const xs = games.map((g) => Number(g[f])).filter(Number.isFinite); return xs.length ? one(xs.reduce((a, b) => a + b, 0) / xs.length) : null; };

async function starOf(bdl, pid, info, line, season, asOf) {
  const safe = (p) => Promise.resolve(p).catch(() => null);
  const [cur, prev] = await Promise.all([
    safe(bdl.getNbaPlayerGameLogs(pid, 100, {}, { season, asOf })),
    safe(bdl.getNbaPlayerGameLogs(pid, 100, {}, { season: season - 1, asOf })),
  ]);
  const thisSeason = cur?.games || [];
  const games = thisSeason.length >= 3 ? thisSeason : (prev?.games || []);
  if (!games.length) return null;
  return { player_id: String(pid), name: info.name, position: info.position || null, line,
    pts: avg(games, 'pts'), reb: avg(games, 'reb'), ast: avg(games, 'ast'), fg3m: avg(games, 'fg3m'), min: avg(games, 'min'),
    games: games.length, scope: thisSeason.length >= 3 ? 'this season' : 'last season' };
}

export async function computeNbaStars(ctx) {
  const { games, bdl, helpers, season, date } = ctx;
  const rows = [];
  let examined = 0;
  for (const game of games || []) {
    try {
      const home = game?.home_team, away = game?.visitor_team;
      if (game?.id == null || !home?.id || !away?.id) continue;
      examined++;
      const points = mainLines(await bdl.getNbaPlayerProps(game.id).catch(() => [])).filter((m) => m.prop_type === 'points');
      if (!points.length) continue;
      const people = await bdl.getNbaPlayersByIds([...new Set(points.map((m) => m.player_id))]).catch(() => ({}));
      const top = (team) => points
        .filter((m) => (people?.[m.player_id] || people?.[String(m.player_id)])?.team === team.full_name)
        .sort((x, y) => y.line - x.line)[0];
      const [ta, th] = [top(away), top(home)];
      if (!ta || !th) continue;
      const asOf = new Date(game.datetime || `${date}T23:00:00Z`);
      const [sa, sh] = await Promise.all([
        starOf(bdl, ta.player_id, people[ta.player_id] || people[String(ta.player_id)], ta.line, season, asOf),
        starOf(bdl, th.player_id, people[th.player_id] || people[String(th.player_id)], th.line, season, asOf),
      ]);
      if (!sa || !sh) continue;
      const said = (s, team) => `${s.name} (${team.abbreviation}) averaged ${s.pts} points, ${s.reb} rebounds and ${s.ast} assists ${s.scope} over ${s.games} games; his points line tonight is ${s.line}.`;
      rows.push(makeRow({
        category: 'nba_stars',
        headline: `${sa.name} and ${sh.name} lead tonight's board`,
        detail: `${said(sa, away)} ${said(sh, home)}`,
        game: helpers.gameLabel(game),
        value: `${sa.line} / ${sh.line}`,
        tone: TONES.NEUTRAL,
        relevance_score: 72,
        game_id: game.id,
        meta: { stars: [{ side: 'away', team: away.abbreviation, ...sa }, { side: 'home', team: home.abbreviation, ...sh }] },
      }));
    } catch (err) {
      console.error('[nbaStars] game error:', err?.message || err);
    }
  }
  console.log(`[nbaStars] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeNbaStars };
