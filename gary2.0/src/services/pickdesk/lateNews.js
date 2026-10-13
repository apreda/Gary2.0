// LATE NEWS (founder GO, Oct 13 2026: "we need a mechanism for scratching the pick and letting the users know that
// this pick was scratched and why"; "Gary can also scratch the pick if he wants").
//
// Every game pick's availability is recorded when it publishes: both teams, from the feed the sport's desk reads
// (NFL: the BDL injury feed with this week's notes; NBA: BDL's injury feed; MLB: the starting pitchers and posted
// lineups; college: the conference's official availability report). When the pick is due on Winners (75 minutes
// before an NFL, college or MLB start, after the NFL inactives; 28 minutes before an NBA tip, after the final
// statuses), the same feed is read again:
//   nothing changed and nobody undecided  -> the pick goes on as before ('clear');
//   something changed, or a player is still undecided -> Gary reads his own write-up and the news and answers
//     whether the pick stands ('stand') or is scratched ('scratch');
//   the feed cannot be read -> the pick goes on as before ('no_feed'), and the log says so.
// A scratched pick stays in the app marked scratched with his reason (SQL scratch_game_pick), is never graded and
// never goes on Winners (seat_the_card and admit_winners_candidate read winners_late_news). NHL is not on Winners.
import { ballDontLieService as bdl } from '../ballDontLieService.js';
import { reconcileNflStatus } from '../nflAvailability.js';
import { getMlbSchedule, getConfirmedLineups } from '../mlbStatsApiService.js';
import { officialAvailabilityForGame } from '../ncaafAvailabilityReports.js';
import { generateSolText } from '../insights/solText.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';

const MIN = 60_000;
/** When a pick is checked (and seats): minutes before the start, and the last minute it may still seat. */
export const CHECK_WINDOW = { NBA: { lead: 28, floor: 10 }, default: { lead: 75, floor: 20 } };
const windowFor = (league) => CHECK_WINDOW[league] || CHECK_WINDOW.default;
const BDL_SPORT = { NFL: 'americanfootball_nfl', NBA: 'basketball_nba' };
const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
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
    if (league === 'NFL' || league === 'NBA') {
      const ids = await teamIds(league, homeTeam, awayTeam);
      if (ids.home == null || ids.away == null) return { unavailable: `no ${league} team ids for ${awayTeam} @ ${homeTeam}` };
      const raw = league === 'NFL'
        ? await bdl.getNflPlayerInjuries([], { ttlMinutes: 2, throwOnError: true })
        : await bdl.getInjuriesGeneric(BDL_SPORT.NBA, { team_ids: [ids.home, ids.away] }, 2);
      const sideOf = (r) => { const id = r?.player?.team?.id ?? r?.team?.id ?? r?.player?.team_id ?? r?.team_id;
        return String(id) === String(ids.home) ? 'home' : String(id) === String(ids.away) ? 'away' : null; };
      const rows = (raw || []).map((r) => {
        const side = sideOf(r);
        if (!side) return null;
        const status = league === 'NFL' ? reconcileNflStatus(r).status : r.status;
        return { side, name: fullName(r.player), position: r.player?.position_abbreviation || r.player?.position || null,
          status: word(status), note: String(r.comment || r.description || '').replace(/\s+/g, ' ').trim() || null };
      }).filter((r) => r?.name);
      return { source: league === 'NFL' ? 'BDL NFL injury feed' : 'BDL NBA injury feed', rows };
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

async function mlbAvailability({ homeTeam, awayTeam, commence }) {
  const schedule = await getMlbSchedule(etDate(commence), { throwOnError: true });
  const game = (schedule || []).find((g) => g.teams?.home?.team?.name === homeTeam && g.teams?.away?.team?.name === awayTeam && sameStart(g.gameDate, commence));
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

// What a listing means, said plainly beside a player not yet ruled in or out (founder, Oct 13 2026: "let Gary
// understand what questionable means", not just that it is undecided).
const MEANING = {
  NBA: 'On the NBA injury report, questionable or day-to-day means the team has not ruled him in or out, and doubtful means he is unlikely to play. Teams can update the report until tip-off.',
  NCAAF: 'On the conference availability report, questionable means the school has not ruled him in or out, and doubtful means he is unlikely to play. The report is updated on game day.',
};

/** The ask: the pick, his own words, the news, one question. */
export function buildLateNewsAsk({ league, pick, matchup, commence, homeTeam, awayTeam, rationale, changes, unresolved }) {
  const team = (side) => (side === 'home' ? homeTeam : awayTeam);
  const line = (r, text) => `- ${team(r.side)}: ${r.name}${r.position ? ` (${r.position})` : ''}, ${text}${r.note ? `. ${r.note}` : ''}`;
  return [
    `You are Gary. Earlier today you made this ${league} pick: ${pick} (${matchup}, ${clock(commence)} ET).`,
    '',
    'What you wrote:',
    String(rationale || '').trim() || '(no write-up stored)',
    '',
    ...(changes.length ? ['Since you made it:', ...changes.map((c) => line(c, `${c.from} → ${c.to}`)), ''] : []),
    ...(unresolved.length ? ['Not ruled in or out yet:', ...unresolved.map((u) => `- ${team(u.side)}: ${u.name}${u.position ? ` (${u.position})` : ''}, ${u.status.toLowerCase()}${u.note ? `. Latest report: ${u.note}` : ''}`),
      MEANING[league] || '', ''].filter((l, i, a) => l !== '' || a[i - 1] !== '') : []),
    'Does the pick stand, or do you scratch it?',
    '',
    'Answer with one JSON object: {"decision": "stand" or "scratch", "why": "one or two sentences; if you scratch it, fans read this"}',
  ].join('\n');
}

export function parseLateNewsAnswer(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]);
    const decision = String(o.decision || '').trim().toLowerCase();
    const why = String(o.why || '').replace(/\s+/g, ' ').trim();
    if (!['stand', 'scratch'].includes(decision) || (decision === 'scratch' && !why)) return null;
    return { decision, why };
  } catch { return null; }
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
export async function runLateNewsChecks(client, date, { now = Date.now(), availability = availabilityNow, generate = generateSolText, log = console } = {}) {
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
    await checkOne(client, c, row.at_pick, { availability, generate, log });
    checked++;
  }
  return checked;
}

async function settle(client, c, fields) {
  const { error } = await client.from('winners_late_news').update({ ...fields, checked_at: new Date().toISOString() }).eq('candidate_id', c.id).is('decision', null);
  if (error) throw error;
}

async function checkOne(client, c, atPick, { availability, generate, log }) {
  const label = `${c.league} ${c.pick_text}`;
  const now = await availability({ league: c.league, homeTeam: c.homeTeam, awayTeam: c.awayTeam, commence: c.commence_time });
  if (now.unavailable) {
    log.warn?.(`[Late news] ${label}: feed unavailable (${now.unavailable}); the pick goes on as before`);
    return settle(client, c, { at_check: { unavailable: now.unavailable }, decision: 'no_feed', why: now.unavailable });
  }
  const before = atPick && !atPick.unavailable && !atPick.late ? atPick : null;
  const { changes, unresolved } = diffAvailability(before, now, c.league);
  if (!changes.length && !unresolved.length) return settle(client, c, { at_check: now, changes: [], unresolved: [], decision: 'clear' });
  const ask = buildLateNewsAsk({ league: c.league, pick: c.pick_text, matchup: c.matchup || `${c.awayTeam} @ ${c.homeTeam}`,
    commence: c.commence_time, homeTeam: c.homeTeam, awayTeam: c.awayTeam, rationale: c.rationale, changes, unresolved });
  let answer = null; let writer = null;
  for (const m of [...new Set([c.model, APP_WRITING_MODEL].filter(Boolean))]) {
    try {
      answer = parseLateNewsAnswer(await generate(ask, { model: m, effort: 'medium', maxTokens: 800 }));
      if (answer) { writer = m; break; }
      log.warn?.(`[Late news] ${label}: ${m} did not answer in the JSON asked for`);
    } catch (e) { log.warn?.(`[Late news] ${label}: ${m} failed (${e?.message || e})`); }
  }
  if (!answer) {
    log.warn?.(`[Late news] ${label}: no answer; the pick goes on as before`);
    return settle(client, c, { at_check: now, changes, unresolved, decision: 'failed', asked: true, why: 'no answer' });
  }
  await settle(client, c, { at_check: now, changes, unresolved, decision: answer.decision, why: answer.why, model: writer, asked: true });
  if (answer.decision === 'scratch') {
    const { data, error } = await client.rpc('scratch_game_pick', { p_candidate_id: c.id, p_reason: answer.why });
    if (error) throw error;
    log.log?.(`[Late news] ✂️  ${label} scratched: ${answer.why} (${JSON.stringify(data)})`);
  } else {
    log.log?.(`[Late news] ${label} stands after the news: ${answer.why}`);
  }
}
