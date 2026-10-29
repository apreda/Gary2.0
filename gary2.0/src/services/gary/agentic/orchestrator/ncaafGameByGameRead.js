/**
 * THE COLLEGE GAME-BY-GAME READ (Oct 27 2026, founder GO; the second system, run beside the live read and never
 * published). All of it from ESPN, one source: each team's schedule (every game's id, venue, neutral site, score) and
 * each game's box (every player on both sides, each score with its quarter and clock, every drive, each team's totals,
 * the score by quarter). Tonight first (the live read's quarterbacks and coaches, availability report, regulars missing
 * from the last game, and schedule, travel and weather, without season totals), then the records of every team in the
 * read, this season's meetings, and each team's last NCAAF_WINDOW games in full, then one line for each older game. An
 * opponent is its record, its FBS or FCS standing and its results; no averages or ranks. The news is the live read's,
 * without recaps of the games shown.
 */
import { sectionOf, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { quarterbacksAndCoaches, availabilityReport, afterIntro, situation } from './ncaafRead.js';
import { newsWithoutRecaps } from './newsWithoutRecaps.js';
import { findEspnCollegeEvent } from '../../../providers/espnCollegeService.js';
import { ncaafSeason } from '../../../../utils/dateUtils.js';
import { getNcaafGameBox, getNcaafRosterPositions, ncaafDriveTally } from '../scoutReport/sports/ncaafGameBox.js';
import { teamStarters, startersAmong } from '../../../sports/ncaaf/ncaafStarters.js';

export const NCAAF_WINDOW = 6;
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const fetched = new Map();
const getJson = (url) => {
  if (!fetched.has(url)) fetched.set(url, fetch(url, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return fetched.get(url);
};
const etDay = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** A team's ESPN profile: name, nickname, FBS or FCS. */
async function teamInfo(id) {
  const t = (await getJson(`${SITE}/teams/${id}`))?.team;
  if (!t) return null;
  // FBS is ESPN's group 80, as a conference's parent or the team's own group; every other group is FCS or below.
  const division = !t.groups ? null : t.groups.parent?.id === '80' || t.groups.id === '80' ? 'FBS' : 'FCS';
  return { id: String(t.id), name: t.displayName, short: t.nickname || t.shortDisplayName || t.displayName, division, college: t.location, abbr: t.abbreviation };
}

/** A team's finished games before `before` (an instant), oldest first: { id, date, venue, neutral, home, us, them }. */
async function finishedGames(teamId, season, before) {
  const events = (await getJson(`${SITE}/teams/${teamId}/schedule?season=${season}`))?.events || [];
  return events.map((e) => {
    const c = e.competitions?.[0]; const comp = c?.competitors || [];
    const us = comp.find((x) => String(x.team?.id) === String(teamId)), them = comp.find((x) => String(x.team?.id) !== String(teamId));
    return { id: String(e.id), date: e.date, final: c?.status?.type?.name === 'STATUS_FINAL', venue: c?.venue ? `${c.venue.fullName}${c.venue.address?.city ? `, ${c.venue.address.city}` : ''}` : null,
      neutral: Boolean(c?.neutralSite), home: us?.homeAway === 'home', ot: Math.max(0, Number(c?.status?.period || 0) - 4),
      us: { id: String(us?.team?.id), name: us?.team?.displayName, short: us?.team?.nickname || us?.team?.shortDisplayName, score: Number(us?.score?.value ?? us?.score) },
      them: { id: String(them?.team?.id), name: them?.team?.displayName, short: them?.team?.nickname || them?.team?.shortDisplayName, score: Number(them?.score?.value ?? them?.score) } };
  }).filter((g) => g.final && Date.parse(g.date) < Date.parse(before)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
const wl = (gs) => { const w = gs.filter((g) => g.us.score > g.them.score).length; return `${w}-${gs.length - w}`; };
const vs = (g) => (g.neutral ? 'vs' : g.home ? 'vs' : '@');
// Overtime from the period count (Oct 27 2026 data loop: Miami's 43-35 win over Florida State in two overtimes read as
// a regulation 8-point win, its quarters "7-7-0-14-7-8").
const result = (g) => `${g.us.score > g.them.score ? 'W' : 'L'} ${g.us.score}-${g.them.score}${g.ot ? ` in ${g.ot > 1 ? `${g.ot} overtimes` : 'overtime'}` : ''}`;

// Each player's position from his team's current ESPN roster, as the NFL and NBA reads show theirs; a player no longer
// on the roster is shown without one. "started" from the official box's lineup (Oct 27 2026 data loop), when a school
// posts it: null `starters` is a game with no lineup on file.
function playerLines(box, teamId, positions = {}, starters = null) {
  // ESPN's "Team" row is the team's own plays (kneel-downs, spikes, a botched snap), not a player (Oct 29 2026 hunt).
  const ps = (box.players || []).filter((p) => p.teamId === String(teamId) && !/^team$/i.test(String(p.name || '').trim()));
  const s = (p, c, k) => p.stats?.[c]?.[k];
  // The starters the box counts nothing for (the offensive line, mostly) are named after, so every game's lineup is whole.
  const lined = ps.filter((p) => s(p, 'passing', 'passingAttempts') || s(p, 'rushing', 'rushingAttempts') || s(p, 'receiving', 'receptions') || s(p, 'defensive', 'totalTackles')
    || s(p, 'defensive', 'sacks') || s(p, 'interceptions', 'interceptions') || s(p, 'defensive', 'passesDefended'));
  const unit = (p) => (s(p, 'passing', 'passingAttempts') || s(p, 'rushing', 'rushingAttempts') || s(p, 'receiving', 'receptions') ? 'offense' : 'defense');
  const lineup = starters ? startersAmong(starters, lined.map((p) => ({ name: p.name, unit: unit(p) }))) : null;
  const who = (p) => { const tags = [positions[p.id], lineup?.started.has(p.name) ? 'started' : null].filter(Boolean); return `${p.name}${tags.length ? ` (${tags.join(', ')})` : ''}`; };
  const off = ps.filter((p) => s(p, 'passing', 'passingAttempts') || s(p, 'rushing', 'rushingAttempts') || s(p, 'receiving', 'receptions'))
    .sort((a, b) => (s(b, 'passing', 'passingAttempts') || 0) - (s(a, 'passing', 'passingAttempts') || 0) || ((s(b, 'rushing', 'rushingAttempts') || 0) + (s(b, 'receiving', 'receptions') || 0)) - ((s(a, 'rushing', 'rushingAttempts') || 0) + (s(a, 'receiving', 'receptions') || 0)))
    .map((p) => `    ${who(p)} ${[s(p, 'passing', 'passingAttempts') ? `${s(p, 'passing', 'completions')}-of-${s(p, 'passing', 'passingAttempts')}, ${s(p, 'passing', 'passingYards')} yds, ${s(p, 'passing', 'passingTouchdowns') || 0} TD, ${s(p, 'passing', 'interceptions') || 0} INT` : null,
      s(p, 'rushing', 'rushingAttempts') ? `${plural(s(p, 'rushing', 'rushingAttempts'), 'carry', 'carries')} ${s(p, 'rushing', 'rushingYards')} yds${s(p, 'rushing', 'rushingTouchdowns') ? ` ${s(p, 'rushing', 'rushingTouchdowns')} TD` : ''}` : null,
      s(p, 'receiving', 'receptions') ? `${plural(s(p, 'receiving', 'receptions'), 'catch', 'catches')} ${s(p, 'receiving', 'receivingYards')} yds${s(p, 'receiving', 'receivingTouchdowns') ? ` ${s(p, 'receiving', 'receivingTouchdowns')} TD` : ''}` : null,
      s(p, 'fumbles', 'fumblesLost') ? `${plural(s(p, 'fumbles', 'fumblesLost'), 'fumble')} lost` : null].filter(Boolean).join(', ')}`);
  // Under defense only defenders: an offensive player's or a specialist's tackle (after a turnover, on a return) is listed
  // apart, as the NFL second system does (Oct 29 2026 hunt: Kansas's quarterback and a guard read as defenders).
  // The roster position decides; with none on file, his stat line (a safety's fake-punt run is still a safety's).
  const offensive = (p) => (positions[p.id] ? /^(QB|RB|FB|WR|TE|OL|OT|OG|OC|C|G|T|IOL|PK|K|P|LS)$/i.test(String(positions[p.id])) : unit(p) === 'offense');
  const defRows = ps.filter((p) => s(p, 'defensive', 'totalTackles') || s(p, 'defensive', 'sacks') || s(p, 'interceptions', 'interceptions') || s(p, 'defensive', 'passesDefended'));
  const defLine = (list) => list.sort((a, b) => (s(b, 'defensive', 'totalTackles') || 0) - (s(a, 'defensive', 'totalTackles') || 0))
    .map((p) => `    ${who(p)} ${[s(p, 'defensive', 'totalTackles') ? plural(s(p, 'defensive', 'totalTackles'), 'tackle') : null, s(p, 'defensive', 'tacklesForLoss') ? `${s(p, 'defensive', 'tacklesForLoss')} for loss` : null,
      s(p, 'defensive', 'sacks') ? plural(s(p, 'defensive', 'sacks'), 'sack') : null, s(p, 'defensive', 'hurries') ? plural(s(p, 'defensive', 'hurries'), 'hurry', 'hurries') : null,
      s(p, 'interceptions', 'interceptions') ? `${s(p, 'interceptions', 'interceptions')} INT` : null, s(p, 'defensive', 'passesDefended') ? plural(s(p, 'defensive', 'passesDefended'), 'pass defended', 'passes defended') : null,
      s(p, 'fumbles', 'fumblesRecovered') ? plural(s(p, 'fumbles', 'fumblesRecovered'), 'fumble recovery', 'fumble recoveries') : null].filter(Boolean).join(', ')}`);
  const def = defLine(defRows.filter((p) => !offensive(p)));
  const otherTackles = defLine(defRows.filter(offensive)).map((x) => x.trim());
  // Every field goal try's distance, as the live read gives them (founder, Oct 24 2026: "FG 0-of-2" needs the 32 and
  // the 55 behind it); the tries come from the play-by-play, a team's own kicker's when it used one.
  const tries = (box.fieldGoals || []).filter((f) => f.teamId === String(teamId));
  const kickers = ps.filter((p) => s(p, 'kicking', 'fieldGoalAttempts'));
  const triesOf = (p) => (kickers.length === 1 ? tries : tries.filter((f) => String(f.kicker || '').toLowerCase().replace(/[^a-z.]/g, '') === `${String(p.first || '').charAt(0)}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '')));
  const distances = (p) => {
    const t = triesOf(p);
    if (t.length !== s(p, 'kicking', 'fieldGoalAttempts') || t.some((f) => f.yards == null)) return 'distances not on file';
    const list = (xs) => xs.map((f) => f.yards).join(', ');
    return [t.some((f) => f.made) ? `made ${list(t.filter((f) => f.made))}` : null, t.some((f) => !f.made && !f.blocked) ? `missed ${list(t.filter((f) => !f.made && !f.blocked))}` : null,
      t.some((f) => f.blocked) ? `blocked ${list(t.filter((f) => f.blocked))}` : null].filter(Boolean).join('; ');
  };
  const kick = ps.filter((p) => s(p, 'kicking', 'fieldGoalAttempts') || s(p, 'kicking', 'extraPointAttempts') || s(p, 'punting', 'punts'))
    .map((p) => `${p.name} ${[s(p, 'kicking', 'fieldGoalAttempts') ? `FG ${s(p, 'kicking', 'fieldGoalsMade')}-of-${s(p, 'kicking', 'fieldGoalAttempts')} (${distances(p)})` : null,
      s(p, 'kicking', 'extraPointAttempts') ? `XP ${s(p, 'kicking', 'extraPointsMade')}-of-${s(p, 'kicking', 'extraPointAttempts')}` : null,
      s(p, 'punting', 'punts') ? `${plural(s(p, 'punting', 'punts'), 'punt')} for ${s(p, 'punting', 'puntYards')} yds, ${s(p, 'punting', 'puntsInside20') || 0} inside the 20` : null].filter(Boolean).join(', ')}`);
  const quiet = lineup ? lineup.unmatched.map((x) => `${x.name}${x.position ? ` (${x.position})` : ''}`) : null;
  return { off, def, otherTackles, kick, quiet, onFile: ps.length > 0 };
}

async function fullGame(g, season, tonight) {
  const box = await getNcaafGameBox(g.id);
  const opp = await teamInfo(g.them.id);
  const head = `${etDay(g.date)} · ${vs(g)} ${g.them.name}${g.neutral ? ' at a neutral site' : ''}${g.venue ? ` (${g.venue})` : ''} · ${result(g)}`;
  if (!box || box.unavailable) return `${head}\n  the box score is not on file (${box?.reason || 'ESPN did not answer'})`;
  const us = box.teams.find((t) => t.id === g.us.id), them = box.teams.find((t) => t.id === g.them.id);
  const q = (t, name) => `${name} ${!t?.quarters?.length ? 'not on file' : `${t.quarters.slice(0, 4).join('-')}${t.quarters.length > 4 ? `, overtime ${t.quarters.slice(4).join('-')}` : ''}`}`;
  const scores = (box.scoring || []).map((p) => `${p.period ? `${ord(p.period)}${p.clock ? ` ${p.clock}` : ''}` : ''} ${p.teamId === g.us.id ? g.us.short : p.teamId === g.them.id ? g.them.short : ''}: ${p.text} (${g.us.short} ${g.home ? p.home : p.away}, ${g.them.short} ${g.home ? p.away : p.home})`.trim());
  const drives = (id, short) => { const ds = (box.drives || []).filter((d) => d.teamId === id); if (!ds.length) return `${short} not on file`; return `${short} ${ds.length} (${ncaafDriveTally(ds.map((d) => d.result || 'other'))})`; };
  const totals = (t, short) => { const x = t?.totals; if (!x) return `${short} not on file`; return `${short} ${x.totalYards ?? '?'} yards (${x.rushingYards ?? '?'} rushing on ${x.rushingAttempts ?? '?'}, ${x.netPassingYards ?? '?'} passing), ${x.firstDowns ?? '?'} first downs, third down ${x.thirdDownEff ?? '?'}, fourth down ${x.fourthDownEff ?? '?'}, ${x.turnovers ?? '?'} turnovers, penalties ${x.totalPenaltiesYards ?? '?'}, possession ${x.possessionTime ?? '?'}`; };
  const lines = [head,
    `  by quarter: ${q(us, g.us.short)} · ${q(them, g.them.short)}`,
    `  scoring: ${scores.length ? scores.join('; ') : 'not on file'}`,
    `  drives: ${drives(g.us.id, g.us.short)} · ${drives(g.them.id, g.them.short)}`,
    `  team: ${totals(us, g.us.short)} · ${totals(them, g.them.short)}`];
  const [usInfo, themInfo] = await Promise.all([teamInfo(g.us.id), opp]);
  const lineups = await Promise.all([[usInfo, themInfo], [themInfo, usInfo]].map(([a, b]) => (a?.college
    ? teamStarters({ college: a.college, abbr: a.abbr }, [{ gameId: g.id, date: g.date, opponent: { college: b?.college, abbr: b?.abbr } }], season).then((m) => m.get(String(g.id)) || null).catch(() => null) : null)));
  for (const [i, side] of [g.us, g.them].entries()) {
    const roster = await getNcaafRosterPositions(side.id).catch(() => null);
    const p = playerLines(box, side.id, roster?.positions || {}, lineups[i]);
    lines.push(`  ${side.name}:${p.onFile ? '' : ' player lines not on file'}`);
    if (p.off.length) lines.push('   offense', ...p.off);
    if (p.def.length) lines.push('   defense', ...p.def);
    if (p.otherTackles.length) lines.push(`   tackles by offensive players and specialists: ${p.otherTackles.join('; ')}`);
    if (p.kick.length) lines.push(`   kicking and punting: ${p.kick.join('; ')}`);
    lines.push(`   ${p.quiet ? `starters with no stat line: ${p.quiet.join(', ') || 'none'}` : 'starting lineup: not on file'}`);
  }
  // The opponent coming in: its division, its record before this game and its games, its record before tonight.
  const oppGames = await finishedGames(g.them.id, season, tonight);
  const prior = oppGames.filter((x) => Date.parse(x.date) < Date.parse(g.date));
  lines.push(`  ${g.them.name} coming in${opp?.division ? ` (${opp.division})` : ''}: ${wl(prior)}${prior.length ? `; ${prior.map((x) => `${etDay(x.date).replace(/^\w+, /, '')} ${result(x)} ${vs(x)} ${x.them.short}`).join('; ')}` : ' (their first game)'} · ${wl(oppGames)} before tonight`);
  return lines.join('\n');
}

// The live read's pointer to its own section, bracketed or bare (Oct 29 2026 hunt: the bare form stayed).
const UNDER_OFFENSE = /(\(?)game by game under CARRIES AND CATCHES, GAME BY GAME(\)?)/g;

/** The game as the second system shows it. `news` is the live read's news for the same game. */
export async function buildNcaafGameByGameStory(desk, { homeTeam, awayTeam, gameDate, commenceTime, asOf = new Date(), season, news = '' } = {}) {
  const tonight = commenceTime || new Date(asOf).toISOString();
  // The season the game falls in, not its UTC year (Oct 29 2026 hunt: January bowls are last year's season).
  const yr = season || ncaafSeason(new Date(tonight));
  const event = await findEspnCollegeEvent({ date: gameDate, homeTeam, awayTeam, commenceTime }).catch(() => null);
  const homeId = event?.homeTeamId || '', awayId = event?.awayTeamId || '';
  const tonightPart = ['TONIGHT',
    `THE QUARTERBACKS AND COACHES\n${quarterbacksAndCoaches(desk, { availability: false })}`,
    // Season totals leave the report's lines (the games are below, game by game).
    // The desk points its regulars to the live read's own game-by-game section; here their games are below (Oct 27 2026
    // data loop: "game by game under CARRIES AND CATCHES, GAME BY GAME" named a section this read doesn't have).
    `THE AVAILABILITY REPORT\n${String(availabilityReport(desk)).replace(/;\s*season:[^\n]*/g, '').replace(UNDER_OFFENSE, '$1in the games below$2')}`,
    `REGULARS WITH NO STAT ROW IN THE LAST GAME\n${String(afterIntro(sectionOf(desk, 'REGULARS WITH NO STAT ROW IN THE LAST GAME'))).replace(/;\s*season:[^\n]*/g, '').replace(UNDER_OFFENSE, '$1in the games below$2')}`,
    `SCHEDULE, TRAVEL AND WEATHER\n${situation(desk)}`].join('\n\n');
  if (!homeId || !awayId) {
    return { line: lineOf(desk), story: [[matchupHeader(desk), spreadInWords(lineOf(desk))].filter(Boolean).join('\n'), tonightPart, 'THE GAMES: not on file (ESPN has no event for this game)'].join('\n\n'), news };
  }
  const [awayGames, homeGames] = await Promise.all([finishedGames(awayId, yr, tonight), finishedGames(homeId, yr, tonight)]);
  // Every team in the read: the two, their opponents, with division and record before tonight.
  const ids = [...new Set([homeId, awayId, ...awayGames.map((g) => g.them.id), ...homeGames.map((g) => g.them.id)])];
  const records = await Promise.all(ids.map(async (id) => { const [t, gs] = await Promise.all([teamInfo(id), finishedGames(id, yr, tonight)]); return t ? `${t.name}${t.division ? ` (${t.division})` : ''} ${wl(gs)}` : null; }));
  const meetings = awayGames.filter((g) => g.them.id === homeId);
  const meetingIds = new Set(meetings.map((g) => g.id));
  const teamPart = async (name, games) => {
    if (!games.length) return `${name.toUpperCase()}: no games yet this season`;
    const newest = games.slice().reverse();
    const full = await Promise.all(newest.slice(0, NCAAF_WINDOW).map((g) => (meetingIds.has(g.id) ? `${etDay(g.date)} ${result(g)} ${vs(g)} ${g.them.short}: in this season's meetings above` : fullGame(g, yr, tonight))));
    const older = newest.slice(NCAAF_WINDOW);
    return [`${name.toUpperCase()}: ${wl(games)}${games.length > NCAAF_WINDOW ? `; the last ${NCAAF_WINDOW} games in full, newest first, then one line for each older game` : ', newest first'}`,
      full.join('\n\n'), older.length ? `Older games, one line each:\n${older.map((g) => `  ${etDay(g.date)} ${result(g)} ${vs(g)} ${g.them.name}`).join('\n')}` : null].filter(Boolean).join('\n\n');
  };
  const story = [[matchupHeader(desk), spreadInWords(lineOf(desk))].filter(Boolean).join('\n'), tonightPart,
    `RECORDS BEFORE TONIGHT (the two teams and every opponent they have played)\n${records.filter(Boolean).join(' · ')}`,
    meetings.length ? `THIS SEASON'S MEETINGS\n${(await Promise.all(meetings.map((g) => fullGame(g, yr, tonight)))).join('\n\n')}` : "THIS SEASON'S MEETINGS: none before tonight",
    await teamPart(awayTeam, awayGames), await teamPart(homeTeam, homeGames)].join('\n\n');
  const finals = new Set([...awayGames, ...homeGames].map((g) => `${g.us.score}-${g.them.score}`));
  return { line: lineOf(desk), story, news: newsWithoutRecaps(news, finals) };
}
