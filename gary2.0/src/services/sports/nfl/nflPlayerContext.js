// NFL PLAYER CONTEXT (founder GO, Sep 24 2026), the football half of the MLB
// game frames: every value on a player's sheet carries its week, date and the
// defense it came against; beside it his snaps, his share of the targets lately
// against his season, what tonight's defense has allowed to his position, and
// who is out around him. From nflverse (weekly player stats, snap counts,
// schedules), which Ball Don't Lie does not carry. Facts only, one per line.
import { RELEASE_BASE, fetchCsv, TEAM_NAMES } from './nflStreaksService.js';
import { normName } from '../../gary/darts/dartsCommon.js';
import { withOfficialBox } from './espnNflBox.js';

const n = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => { const [, m, dd] = String(d || '').split('-').map(Number); return m ? `${MONTHS[m - 1]} ${dd}` : null; };

// A failed load is not kept (Oct 29 2026 hunt, round 7: one failed download read "no games yet" on every dart for the
// rest of the process); the next call asks again.
const memo = new Map();
const once = (key, fn) => {
  // A result marked `retry` (a part of it failed) is used once and asked for again next time (round 14).
  if (!memo.has(key)) memo.set(key, fn().catch(() => null).then((v) => { if (v == null || v.retry) memo.delete(key); return v; }));
  return memo.get(key);
};

/** One season's weekly player rows (nflverse stats_player_week), regular season, in the official box's counts
 * (espnNflBox.js; Oct 27 2026: Brock Bowers' 13 targets were officially 14). */
export const weeklyRows = (season) => once(`week|${season}`, async () => {
  const url = `${RELEASE_BASE}/stats_player/stats_player_week_${season}.csv`;
  const rows = (await fetchCsv(url).catch(() => fetchCsv(url))).filter((r) => r.season_type === 'REG');
  // Without the schedule or the official box, nflverse's own counts are used this once and the official ones asked for
  // again on the next call (round 14: a failed schedule download kept nflverse's counts for the whole run).
  const schedule = await fetchCsv(`${RELEASE_BASE}/schedules/games.csv`).catch(() => null);
  const official = schedule ? (await withOfficialBox(rows, schedule, season).catch(() => null))?.rows : null;
  if (official) return official;
  rows.retry = true; rows.officialMissing = true;
  return rows;
});

/** "season|week|TEAM" → game date, from the nflverse schedule; `.site` has where the team played it ("vs", "@" or
 * "vs ... (neutral site)"). Oct 26 2026: every prop log line read "vs" the opponent, road games included. */
export const gameDays = () => once('days', async () => {
  // `.result`: how each team's game ended, "W 27-24" or "L 13-35, OT" (round 12: the dart and prop rows never said).
  const out = new Map(); out.site = new Map(); out.opp = new Map(); out.result = new Map();
  for (const g of await fetchCsv(`${RELEASE_BASE}/schedules/games.csv`)) {
    for (const t of [g.home_team, g.away_team]) {
      const key = `${g.season}|${Number(g.week)}|${t}`;
      out.set(key, g.gameday);
      out.site.set(key, g.location === 'Neutral' ? 'neutral' : t === g.home_team ? 'home' : 'away');
      out.opp.set(key, t === g.home_team ? g.away_team : g.home_team);
      if (g.home_score !== '' && g.away_score !== '' && g.home_score != null) {
        const us = Number(t === g.home_team ? g.home_score : g.away_score), them = Number(t === g.home_team ? g.away_score : g.home_score);
        out.result.set(key, `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}${String(g.overtime) === '1' ? ', OT' : ''}`);
      }
    }
  }
  return out;
});

/** PFR's times pressured per quarterback game: "season|week|team|normalized name" -> count (round 11). */
export const qbPressure = (season) => once(`pressure|${season}`, async () => {
  const out = new Map();
  // A failed download is null, so it is asked for again (round 14: it was kept as an empty map, and pressure dropped).
  const rows = await fetchCsv(`${RELEASE_BASE}/pfr_advstats/advstats_week_pass_${season}.csv`).catch(() => null);
  if (!rows) return null;
  for (const r of rows) {
    if (r.times_pressured === '' || r.times_pressured == null) continue;
    out.set(`${r.season}|${n(r.week)}|${r.team}|${normName(r.pfr_player_name)}`, n(r.times_pressured));
  }
  return out;
});

/** Each receiver's drops in each game (PFR's receiving charting), "season|week|TEAM|name" -> drops (round 14: A.J.
 * Brown's three drops in a 3-of-10 day were nowhere). Null when the file did not load. */
export const receiverDrops = (season) => once(`drops|${season}`, async () => {
  const rows = await fetchCsv(`${RELEASE_BASE}/pfr_advstats/advstats_week_rec_${season}.csv`).catch(() => null);
  if (!rows) return null;
  const out = new Map();
  for (const r of rows) if (r.receiving_drop !== '' && r.receiving_drop != null) out.set(`${r.season}|${n(r.week)}|${r.team}|${normName(r.pfr_player_name)}`, n(r.receiving_drop));
  return out;
});

/** normalized name → [{ week, team, opp, snaps, teamSnaps }] newest first. */
export const snapCounts = (season) => once(`snaps|${season}`, async () => {
  // `.byPfr`: the same lists by PFR id, for players the stats feed spells differently (aliasByRoster).
  const out = new Map(); out.byPfr = new Map();
  for (const r of await fetchCsv(`${RELEASE_BASE}/snap_counts/snap_counts_${season}.csv`)) {
    if (r.game_type !== 'REG') continue;
    // A special-teams-only game is kept apart on the list as `.stOnly` (week -> special-teams snaps), so it reads as a game
    // he played on special teams, not as one he missed (round 11: Dean Connors read "did not play" on 16 special-teams
    // snaps a week).
    if (!(n(r.offense_snaps) > 0)) {
      if (!(n(r.st_snaps) > 0) && !(n(r.defense_snaps) > 0)) continue;
      const k0 = normName(r.player);
      if (!out.has(k0)) out.set(k0, []);
      if (r.pfr_player_id && !out.byPfr.has(r.pfr_player_id)) out.byPfr.set(r.pfr_player_id, out.get(k0));
      // A two-way player's all-defense game is kept as `.defOnly` (round 11: Travis Hunter's Week 4, every defensive snap,
      // read "did not play").
      // With the club, so a same-name player on another team is never read as his (round 12: the Titans' Michael Carter
      // read the Eagles' Michael Carter II's defensive snaps).
      if (n(r.defense_snaps) > 0) (out.get(k0).defOnly ||= new Map()).set(`${n(r.week)}|${r.team}`, n(r.defense_snaps));
      else (out.get(k0).stOnly ||= new Map()).set(`${n(r.week)}|${r.team}`, n(r.st_snaps));
      continue;
    }
    const k = normName(r.player);
    if (!out.has(k)) out.set(k, []);
    if (r.pfr_player_id && !out.byPfr.has(r.pfr_player_id)) out.byPfr.set(r.pfr_player_id, out.get(k));
    const pct = n(r.offense_pct);
    out.get(k).push({ week: n(r.week), team: r.team, opp: r.opponent, snaps: n(r.offense_snaps), teamSnaps: pct > 0 ? Math.round(n(r.offense_snaps) / pct) : null });
    (out.rows ||= []).push({ name: r.player, pfr: r.pfr_player_id, pos: r.position, team: r.team, week: n(r.week), pct });
    // One count per team game (Oct 29 2026 hunt, round 7: worked back from each player's rounded share, one Panthers game
    // read 79, 78 and 77 team snaps on one sheet): the share of the player with the most snaps, 100% for a full game.
    const tk = `${r.team}|${n(r.week)}`, top = out.teamTop?.get(tk);
    if (!out.teamTop) out.teamTop = new Map();
    if (pct > 0 && (!top || n(r.offense_snaps) > top.snaps)) out.teamTop.set(tk, { snaps: n(r.offense_snaps), total: Math.round(n(r.offense_snaps) / pct) });
  }
  for (const list of out.values()) {
    for (const x of list) { const t = out.teamTop?.get(`${x.team}|${x.week}`); if (t) x.teamSnaps = t.total; }
    list.sort((a, b) => b.week - a.week);
  }
  return out;
});

/** Each club's offensive regulars (QB, RB, FB, WR, TE with half or more of the snaps in at least half of the games he
 * played for it before that week; a quarterback only when he has started the most of its games and did not dress) who had
 * no offensive snap in one of its games while on its roster that week, "week|team" -> [{ name, pos, why }] (round 13:
 * Rashod Bateman's 9 targets in Wk 2 came with Zay Flowers out, and the dart row never said so). */
export function regularsOut(snaps, roster) {
  const out = new Map();
  if (!snaps?.rows?.length || !roster?.length) return out;
  const words = rosterWeekWords(roster);
  const rosterRow = new Map(roster.filter((r) => r.pfr_id).map((r) => [`${r.pfr_id}|${Number(r.week)}`, r]));
  const teamWeeks = new Map();
  for (const key of snaps.teamTop?.keys() || []) { const [t, w] = key.split('|'); teamWeeks.set(t, [...(teamWeeks.get(t) || []), Number(w)]); }
  const byPlayer = new Map();
  for (const r of snaps.rows) if (r.pfr && /^(QB|RB|FB|WR|TE)$/.test(r.pos)) byPlayer.set(r.pfr, [...(byPlayer.get(r.pfr) || []), r]);
  const qbOf = (team, w) => {
    const starts = new Map();
    for (const r of snaps.rows) if (r.team === team && r.pos === 'QB' && r.week < w && r.pct >= 0.5) { const x = starts.get(r.pfr) || { n: 0, last: 0 }; starts.set(r.pfr, { n: x.n + 1, last: Math.max(x.last, r.week) }); }
    return [...starts].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0]?.[0] ?? null;
  };
  for (const [pfr, list] of byPlayer) {
    for (const team of new Set(list.map((r) => r.team))) {
      const mine = list.filter((r) => r.team === team);
      for (const w of teamWeeks.get(team) || []) {
        if (mine.some((r) => r.week === w)) continue;
        const before = mine.filter((r) => r.week < w).sort((a, b) => b.week - a.week);
        if (!before.length || before.filter((r) => r.pct >= 0.5).length * 2 < before.length) continue;
        const ro = rosterRow.get(`${pfr}|${w}`);
        if (!ro || ro.team !== team) continue;
        const why = words.get(`${ro.gsis_id}|${w}`) || 'no offensive snaps';
        if (/released|traded|retired|practice squad/.test(why)) continue;
        // A quarterback only when he has started the most of its games so far, ties to the latest start (round 13: the
        // Falcons' Cooper Rush, benched after two starts, read as missing behind Michael Penix).
        if (before[0].pos === 'QB' && (why === 'no offensive snaps' || qbOf(team, w) !== pfr)) continue;
        // Nor one whose starts all came while this week's starter was inactive or on a reserve list: he was the fill-in
        // (round 14: Rush's two starts came with Michael Penix Jr. out, and Penix's first games back read "without Rush").
        if (before[0].pos === 'QB') {
          const now = snaps.rows.filter((r) => r.team === team && r.pos === 'QB' && r.week === w && r.pct >= 0.5).sort((a, b) => b.pct - a.pct)[0];
          const starts = before.filter((r) => r.pct >= 0.5).map((r) => r.week);
          // ...and who has not started since that starter came back (Washington's Jayden Daniels, back in Week 5, was the
          // starter: his Weeks 3-4 stay "without").
          const startedSince = mine.some((r) => r.week > w && r.pct >= 0.5);
          if (now && now.pfr !== pfr && starts.length && !startedSince && starts.every((x) => ['INA', 'RES'].includes(String(rosterRow.get(`${now.pfr}|${x}`)?.status || '').toUpperCase()))) continue;
        }
        const k = `${w}|${team}`;
        out.set(k, [...(out.get(k) || []), { name: mine[0].name, pos: mine[0].pos, why, share: before.reduce((a, r) => a + r.pct, 0) / before.length }]);
      }
    }
  }
  for (const list of out.values()) list.sort((a, b) => b.share - a.share);
  return out;
}

/** Adds each weekly stats row's spelling to `snaps` through the weekly roster's GSIS-to-PFR ids (Oct 29 2026 hunt: the
 * stats feed's Kenny Gainwell is the snap file's Kenneth Gainwell, and his prop sheet read no snaps). */
export function aliasByRoster(snaps, statRows, roster) {
  if (!snaps?.byPfr || !roster?.length) return snaps;
  const pfr = new Map(roster.filter((r) => r.gsis_id && r.pfr_id).map((r) => [r.gsis_id, r.pfr_id]));
  for (const r of statRows || []) {
    const k = normName(r.player_display_name), list = snaps.byPfr.get(pfr.get(r.player_id));
    if (list && !snaps.has(k)) snaps.set(k, list);
  }
  return snaps;
}

const GROUP = (pos) => (pos === 'WR' ? 'WR' : pos === 'TE' ? 'TE' : pos === 'RB' || pos === 'FB' ? 'RB' : pos === 'QB' ? 'QB' : null);

/** defense TEAM → { games, WR|TE|RB|QB: totals } from the offenses it faced. */
export const defenseByPosition = (season) => once(`def|${season}`, async () => {
  const out = new Map();
  for (const r of (await weeklyRows(season)) || []) {
    // A two-way player's catches count with the receivers, his carries with the backs (round 12: Travis Hunter, listed
    // at corner, left his catches out of the defenses' rows).
    const g = GROUP(r.position) || (n(r.targets) ? 'WR' : n(r.carries) ? 'RB' : null);
    const d = r.opponent_team;
    if (!g || !d) continue;
    if (!out.has(d)) out.set(d, { weeks: new Set(), WR: {}, TE: {}, RB: {}, QB: {}, games: new Map() });
    const t = out.get(d);
    t.weeks.add(n(r.week));
    // Each game on its own too, with the offense it faced (Oct 29 2026, founder: no totals over games).
    if (!t.games.has(n(r.week))) t.games.set(n(r.week), { opp: r.team, WR: {}, TE: {}, RB: {}, QB: {} });
    const wk = t.games.get(n(r.week));
    const add = (k, v) => { t[g][k] = (t[g][k] || 0) + v; wk[g][k] = (wk[g][k] || 0) + v; };
    add('targets', n(r.targets)); add('rec', n(r.receptions)); add('recYds', n(r.receiving_yards)); add('recTd', n(r.receiving_tds));
    add('carries', n(r.carries)); add('rushYds', n(r.rushing_yards)); add('rushTd', n(r.rushing_tds));
    add('passYds', n(r.passing_yards)); add('passTd', n(r.passing_tds)); add('int', n(r.passing_interceptions)); add('sacks', n(r.sacks_suffered));
    // Who threw against it that day (round 9: a defense's game against a backup read the same as against a starter).
    if (n(r.attempts) > 0) (wk.passers ||= []).push({ name: r.player_display_name, att: n(r.attempts) });
  }
  return out;
});

const TEAM_WORD = { WR: 'wide receivers', TE: 'tight ends', RB: 'running backs', QB: 'quarterbacks' };

/** "PHI defense against wide receivers, 2026 (2 games): 29 catches on 41 targets, 388 yards, 3 TD · 2025 (17 games): ..." */
export function defenseLine(cur, prev, defense, position, season) {
  const g = GROUP(position);
  if (!g || !defense) return null;
  // Game by game, newest first, with the offense it faced (Oct 29 2026, founder: "give Gary the numbers behind the
  // average"; it read "PHI defense against wide receivers, 2026 (5 games): 29 catches on 41 targets, 388 yards, 3 TD").
  const games = cur?.get(defense)?.games;
  if (games?.size) {
    const bits = (x) => (g === 'QB' ? `${x.passYds || 0} passing yards, ${x.passTd || 0} TD, ${x.int || 0} INT, ${x.sacks || 0} sacks, ${x.rushYds || 0} rushing`
      : g === 'RB' ? `${x.carries || 0} carries for ${x.rushYds || 0}, ${x.rushTd || 0} TD; ${x.rec || 0} catches for ${x.recYds || 0}, ${x.recTd || 0} TD`
        : `${x.rec || 0} catches on ${x.targets || 0} targets, ${x.recYds || 0} yards, ${x.recTd || 0} TD`);
    // "against", not "vs": the rows carry no site (round 9: road games read as home ones).
    const threw = (x) => (x.passers?.length ? ` (${x.passers.sort((a, b) => b.att - a.att).map((p) => `${p.name} ${p.att} att`).join(', ')})` : '');
    const rows = [...games].sort((a, b) => b[0] - a[0]).map(([wk, x]) => `Wk ${wk} against ${x.opp}${threw(x)}: ${bits(x[g])}`);
    return `${defense} defense against ${TEAM_WORD[g]}, ${season} game by game, newest first: ${rows.join(' · ')}`;
  }
  const one = (map, label) => {
    const t = map?.get(defense);
    if (!t) return null;
    const x = t[g];
    const games = t.weeks.size;
    const bits = g === 'QB'
      ? [`${x.passYds || 0} passing yards`, `${x.passTd || 0} passing TD`, `${x.int || 0} INT`, `${x.rushYds || 0} rushing yards`]
      : g === 'RB'
        ? [`${x.carries || 0} carries for ${x.rushYds || 0} yards`, `${x.rushTd || 0} rushing TD`, `${x.rec || 0} catches for ${x.recYds || 0} yards`, `${x.recTd || 0} receiving TD`]
        : [`${x.rec || 0} catches on ${x.targets || 0} targets`, `${x.recYds || 0} yards`, `${x.recTd || 0} TD`];
    return `${label} (${games} game${games === 1 ? '' : 's'}): ${bits.join(', ')}`;
  };
  const parts = [one(cur, String(season)), one(prev, String(season - 1))].filter(Boolean);
  return parts.length ? `${defense} defense against ${TEAM_WORD[g]}, ${parts.join(' · ')}` : null;
}


/** Each player's roster word for a week ("inactive", "injured reserve", "commissioner's exempt list"), keyed
 * "GSIS id|week", from the weekly roster (Oct 29 2026 hunt, round 7: Josh Jacobs' sheet read "did not play" for the six
 * weeks he was on the exempt list, Lamar Jackson's for three weeks inactive). */
// `.active` holds the weeks he was on the active roster, and `.report` that week's report status and injury from the
// league's injury file (round 14: Ladd McConkey's Week 5, active and questionable with a foot, read a bare "did not play").
export function rosterWeekWords(roster, injuries = null) {
  const out = new Map(); out.active = new Set(); out.report = new Map();
  for (const r of roster || []) if (r.gsis_id && String(r.status).toUpperCase() === 'ACT') out.active.add(`${r.gsis_id}|${Number(r.week)}`);
  for (const r of injuries || []) {
    if (!r.gsis_id || String(r.game_type || 'REG') !== 'REG') continue;
    const words = [r.report_status ? String(r.report_status).toLowerCase() : null, r.report_primary_injury ? String(r.report_primary_injury).toLowerCase() : null,
      r.practice_status ? (/did not/i.test(r.practice_status) ? 'did not practice' : /limited/i.test(r.practice_status) ? 'limited in practice' : /full/i.test(r.practice_status) ? 'full practice' : String(r.practice_status).toLowerCase()) : null].filter(Boolean);
    if (words.length) out.report.set(`${r.gsis_id}|${Number(r.week)}`, words.join(', '));
  }
  for (const r of roster || []) {
    const w = r.status === 'INA' ? 'inactive' : r.status === 'EXE' ? "commissioner's exempt list"
      : r.status === 'RES' ? (/^R(?:01|48)$/.test(String(r.status_description_abbr || '')) ? 'injured reserve' : 'on a reserve list')
        : r.status === 'DEV' ? 'practice squad' : r.status === 'CUT' ? 'released' : r.status === 'RET' ? 'retired' : /^TR/.test(String(r.status)) ? 'traded' : null;
    if (w && r.gsis_id) out.set(`${r.gsis_id}|${Number(r.week)}`, w);
  }
  return out;
}

/** The team's quarterbacks each week, keyed "season|week|TEAM": every passer with 5+ attempts, most first (Oct 29 2026
 * hunt, round 7: the Ravens' receivers read the same with Lamar Jackson and with Tyler Huntley). */
export function weekPassers(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!(n(r.attempts) >= 5)) continue;
    const k = `${r.season}|${Number(r.week)}|${r.team}`;
    by.set(k, [...(by.get(k) || []), r]);
  }
  return new Map([...by].map(([k, list]) => [k, list.sort((a, b) => n(b.attempts) - n(a.attempts)).map((r) => r.player_display_name)]));
}

/** "Wk 2 Sep 14 vs DAL: 7 targets, 5 catches, 72 yards, 1 TD; 2 carries, 9 yards; 54 of 66 snaps" — newest first. */
// `defenses`: team code → the defense that week's opponent is this season ("allowing 26.3 points a game, 5th most"),
// so "120 yards vs DAL" says whether Dallas was a soft defense (Oct 26 2026, as the game lines show it).
// A game his club played that he has no row in reads "did not play" (Oct 27 2026 darts bug audit: Josh Jacobs' sheet
// showed one game, Week 7, with nothing to say he had missed Weeks 1 to 6 and was one game back).
// `passers` (weekPassers) names his team's quarterback each game for a non-passer; `rosterWords` (rosterWeekWords) says
// why a game he missed was missed.
// `hurt`: the play ledger's in-game injuries, "week|team" -> [{ who: "A.Jones", q, clock, later }] (round 13: a game he
// left hurt read like a dud game).
export function nflGameLog(rows, { season, days, snaps = [], limit = 8, defenses = null, teamTargets = null, today = null, passers = null, rosterWords = null, pressure = null, hurt = null, without = null, plays = null, drops = null } = {}) {
  const line = (r) => {
    const wk = n(r.week);
    const date = days?.get(`${season}|${wk}|${r.team}`); const site = days?.site?.get(`${season}|${wk}|${r.team}`);
    const bits = [];
    if (n(r.special_teams_tds) || n(r.fumble_recovery_tds)) bits.push(`${n(r.special_teams_tds) + n(r.fumble_recovery_tds)} return TD`);
    // Sacked and pressured too (round 11: a QB's sheet had no pressure, the stat the founder named): sacks from the weekly
    // row, pressures from PFR's charting (`pressure`: "season|week|team|name" -> times pressured).
    const pressured = pressure?.get(`${r.season}|${wk}|${r.team}|${normName(r.player_display_name)}`);
    const qbGame = n(r.attempts) >= 5 || n(r.sacks_suffered) > 0;
    if (n(r.attempts)) bits.push(`${n(r.completions)} of ${n(r.attempts)} passing, ${n(r.passing_yards)} yards, ${n(r.passing_tds)} TD, ${n(r.passing_interceptions)} INT${qbGame ? `, sacked ${n(r.sacks_suffered)}${pressured != null ? `, pressured ${pressured}` : ''}` : ''}`);
    if (n(r.carries)) bits.push(`${n(r.carries)} carries, ${n(r.rushing_yards)} yards${n(r.rushing_tds) ? `, ${n(r.rushing_tds)} TD` : ''}`);
    const teamTotal = teamTargets?.get(`${r.season}|${r.week}|${r.team}`);
    const dropped = drops?.get(`${r.season}|${wk}|${r.team}|${normName(r.player_display_name)}`);
    if (n(r.targets) || n(r.receptions)) bits.push(`${n(r.targets)} targets${teamTotal ? ` (of the team's ${teamTotal})` : ''}, ${n(r.receptions)} catches, ${n(r.receiving_yards)} yards${n(r.receiving_tds) ? `, ${n(r.receiving_tds)} TD` : ''}${dropped ? `, ${dropped} drop${dropped === 1 ? '' : 's'}` : ''}`);
    const s = snaps.find((x) => x.week === wk);
    if (s) bits.push(`${s.snaps}${s.teamSnaps ? ` of ${s.teamSnaps}` : ''} snaps`);
    // The week's quarterbacks unless he is one of them (round 9: a receiver's trick-play pass hid the week's QB).
    const listed = passers?.get(`${r.season}|${wk}|${r.team}`);
    const qbs = listed && !listed.some((q) => normName(q) === normName(r.player_display_name)) ? listed : null;
    if (qbs?.length) bits.push(`QB ${qbs.join(', ')}`);
    const faced = defenses?.get(r.opponent_team);
    const where = site === 'away' ? `@ ${r.opponent_team}` : `vs ${r.opponent_team}${site === 'neutral' ? ' at a neutral site' : ''}`;
    const result = days?.result?.get(`${season}|${wk}|${r.team}`);
    const parts = String(r.player_display_name || '').replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i, '').split(/\s+/);
    const h = (hurt?.get(`${wk}|${r.team}`) || []).find((e) => { const [i, l] = String(e.who).split('.'); return l && parts.length > 1 && l.toLowerCase() === parts.at(-1).toLowerCase() && parts[0].toLowerCase().startsWith(String(i).toLowerCase()); });
    if (h) bits.push(`hurt in Q${h.q}${h.clock ? ` (${h.clock})` : ''}, ${h.later ? 'on a later play' : 'not on a later play'}`);
    // His last play before the 4th quarter in a game his club played into it, on a day his snap share fell under 60% of
    // his usual (round 14: Ladd McConkey's last play at Q1 7:21, no "was injured" line, read like a quiet game).
    const lp = !h && plays?.get(`${wk}|${r.team}`);
    if (lp) {
      const mine = Object.entries(lp.lastPlay || {}).find(([k]) => { const [, who] = k.split('|'); const [i, l] = String(who).split('.'); return l && parts.length > 1 && l.toLowerCase() === parts.at(-1).toLowerCase() && parts[0].toLowerCase().startsWith(String(i).toLowerCase()); })?.[1];
      const shareOf = (x) => (x?.teamSnaps ? x.snaps / x.teamSnaps : null);
      const others = snaps.filter((x) => x.week !== wk).map(shareOf).filter((v) => v != null).sort((a, b) => a - b);
      const usual = others.length ? others[Math.floor(others.length / 2)] : null, today = shareOf(snaps.find((x) => x.week === wk));
      if (mine && mine.q < 4 && (lp.teamLastQ?.[r.team] || 0) >= 4 && usual != null && today != null && today < 0.6 * usual) bits.push(`last on a play in Q${mine.q}${mine.clock ? ` (${mine.clock})` : ''}`);
    }
    const gone = (without?.get(`${wk}|${r.team}`) || []).filter((x) => normName(x.name) !== normName(r.player_display_name)).slice(0, 3);
    if (gone.length) bits.push(`without ${gone.map((x) => `${x.name} (${x.pos}, ${x.why})`).join(', ')}`);
    return `Wk ${wk}${date ? ` ${day(date)}` : ''} ${where}${faced ? ` (${faced})` : ''}${result ? `, ${result}` : ''}: ${bits.join('; ') || 'no touches'}`;
  };
  const played = (rows || []).map((r) => ({ wk: n(r.week), text: line(r) }));
  const team = rows?.[0]?.team, gsis = rows?.[0]?.player_id;
  const end = today || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const missed = [];
  if (team && days) {
    for (const [key, date] of days) {
      const [s, w, t] = key.split('|');
      if (Number(s) === Number(season) && t === team && Number(w) <= 18 && date && date < end && !played.some((p) => p.wk === Number(w))) {
        const on = snaps.find((x) => x.week === Number(w) && x.snaps > 0);
        const wk0 = `${gsis}|${Number(w)}`;
        const why = gsis ? rosterWords?.get(wk0) || (rosterWords?.active?.has(wk0) ? `active${rosterWords.report?.get(wk0) ? `; on that week's report: ${rosterWords.report.get(wk0)}` : ''}` : null) : null;
        // The game as a played line has it: where, against whom, that defense and his team's quarterback (round 8: "Wk 6
        // Oct 18: no touches; 33 of 46 snaps" lost the opponent, the site, the defense and the passer).
        const opp = days.opp?.get(key), site = days.site?.get(key);
        const result = days.result?.get(key);
        const where = opp ? ` ${site === 'away' ? '@' : 'vs'} ${opp}${site === 'neutral' ? ' at a neutral site' : ''}${defenses?.get(opp) ? ` (${defenses.get(opp)})` : ''}${result ? `, ${result}` : ''}` : '';
        const qbs = passers?.get(`${season}|${Number(w)}|${team}`);
        const st = snaps?.stOnly?.get(`${Number(w)}|${team}`), def = snaps?.defOnly?.get(`${Number(w)}|${team}`);
        missed.push({ wk: Number(w), text: `Wk ${Number(w)} ${day(date)}${where}: ${on ? `no touches; ${on.snaps}${on.teamSnaps ? ` of ${on.teamSnaps}` : ''} snaps` : def ? `no offensive snaps (${def} on defense)` : st ? `special teams only (${st} snaps), no offensive snaps` : `did not play${why ? ` (${why})` : ''}`}${qbs?.length ? `; QB ${qbs.join(', ')}` : ''}` });
      }
    }
  }
  return [...played, ...missed].sort((a, b) => b.wk - a.wk).slice(0, limit).map((x) => x.text);
}

// A game he played without a catch, carry or pass has no stat row in either feed, so it read "did not play" and dropped
// out of his per-game rates (Oct 29 2026 hunt: Kendrick Bourne, 42 snaps at the Giants with no catch, read 39.0
// receiving yards a game over 6 against 33.4 over 7). His offensive snaps put it back, as a zero.
const ZERO_GAME = { pass_comp: 0, pass_att: 0, pass_yds: 0, pass_tds: 0, ints: 0, rush_att: 0, rush_yds: 0, rush_tds: 0, receptions: 0, targets: 0, rec_yds: 0, rec_tds: 0 };
const etYmd = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x)) ? String(x) : new Date(x).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
/** `games` (newest first; by week, or by date for the stats feed's game logs) with each week of `snapList` (snapCounts'
 * entries: week, team, snaps) that has no game added as a zero game; `days` places a week on a date. */
export function withSnapGames(games, snapList, { season, days } = {}) {
  const list = [...(games || [])];
  if (!snapList?.length) return list;
  const byDate = list.some((g) => g.week == null);
  const weeks = new Set(list.filter((g) => g.week != null).map((g) => Number(g.week)));
  const dates = new Set(list.filter((g) => g.date).map((g) => etYmd(g.date)));
  for (const s of snapList) {
    if (!(s.snaps > 0)) continue;
    const date = days?.get(`${season}|${s.week}|${s.team}`) || null;
    if (weeks.has(s.week) || (date && dates.has(date)) || (byDate && !date)) continue;
    list.push({ ...ZERO_GAME, week: s.week, date, team: s.team, opp: s.opp, noTouches: true });
  }
  return byDate || list.some((g) => g.week == null)
    ? list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    : list.sort((a, b) => Number(b.week) - Number(a.week));
}

/** Each team's targets in each week, from every player's weekly row: `${season}|${week}|${team}` → targets. */
export function teamTargetTotals(rows) {
  const totals = new Map();
  for (const r of rows || []) {
    const key = `${r.season}|${r.week}|${r.team}`;
    totals.set(key, (totals.get(key) || 0) + n(r.targets));
  }
  return totals;
}

/**
 * "share of the team's targets: 31 of 104 over the last 3 games, 52 of 190 this season". With the team's weekly
 * totals, every game he has a row for counts, a no-target game as "0 of 31" (round 2 audit, Oct 13 2026: the
 * share came from his own target_share, so a game he was not targeted added nothing and was not counted).
 */
export function targetShareLine(rows, totals = null, snapList = null, season = null) {
  const fromTotals = (r) => (totals ? totals.get(`${r.season}|${r.week}|${r.team}`) : undefined);
  // A game he played with no target counts, with the team's targets that day (see withSnapGames).
  const have = new Set((rows || []).map((r) => n(r.week)));
  const zeros = season ? (snapList || []).filter((s) => s.snaps > 0 && !have.has(s.week)).map((s) => ({ season, week: s.week, team: s.team, targets: 0 })) : [];
  const list = [...(rows || []), ...zeros].sort((a, b) => n(b.week) - n(a.week)).filter((r) => n(r.targets) > 0 || n(r.target_share) > 0 || fromTotals(r) > 0);
  if (list.length < 2) return null;
  const teamTargets = (r) => fromTotals(r) || (n(r.target_share) > 0 ? Math.round(n(r.targets) / n(r.target_share)) : null);
  const sum = (xs) => xs.reduce((a, r) => ({ mine: a.mine + n(r.targets), team: a.team + (teamTargets(r) || 0) }), { mine: 0, team: 0 });
  const last3 = sum(list.slice(0, 3)), all = sum(list);
  if (!all.team) return null;
  return `his targets against the team's: ${last3.mine} of ${last3.team} over his last ${Math.min(3, list.length)} games, ${all.mine} of ${all.team} this season (${list.length} games)`;
}

/**
 * "his club's report: WR Ja'Marr Chase (out), TE ... (questionable) · on reserve: ..." — his club's current report,
 * himself excluded: this week's statuses first, then the reserve lists, every name (Oct 27 2026 darts bug audit: the
 * first ten in the feed's order, reserve players among them, hid this week's names on 24 of 32 clubs; the 49ers' line
 * left out Bosa, McCaffrey, Deebo Samuel and Mike Evans, all questionable).
 */
// `weeksByName` (normName -> his weekly rows) adds the last week each listed player played (round 11: "WR Terry McLaurin
// (ir)" did not say he had played through Week 6, so the rows he was in and out of read the same). `label` names whose
// report it is.
export function outAroundLine(injuries, teamFull, name, { weeksByName = null, snaps = null, label = "his club's report" } = {}) {
  const club = Object.entries(TEAM_NAMES).find(([, full]) => full === teamFull)?.[0] || null;
  const mine = normName(name);
  const list = (injuries || []).filter((i) => (i?.player?.team?.full_name || i?.team?.full_name) === teamFull
    && normName(`${i?.player?.first_name || ''} ${i?.player?.last_name || ''}`) !== mine
    && /^(out|doubtful|questionable|no game status yet|ir|injured reserve|pup)/i.test(String(i?.status || '')));
  if (!list.length) return null;
  const rank = (s) => ['out', 'doubtful', 'questionable', 'no game status yet'].findIndex((w) => String(s).toLowerCase().startsWith(w));
  // His last game with this club: any stat row or any snap, offense, defense or special teams (round 12: a blocker hurt
  // before his first catch read his game before, and a same-name player on another club supplied weeks).
  const lastWeek = (i) => {
    if (!weeksByName && !snaps) return null;
    const nm = normName(`${i.player?.first_name || ''} ${i.player?.last_name || ''}`);
    const ws = [...(weeksByName?.get(nm) || []).filter((r) => !club || r.team === club).map((r) => Number(r.week)),
      ...(snaps?.get(nm) || []).filter((x) => !club || x.team === club).map((x) => Number(x.week)),
      ...[...(snaps?.get(nm)?.stOnly?.keys() || []), ...(snaps?.get(nm)?.defOnly?.keys() || [])].filter((k) => !club || k.endsWith(`|${club}`)).map((k) => Number(k.split('|')[0]))];
    return ws.length ? Math.max(...ws) : null;
  };
  const detail = (r) => {
    if (!r) return '';
    const hurt = [r.injury, r.secondary].filter(Boolean).map((x) => String(x).toLowerCase()).join(', ');
    const days = r.practiceDays?.length ? r.practiceDays.map((d) => `${String(d.day).split(',')[0]} ${d.practice}`).join(', ') : r.practice;
    return [hurt, days ? `practice ${days}` : null].filter(Boolean).join('; ');
  };
  const word = (i) => { const w = lastWeek(i); const d = detail(i.report); return `${i.player?.position_abbreviation || i.player?.position || ''} ${i.player?.first_name} ${i.player?.last_name} (${d ? `${d}; ` : ''}${String(i.status).toLowerCase()}${w ? `; last played Wk ${w}` : ''})`.trim(); };
  const week = list.filter((i) => rank(i.status) >= 0).sort((a, b) => rank(a.status) - rank(b.status));
  const reserve = list.filter((i) => rank(i.status) < 0);
  return [week.length ? `${label}: ${week.map(word).join(', ')}` : `${label}: nobody listed this week`,
    reserve.length ? `on reserve: ${reserve.map(word).join(', ')}` : null].filter(Boolean).join(' · ');
}

/**
 * The injury feed's rows under the league's official report for this game's week (Oct 29 2026 hunt: the props sheets
 * read the feed alone, which had no row for Akayleb Evans, Out on the Panthers' report). The report's game status wins
 * for a player both list; a report player the feed lacks is added; before the week's statuses are issued (the final
 * report), a feed's weekly word reads "no game status yet". `reports`: [{ team: full name, report }].
 */
// `roster` (the weekly roster's rows): a feed row for a player on the practice squad in the roster's latest week is not
// the club's report (round 14: the Vikings' practice-squad injured list read "out" at the head of their report).
export function withOfficialReport(injuries, reports, roster = null) {
  const full = (i) => normName(`${i?.player?.first_name || ''} ${i?.player?.last_name || ''}`);
  const latest = Math.max(0, ...(roster || []).map((r) => Number(r.week) || 0));
  const practiceSquad = new Set((roster || []).filter((r) => Number(r.week) === latest && String(r.status).toUpperCase() === 'DEV').map((r) => normName(r.full_name)));
  const rows = (injuries || []).filter((i) => !practiceSquad.has(full(i)));
  for (const { team, report, pending = false } of reports || []) {
    // A report not filed yet, before the final report is due: the feed's weekly word is its placeholder (round 8).
    if (!report?.players?.length) {
      if (pending) for (let k = 0; k < rows.length; k++) { const i = rows[k]; if ((i?.player?.team?.full_name || i?.team?.full_name) === team && /^(questionable|doubtful|probable)$/i.test(String(i.status || ''))) rows[k] = { ...i, status: 'no game status yet' }; }
      continue;
    }
    const designated = report.players.some((r) => r.game_status);
    const mine = rows.filter((i) => (i?.player?.team?.full_name || i?.team?.full_name) === team);
    const byName = new Map(mine.map((i) => [full(i), i]));
    // Then a last name only one player on each side has, as the read matches them (nfl.js; Oct 29 2026 hunt, round 7:
    // the report's "Andrew Ogletree" and the feed's "Drew Ogletree" stayed two rows, the feed's status beside the report's).
    const lastOf = (name) => normName(String(name || '').trim().split(/\s+/).slice(1).join(' '));
    const feedLast = new Map(), reportLast = new Map();
    for (const i of mine) { const k = normName(i?.player?.last_name); feedLast.set(k, [...(feedLast.get(k) || []), i]); }
    for (const r of report.players) reportLast.set(lastOf(r.name), (reportLast.get(lastOf(r.name)) || 0) + 1);
    for (const r of report.players) {
      const k = lastOf(r.name);
      const listed = byName.get(normName(r.name)) || (k && feedLast.get(k)?.length === 1 && reportLast.get(k) === 1 ? feedLast.get(k)[0] : null);
      // The report's injury and practice days ride with the row (round 13: the frames gave a status only), and before the
      // game statuses are filed every player on the report is listed, not only the feed's (Mahomes and Andrews were missing).
      if (listed) { rows[rows.indexOf(listed)] = { ...listed, ...(r.game_status ? { status: r.game_status } : {}), report: r }; continue; }
      if (!r.game_status && designated) continue;
      const [first, ...rest] = String(r.name || '').trim().split(/\s+/);
      rows.push({ player: { first_name: first, last_name: rest.join(' '), position_abbreviation: r.position, team: { full_name: team } }, status: r.game_status || 'no game status yet', report: r });
    }
    if (!designated) {
      for (let k = 0; k < rows.length; k++) {
        const i = rows[k];
        if ((i?.player?.team?.full_name || i?.team?.full_name) === team && /^(questionable|doubtful|probable)$/i.test(String(i.status || ''))) rows[k] = { ...i, status: 'no game status yet' };
      }
    }
  }
  return rows;
}

/** A club's regular season from the schedule: "11-6, 25.1 points a game, 19.2 allowed (17 games)"; null before a final. */
export async function teamSeasonLine(season, abbr) {
  const games = (await fetchCsv(`${RELEASE_BASE}/schedules/games.csv`).catch(() => []))
    .filter((g) => Number(g.season) === Number(season) && g.game_type === 'REG' && g.home_score !== '' && g.away_score !== '' && (g.home_team === abbr || g.away_team === abbr));
  if (!games.length) return null;
  let w = 0, l = 0, t = 0, pf = 0, pa = 0;
  for (const g of games) {
    const mine = g.home_team === abbr ? n(g.home_score) : n(g.away_score), theirs = g.home_team === abbr ? n(g.away_score) : n(g.home_score);
    pf += mine; pa += theirs;
    if (mine > theirs) w++; else if (mine < theirs) l++; else t++;
  }
  const k = games.length;
  return `${w}-${l}${t ? `-${t}` : ''}, ${(pf / k).toFixed(1)} points a game, ${(pa / k).toFixed(1)} allowed (${k} game${k === 1 ? '' : 's'})`;
}
