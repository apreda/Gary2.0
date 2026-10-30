// The NFL dart board: every game on the ET date still to kick off, its line,
// each priced player with his injury tag, this season's game count and totals
// (this season only: founder, Oct 23 2026, no last season ever; a one or two
// game rate is a count, never who a player is), and the day's prices for the
// seven NFL dart categories. Sources: BDL
// games, odds, player props and injuries; nflverse weekly lines.
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { nflSeason } from '../../../utils/dateUtils.js';
import { TEAM_NAMES } from '../../sports/nfl/nflStreaksService.js';
import { weeklyRows as officialWeeklyRows, withOfficialReport, snapCounts, aliasByRoster } from '../../sports/nfl/nflPlayerContext.js';
import { getPracticeReport, nflverseCode, loadNflverseFile } from '../../providers/nflverseService.js';
import { getNflSchedule, scheduleRowFor } from '../../sports/nfl/nflSchedule.js';
import { overPrice, mainLineBoth, fmtOdds, etClock, etDate, normName, clubShort, isNflSkillRow } from './dartsCommon.js';

const START_BUFFER_MS = 10 * 60 * 1000;
const OUT = /^(out|ir|injured reserve|pup|suspended|nfi|inactive|reserve)/i;  // reserve: BDL's Reserve-Sus (round 2 audit)
const ABBR_BY_NAME = Object.fromEntries(Object.entries(TEAM_NAMES).map(([abbr, name]) => [name, abbr]));
const POS = { Quarterback: 'QB', 'Running Back': 'RB', 'Wide Receiver': 'WR', 'Tight End': 'TE', Fullback: 'FB' };
const nextUtcDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const n = (v) => Number(v || 0);

// The season's weekly rows in the official box's counts, the same rows the sheet's game log reads (Oct 27 2026 darts bug
// audit: the totals and the volume model read nflverse's own counts beside a game log in the official ones).
// Null when the weekly stats did not load: the sheets say so rather than "no games yet" (Oct 29 2026 hunt, round 7).
const weeklyRows = async (season) => officialWeeklyRows(season);

/** normalized name → the season's regular-season games, newest first (the shape the sheets and the volume model read). */
export async function nflSeasonGames(season) {
  const rows = await weeklyRows(season);
  const byName = new Map();
  if (!rows) byName.missing = true;
  for (const r of rows || []) {
    if (r.season_type !== 'REG' || !isNflSkillRow(r)) continue;
    const key = normName(r.player_display_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push({ week: n(r.week), opp: r.opponent_team, team: r.team,
      pass_comp: n(r.completions), pass_att: n(r.attempts), pass_yds: n(r.passing_yards), pass_tds: n(r.passing_tds), ints: n(r.passing_interceptions),
      rush_att: n(r.carries), rush_yds: n(r.rushing_yards), rush_tds: n(r.rushing_tds),
      receptions: n(r.receptions), targets: n(r.targets), rec_yds: n(r.receiving_yards), rec_tds: n(r.receiving_tds),
      // Return and fumble-recovery TDs settle an anytime TD too (round 11: Myles Price's punt-return TD was invisible).
      ret_tds: n(r.special_teams_tds) + n(r.fumble_recovery_tds) });
  }
  for (const games of byName.values()) games.sort((a, b) => b.week - a.week);
  return byName;
}

/** name|team → { games, targets, rec, recYds, recTd, carries, rushYds, rushTd, passTd, int } per season. */
async function seasonLines(season) {
  const rows = await weeklyRows(season);
  const byKey = new Map();
  const byName = new Map();
  for (const r of rows || []) {
    if (r.season_type !== 'REG' || !isNflSkillRow(r)) continue;
    const key = `${normName(r.player_display_name)}|${r.team}`;
    const cur = byKey.get(key) || { games: 0, targets: 0, rec: 0, recYds: 0, recTd: 0, carries: 0, rushYds: 0, rushTd: 0, passTd: 0, int: 0, attempts: 0 };
    cur.targets += n(r.targets); cur.rec += n(r.receptions); cur.recYds += n(r.receiving_yards); cur.recTd += n(r.receiving_tds);
    cur.carries += n(r.carries); cur.rushYds += n(r.rushing_yards); cur.rushTd += n(r.rushing_tds);
    cur.passTd += n(r.passing_tds); cur.int += n(r.passing_interceptions); cur.attempts += n(r.attempts);
    cur.weeks = cur.weeks || new Set(); cur.weeks.add(n(r.week)); cur.display = cur.display || r.player_display_name;
    cur.rows = cur.rows || [];
    cur.rows.push({ week: n(r.week), opp: r.opponent_team, targets: n(r.targets), rec: n(r.receptions), recYds: n(r.receiving_yards), recTd: n(r.receiving_tds),
      carries: n(r.carries), rushYds: n(r.rushing_yards), rushTd: n(r.rushing_tds), passTd: n(r.passing_tds), int: n(r.passing_interceptions) });
    byKey.set(key, cur);
  }
  // A game he played without a stat row counts as a game (withSnapGames; Oct 29 2026 hunt: Josh Whyle, in all seven of
  // the Packers' games, read "no games yet").
  const [snapFile, roster] = await Promise.all([snapCounts(season).catch(() => null), loadNflverseFile('roster_weekly', season).catch(() => null)]);
  const snaps = snapFile ? aliasByRoster(snapFile, rows, roster && !roster.unavailable ? roster.rows : null) : null;
  for (const [nk, list] of snaps || []) {
    // Special-teams-only weeks apart (round 11).
    for (const [w, st] of list?.stOnly || []) {
      for (const [key, cur] of byKey) if (key.startsWith(`${nk}|`)) (cur.stWeeks ||= new Map()).set(w, st);
    }
    for (const [w, def] of list?.defOnly || []) {
      for (const [key, cur] of byKey) if (key.startsWith(`${nk}|`)) (cur.defWeeks ||= new Map()).set(w, def);
    }
    for (const s of list || []) {
      if (!(s.snaps > 0)) continue;
      const key = `${nk}|${s.team}`;
      const cur = byKey.get(key) || { games: 0, targets: 0, rec: 0, recYds: 0, recTd: 0, carries: 0, rushYds: 0, rushTd: 0, passTd: 0, int: 0, attempts: 0, weeks: new Set() };
      cur.weeks.add(s.week); byKey.set(key, cur);
    }
  }
  for (const [key, cur] of byKey) {
    cur.games = cur.weeks.size;
    const nk = key.split('|')[0];
    if (!byName.has(nk) || byName.get(nk).games < cur.games) byName.set(nk, cur);
  }
  return { byKey, byName, missing: !rows };
}

// His last three games as games, newest first (Oct 29 2026, founder: no season totals; it read "7 games, 45 targets, 31
// catches, 512 rec yds, 4 TD"). A game he played without a stat row is a game with nothing in it.
// The team's last three games when its schedule is on file, a game he missed said so (round 9: Lamar Jackson's line read
// "last 3: Wk 4, 3, 2", his three missed games since unsaid). `elsewhere(w)` names another club he played for that week.
function statText(pos, s, teamWeeks = null, elsewhere = () => null) {
  if (!s) return null;
  const rows = new Map((s.rows || []).map((r) => [r.week, r]));
  const weeks = teamWeeks?.length ? teamWeeks.slice(0, 3) : [...(s.weeks || [])].sort((a, b) => b - a).slice(0, 3);
  const last = weeks.map((w) => {
    const r = rows.get(w);
    const st = s.stWeeks?.get(w), def = s.defWeeks?.get(w);
    if (def && !r) return `Wk ${w} no offensive snaps (${def} on defense)`;
    if (st && (!r || !(r.targets || r.carries || r.rec || r.passTd || r.int || r.recYds || r.rushYds))) return `Wk ${w} special teams only (${st} snaps)`;
    if (!r && !s.weeks?.has(w)) { const other = elsewhere(w); return `Wk ${w} ${other ? `with ${other}` : 'did not play'}`; }
    if (!r) return `Wk ${w} no touches`;
    if (pos === 'QB') return `Wk ${w} ${r.passTd} pass TD, ${r.int} INT, ${r.rushYds} rush yds, ${r.rushTd || 0} rush TD`;
    if (pos === 'RB' || pos === 'FB') return `Wk ${w} ${r.carries} carries ${r.rushYds} yds${r.rushTd ? ` ${r.rushTd} TD` : ''}, ${r.targets} tgt ${r.recYds} yds${r.recTd ? ` ${r.recTd} TD` : ''}`;
    return `Wk ${w} ${r.targets} tgt, ${r.rec} catch${r.rec === 1 ? '' : 'es'} ${r.recYds} yds${r.recTd ? ` ${r.recTd} TD` : ''}${r.rushTd ? `, ${r.rushTd} rush TD` : ''}`;
  });
  return `${s.games} game${s.games === 1 ? '' : 's'}; ${teamWeeks?.length ? `his team's last ${last.length}` : `last ${last.length}`}, newest first: ${last.join('; ')}`;
}

export async function buildNflDartsBoard({ date, now = Date.now(), used = {}, supabase = null }) {
  // The season the date falls in, not its calendar year (Oct 29 2026 hunt: Week 18 and the playoffs are in January).
  const season = nflSeason(new Date(`${date}T17:00:00Z`));
  const listed = [...await bdl.getNflGamesForDate(date), ...await bdl.getNflGamesForDate(nextUtcDay(date))];
  const seen = new Set();
  const games = listed
    .filter((g) => g?.id != null && !seen.has(g.id) && seen.add(g.id))
    .filter((g) => etDate(Date.parse(g.date)) === date && Date.parse(g.date) > now + START_BUFFER_MS)
    .filter((g) => !/final|progress|half|quarter|overtime/i.test(String(g.status || '')))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (!games.length) return { league: 'NFL', games: 0, text: '', candidates: new Map(), eligible: {} };

  const [odds, feed, thisYear, schedule] = await Promise.all([
    bdl.getOddsV2({ game_ids: games.map((g) => g.id) }, 'nfl').catch(() => null),
    bdl.getNflPlayerInjuries().catch(() => []),
    seasonLines(season),
    getNflSchedule().catch(() => null),
  ]);
  // Each player's status and the Out filter from the league's report for the game's week, over the injury feed (Oct 29
  // 2026 hunt: only the sheets' report line had it), as the sheets read it.
  const reports = schedule && !schedule.unavailable ? await Promise.all(games.flatMap((g) => {
    const week = Number(scheduleRowFor(schedule, season, nflverseCode(g.home_team.full_name), nflverseCode(g.visitor_team.full_name), g.date)?.week) || null;
    return week ? [g.home_team.full_name, g.visitor_team.full_name].map((team) => getPracticeReport(team, season, week)
      .then((report) => ({ team, report: report?.unavailable ? null : report })).catch(() => ({ team, report: null }))) : [];
  })) : [];
  const injuries = withOfficialReport(feed, reports);
  const injuryById = new Map(injuries.filter((i) => i?.player?.id != null).map((i) => [String(i.player.id), String(i.status || '')]));
  const teamOfRow = (i) => i?.player?.team?.full_name || i?.team?.full_name || '';
  const injuryByName = new Map(injuries.filter((i) => i?.player?.id == null).map((i) => [`${teamOfRow(i)}|${normName(`${i.player?.first_name || ''} ${i.player?.last_name || ''}`)}`, String(i.status || '')]));
  // The morning board's quarterback write-up no longer rides the frames (round 10: season totals, per-attempt averages,
  // opinions and a status from the morning). Each sheet carries the games themselves.

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
    // A failed feed said, never a game with no line (round 10; the NBA board has said so since round 7).
    if (!line) head.push(odds === null ? 'spread and total not on file (the odds feed did not load)' : 'spread and total not on file');
    lines.push(head.join(' · '));
    const gameLine = head.slice(1).join(' · ') || null;
    frames.push({ gameId: String(g.id), matchup, homeFull: home, awayFull: away, homeAbbr: ABBR_BY_NAME[home] || null, awayAbbr: ABBR_BY_NAME[away] || null,
      spreadHome: line?.spread_home_value != null ? Number(line.spread_home_value) : null, total: line?.total_value != null ? Number(line.total_value) : null, commence: g.date,
      extra: [] });

    let rows = [], players = {};
    try {
      rows = await bdl.getNflPlayerProps(g.id, { throwOnError: true });
      const ids = [...new Set(rows.map((r) => r.player_id).filter((x) => x != null))];
      players = ids.length ? await bdl.getNflPlayersByIds(ids, { throwOnError: true }) : {};
    } catch (e) {
      frames.at(-1).extra.push(`players' prices not on file (the props feed did not load: ${e?.message || e})`);
      lines.push(`  players' prices not on file (the props feed did not load)`);
    }
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
        const status = injuryById.get(pid) || injuryByName.get(`${teamName}|${normName(info.name)}`) || '';
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
        // The stats' spelling of him: his own name, else the one player on his team with his last name (round 10: BDL's
        // Joshua Palmer, Matt Hibner and Hollywood Brown are nflverse's Josh Palmer, Matthew Hibner and Marquise Brown,
        // and read "no games yet").
        const lastOf = (x) => normName(String(x || '').replace(/\s+(?:jr|sr|ii|iii|iv|v)\.?$/i, '').trim().split(/\s+/).pop());
        const same = abbr && !thisYear.byKey.has(`${normName(info.name)}|${abbr}`)
          ? [...thisYear.byKey].filter(([k, v]) => k.endsWith(`|${abbr}`) && v.display && lastOf(v.display) === lastOf(info.name)) : [];
        const nk = same.length === 1 ? same[0][0].split('|')[0] : normName(info.name);
        const now26 = abbr ? thisYear.byKey.get(`${nk}|${abbr}`) : null;
        const cur = now26 || thisYear.byName.get(nk);
        const facts = [`${info.name} ${pos}`];
        if (status) facts.push(status.toLowerCase());
        const teamWeeks = abbr && schedule && !schedule.unavailable ? schedule.rows.filter((r) => Number(r.season) === season && (r.home_team === abbr || r.away_team === abbr)
          && r.home_score !== '' && r.home_score != null && String(r.gameday) < date).map((r) => Number(r.week)).sort((a, b) => b - a) : null;
        const elsewhere = (w) => [...thisYear.byKey].find(([k, v]) => k.startsWith(`${nk}|`) && k !== `${nk}|${abbr}` && v.weeks.has(w))?.[0].split('|')[1] || null;
        const recent = cur ? `${season}: ${statText(pos, cur, now26 ? teamWeeks : null, elsewhere)}` : thisYear.missing ? `${season}: games not on file (the weekly stats did not load)` : `${season}: no games yet`;
        facts.push(recent);
        const id = `P${++seq}`;
        lines.push(`  [${id}] ${facts.join(' · ')} · ${prices.join(' · ')}`);
        const matchKey = info.name;
        // statKey: the stats' spelling; recent: his team's last three games for the one-line board (round 10: built, never
        // read; the line Gary picks sheets from carried only a game count).
        candidates.set(id, { id, gameId: String(g.id), matchup, commence: g.date, player: info.name, playerId: pid, team: teamName, position: pos, td, rec, rush, pass, int, tdKind,
          status: status ? status.toLowerCase() : null, gameLine, statKey: nk, recent });
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
