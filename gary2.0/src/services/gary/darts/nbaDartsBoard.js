// The NBA dart board (Oct 19 2026, for the opener): every game on the ET date still to tip, its line and total,
// each rotation player's main over/under line in the five NBA dart categories, and a sheet of his own games for
// the stat each settles on (this season only: founder, Oct 23 2026, no last season ever). No formula: the
// menu is the board in the books' order of who matters most (the higher line first). Sources: BDL games, odds,
// player props, the league's injury report and the stored game records.
//
// Oct 27 2026 (founder: NBA darts losing while MLB's and the NFL's hold; points 11-21): the sheet was a season average
// and ten bare numbers, so a 14 in 22 minutes of a blowout read like a slump, and nothing said who was out around him.
// Each player's sheet is now his games dated, started or off the bench, his minutes and the stat, and the regulars his
// team was without that night, from the game records (the official box's counts); tonight's official report for both
// teams sits above. Injuries come from the league's report only, as everywhere else (the stats feed's list was read).
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { latestOfficialReport, gameListing, samePlayerIn } from '../../providers/nbaOfficialInjuryReport.js';
import { teamRecords } from '../../gamebygame/gameRecordStore.js';
import { mainLineBoth, fmtOdds, etClock, etDate, normName } from './dartsCommon.js';
import { nbaSeason } from '../../../utils/dateUtils.js';

const START_BUFFER_MS = 10 * 60 * 1000;
const OUT = /^out/i;
const reportDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
const shortDay = (ymd) => new Date(`${String(ymd).slice(0, 10)}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const LISTED = ['Out', 'Doubtful', 'Questionable'];
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
  // Tonight's report, each team's side of it ('unfiled' until the team files), and each team's games so far.
  const report = await latestOfficialReport({ now: new Date(now) }).catch(() => null);
  const listings = new Map(games.map((g) => [String(g.id), report ? gameListing(report, reportDate(g.datetime), g.home_team.full_name, g.visitor_team.full_name) : null]));
  const recordsOf = new Map();
  for (const g of games) for (const t of [g.home_team, g.visitor_team]) {
    if (!recordsOf.has(String(t.id))) recordsOf.set(String(t.id), await teamRecords('NBA', season, t.id, date, 100).catch(() => null));
  }
  // A team's players this season as the stats feed names them: a first initial pairs a board name with a report name only
  // when no teammate shares it (Oct 29 2026 hunt: Jaylin Williams matched Jalen Williams, Out).
  const feedNames = (teamId) => [...new Set((recordsOf.get(String(teamId)) || []).flatMap((r) => (r.record?.players || [])
    .filter((p) => p.side === (String(r.record.home?.id) === String(teamId) ? 'home' : 'away')).map((p) => p.name)))];
  const statusOf = (gameId, teamName, name, peers) => {
    const side = listings.get(String(gameId))?.[teamName];
    if (!side || side === 'unfiled') return '';
    const hit = samePlayerIn(name, [...side.values()].map((r) => r.name), peers);
    const row = hit ? [...side.values()].find((r) => r.name === hit) : null;
    return row && row.status !== 'Available' ? row.status : '';
  };
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

    const rows = await bdl.getNbaPlayerProps(g.id).catch(() => []);
    const ids = [...new Set(rows.map((r) => r.player_id).filter((x) => x != null))];
    const people = ids.length ? await bdl.getNbaPlayersByIds(ids).catch(() => ({})) : {};
    const byPlayer = new Map();
    for (const r of rows) { const k = String(r.player_id); if (!byPlayer.has(k)) byPlayer.set(k, []); byPlayer.get(k).push(r); }
    const lines = [head.join(' · ')];
    lines.push(`  tonight's injury report${report ? ` (${report.postedAt ? new Date(report.postedAt).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : ''})` : ''}: ${[away, home].map((t) => `${t.abbreviation} ${listedLine(listings.get(String(g.id))?.[t.full_name], report)}`).join(' · ')}`);
    // The report rides in each game's block, the part of the board Gary's ask carries (Oct 29 2026 hunt: it sat only in
    // board.text, which no ask reads).
    frames.push({ gameId: String(g.id), matchup, homeFull: home.full_name, awayFull: away.full_name, commence: g.datetime, block: lines.join('\n') });
    for (const team of [away, home]) {
      const roster = [...byPlayer.keys()].map((pid) => ({ pid, info: people[pid] || people[Number(pid)] })).filter((p) => p.info?.team === team.full_name);
      const priced = [];
      for (const { pid, info } of roster) {
        const status = statusOf(g.id, team.full_name, info.name, [...new Set([...feedNames(team.id), ...roster.map((p) => p.info.name)])]);
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
        candidates.set(id, { id, gameId: String(g.id), matchup, commence: g.datetime, player: info.name, playerId: pid, team: team.full_name, teamId: String(team.id),
          position: info.position || null, status: status ? status.toLowerCase() : null, ...markets });
        for (const k of Object.keys(NBA_MARKET)) if (markets[k] && !usedSet[k].has(info.name)) eligible[k].push(id);
      }
    }
    blocks.push(lines.join('\n'));
  }

  return { league: 'NBA', games: games.length, season, text: `## TODAY'S NBA BOARD\n\n${blocks.join('\n\n')}`, candidates, eligible, frames, abbrById, recordsOf };
}

// A team's side of tonight's report in a few words: who is out, doubtful or questionable.
function listedLine(side, report) {
  if (!report) return 'not on file (the report did not load)';
  if (!side || side === 'unfiled') return 'not filed yet';
  const by = LISTED.map((st) => [st, [...side.values()].filter((r) => r.status === st && !/g league - two-way/i.test(r.reason)).map((r) => r.name)]).filter(([, names]) => names.length);
  return by.length ? by.map(([st, names]) => `${st.toLowerCase()} ${names.join(', ')}`).join('; ') : 'nobody listed';
}

/**
 * One player's games this season from the records, newest first: date, opponent, started or off the bench, minutes,
 * the stat, and the regulars his team was without (out on the report at tip, and played 15+ minutes in another of these
 * games). A game he was on the report or did not play reads so. Null when his team has no records on file.
 */
function gameLines(c, records, stat, abbrById) {
  if (!records) return null;
  const rows = [];
  for (const r of records) {
    const rec = r.record; const side = String(rec.home?.id) === c.teamId ? 'home' : 'away';
    const opp = side === 'home' ? rec.away : rec.home;
    const me = (rec.players || []).find((p) => String(p.id) === String(c.playerId));
    const value = me ? (stat === 'pra' ? me.pts + me.reb + me.ast : me[stat]) : null;
    rows.push({ rec, side, opp: opp?.abbr || abbrById?.get(String(opp?.id)) || opp?.name || '?', me, value, date: r.game_date });
  }
  const big = new Set(rows.flatMap((x) => (x.rec.players || []).filter((p) => p.side === x.side && p.min >= 15).map((p) => p.name)));
  return rows.map((x) => {
    const where = `${shortDay(x.date)} ${x.side === 'home' ? 'vs' : '@'} ${x.opp}`;
    const outRows = (x.rec.report?.[x.side]?.rows || []).filter((r) => r.status === 'Out' && !/g league - two-way/i.test(r.reason || ''));
    const names = (x.rec.players || []).filter((p) => p.side === x.side).map((p) => p.name);
    const mine = outRows.find((r) => samePlayerIn(c.player, [r.name], names));
    if (!x.me || !(x.me.min > 0)) return `${where}: did not play${mine ? ` (out: ${String(mine.reason || '').replace(/^Injury\/Illness - /, '')})` : ''}`;
    const without = outRows.filter((r) => r !== mine && [...big].some((n) => samePlayerIn(n, [r.name], names))).map((r) => r.name);
    return `${where}: ${x.me.starter ? 'started' : 'off the bench'}, ${Math.round(x.me.min)} min, ${one(x.value)}${without.length ? ` · without ${without.join(', ')}` : ''}`;
  });
}

/** One category's menu: every eligible player, his line, and a sheet of his own games for the stat it settles on. */
export async function screenNbaCategory({ kind, board, asOf = new Date() }) {
  const m = NBA_MARKET[kind];
  const menu = [];
  for (const id of board.eligible[kind] || []) {
    const c = board.candidates.get(id);
    const mk = c?.[kind];
    if (!mk) continue;
    const head = `${c.player} (${c.team})${c.status ? ` · ${c.status}` : ''} · ${LABEL[kind]} ${mk.line} · over ${fmtOdds(mk.over)} / under ${fmtOdds(mk.under)}`;
    const sheet = [head];
    const lines = gameLines(c, board.recordsOf?.get(c.teamId), m.stat, board.abbrById);
    const played = (board.recordsOf?.get(c.teamId) || []).map((r) => (r.record.players || []).find((p) => String(p.id) === String(c.playerId))).filter((p) => p?.min > 0);
    if (!lines) sheet.push("    This season's games are not on file (the game records did not load).");
    else if (!lines.length) sheet.push('    No games yet this season.');
    else {
      if (played.length >= 3) sheet.push(`    This season: ${one(avg(played.map((p) => ({ ...p, pra: p.pts + p.reb + p.ast })), m.stat))} ${m.word} a game in ${one(avg(played, 'min'))} minutes over ${played.length} games`);
      sheet.push(`    His team's games, newest first:\n      ${lines.slice(0, 10).join('\n      ')}`);
    }
    // The one-line board Gary picks his sheets from carries his last three games, as MLB's and the NFL's lines carry
    // theirs (Oct 27 2026 darts bug audit: the NBA line was a name and a price, so a full slate's first pick was made
    // from names alone).
    const recent = played.slice(0, 3).map((p) => one(m.stat === 'pra' ? p.pts + p.reb + p.ast : p[m.stat]));
    const line = `${head} · ${recent.length ? `last ${recent.length === 1 ? 'game' : `${recent.length} games`}, newest first: ${recent.join(', ')}` : 'no games yet this season'}`;
    menu.push({ id, gameId: c.gameId, line, sheet: sheet.join('\n') });
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
