// LATE NEWS (founder GO, Oct 13 2026): every game pick's availability is recorded when it publishes, from the feed the
// sport's desk reads (NFL: the BDL injury feed with this week's notes; NBA: the league's official report; MLB: the starting
// pitchers and posted lineups; college: the conference's official availability report), and read again when the pick is
// due on Winners (75 minutes before an NFL, college or MLB start, after the NFL inactives; 28 minutes before an NBA tip).
// What changed, and who was still undecided, is recorded for the data check.
//
// A published pick is final (founder, Oct 23 2026: "Gary can't scratch it ... he has to make his best pick with the
// information available ... if they really are still undecided then Gary has to still make the pick just like the
// public would"). The check no longer asks him whether the pick stands and never scratches it: nothing changed is
// 'clear', a change or an undecided player is recorded with 'stand', a feed that cannot be read is 'no_feed'. The
// Mavericks +7.5 of Oct 23 had been scratched when Aaron Nesmith came off Indiana's report.
import { ballDontLieService as bdl } from '../providers/ballDontLieService.js';
import { reconcileNflStatus } from '../sports/nfl/nflAvailability.js';
import { getMlbSchedule, getConfirmedLineups } from '../providers/mlbStatsApiService.js';
import { clubNick } from '../sports/mlb/mlbGameFrames.js';
import { officialAvailabilityForGame } from '../sports/ncaaf/ncaafAvailabilityReports.js';
import { latestOfficialReport } from '../providers/nbaOfficialInjuryReport.js';

const MIN = 60_000;
/** When a pick is checked (and seats): minutes before the start, and the last minute it may still seat. */
export const CHECK_WINDOW = { NBA: { lead: 28, floor: 10 }, default: { lead: 75, floor: 20 } };
const windowFor = (league) => CHECK_WINDOW[league] || CHECK_WINDOW.default;
const BDL_SPORT = { NFL: 'americanfootball_nfl', NBA: 'basketball_nba' };
const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const nameKey = (v) => String(v || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const fullName = (p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
const STATUS_WORD = { q: 'Questionable', d: 'Doubtful', o: 'Out', gtd: 'Game-time decision', dtd: 'Day-to-day' };
const word = (s) => STATUS_WORD[String(s || '').trim().toLowerCase()] || String(s || '').trim();
// Still undecided at the check: a player the pick's sport has not settled yet. The NFL has settled its own by then
// (inactives come 90 minutes before kickoff; a questionable player not on the list plays).
const UNDECIDED = /^(questionable|doubtful|game[- ]time|gtd|day[- ]to[- ]day|dtd)/i;

async function teamIds(league, homeTeam, awayTeam) {
  const teams = await bdl.getTeams(BDL_SPORT[league]);
  const find = (n) => (teams || []).find((t) => [t.full_name, t.name, `${t.city || ''} ${t.name || ''}`.trim()].includes(n));
  return { home: find(homeTeam)?.id ?? null, away: find(awayTeam)?.id ?? null };
}

/**
 * Both teams' availability now: { source, rows: [{ side, name, position, status, note }] }, or
 * { unavailable: reason }. A row is a player the feed lists; MLB rows are the starting pitchers and the lineups.
 */
export async function availabilityNow({ league, homeTeam, awayTeam, commence }) {
  try {
    if (league === 'NBA') return await nbaAvailability({ homeTeam, awayTeam });
    if (league === 'NFL') {
      const ids = await teamIds(league, homeTeam, awayTeam);
      if (ids.home == null || ids.away == null) return { unavailable: `no ${league} team ids for ${awayTeam} @ ${homeTeam}` };
      const raw = await bdl.getNflPlayerInjuries([], { ttlMinutes: 2, throwOnError: true });
      const sideOf = (r) => { const id = r?.player?.team?.id ?? r?.team?.id ?? r?.player?.team_id ?? r?.team_id;
        return String(id) === String(ids.home) ? 'home' : String(id) === String(ids.away) ? 'away' : null; };
      const rows = (raw || []).map((r) => {
        const side = sideOf(r);
        if (!side) return null;
        const status = reconcileNflStatus(r).status;
        return { side, name: fullName(r.player), position: r.player?.position_abbreviation || r.player?.position || null,
          status: word(status), note: String(r.comment || r.description || '').replace(/\s+/g, ' ').trim() || null };
      }).filter((r) => r?.name);
      return { source: 'BDL NFL injury feed', rows };
    }
    if (league === 'NCAAF') {
      // The report matcher reads BDL team objects (school names), not the pick's full names ("Alabama Crimson Tide").
      const teams = await bdl.getTeams('americanfootball_ncaaf').catch(() => []);
      const team = (n) => (teams || []).find((t) => t.full_name === n) || n;
      const report = await officialAvailabilityForGame({ homeTeam: team(homeTeam), awayTeam: team(awayTeam), date: etDate(commence) });
      if (!report?.found) return { unavailable: 'no official conference availability report for this game' };
      const rows = ['home', 'away'].flatMap((side) => (report[side]?.listed || []).map((r) => ({ side, name: r.name, position: r.position || null, status: word(r.status), note: null })));
      return { source: `${report.conference} availability report (${report.reportType || 'latest'})`, rows };
    }
    if (league === 'MLB') return await mlbAvailability({ homeTeam, awayTeam, commence });
    return { unavailable: `${league} has no late-news feed` };
  } catch (e) {
    return { unavailable: e?.message || String(e) };
  }
}

const sameStart = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) < 3 * 60 * MIN;

/**
 * NBA: the league's official injury report (posted every 15 minutes) for the statuses, with BDL's latest news note
 * on the player when that feed answers (its NBA tier is a separate subscription).
 */
async function nbaAvailability({ homeTeam, awayTeam }) {
  const report = await latestOfficialReport();
  const sideOf = (team) => (team === homeTeam ? 'home' : team === awayTeam ? 'away' : null);
  const notes = new Map();
  try {
    const ids = await teamIds('NBA', homeTeam, awayTeam);
    const raw = await bdl.getInjuriesGeneric(BDL_SPORT.NBA, { team_ids: [ids.home, ids.away].filter((x) => x != null) }, 2);
    for (const r of raw || []) notes.set(nameKey(fullName(r.player)), String(r.description || r.comment || '').replace(/\s+/g, ' ').trim());
  } catch { /* the official report stands alone */ }
  const rows = report.rows.filter((r) => sideOf(r.team) && !/^available$/i.test(r.status) && !/g league/i.test(r.reason))
    .map((r) => ({ side: sideOf(r.team), name: r.player, position: null, status: word(r.status),
      note: [r.reason, notes.get(nameKey(r.player))].filter(Boolean).join('. ') || null }));
  return { source: `NBA official injury report (${report.url.split('/').pop()})`, rows };
}

/** Tonight's game on the MLB schedule. MLB picks name the clubs short ("Dodgers"); the schedule names them in full. */
export function findMlbGame(schedule, { homeTeam, awayTeam, commence }) {
  const is = (team, name) => [team?.name, clubNick(team?.name)].includes(name);
  return (schedule || []).find((g) => is(g.teams?.home?.team, homeTeam) && is(g.teams?.away?.team, awayTeam) && sameStart(g.gameDate, commence));
}

async function mlbAvailability({ homeTeam, awayTeam, commence }) {
  const schedule = await getMlbSchedule(etDate(commence), { throwOnError: true });
  const game = findMlbGame(schedule, { homeTeam, awayTeam, commence });
  if (!game) return { unavailable: `no MLB schedule game for ${awayTeam} @ ${homeTeam}` };
  const rows = [];
  for (const side of ['home', 'away']) {
    const sp = game.teams?.[side]?.probablePitcher?.fullName;
    if (sp) rows.push({ side, name: sp, position: 'SP', status: 'Starting pitcher', note: null });
  }
  const lineups = await getConfirmedLineups(game.gamePk);
  let previous = null;
  for (const side of ['home', 'away']) {
    const list = lineups?.[side] || [];
    if (list.length < 9) continue;   // not posted yet
    for (const p of list) rows.push({ side, name: p.name, position: p.position || null, status: 'In the lineup', note: null });
    // A regular out of tonight's lineup: the club's previous game's lineup is the comparison.
    previous ??= await previousLineups(game, commence);
    const tonight = new Set(list.map((p) => nameKey(p.name)));
    for (const p of previous?.[side] || []) {
      if (!tonight.has(nameKey(p.name))) rows.push({ side, name: p.name, position: p.position || null, status: 'Not in tonight\'s lineup', note: 'in the lineup in the club\'s previous game' });
    }
  }
  return { source: 'MLB Stats API (starting pitchers and posted lineups)', rows };
}

/** Each club's lineup in its previous game (up to five days back). */
async function previousLineups(game, commence) {
  const out = {};
  for (const side of ['home', 'away']) {
    const teamId = game.teams?.[side]?.team?.id;
    for (let back = 1; back <= 5 && !out[side]; back++) {
      const day = etDate(new Date(Date.parse(commence) - back * 86_400_000).toISOString());
      const games = await getMlbSchedule(day).catch(() => []);
      const prev = (games || []).filter((g) => /final|game over|completed/i.test(String(g.status?.detailedState || ''))
        && [g.teams?.home?.team?.id, g.teams?.away?.team?.id].includes(teamId)).sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate))[0];
      if (!prev) continue;
      const l = await getConfirmedLineups(prev.gamePk).catch(() => null);
      const prevSide = prev.teams?.home?.team?.id === teamId ? 'home' : 'away';
      if (l?.[prevSide]?.length >= 9) out[side] = l[prevSide];
    }
  }
  return out;
}

/**
 * What changed between the pick and now, and who is still undecided. A row's identity is its side and name; MLB
 * starting pitchers compare by side alone (a new name is the change).
 */
export function diffAvailability(before, after, league) {
  const key = (r) => (r.position === 'SP' && league === 'MLB' ? `${r.side}|SP` : `${r.side}|${nameKey(r.name)}`);
  const was = new Map((before?.rows || []).map((r) => [key(r), r]));
  const now = new Map((after?.rows || []).map((r) => [key(r), r]));
  const changes = [];
  if (before?.rows) {
    for (const [k, r] of now) {
      const old = was.get(k);
      if (!old) {
        // A lineup posted since the pick is not news by itself; a regular out of it is (its own row).
        if (league === 'MLB' && r.status === 'In the lineup') continue;
        changes.push({ side: r.side, name: r.name, position: r.position, from: 'not listed', to: r.status, note: r.note });
      } else if (league === 'MLB' && r.position === 'SP' && nameKey(old.name) !== nameKey(r.name)) {
        changes.push({ side: r.side, name: r.name, position: 'SP', from: `${old.name} was the starting pitcher`, to: 'Starting pitcher', note: null });
      } else if (old.status !== r.status) {
        changes.push({ side: r.side, name: r.name, position: r.position, from: old.status, to: r.status, note: r.note });
      }
    }
    for (const [k, r] of was) {
      if (now.has(k) || (league === 'MLB' && (r.status === 'In the lineup' || r.position === 'SP'))) continue;
      changes.push({ side: r.side, name: r.name, position: r.position, from: r.status, to: 'off the report', note: null });
    }
  } else if (league === 'MLB') {
    // No record from pick time: tonight's lineup absences still count as news.
    for (const r of after?.rows || []) if (r.status === 'Not in tonight\'s lineup') changes.push({ side: r.side, name: r.name, position: r.position, from: 'in the previous game\'s lineup', to: r.status, note: null });
  }
  const unresolved = league === 'NFL' || league === 'MLB' ? []
    : (after?.rows || []).filter((r) => UNDECIDED.test(r.status)).map((r) => ({ side: r.side, name: r.name, position: r.position, status: r.status, note: r.note }));
  return { changes, unresolved };
}

const CANDIDATE_FIELDS = 'id,game_date,league,game_id,pick_text,commence_time,created_at,homeTeam:pick_snapshot->>homeTeam,awayTeam:pick_snapshot->>awayTeam,matchup:pick_snapshot->>matchup,rationale:pick_snapshot->>rationale,model:pick_snapshot->>model';

/** Record a game pick's availability as it publishes (the pick runner; the worker backstops one it missed). */
export async function recordAtPick(client, candidate, { availability = availabilityNow, late = false } = {}) {
  const now = await availability({ league: candidate.league, homeTeam: candidate.homeTeam, awayTeam: candidate.awayTeam, commence: candidate.commence_time });
  const { error } = await client.from('winners_late_news').upsert({
    candidate_id: candidate.id, game_date: candidate.game_date, league: candidate.league, game_id: String(candidate.game_id),
    at_pick: now.unavailable ? { unavailable: now.unavailable, late } : { ...now, late }, at_pick_at: new Date().toISOString(),
  }, { onConflict: 'candidate_id', ignoreDuplicates: true });
  if (error) throw error;
  return now;
}

/** The pick runner's call right after a game pick publishes. Never throws. */
export async function recordPickAvailability(client, { league, gameId, log = console }) {
  try {
    if (league === 'NHL') return;
    const { data, error } = await client.from('winners_candidates').select(CANDIDATE_FIELDS)
      .eq('league', league).eq('kind', 'game').eq('game_id', String(gameId)).order('id', { ascending: false }).limit(1);
    if (error) throw error;
    if (data?.[0]) await recordAtPick(client, data[0]);
  } catch (e) {
    log.warn?.(`[Late news] ${league} ${gameId}: availability at pick time not recorded (${e?.message || e}); the worker records it`);
  }
}

/**
 * The worker's pass: record any pick that has no availability yet, then check every pick that is due. Returns how
 * many it checked.
 */
export async function runLateNewsChecks(client, date, { now = Date.now(), availability = availabilityNow, log = console } = {}) {
  const { data: cands, error } = await client.from('winners_candidates').select(CANDIDATE_FIELDS).eq('game_date', date).eq('kind', 'game');
  if (error) throw error;
  const open = (cands || []).filter((c) => c.league !== 'NHL' && Date.parse(c.commence_time) > now + windowFor(c.league).floor * MIN);
  if (!open.length) return 0;
  const { data: rows, error: e2 } = await client.from('winners_late_news').select('candidate_id,at_pick,decision').in('candidate_id', open.map((c) => c.id));
  if (e2) throw e2;
  const byId = new Map((rows || []).map((r) => [Number(r.candidate_id), r]));
  let checked = 0;
  for (const c of open) {
    let row = byId.get(Number(c.id));
    if (!row) {
      // The pick runner records it as the pick publishes; the backstop waits five minutes for it, and a record
      // taken long after the pick is not a baseline (`late`).
      const age = now - Date.parse(c.created_at);
      if (age < 5 * MIN) continue;
      const atPick = await recordAtPick(client, c, { availability, late: age > 20 * MIN }).catch((e) => { log.warn?.(`[Late news] ${c.id}: ${e?.message || e}`); return null; });
      row = { at_pick: atPick && !atPick.unavailable && age <= 20 * MIN ? atPick : null, decision: null };
    }
    if (row.decision) continue;
    if (Date.parse(c.commence_time) > now + windowFor(c.league).lead * MIN) continue;
    await checkOne(client, c, row.at_pick, { availability, log });
    checked++;
  }
  return checked;
}

async function settle(client, c, fields) {
  const { error } = await client.from('winners_late_news').update({ ...fields, checked_at: new Date().toISOString() }).eq('candidate_id', c.id).is('decision', null);
  if (error) throw error;
}

async function checkOne(client, c, atPick, { availability, log }) {
  const label = `${c.league} ${c.pick_text}`;
  const now = await availability({ league: c.league, homeTeam: c.homeTeam, awayTeam: c.awayTeam, commence: c.commence_time });
  if (now.unavailable) {
    log.warn?.(`[Late news] ${label}: feed unavailable (${now.unavailable}); the pick goes on as before`);
    return settle(client, c, { at_check: { unavailable: now.unavailable }, decision: 'no_feed', why: now.unavailable });
  }
  const before = atPick && !atPick.unavailable && !atPick.late ? atPick : null;
  const { changes, unresolved } = diffAvailability(before, now, c.league);
  if (!changes.length && !unresolved.length) return settle(client, c, { at_check: now, changes: [], unresolved: [], decision: 'clear' });
  // A change or an undecided player is recorded; the pick stands as published (see the top of this file).
  await settle(client, c, { at_check: now, changes, unresolved, decision: 'stand', why: 'A published pick is final; the changes are recorded.' });
  log.log?.(`[Late news] ${label}: ${changes.length} change(s), ${unresolved.length} undecided; recorded, the pick stands`);
}
