// The NBA dart board (Oct 19 2026, for the opener): every game on the ET date still to tip, its line and total,
// each rotation player's main over/under line in the five NBA dart categories, and a sheet of his own games for
// the stat each settles on (this season once he has three, last season before that, labeled). No formula: the
// menu is the board in the books' order of who matters most (the higher line first). Sources: BDL games, odds,
// player props, injuries and game logs.
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { mainLineBoth, fmtOdds, etClock, etDate, normName } from './dartsCommon.js';
import { nbaSeason } from '../../../utils/dateUtils.js';

const START_BUFFER_MS = 10 * 60 * 1000;
const OUT = /^out/i;
const nextUtcDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** The NBA categories: the candidate key, the BDL prop type, the game-log field, and the line that makes a market. */
export const NBA_MARKET = {
  pts: { prop: 'points', stat: 'pts', floor: 10.5, word: 'points' },
  reb: { prop: 'rebounds', stat: 'reb', floor: 4.5, word: 'rebounds' },
  ast: { prop: 'assists', stat: 'ast', floor: 3.5, word: 'assists' },
  threes: { prop: 'threes', stat: 'fg3m', floor: 1.5, word: 'threes' },
  pra: { prop: 'points_rebounds_assists', stat: 'pra', floor: 15.5, word: 'points + rebounds + assists' },
};
const LABEL = { pts: 'POINTS', reb: 'REBOUNDS', ast: 'ASSISTS', threes: 'THREES', pra: 'PTS+REB+AST' };
const one = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1));
const avg = (games, f) => { const xs = games.map((g) => g[f]).filter((v) => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };

export async function buildNbaDartsBoard({ date, now = Date.now(), used = {} }) {
  const season = nbaSeason(new Date(`${date}T16:00:00Z`));
  const listed = [...await bdl.getGames('basketball_nba', { dates: [date] }).catch(() => []), ...await bdl.getGames('basketball_nba', { dates: [nextUtcDay(date)] }).catch(() => [])];
  const seen = new Set();
  const games = listed
    .filter((g) => g?.id != null && !seen.has(g.id) && seen.add(g.id))
    .filter((g) => etDate(Date.parse(g.datetime)) === date && Date.parse(g.datetime) > now + START_BUFFER_MS)
    .filter((g) => !/final|qtr|half|ot/i.test(String(g.status || '')) || /T\d/.test(String(g.status || '')))
    .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  if (!games.length) return { league: 'NBA', games: 0, text: '', candidates: new Map(), eligible: {}, frames: [] };

  const teams = await bdl.getTeams('basketball_nba').catch(() => []);
  const abbrById = new Map((teams || []).map((t) => [String(t.id), t.abbreviation]));
  const injuries = await bdl.getInjuriesGeneric('basketball_nba', { team_ids: games.flatMap((g) => [g.home_team?.id, g.visitor_team?.id]).filter((x) => x != null) }).catch(() => []);
  const injuryById = new Map((injuries || []).filter((i) => i?.player?.id != null).map((i) => [String(i.player.id), String(i.status || '')]));
  const odds = await bdl.getOddsV2?.({ game_ids: games.map((g) => g.id) }, 'nba').catch(() => []) || [];

  const candidates = new Map();
  const eligible = Object.fromEntries(Object.keys(NBA_MARKET).map((k) => [k, []]));
  const usedSet = Object.fromEntries(Object.keys(eligible).map((k) => [k, new Set((used[k] || []).map(String))]));
  const frames = [];
  const blocks = [];
  let seq = 0;

  for (const [gi, g] of games.entries()) {
    const away = g.visitor_team, home = g.home_team;
    const matchup = `${away.abbreviation} @ ${home.abbreviation}`;
    const line = (odds || []).filter((o) => o.game_id === g.id).sort((a, b) => (a.vendor === 'draftkings' ? -1 : 0) - (b.vendor === 'draftkings' ? -1 : 0))[0];
    const head = [`GAME ${gi + 1} · ${away.full_name} @ ${home.full_name} · ${etClock(g.datetime)}`];
    if (line?.spread_home_value != null) { const sp = Number(line.spread_home_value); head.push(sp < 0 ? `${home.abbreviation} ${sp}` : sp > 0 ? `${away.abbreviation} ${-sp}` : 'pick em'); }
    if (line?.total_value != null) head.push(`total ${line.total_value}`);
    frames.push({ gameId: String(g.id), matchup, homeFull: home.full_name, awayFull: away.full_name, commence: g.datetime, block: head.join(' · ') });

    const rows = await bdl.getNbaPlayerProps(g.id).catch(() => []);
    const ids = [...new Set(rows.map((r) => r.player_id).filter((x) => x != null))];
    const people = ids.length ? await bdl.getNbaPlayersByIds(ids).catch(() => ({})) : {};
    const byPlayer = new Map();
    for (const r of rows) { const k = String(r.player_id); if (!byPlayer.has(k)) byPlayer.set(k, []); byPlayer.get(k).push(r); }
    const lines = [head.join(' · ')];
    for (const team of [away, home]) {
      const roster = [...byPlayer.keys()].map((pid) => ({ pid, info: people[pid] || people[Number(pid)] })).filter((p) => p.info?.team === team.full_name);
      const priced = [];
      for (const { pid, info } of roster) {
        const status = injuryById.get(pid) || '';
        if (OUT.test(status)) continue;
        const r = byPlayer.get(pid);
        const markets = Object.fromEntries(Object.entries(NBA_MARKET).map(([k, m]) => {
          const both = mainLineBoth(r, m.prop);
          return [k, both && both.line >= m.floor ? both : null];
        }));
        if (!Object.values(markets).some(Boolean)) continue;
        priced.push({ pid, info, status, markets });
      }
      priced.sort((a, b) => (b.markets.pts?.line ?? 0) - (a.markets.pts?.line ?? 0));
      if (!priced.length) continue;
      lines.push(`${team.full_name}:`);
      for (const { pid, info, status, markets } of priced) {
        const id = `P${++seq}`;
        const shown = Object.entries(markets).filter(([, m]) => m).map(([k, m]) => `${LABEL[k]} ${m.line} over ${fmtOdds(m.over)} / under ${fmtOdds(m.under)}`);
        lines.push(`  [${id}] ${info.name}${info.position ? ` ${info.position}` : ''}${status ? ` · ${status.toLowerCase()}` : ''} · ${shown.join(' · ')}`);
        candidates.set(id, { id, gameId: String(g.id), matchup, commence: g.datetime, player: info.name, playerId: pid, team: team.full_name,
          position: info.position || null, status: status ? status.toLowerCase() : null, ...markets });
        for (const k of Object.keys(NBA_MARKET)) if (markets[k] && !usedSet[k].has(info.name)) eligible[k].push(id);
      }
    }
    blocks.push(lines.join('\n'));
  }

  return { league: 'NBA', games: games.length, season, text: `## TODAY'S NBA BOARD\n\n${blocks.join('\n\n')}`, candidates, eligible, frames, abbrById };
}

/** One category's menu: every eligible player, his line, and a sheet of his own games for the stat it settles on. */
export async function screenNbaCategory({ kind, board, asOf = new Date() }) {
  const m = NBA_MARKET[kind];
  const menu = [];
  for (const id of board.eligible[kind] || []) {
    const c = board.candidates.get(id);
    const mk = c?.[kind];
    if (!mk) continue;
    const [cur, prev] = await Promise.all([
      bdl.getNbaPlayerGameLogs(c.playerId, 100, {}, { season: board.season, asOf }).catch(() => null),
      bdl.getNbaPlayerGameLogs(c.playerId, 100, {}, { season: board.season - 1, asOf }).catch(() => null),
    ]);
    const now = cur?.games || [];
    const games = (now.length >= 3 ? now : (prev?.games || [])).map((g) => ({ ...g, opponent: g.opponent || board.abbrById?.get(String(g.opponentId)) || '?' }));
    const label = now.length >= 3 ? 'this season' : `last season (${board.season - 1}-${String(board.season).slice(2)})`;
    const head = `${c.player} (${c.team})${c.status ? ` · ${c.status}` : ''} · ${LABEL[kind]} ${mk.line} · over ${fmtOdds(mk.over)} / under ${fmtOdds(mk.under)}`;
    const sheet = [head];
    if (now.length && now.length < 3) sheet.push(`    This season so far: ${now.map((g) => `${g.isHome ? 'vs' : '@'} ${board.abbrById?.get(String(g.opponentId)) || '?'} ${one(g[m.stat])}`).join(', ')}`);
    if (games.length) {
      sheet.push(`    ${label[0].toUpperCase()}${label.slice(1)}: ${one(avg(games, m.stat))} ${m.word} a game in ${one(avg(games, 'min'))} minutes over ${games.length} games`);
      sheet.push(`    Last ${Math.min(10, games.length)}, newest first: ${games.slice(0, 10).map((g) => `${g.isHome ? 'vs' : '@'} ${g.opponent} ${one(g[m.stat])}`).join(', ')}`);
    } else sheet.push('    No games on file.');
    menu.push({ id, gameId: c.gameId, line: head, sheet: sheet.join('\n') });
  }
  // The books' order of who matters most: the higher line first.
  menu.sort((a, b) => (board.candidates.get(b.id)?.[kind]?.line ?? 0) - (board.candidates.get(a.id)?.[kind]?.line ?? 0));
  return { kind, menu, screen: {}, note: null };
}

/** The darts row for one NBA throw; every NBA category is over or under the main line. */
export function nbaDartRow(kind, c, { side = 'over' } = {}) {
  const m = c[kind];
  return { league: 'NBA', kind, game_id: c.gameId, matchup: c.matchup, commence_time: c.commence, player: c.player, player_id: c.playerId,
    team: c.team, position: c.position, bet: side, prop: `${NBA_MARKET[kind].prop} ${m.line}`, odds: side === 'under' ? m.under : m.over, book: m.book };
}

export const nbaKey = (kind) => kind;
export { normName };
