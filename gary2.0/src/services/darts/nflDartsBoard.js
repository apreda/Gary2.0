// The NFL dart board: every game on the ET date still to kick off, its line,
// each priced player with his injury tag, this season's game count and totals
// beside last season's (a one or two game rate is a count, never who a player
// is), and the day's prices for the seven NFL dart categories. Sources: BDL
// games, odds, player props and injuries; nflverse weekly lines.
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { RELEASE_BASE, TEAM_NAMES, fetchCsv } from '../nflStreaksService.js';
import { overPrice, mainLineBoth, fmtOdds, etClock, etDate, normName, clubShort } from './dartsCommon.js';

const START_BUFFER_MS = 10 * 60 * 1000;
const OUT = /^(out|ir|injured reserve|pup|suspended|nfi|inactive)/i;
const ABBR_BY_NAME = Object.fromEntries(Object.entries(TEAM_NAMES).map(([abbr, name]) => [name, abbr]));
const POS = { Quarterback: 'QB', 'Running Back': 'RB', 'Wide Receiver': 'WR', 'Tight End': 'TE', Fullback: 'FB' };
const nextUtcDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const n = (v) => Number(v || 0);

// One CSV read per season per process: the totals and the game arrays share it.
const csvMemo = new Map();
async function weeklyRows(season) {
  if (!csvMemo.has(season)) csvMemo.set(season, fetchCsv(`${RELEASE_BASE}/stats_player/stats_player_week_${season}.csv`).catch(() => []));
  return csvMemo.get(season);
}

/** normalized name → the season's regular-season games, newest first (the shape the sheets and the volume model read). */
export async function nflSeasonGames(season) {
  const rows = await weeklyRows(season);
  const byName = new Map();
  for (const r of rows) {
    if (r.season_type !== 'REG') continue;
    const key = normName(r.player_display_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push({ week: n(r.week), opp: r.opponent_team, team: r.team,
      pass_comp: n(r.completions), pass_att: n(r.attempts), pass_yds: n(r.passing_yards), pass_tds: n(r.passing_tds), ints: n(r.passing_interceptions),
      rush_att: n(r.carries), rush_yds: n(r.rushing_yards), rush_tds: n(r.rushing_tds),
      receptions: n(r.receptions), targets: n(r.targets), rec_yds: n(r.receiving_yards), rec_tds: n(r.receiving_tds) });
  }
  for (const games of byName.values()) games.sort((a, b) => b.week - a.week);
  return byName;
}

/** name|team → { games, targets, rec, recYds, recTd, carries, rushYds, rushTd, passTd, int } per season. */
async function seasonLines(season) {
  const rows = await weeklyRows(season);
  const byKey = new Map();
  const byName = new Map();
  for (const r of rows) {
    if (r.season_type !== 'REG') continue;
    const key = `${normName(r.player_display_name)}|${r.team}`;
    const cur = byKey.get(key) || { games: 0, targets: 0, rec: 0, recYds: 0, recTd: 0, carries: 0, rushYds: 0, rushTd: 0, passTd: 0, int: 0, attempts: 0 };
    cur.games += 1;
    cur.targets += n(r.targets); cur.rec += n(r.receptions); cur.recYds += n(r.receiving_yards); cur.recTd += n(r.receiving_tds);
    cur.carries += n(r.carries); cur.rushYds += n(r.rushing_yards); cur.rushTd += n(r.rushing_tds);
    cur.passTd += n(r.passing_tds); cur.int += n(r.passing_interceptions); cur.attempts += n(r.attempts);
    byKey.set(key, cur);
    const nk = normName(r.player_display_name);
    if (!byName.has(nk) || byName.get(nk).games < cur.games) byName.set(nk, cur);
  }
  return { byKey, byName };
}

function statText(pos, s) {
  if (!s) return null;
  const g = `${s.games} game${s.games === 1 ? '' : 's'}`;
  if (pos === 'QB') return `${g}, ${s.passTd} pass TD, ${s.int} INT, ${s.rushYds} rush yds, ${s.rushTd} rush TD`;
  if (pos === 'RB' || pos === 'FB') return `${g}, ${s.carries} carries, ${s.rushYds} rush yds, ${s.rushTd} rush TD, ${s.targets} targets, ${s.recYds} rec yds, ${s.recTd} rec TD`;
  return `${g}, ${s.targets} target${s.targets === 1 ? '' : 's'}, ${s.rec} catch${s.rec === 1 ? '' : 'es'}, ${s.recYds} rec yds, ${s.recTd} TD${s.rushTd ? `, ${s.rushTd} rush TD` : ''}`;
}

export async function buildNflDartsBoard({ date, now = Date.now(), used = {} }) {
  const season = Number(date.slice(0, 4));
  const listed = [...await bdl.getNflGamesForDate(date), ...await bdl.getNflGamesForDate(nextUtcDay(date))];
  const seen = new Set();
  const games = listed
    .filter((g) => g?.id != null && !seen.has(g.id) && seen.add(g.id))
    .filter((g) => etDate(Date.parse(g.date)) === date && Date.parse(g.date) > now + START_BUFFER_MS)
    .filter((g) => !/final|progress|half|quarter|overtime/i.test(String(g.status || '')))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!games.length) return { league: 'NFL', games: 0, text: '', candidates: new Map(), eligible: {} };

  const [odds, injuries, thisYear, lastYear] = await Promise.all([
    bdl.getOddsV2({ game_ids: games.map((g) => g.id) }, 'nfl').catch(() => []),
    bdl.getNflPlayerInjuries().catch(() => []),
    seasonLines(season),
    seasonLines(season - 1),
  ]);
  const injuryById = new Map(injuries.filter((i) => i?.player?.id != null).map((i) => [String(i.player.id), String(i.status || '')]));

  const candidates = new Map();
  const eligible = { td: [], qbtd: [], recyds: [], rushyds: [], passtd: [], int: [] };
  const frames = [];
  const usedSet = Object.fromEntries(Object.keys(eligible).map((k) => [k, new Set((used[k] || []).map(String))]));
  let seq = 0;
  const blocks = [];

  for (const [gi, g] of games.entries()) {
    const away = g.visitor_team?.full_name;
    const home = g.home_team?.full_name;
    const matchup = `${clubShort(away)} @ ${clubShort(home)}`;
    const lines = [];
    const line = (odds || []).filter((o) => o.game_id === g.id).sort((a, b) => (a.vendor === 'draftkings' ? -1 : 0) - (b.vendor === 'draftkings' ? -1 : 0))[0];
    const head = [`GAME ${gi + 1} · ${matchup} · ${new Date(g.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' })} ${etClock(g.date)}`];
    if (line?.spread_home_value != null) {
      const sp = Number(line.spread_home_value);
      head.push(sp < 0 ? `${clubShort(home)} ${sp}` : sp > 0 ? `${clubShort(away)} ${-sp}` : 'pick em');
    }
    if (line?.total_value != null) head.push(`total ${line.total_value}`);
    lines.push(head.join(' · '));
    const gameLine = head.slice(1).join(' · ') || null;
    frames.push({ gameId: String(g.id), matchup, homeFull: home, awayFull: away, spreadHome: line?.spread_home_value != null ? Number(line.spread_home_value) : null, total: line?.total_value != null ? Number(line.total_value) : null, commence: g.date });

    const rows = await bdl.getNflPlayerProps(g.id);
    const ids = [...new Set(rows.map((r) => r.player_id).filter((x) => x != null))];
    const players = ids.length ? await bdl.getNflPlayersByIds(ids) : {};
    const byPlayer = new Map();
    for (const r of rows) {
      const k = String(r.player_id);
      if (!byPlayer.has(k)) byPlayer.set(k, []);
      byPlayer.get(k).push(r);
    }

    for (const teamName of [away, home]) {
      const abbr = ABBR_BY_NAME[teamName] || null;
      const roster = [...byPlayer.keys()]
        .map((pid) => ({ pid, info: players[pid] || players[Number(pid)] }))
        .filter((p) => p.info?.team === teamName && POS[p.info.position]);
      if (!roster.length) continue;
      lines.push(`${clubShort(teamName)}:`);
      const order = { QB: 0, RB: 1, WR: 2, TE: 3, FB: 4 };
      roster.sort((a, b) => order[POS[a.info.position]] - order[POS[b.info.position]]);
      for (const { pid, info } of roster) {
        const pos = POS[info.position];
        const status = injuryById.get(pid) || '';
        if (OUT.test(status)) continue;
        const r = byPlayer.get(pid);
        const td = overPrice(r, { propType: 'anytime_td', line: 0.5 });
        // The yardage and quarterback lines are taken either way (Sep 24 2026):
        // the main line with both prices.
        const rec = pos === 'QB' ? null : mainLineBoth(r, 'receiving_yards');
        const rush = pos === 'RB' || pos === 'FB' ? mainLineBoth(r, 'rushing_yards') : null;
        const pass = pos === 'QB' ? mainLineBoth(r, 'passing_tds') : null;
        const int = pos === 'QB' ? mainLineBoth(r, 'interceptions') : null;
        const prices = [];
        // Tight ends score in ANYTIME TD now that their own category is gone (Sep 23 2026).
        const tdKind = pos === 'QB' ? 'qbtd' : 'td';
        const both = (label, m) => `${label} ${m.line} over ${fmtOdds(m.over)} / under ${fmtOdds(m.under)}`;
        if (td) prices.push(`${pos === 'QB' ? 'QB RUSHING TD' : 'ANYTIME TD'} ${fmtOdds(td.odds)}`);
        if (rec) prices.push(both('RECEIVING YARDS', rec));
        if (rush) prices.push(both('RUSHING YARDS', rush));
        if (pass) prices.push(both('PASSING TDS', pass));
        if (int) prices.push(both('INTERCEPTIONS', int));
        if (!prices.length) continue;
        const nk = normName(info.name);
        const now26 = abbr ? thisYear.byKey.get(`${nk}|${abbr}`) : null;
        const cur = now26 || thisYear.byName.get(nk);
        const prev = lastYear.byName.get(nk);
        const facts = [`${info.name} ${pos}`];
        if (status) facts.push(status.toLowerCase());
        facts.push(cur ? `${season}: ${statText(pos, cur)}` : `${season}: no games yet`);
        if (prev) facts.push(`${season - 1}: ${statText(pos, prev)}`);
        const id = `P${++seq}`;
        lines.push(`  [${id}] ${facts.join(' · ')} · ${prices.join(' · ')}`);
        const matchKey = info.name;
        candidates.set(id, { id, gameId: String(g.id), matchup, commence: g.date, player: info.name, playerId: pid, team: teamName, position: pos, td, rec, rush, pass, int, tdKind,
          status: status ? status.toLowerCase() : null, gameLine });
        if (td && !usedSet[tdKind].has(matchKey)) eligible[tdKind].push(id);
        if (rec && !usedSet.recyds.has(matchKey)) eligible.recyds.push(id);
        if (rush && !usedSet.rushyds.has(matchKey)) eligible.rushyds.push(id);
        if (pass && !usedSet.passtd.has(matchKey)) eligible.passtd.push(id);
        if (int && !usedSet.int.has(matchKey)) eligible.int.push(id);
      }
    }
    blocks.push(lines.join('\n'));
  }

  return {
    league: 'NFL',
    games: games.length,
    season,
    text: `## TODAY'S NFL BOARD\n\n${blocks.join('\n\n')}`,
    candidates,
    eligible,
    frames,
  };
}

/** The market a sided NFL dart reads on its candidate. */
export const SIDED_MARKET = {
  recyds: { key: 'rec', prop: 'receiving_yards' },
  rushyds: { key: 'rush', prop: 'rushing_yards' },
  passtd: { key: 'pass', prop: 'passing_tds' },
  int: { key: 'int', prop: 'interceptions' },
};

/** The darts row for one validated NFL throw; `side` is over or under on a sided category. */
export function nflDartRow(kind, c, { side = 'over' } = {}) {
  const base = { league: 'NFL', kind, game_id: c.gameId, matchup: c.matchup, commence_time: c.commence,
    player: c.player, player_id: c.playerId, team: c.team, position: c.position, bet: 'over' };
  if (kind === 'td' || kind === 'qbtd') return { ...base, prop: 'anytime_td 0.5', odds: c.td.odds, book: c.td.book };
  const market = SIDED_MARKET[kind];
  const m = c[market.key];
  return { ...base, bet: side, prop: `${market.prop} ${m.line}`, odds: side === 'under' ? m.under : m.over, book: m.book };
}
