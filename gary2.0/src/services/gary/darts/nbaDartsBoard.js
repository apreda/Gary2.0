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
import { teamRecords, seasonSummaries } from '../../gamebygame/gameRecordStore.js';
import { summariesByTeam, wonLost } from '../../sports/nba/nbaGameRecordText.js';
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
  // A feed that failed says so under each game (Oct 29 2026 hunt, round 7): a failed odds or props read looked the same
  // as no line and no prices, and the game's spread or its players left the board without a word.
  let oddsFailed = false;
  const odds = await bdl.getOddsV2?.({ game_ids: games.map((g) => g.id) }, 'nba').catch(() => { oddsFailed = true; return []; }) || [];

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
    if (oddsFailed) head.push('spread and total not on file (the odds feed did not load)');

    let pricesFailed = false;
    const rows = await bdl.getNbaPlayerProps(g.id, { throwOnError: true }).catch(() => { pricesFailed = true; return []; });
    const ids = [...new Set(rows.map((r) => r.player_id).filter((x) => x != null))];
    const people = ids.length ? await bdl.getNbaPlayersByIds(ids, { throwOnError: true }).catch(() => { pricesFailed = true; return {}; }) : {};
    const byPlayer = new Map();
    for (const r of rows) { const k = String(r.player_id); if (!byPlayer.has(k)) byPlayer.set(k, []); byPlayer.get(k).push(r); }
    const lines = [head.join(' · ')];
    if (pricesFailed) lines.push("  players' prices not on file (the props feed did not load)");
    lines.push(`  tonight's injury report${report ? ` (${report.postedAt ? new Date(report.postedAt).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : ''})` : ''}: ${[away, home].map((t) => `${t.abbreviation} ${listedLine(listings.get(String(g.id))?.[t.full_name], report)}`).join(' · ')}`);
    // Each team's last five games with their scores, so a sheet is read against tonight's opponent too (round 12: NBA
    // darts carried nothing about the other team).
    for (const t of [away, home]) {
      const recs = recordsOf.get(String(t.id));
      if (!recs) { lines.push(`  ${t.abbreviation} games: not on file (the game records did not load)`); continue; }
      const last = recs.slice(0, 5).map((r) => { const side = String(r.record.home?.id) === String(t.id) ? 'home' : 'away', other = side === 'home' ? 'away' : 'home';
        const a = r.record.final?.[side], b = r.record.final?.[other], ot = (r.record.periods?.length || 0) > 4;
        return `${a > b ? 'W' : 'L'} ${a}-${b}${ot ? ' (OT)' : ''} ${side === 'home' ? 'vs' : '@'} ${r.record[other]?.abbr || r.record[other]?.name || '?'}`; });
      lines.push(`  ${t.abbreviation} last ${last.length} games, newest first: ${last.join(', ') || 'none yet'}`);
    }
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

  // Each past opponent's record now, for the sheets' game rows (round 9: darts carry no read, and a number against a 1-6
  // team read the same as one against a 6-1 team).
  const summaries = await seasonSummaries('NBA', season, date).catch(() => null);
  const byTeam = summaries ? summariesByTeam(summaries) : null;
  const oppRecord = byTeam ? (teamId) => wonLost(byTeam.get(String(teamId)) || [], teamId) : null;
  return { league: 'NBA', games: games.length, season, text: `## TODAY'S NBA BOARD\n\n${blocks.join('\n\n')}`, candidates, eligible, frames, abbrById, recordsOf, oppRecord };
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
// The props sheets read the same rows (Oct 29 2026, founder: no season averages; "give Gary the numbers behind the
// average"): `stat` is one stat or a list of them ('min' leaves the minutes in the row; names as the sheets print them).
const STAT_WORD = { pts: 'pts', reb: 'reb', ast: 'ast', fg3m: '3PM', pra: 'PRA' };
export function nbaGameRows(c, records, stats, abbrById, oppRecord = null) { return gameLines(c, records, stats, abbrById, oppRecord); }
function gameLines(c, records, stat, abbrById, oppRecord = null) {
  if (!records) return null;
  const rows = [];
  for (const r of records) {
    const rec = r.record; const side = String(rec.home?.id) === c.teamId ? 'home' : 'away';
    const opp = side === 'home' ? rec.away : rec.home;
    const me = (rec.players || []).find((p) => String(p.id) === String(c.playerId));
    const valueOf = (f) => (me ? (f === 'pra' ? me.pts + me.reb + me.ast : me[f]) : null);
    const value = Array.isArray(stat) ? stat.filter((f) => f !== 'min').map((f) => `${one(valueOf(f))} ${STAT_WORD[f] || f}`).join(', ') : valueOf(stat);
    rows.push({ rec, side, opp: opp?.abbr || abbrById?.get(String(opp?.id)) || opp?.name || '?', oppId: opp?.id, me, value, date: r.game_date });
  }
  const big = new Set(rows.flatMap((x) => (x.rec.players || []).filter((p) => p.side === x.side && p.min >= 15).map((p) => p.name)));
  return rows.map((x) => {
    // The team's result, with overtime (Oct 29 2026 hunt, round 7: Achiuwa's 14 minutes read without the 130-103 loss at
    // San Antonio, Murphy's 37 without the overtime at Denver).
    const us = x.rec.final?.[x.side], them = x.rec.final?.[x.side === 'home' ? 'away' : 'home'];
    const ot = (x.rec.periods?.length || 0) - 4;
    const score = us != null && them != null ? ` (${us > them ? 'W' : 'L'} ${us}-${them}${ot > 0 ? `, ${ot === 1 ? 'OT' : `${ot} OT`}` : ''})` : '';
    const where = `${shortDay(x.date)} ${x.side === 'home' ? 'vs' : '@'} ${x.opp}${oppRecord && x.oppId != null ? ` (${oppRecord(x.oppId)} now)` : ''}${score}`;
    const outRows = (x.rec.report?.[x.side]?.rows || []).filter((r) => r.status === 'Out' && !/g league - two-way/i.test(r.reason || ''));
    const names = (x.rec.players || []).filter((p) => p.side === x.side).map((p) => p.name);
    const mine = outRows.find((r) => samePlayerIn(c.player, [r.name], names));
    // Why he did not play, from the report at tip: out and why, listed with another status, or not on it (round 9: a
    // coach's decision read the same as an unlisted absence).
    const listedAs = !mine ? (x.rec.report?.[x.side]?.rows || []).find((r) => samePlayerIn(c.player, [r.name], names)) : null;
    const why = mine ? `out: ${String(mine.reason || '').replace(/^Injury\/Illness - /, '')}`
      : listedAs ? `listed ${String(listedAs.status || '').toLowerCase()}` : !x.rec.report?.[x.side] || x.rec.report[x.side].notOnFile ? 'the injury report not on file' : 'not on the injury report';
    if (!x.me || !(x.me.min > 0)) return `${where}: did not play (${why})`;
    // Fouls that cut his minutes (round 9: Giannis's 25 minutes on Oct 24 were six fouls).
    const fouls = x.me.pf >= 6 ? ', fouled out' : x.me.pf === 5 ? ', 5 fouls' : '';
    const without = outRows.filter((r) => r !== mine && [...big].some((n) => samePlayerIn(n, [r.name], names))).map((r) => r.name);
    // A teammate who started and played under 15 minutes (round 12: Jalen Duren's 10-minute exit read as a full game around
    // him), the rule the live read uses.
    const shortStarters = (x.rec.players || []).filter((p) => p.side === x.side && p.starter && p.min > 0 && p.min < 15 && String(p.id) !== String(c.playerId)).map((p) => `${p.name} started, played ${Math.round(p.min)} min`);
    // The attempts behind the stat (round 11: "3" threes read the same on 3 of 10 as on 3 of 4).
    const fields = Array.isArray(stat) ? stat : [stat];
    const m = x.me, shots = m.fga == null ? null
      : fields.some((f) => f === 'pts' || f === 'pra') ? `${m.fgm}-${m.fga} FG, ${m.fg3m}-${m.fg3a} 3PT, ${m.ftm}-${m.fta} FT`
        : fields.includes('fg3m') ? `${m.fg3m}-${m.fg3a} 3PT` : null;
    return `${where}: ${x.me.starter ? 'started' : 'off the bench'}, ${Math.round(x.me.min)} min${fouls}, ${typeof x.value === 'string' ? x.value : one(x.value)}${shots ? ` (${shots})` : ''}${without.length ? ` · without ${without.join(', ')}` : ''}${shortStarters.length ? ` · ${shortStarters.join(', ')}` : ''}`;
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
    const lines = gameLines(c, board.recordsOf?.get(c.teamId), m.stat, board.abbrById, board.oppRecord);
    // His team's last three games, a game he missed said so (round 9: Naji Marshall's "last 3 games" reached back past the
    // two he had just missed).
    const teamRecs = board.recordsOf?.get(c.teamId);
    const lastThree = (teamRecs || []).slice(0, 3).map((r) => (r.record.players || []).find((p) => String(p.id) === String(c.playerId)));
    if (!lines) sheet.push("    This season's games are not on file (the game records did not load).");
    else if (!lines.length) sheet.push('    No games yet this season.');
    else {
      sheet.push(`    His team's games, newest first:\n      ${lines.slice(0, 10).join('\n      ')}`);
    }
    // The one-line board Gary picks his sheets from carries his last three games, as MLB's and the NFL's lines carry
    // theirs (Oct 27 2026 darts bug audit: the NBA line was a name and a price, so a full slate's first pick was made
    // from names alone).
    const recent = lastThree.map((p) => (p?.min > 0 ? one(m.stat === 'pra' ? p.pts + p.reb + p.ast : p[m.stat]) : 'did not play'));
    // A failed load is not a team with no games (round 12).
    const line = `${head} · ${!teamRecs ? "this season's games not on file (the game records did not load)" : recent.length ? `his team's last ${recent.length === 1 ? 'game' : `${recent.length} games`}, newest first: ${recent.join(', ')}` : 'no games yet this season'}`;
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
