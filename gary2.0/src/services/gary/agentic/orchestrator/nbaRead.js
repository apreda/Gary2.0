// THE NBA READ (Oct 21 2026, founder: "give college the NFL treatment and same with NBA then we can always go back to
// the old NBA if needed"). Every NBA game pick unless GARY_NBA_SYSTEM=april, which runs the April 2026 prompts
// (nbaWinningEra.js) through the agent loop. The NBA's own copy of the NFL read's shape (nflRead.js): the line and how
// it got to this number first, then who's playing and who's out, the season game by game (each team's record and,
// from its sixth game, its per-possession numbers with ranks at the head of its log), the rotation and the spot, plus
// the day's news gathered for the desk. No articles (founder,
// Oct 22 2026, for every sport after TNF's NFL read). He is
// asked what the line is saying, what matters in this game and what doesn't, and which side he likes at this spread;
// then he writes that answer as the card. His instructions are what a sharp knows about NBA markets (nbaKnowledge.js)
// and the date. Nothing weighs, scores or projects for him. The 11-factor research briefing does not run: the desk's
// news is the news, as the NFL's news desk is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { nbaSeason } from '../../../../utils/dateUtils.js';
import { homedir } from 'node:os';
import { nbaSystemPrompt, nbaGameMessage, nbaCardMessage, NBA_FORMAT_ONLY } from './nbaKnowledge.js';
import { esc, sectionOf, matchupHeader, spreadInWords } from './footballDeskText.js';
import { withoutBettingLines, withoutSentences } from './ncaafRead.js';
import { newsWithoutRecaps } from './newsWithoutRecaps.js';
import { etDate } from '../../../sports/nfl/nflBettorData.js';
import { leagueRatingsAt, gameByGame, firstGameDate, teamSeason, nbaTeams, outLastGame, nextGameLine, inStandings, tonightCupLine, cupWords } from '../../../sports/nba/nbaBettorData.js';
import { latestOfficialReport, gameListing, playerKey } from '../../../providers/nbaOfficialInjuryReport.js';
import { calculateRestSituation, formatRestSituation } from '../scoutReport/shared/dataFetchers/recentGames.js';
import { espnVenue } from '../../../sports/nba/espnNbaGame.js';
import { NBA_ARENAS } from '../../../sports/nba/nbaArenas.js';
import { GAME_PICK_MODEL, GAME_ML_CAP } from './orchestratorConfig.js';
import { createModelSession, sendToSessionWithRetry } from './sessionManager.js';
import { createCostTracker } from './costTracker.js';
import { parseGaryResponse } from './responseParser.js';
import { auditPickRationale } from './statAudit.js';
import { buildMlCapRetryMessage } from './passBuilders.js';
import { gameMarketUnavailable } from './mlbCaseMenu.js';
import { moneylinePastCap } from './agentLoop.js';

const NEWS_NOT_ON_FILE = "The news search did not return a report for this game; today's news is not on file.";


/** THE LINE, held for the card: the spread, the moneylines and the tickets, from the desk's BETTING CONTEXT. */
export function nbaLineOf(desk) {
  return sectionOf(desk, 'BETTING CONTEXT').split('\n')
    .filter((l) => /^(?:Spread|Moneyline|Tickets on this game|Total|Over\/Under):/.test(l)).join('\n');
}

// An Eastern clock time written without a year ("Oct 23, 4:00 PM"), as an instant: the year is the pick's, the offset
// the one New York keeps that day.
const MONTH_NUM = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function easternInstant(mon, day, h, min, ampm, asOf) {
  const mo = MONTH_NUM[mon]; const at = new Date(asOf);
  if (mo == null || Number.isNaN(at.getTime())) return null;
  const year = at.getUTCFullYear() + (mo === 0 && at.getUTCMonth() === 11 ? 1 : mo === 11 && at.getUTCMonth() === 0 ? -1 : 0);
  const hour = (Number(h) % 12) + (ampm === 'PM' ? 12 : 0);
  for (const off of [4, 5]) {
    const d = new Date(Date.UTC(year, mo, Number(day), hour + off, Number(min)));
    if (Number(d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' })) === hour) return d.toISOString();
  }
  return null;
}
// The tip, from the desk's header ("Sport: NBA | Friday, Oct 23, 4:00 PM EDT").
export function tipOf(desk, asOf) {
  const m = String(desk || '').match(/^Sport: [^|\n]+\| \w+, (\w{3}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM) E[DS]T$/m);
  return m ? easternInstant(m[1], m[2], m[3], m[4], m[5], asOf) : null;
}
export const reportDay = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });

// The injury report as reported, in plain facts. The desk's labels steer ("PRICED IN", "ESTABLISHED ABSENCES (already
// reflected in line + all stats above — do NOT cite these players by name as reasons for your pick)"); the read keeps
// what each label stood on: since when, and how many games the team has played without him. Before a team's first
// game its entries carry no tag ("[out for the opener]" read as Out beside a Questionable status). The desk's
// established tier holds anyone missing from the recent box scores, Questionable included (Dean Wade, newly signed,
// read as "ALREADY OUT" on Oct 22). Each team's players now sit in one list, away team first as in the game log: the
// tiers' headings ("NEW, UNCERTAIN OR PROBABLE") named a judgment, and each player's own tag and first listing carry
// what they stood on (Oct 23 2026 data audit). A team with nobody on the report says so. The projected starters'
// heading that sits inside the section is theirs, not the report's.
export function injuriesAsReported(desk, { homeTeam = null, awayTeam = null } = {}) {
  const teams = new Map([['AWAY', null], ['HOME', null]]);
  let side = null;
  for (const raw of sectionOf(desk, 'INJURY REPORT').split('\n')) {
    // The desk's "Team Share: 18.5% PTS | 14.3% REB | 15.0% FGA" under a player is a season rate, and the read took it
    // for the head of the players listed after it (Oct 27 2026 data audit); his games are in the log.
    if (!raw.trim() || /^TODAY'S DATE|^Official NBA injury report: |^STARTING LINEUPS \(|^ACTIVE INJURIES$|^ESTABLISHED ABSENCES|^[─━]+$|^\s*Team Share:/.test(raw)) continue;
    const h = raw.match(/^\[(HOME|AWAY)\] ([^:]+):\s*(.*)$/);
    if (h) {
      side = h[1];
      const t = teams.get(side) || { name: h[2], rows: [], notes: [] };
      if (h[3]) t.notes.push(h[3]);
      teams.set(side, t);
      continue;
    }
    const l = raw
      .replace(/ ?\[SEASON OPENER — no regular-season games played yet\]/, '')
      .replace(/\[SEASON-LONG(?:: (\d+))?\]/, (m, n) => (n ? `[not in any of the team's last ${n} game${n === '1' ? '' : 's'}]` : '[has not played in any of the team\'s recent games]'))
      // The desk's "Since" date is the last game he played (Oct 29 2026 hunt: "[since Oct 28, 1 days, 0 games missed]" for
      // Meleek Thomas, 20 minutes on Oct 28).
      .replace(/\[(?:FRESH|SHORT-TERM|PRICED IN|LONG-TERM|OUT) — Since ([^(\]]+) \((\d+)d(?:, ([^)]+))?\)\]/, (m, since, days, missed) => `[last played ${since.trim()}, ${days} day${days === '1' ? '' : 's'} ago${missed ? `; ${missed.replace(/missed$/, 'missed since')}` : ''}]`)
      .replace(/\[(?:FRESH|SHORT-TERM|PRICED IN|LONG-TERM|OUT) \(([^)]+)\)\]/, '[$1]')
      .replace(/\[(?:FRESH|SHORT-TERM|PRICED IN|LONG-TERM)\]/, '').replace(/\s+$/, '');
    if (side && teams.get(side)) teams.get(side).rows.push(l);
  }
  if (![...teams.values()].some(Boolean)) return '';
  const out = [];
  for (const [tag, t] of teams) {
    const name = t?.name || (tag === 'HOME' ? homeTeam : awayTeam);
    if (!name) continue;
    if (t?.rows.length) out.push(`[${tag}] ${name}:\n${t.rows.join('\n')}${t.notes.length ? `\n  ${t.notes.join('; ')}` : ''}`);
    else out.push(`[${tag}] ${name}: ${t?.notes.join('; ') || 'nobody listed'}`);
  }
  return out.join('\n');
}

// Which official report the desk read, for who was Out last game and is not listed tonight (the read no longer shows
// its time, Oct 27 2026). A desk records it ("Official NBA injury report: Oct 22, 5:30 PM ET"); an older desk is matched
// to the report at or just before the pick whose rows for this game are the desk's own rows.
// A player's position, when on file, sits between his name and his status: "• Marcus Smart (G) (Out) - ".
const ROW = /^\s*• (.+?)(?: \([A-Z]{1,2}(?:-[A-Z]{1,2})?\))? \(([^)]+)\) - /;
const statusKey = (s) => String(s || '').slice(0, 4).toLowerCase();
function deskRows(desk) {
  const out = new Map();
  for (const l of sectionOf(desk, 'INJURY REPORT').split('\n')) { const m = l.match(ROW); if (m) out.set(playerKey(m[1]), statusKey(m[2])); }
  return out;
}
export async function reportOfDesk(desk, { homeTeam, awayTeam, gameDate, asOf }) {
  const said = (sectionOf(desk, 'INJURY REPORT').match(/^Official NBA injury report: (\w{3}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM) ET$/m));
  if (said) {
    const at = easternInstant(said[1], said[2], said[3], said[4], said[5], asOf);
    return at ? { postedAt: at } : null;
  }
  if (/^Official NBA injury report: report time not on file$/m.test(sectionOf(desk, 'INJURY REPORT'))) return null;
  const mine = deskRows(desk);
  const slot = Math.floor(new Date(asOf).getTime() / 900_000) * 900_000;
  for (let t = slot; t > slot - 2 * 3_600_000; t -= 900_000) {
    const report = await latestOfficialReport({ now: new Date(t), lookbackHours: 0.25 }).catch(() => null);
    if (!report) continue;
    const listing = gameListing(report, gameDate, homeTeam, awayTeam);
    const theirs = new Map();
    for (const side of Object.values(listing)) {
      if (side === 'unfiled') continue;
      for (const [k, r] of side) if (r.status !== 'Available' && !/g league - two-way/i.test(r.reason)) theirs.set(k, statusKey(r.status));
    }
    if (theirs.size === mine.size && [...mine].every(([k, s]) => theirs.get(k) === s)) return { postedAt: report.postedAt };
  }
  return null;
}

// The injury list as reported, without the report's clock time or when each player was first listed and how his
// status went (Oct 27 2026, founder: "he knows the spread is X and X player is now out or X player is now playing").
// Both came in on Oct 23 to match a line move to the news; with the line's path gone they read as news the number might
// not hold yet ("If the 1.5 was set while Thompson was still questionable", "I can't see where this line opened"; 22 of
// 24 reads Oct 24-26 reasoned about what the spread already priced). How long a player has been out stays on his row.
function injurySection(desk, { homeTeam, awayTeam }) {
  const text = injuriesAsReported(desk, { homeTeam, awayTeam });
  return text ? `Official NBA injury report:\n${text}` : 'Official NBA injury report: not on file.';
}

/** The players the league lists Available for tonight, with what they are listed for (Oct 27 2026 data check: Miami read
 * "nobody listed" with Pelle Larsson, 36 minutes in its last game, listed Available with a left finger sprain), from the
 * report the injury list came from. '' when nobody is. */
export async function availableListed(desk, { homeTeam, awayTeam, tip, asOf, seasons = null }) {
  const gameDate = reportDay(tip || asOf);
  const anchor = await reportOfDesk(desk, { homeTeam, awayTeam, gameDate, asOf }).catch(() => null);
  if (!anchor) return '';
  try {
    const listing = gameListing(await latestOfficialReport({ now: new Date(anchor.postedAt), lookbackHours: 0.25 }), gameDate, homeTeam, awayTeam);
    const lines = [];
    for (const [tag, team, ts] of [['AWAY', awayTeam, seasons?.[1]], ['HOME', homeTeam, seasons?.[0]]]) {
      const side = listing[team];
      if (!side || side === 'unfiled') continue;
      // A player Out for the team's last game is listed once, under that (Oct 29 2026 hunt: Dybantsa read twice).
      const back = new Set((ts ? await outLastGame(ts, side).catch(() => []) : []).filter((r) => r.available).map((r) => playerKey(r.name)));
      const rows = [...side.values()].filter((r) => r.status === 'Available' && !/g league - two-way/i.test(r.reason) && !back.has(playerKey(r.name)));
      const why = (r) => String(r.reason || '').replace(/^Injury\/Illness - /, '').trim();
      if (rows.length) lines.push(`[${tag}] ${team}: ${rows.map((r) => `${r.name}${why(r) && why(r) !== '-' ? ` (${why(r)})` : ''}`).join('; ')}`);
    }
    return lines.length ? `Listed Available on the same report:\n${lines.join('\n')}` : '';
  } catch { return ''; }
}

// From the same report as the injury list, each team's players who were Out for its last game and are not listed
// tonight, or listed Available (Oct 27 2026 data audit; see outLastGame).
async function outLastGameSection(desk, seasons, { homeTeam, awayTeam, tip, asOf }) {
  const gameDate = reportDay(tip || asOf);
  const anchor = await reportOfDesk(desk, { homeTeam, awayTeam, gameDate, asOf }).catch(() => null);
  if (!anchor) return "Out for the team's last game, and not listed tonight: not on file (the report the injury list came from is not on file).";
  const span = (r) => (r.allGames ? (r.games === 1 ? 'its only game' : r.games === 2 ? 'both of its games' : `all ${r.games} of its games`) : r.games === 1 ? 'its last game' : `its last ${r.games} games`);
  try {
    const listing = gameListing(await latestOfficialReport({ now: new Date(anchor.postedAt), lookbackHours: 0.25 }), gameDate, homeTeam, awayTeam);
    const lines = [];
    for (const [tag, team, ts] of [['AWAY', awayTeam, seasons[1]], ['HOME', homeTeam, seasons[0]]]) {
      const back = await outLastGame(ts, listing[team]);
      if (back.length) lines.push(`[${tag}] ${team}: ${back.map((r) => `${r.name} (Out for ${span(r)}${r.reason && r.reason !== '-' ? `: ${r.reason}` : ''}${r.available ? '; listed Available tonight' : ''})`).join('; ')}`);
    }
    return lines.length ? `Out for the team's last game, and not listed Out, Doubtful, Questionable or Probable tonight:\n${lines.join('\n')}` : '';
  } catch (e) {
    return `Out for the team's last game, and not listed tonight: not on file (${e.message})`;
  }
}

// The starting fives come from a web search's projection; the read says so above them (Oct 23 2026 audit: the
// desk's heading never reached Gary). A projected starter the injury report lists Out or Doubtful says so in the five
// (Oct 29 2026 hunt, round 7: Golden State's projection had Draymond Green at center six lines above "Draymond Green
// (Out)"; he did not play).
export function projectedStarters(desk) {
  const five = sectionOf(desk, 'STARTING LINEUPS');
  if (!five) return '';
  const listed = new Map();
  for (const l of sectionOf(desk, 'INJURY REPORT').split('\n')) {
    const m = l.match(/^\s*•\s*(.+?)(?: \([A-Z]{1,2}(?:-[A-Z]{1,2})?\))? \((Out|Doubtful)\) - /);
    if (m) listed.set(playerKey(m[1]), m[2]);
  }
  const marked = five.split('\n').map((l) => l.replace(/^(\[(?:HOME|AWAY)\] [^:]+: )(.*)$/, (all, head, list) => head + list.split(/, (?=[^,()]+\()/)
    .map((p) => { const [, name, pos] = p.match(/^(.*?)(?: \(([A-Z]{1,2})\))?$/); const st = listed.get(playerKey(name)); return st ? `${name} (${pos ? `${pos}; ` : ''}${st} on the injury report)` : p; }).join(', '))).join('\n');
  return `Projected starters (a web search's projection, not confirmed):\n${marked}`;
}


// A team before its first game: the desk's BEFORE THE FIRST GAME block for it (this season's roster and who left),
// without last season's finish (founder, Oct 23 2026, every sport: "last season is old news").
function beforeFirstGame(desk, team) {
  const block = sectionOf(desk, 'BEFORE THE FIRST GAME');
  const i = block.search(new RegExp(`^\\[(?:HOME|AWAY)\\] ${esc(team)}$`, 'm'));
  if (i < 0) return '';
  const rest = block.slice(i).split('\n');
  const end = rest.findIndex((l, k) => k > 0 && /^\[(?:HOME|AWAY)\] /.test(l));
  // This season's roster in the present tense: who is on it and who is new to the team, without where anyone was last
  // season or who left (the read turned "left since last season" into "thinner than last year"; Oct 23 2026 audit).
  return (end > 0 ? rest.slice(1, end) : rest.slice(1))
    .filter((l) => !/^\s*(?:Last season|Left since last season)\b/.test(l))
    .map((l) => l.replace(/back from last season: /, '').replace(/; new: /, '; new to the team: ').replace(/ \((?:no NBA games in|20\d\d-\d\d with)[^)]*\)/g, ''))
    .join('\n').trim();
}

// The head of each team's game log (Oct 23 2026: HOW GOOD THEY ARE went, a heading that told Gary what to conclude;
// what it held that the log does not is here): the record from the team's own games, from the tenth game the
// conference place and the home and road records (before that a place among teams tied at 1-0 is the feed's tie order,
// "Cavaliers #15 in East (0-0)", and a split is a game or two). No per-possession numbers (Oct 26 2026: a season rate
// blends the nights a starter sat with the nights he played, the NBA's version of the Bears' backup-quarterback games;
// the games themselves are in the log). A team before its first game says so once, here, with this season's roster.
const RATINGS_MISSING = Symbol('ratings missing');
/** The league's ratings at `asOf`, or a marker the heads print as "opponents' records: not on file" (Oct 29 2026 hunt,
 * round 7: the Winners board swallowed a failed load and dropped every opponent's record without a word). */
export const ratingsOrMissing = (asOf = new Date()) => leagueRatingsAt(asOf).catch((e) => ({ [RATINGS_MISSING]: e.message }));
function teamHead(desk, ratings, team, ts) {
  if (!ts) return { text: `${team}: this season's games not on file.` };
  if (!ts.games.length) {
    const before = beforeFirstGame(desk, team);
    return { text: `${team}: no games yet; tonight is its first game of the season.${before ? `\n${before}` : ''}` };
  }
  // The standings' games: not the postseason and not the NBA Cup final (Oct 29 2026 hunt, round 7).
  const regular = ts.games.filter(inStandings);
  const w = regular.filter((g) => (g.home_team?.id === ts.id ? g.home_team_score > g.visitor_team_score : g.visitor_team_score > g.home_team_score)).length;
  // The record only: no conference place and no home and road records (Oct 29 2026, founder: "Gary shouldn't have to be
  // told that a team is first or last"; every game below says home or away).
  const head = `${team} (${w}-${regular.length - w})`;
  const missing = ratings[RATINGS_MISSING];
  const rated = missing ? `opponents' records: not on file (the league's ratings did not load: ${missing})` : null;
  return { head, rated, text: `${head}${rated ? `\n  ${rated}` : ''}` };
}
async function gameLog(desk, ratings, team, asOf, ts, meetingUnder = null) {
  const h = teamHead(desk, ratings, team, ts);
  if (!h.head) return h.text;
  const log = await gameByGame(team, ratings[RATINGS_MISSING] ? {} : ratings, asOf, { head: h.head, data: ts, meetingUnder }).catch(() => `${h.head}: games not on file.`);
  return h.rated ? log.replace(/^(.*)\n/, `$1\n  ${h.rated}\n`) : log;
}

// SCHEDULE AND TRAVEL (the heading names the data; Oct 24 2026) from the same games as the log: days off since each team's last game, where that game was, tonight's
// trip and a tip outside the usual evening (Oct 23 2026 data audit). A team before its first game is left out (its
// log says so).
// Where each team's last game and tonight's game are played, from ESPN (Oct 29 2026 hunt, round 7: Houston at San
// Antonio in Austin read "at home vs Houston" for the Spurs and "at San Antonio" for the Rockets, and the Lakers' game
// at the Clippers "at Los Angeles"). The schedule feed has no venue. Null where ESPN has none: the team's city stays.
const cityOfTeam = (t) => (t?.city === 'LA' ? 'Los Angeles' : t?.city) || null;
async function lastGameWhere(ts) {
  const g = ts?.games?.[0];
  if (!g) return null;
  const v = await espnVenue(g).catch(() => null);
  if (!v?.city) return null;
  const home = g.home_team?.id === ts.id;
  const opp = home ? g.visitor_team : g.home_team;
  const hostCity = NBA_ARENAS[g.home_team?.abbreviation]?.city;
  const away = v.city !== hostCity;
  if (v.neutral) return `vs ${cityOfTeam(opp)} at a neutral site in ${v.city}`;
  if (home) return `at home vs ${cityOfTeam(opp)}${away ? `, played in ${v.city}` : ''}`;
  return `at ${cityOfTeam(opp) === ts.city ? `the ${opp.name}` : cityOfTeam(opp)}${away || cityOfTeam(opp) === ts.city ? ` in ${v.city}` : ''}`;
}
async function tonightWhere(seasons, homeTeam, awayTeam, tip) {
  const [h, a] = seasons;
  const abbrOf = (ts) => ts?.games?.[0] && (ts.games[0].home_team?.id === ts.id ? ts.games[0].home_team : ts.games[0].visitor_team)?.abbreviation;
  const v = tip ? await espnVenue({ date: etDate(tip), home_team: { name: h?.nickname || homeTeam }, visitor_team: { name: a?.nickname || awayTeam } }).catch(() => null) : null;
  const hostCity = NBA_ARENAS[abbrOf(h)]?.city;
  if (!v?.city || !hostCity) return null;
  if (v.neutral) return { home: `at a neutral site in ${v.city}`, away: `at a neutral site in ${v.city}` };
  if (v.city === hostCity) return null;
  return { home: `a home game played in ${v.city}`, away: `at ${h?.city || homeTeam}, played in ${v.city}` };
}
async function situation(seasons, homeTeam, awayTeam, tip, asOf) {
  const at = tip || new Date(asOf).toISOString();
  const rest = [homeTeam, awayTeam].map((team, i) => (seasons[i]?.games?.length ? calculateRestSituation(seasons[i].games, at, team) : null));
  const [homeWhere, awayWhere, tonight] = await Promise.all([lastGameWhere(seasons[0]), lastGameWhere(seasons[1]), tonightWhere(seasons, homeTeam, awayTeam, tip)]);
  return formatRestSituation(homeTeam, awayTeam, rest[0], rest[1], { city: seasons[0]?.city || null, tip, where: { home: homeWhere, away: awayWhere }, tonight })
    .split('\n').filter((l) => !/: Rest data unavailable$/.test(l)).join('\n').trim();
}

// THE NEWS GARY READS: the desk's news search (the part after its own injury lists), without betting lines, past
// seasons, the preseason, numbers that are not a regular-season box score before the pick, and the lines those leave
// orphaned. A paragraph, bullet or table row that fails leaves whole: dropping one sentence left the next one's numbers
// under the wrong game (Oct 23 2026 data audit: a preseason "5-for-36" read as the opener).
const NEWS_MARK = "--- TODAY'S GAME CONTEXT & NEWS ---";
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/\*+/g, '');

// The news search still quotes last season and the preseason ("Last season it averaged 40.8 three-point attempts", Oct
// 21 2026; founder, Oct 23 2026, every sport: "last season is old news"). A season written "2025-26" counts only when
// it isn't this one. Departures from last season's roster, last season's awards and "last spring" are last season too
// (Oct 23 2026 data audit: Gary's Spurs and Nuggets reads leaned on "with Lu Dort and Isaiah Joe having departed"); a
// player who leaves a game is this season.
const PAST_SEASON = /\blast[- ]season\b|\blast year\b|\bprevious[- ]seasons?\b|\bprior[- ]seasons?\b|\ba year ago\b|\bpreseasons?\b|\bexhibitions?\b|\bpower rankings?\b|\bconference finals\b|\bAll-NBA\b|\bAll-Star (?:selections?|appearances?)\b|\bAll-Defensive\b|\bAll-Rookie\b|\bof the Year\b|\bsummer league\b|\bscrimmages?\b|\bintrasquad\b|\btraining camp\b|\bplayoffs?\b|\bdefending champion|\brookie season\b|\bMVP\b|\bpostseason\b|\bhaving departed\b|\b(?:offseason|summer|free-agent|free agency) departures?\b|\bdepart(?:ed|s|ure|ures)\b(?= (?:in|during|via) (?:free agency|the offseason|the summer)\b| (?:from )?the (?:team|roster|franchise|organization)\b| (?:to|for) (?!the locker)[A-Z])|\bleft (?:\S+ ){0,3}in free agency\b|\b(?:traded|dealt) away\b|\blast (?:spring|summer)\b|\breturns (?:its|their|all of its|all of their) (?:top|entire|core|starting)\b/i;
const pastSeasonLabel = (x, season) => [...String(x).matchAll(/\b(20\d\d)[-–](\d\d)\b/g)].some((m) => Number(m[1]) < season);
// A rate from a game or two (Oct 23 2026 audit: "84.7 points per 100 possessions during Embiid's 33 minutes").
const SHORT_RATE = /per 100 possessions|offensive rating|defensive rating|net rating|true shooting|effective field goal/i;
const pastSeasonLine = (p, season) => PAST_SEASON.test(p) || pastSeasonLabel(p, season) || SHORT_RATE.test(p);

// Dates before the first game. A month written alone counts when it was last season, before the league year turned on
// July 1 ("in April", "hired in May"; Oct 23 2026 data audit); a trade "in July" made this season's roster. A full date
// before the first game counts when its sentence reports a game ("Dallas's last game was a 135-111 home loss to
// Atlanta on October 16" was a preseason game); a roster move, a contract or a schedule change dated then is this
// season's news (Oct 23 2026: the Bucks' 3 p.m. tip, moved on October 16 for the World Series, and the Bulls' October
// 17 cuts had left with the preseason games). A date takes its most recent year up to ten days past the pick ("March 5"
// in October is last March).
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const MONTH = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATED = new RegExp(`\\b(${MONTH}|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?\\s+(\\d{1,2})(?![\\d:])\\b`, 'g');
const MONTH_ALONE = new RegExp(`\\b(?:in|since|during|from|until|through|by|early|late|mid-|last|back in|this past)\\s+(${MONTH})\\b(?!\\s+\\d)`, 'g');
const GAME_REPORT = /\b(?:beat(?! (?:writers?|reporters?)\b)|beats|beaten|beating|defeated|edged|routed|fell to|lost to|lost at|lost by|loss to|loss at|win over|win against|won at|won against|won by|victory|scored|finished with|shot|outscored|points|rebounds|assists|finale)\b|\b(?:[6-9]\d|1\d\d)\s?[–-]\s?(?:[6-9]\d|1\d\d)\b/i;
const sentencesOf = (p) => plain(p).replace(/\b(Jr|Sr|St|Mr|vs)\./g, '$1').split(/(?<=[.!?])\s+(?=[A-Z"“|-])/);
function beforeTheSeason(p, start, asOf) {
  if (!start) return false;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const at = new Date(asOf || Date.now());
  const yearOf = (mo, day) => { let y = at.getUTCFullYear(); while (Date.UTC(y, mo, day) > at.getTime() + 10 * 86_400_000) y -= 1; return y; };
  const datedGame = sentencesOf(p).some((s) => GAME_REPORT.test(s)
    && [...s.matchAll(DATED)].some((m) => { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; return Date.UTC(yearOf(mo, Number(m[2])), mo, Number(m[2])) < startMs; }));
  const leagueYear = Date.UTC(new Date(startMs).getUTCFullYear() - (new Date(startMs).getUTCMonth() < 6 ? 1 : 0), 6, 1);
  const alone = [...plain(p).matchAll(MONTH_ALONE)].some((m) => { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; return Date.UTC(yearOf(mo, 1), mo + 1, 1) <= leagueYear; });
  return datedGame || alone;
}

// SCORES AND STAT LINES ARE CHECKED AGAINST THE BOX SCORES (Oct 23 2026 data audit: a team that had not played reached
// Gary through its exhibitions, "Jokić 7-for-8" and "Evan was elite", so the two sides were measured on different kinds
// of game). A number stays when it is a regular-season final or box-score line from before the pick: a final score, a
// player's or a team's points, rebounds, assists, steals, blocks, turnovers, fouls, threes or shooting. A number tied
// to a part of a game (a quarter, the paint, the bench) cannot be checked and stands, and so does one for a team past
// its fifth game, whose earlier boxes are not loaded. A player of a team with no games yet has no box: his stat lines
// leave, and so does what he did on a court said without a number.
const WORD_NUMS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const N = `(\\d{1,3}(?:\\.\\d)?|${Object.keys(WORD_NUMS).join('|')})`;
const numOf = (x) => (/^\d/.test(x) ? Number(x) : WORD_NUMS[x.toLowerCase()]);
const STAT_KEYS = [['points', 'pts'], ['pts', 'pts'], ['offensive rebounds', 'oreb'], ['rebounds', 'reb'], ['assists', 'ast'], ['steals', 'stl'], ['blocks', 'blk'], ['turnovers', 'turnover'], ['fouls', 'pf'], ['made threes', 'fg3m'], ['threes', 'fg3m'], ['three-pointers', 'fg3m'], ['3-pointers', 'fg3m']];
const STAT = new RegExp(`\\b${N} (${STAT_KEYS.map(([w]) => w).join('|')})\\b`, 'gi');
const PAIR = new RegExp(`\\b${N}[- ](?:for|of)[- ]${N}\\b`, 'gi');
const SHOT_CONTEXT = /^[\s\w-]{0,30}?(?:shooting|from the field|from the floor|from three|from deep|from the line|three-point|3-point|free throws?|field goals?|shots|attempts|FG|3PT|FT)\b/i;
const SCORE = /\b(\d{2,3})\s?[–-]\s?(\d{2,3})\b/g;
const NAMED_SCORE = /\b[A-Z][a-z]+(?: [A-Z][a-z]+)? (\d{2,3}), [A-Z][a-z]+(?: [A-Z][a-z]+)? (\d{2,3})\b/g;
const PART_OF_GAME = /^[^.;]{0,45}?\b(?:quarter|half\b|halftime|overtime|in the paint|fast[- ]break|off turnovers|second[- ]chance|bench|off the bench|stretch|minutes? remaining|final \w+ minutes|opening \w+ minutes|run\b|in transition)/i;
const IN_GAME = /\b(?:lead|led|leading|trail(?:ed|ing)?|advantage|cut|deficit|pushed|ahead|behind|within|after (?:one|two|three) quarters|at halftime|at the half|at the break|run)\b/i;
const ANAPHOR = /^\s*(?:\*\*)?(?:That|This(?! report\b)|These|Those|It|Its|They|Their|He|His|She|Her|Both|The (?:scrimmage|game|finale|exhibition|performance|outing|showing))\b/;
// A game told without a checkable number: what a player did on a court said in the past ("Mobley supplied the strongest
// impression", "Evan was elite") and how a game went ("Boston recovered from a 14-point third-quarter deficit"). For a
// team with no games yet that game was the preseason (Oct 23 2026: both came through for opening-night teams). A skill
// named in the present ("Mitchell's scoring", "Tyson's shooting") is not a game (two previews of the Cavaliers'
// opener had left over it).
const GAME_TOLD = /\b(?:deficit|comeback|recovered|rallied|tying|tied the game|go-ahead|overtime|quarter|halftime|first half|second half|trailed|outscored|rested|recap|final margin|won(?!['’]t)|lost|beat(?! (?:writers?|reporters?)\b)|defeated|win over|loss to|finale|scrimmage|exhibition)\b/i;
const PERFORMANCE = /\b(?:impression|impressed|impressive|was elite|stood out|looked (?:sharp|good|great|strong|rusty|comfortable)|scored|finished with|poured in|posted|tallied|shot \d|went \d|played \d+ minutes|in \d+ minutes)\b|\bled\b[^.;]{0,30}\bin (?:scoring|rebounding|assists)\b/i;

/** What the news is checked against: both teams' regular-season games before the pick, their box scores, every player
 * the desk names (one with no box this season has no stat line to match) and the league's other teams. */
export function newsFacts(seasons, names, league = []) {
  const finals = [], teamRows = [], players = new Map(), teamWords = new Set(), complete = new Set(), zero = new Set(), zeroWords = new Set();
  const add = (name, team, row, own) => {
    const p = players.get(plain(name)) || { team: null, rows: [] };
    if (row) p.rows.push(row);
    if (own || !p.team) p.team = team;
    players.set(plain(name), p);
  };
  for (const ts of seasons) {
    if (!ts) continue;
    if (!ts.games.length) { zero.add(ts.team); for (const w of [ts.city, ts.nickname]) if (w) { zeroWords.add(plain(w)); teamWords.add(plain(w)); } }
    if (ts.boxes.filter(Boolean).length >= ts.games.length) complete.add(ts.team);
    for (const g of ts.games) {
      if (g.postseason) continue;
      finals.push([g.home_team_score, g.visitor_team_score]);
      for (const t of [g.home_team, g.visitor_team]) for (const w of [t?.city, t?.name]) if (w) teamWords.add(plain(w));
    }
    ts.boxes.forEach((box, i) => {
      if (!box) return;
      const game = ts.games[i]?.id;
      teamRows.push(box.totals, box.opponent.totals);
      for (const p of box) add(p.name, ts.team, { ...p, game, opp: box.opponent.fullName }, true);
      for (const p of box.opponent) add(p.name, box.opponent.fullName, { ...p, game, opp: box.fullName || ts.team }, false);
    });
  }
  for (const [team, list] of names) for (const n of list) add(n, team, null, false);
  const tonight = new Set([...names.keys(), ...seasons.filter(Boolean).map((ts) => ts.id)]);
  const here = new Set(seasons.filter(Boolean).flatMap((ts) => [ts.city, ts.nickname]).filter(Boolean).map(plain));
  const others = league.filter((t) => !tonight.has(t.id) && !tonight.has(t.full_name)).flatMap((t) => [t.city === 'LA' ? 'Los Angeles' : t.city, t.name]).filter(Boolean).map(plain).filter((w) => !here.has(w));
  return { finals, teamRows, players, teamWords, complete, zero, zeroWords: [...zeroWords], tonight, here, allComplete: seasons.every((ts) => ts && complete.has(ts.team)),
    // A game count past the most either team has played is not this season's ("7.8 points in 69 games as a rookie").
    maxGames: seasons.every(Boolean) ? Math.max(...seasons.map((ts) => ts.games.length)) : Infinity,
    elsewhere: others.length ? new RegExp(`\\b(?:[Aa]gainst|[Vv]s\\.?|[Vv]ersus|[Ii]n|[Aa]t|[Oo]ver) (?:the )?(?:${[...new Set(others)].map(esc).join('|')})\\b|\\b(?:${[...new Set(others)].map(esc).join('|')})(?:'s)? (?:game|shooting|performance|outing|showing|win|loss)\\b`) : null };
}
// Every player the desk names for each team: the projected starters, the injury report, the rotation and the roster
// before the first game.
function deskNames(desk, homeTeam, awayTeam) {
  const out = new Map([[homeTeam, new Set()], [awayTeam, new Set()]]);
  const add = (team, n) => { const name = String(n || '').replace(/\s*\((?:rookie|[A-Z]{1,2})\)$/, '').trim(); if (team && /^[A-Z][\w'’.-]+(?: [\w'’.-]+){1,3}$/.test(name)) out.get(team)?.add(name); };
  const sideOf = (tag) => (tag === 'HOME' ? homeTeam : awayTeam);
  for (const l of sectionOf(desk, 'STARTING LINEUPS').split('\n')) {
    const m = l.match(/^\[(HOME|AWAY)\] [^:]+: (.+)$/);
    if (m) for (const p of m[2].split(', ')) add(sideOf(m[1]), p.replace(/ \([A-Z]{1,2}\)$/, ''));
  }
  let team = null;
  for (const l of [...sectionOf(desk, 'INJURY REPORT').split('\n'), ...sectionOf(desk, 'AVAILABLE ROSTER').split('\n')]) {
    const h = l.match(/^\[(HOME|AWAY)\] /); if (h) team = sideOf(h[1]);
    const inj = l.match(ROW); if (inj) add(team, inj[1]);
    const ros = l.match(/^ {2}(\S[^-]+?) - [\d.]+ PPG/); if (ros) add(team, ros[1]);
  }
  for (const t of [homeTeam, awayTeam]) {
    for (const l of beforeFirstGame(desk, t).split('\n')) for (const p of l.replace(/^[^:]*: /, '').split(/, |; new to the team: /)) add(t, p);
  }
  return new Map([...out].map(([k, v]) => [k, [...v]]));
}

// The names in a sentence, in order: full names, then last names not inside one. Names that sit together ("Simons
// and Caldwell-Pope") form one group, and a number after them may be their sum.
function namesIn(sentence, facts) {
  const hits = [];
  const taken = [];
  const free = (i, len) => !taken.some(([a, b]) => i < b && i + len > a);
  for (const name of facts.players.keys()) {
    for (const m of sentence.matchAll(new RegExp(`\\b${esc(name)}\\b`, 'g'))) { hits.push({ at: m.index, end: m.index + name.length, names: [name] }); taken.push([m.index, m.index + name.length]); }
  }
  const byLast = new Map();
  for (const name of facts.players.keys()) {
    const last = name.split(' ').filter((w) => !/^(?:Jr|Sr|II|III|IV)\.?$/.test(w)).pop();
    if (last && last.length >= 3) byLast.set(last, [...(byLast.get(last) || []), name]);
  }
  for (const [last, list] of byLast) {
    for (const m of sentence.matchAll(new RegExp(`\\b${esc(last)}\\b`, 'g'))) if (free(m.index, last.length)) { hits.push({ at: m.index, end: m.index + last.length, names: list }); taken.push([m.index, m.index + last.length]); }
  }
  const teams = [...facts.teamWords].flatMap((w) => [...sentence.matchAll(new RegExp(`\\b${esc(w)}\\b`, 'g'))].map((m) => ({ at: m.index, end: m.index + w.length, team: true })));
  const groups = [];
  for (const h of [...hits, ...teams].sort((a, b) => a.at - b.at)) {
    const prev = groups[groups.length - 1];
    if (prev && !h.team && !prev.team && /^(?:'s)?\s*(?:,|and|&|,\s*and)?\s*$/.test(sentence.slice(prev.end, h.at))) { prev.members.push(h.names); prev.end = h.end; } else groups.push(h.team ? { ...h } : { at: h.at, end: h.end, members: [h.names] });
  }
  return groups;
}
// A claim about whoever a name may be: it holds when one of them has a matching row, and it stands unchecked when one
// of them is past the boxes on file (a team after its fifth game, or a third team's player).
const rowsOf = (facts, n) => facts.players.get(n)?.rows || [];
const checkable = (facts, n) => facts.complete.has(facts.players.get(n)?.team);
const claimOk = (facts, names, test) => names.some((n) => rowsOf(facts, n).some(test)) || !names.every((n) => checkable(facts, n));
function groupOk(facts, members, key, value, each) {
  if (members.length === 1 || each) return members.every((names) => claimOk(facts, names, (r) => r[key] === value));
  // A group's number may be their total in one game (Simons and Caldwell-Pope's 23 in New York).
  const games = new Set(members.flatMap((names) => names.flatMap((n) => rowsOf(facts, n).map((r) => r.game))));
  const sumIn = (game) => members.reduce((a, names) => a + (names.map((n) => rowsOf(facts, n).find((r) => r.game === game)?.[key]).find((x) => x != null) ?? 0), 0);
  return [...games].some((game) => sumIn(game) === value) || members.every((names) => claimOk(facts, names, (r) => r[key] === value))
    || !members.every((names) => names.every((n) => checkable(facts, n)));
}
const averageOk = (facts, members, key, value) => members.length === 1 && members[0].some((n) => {
  if (!checkable(facts, n)) return true;
  const rows = rowsOf(facts, n).filter((r) => r.min > 0);
  return rows.length > 0 && Math.abs(rows.reduce((a, r) => a + r[key], 0) / rows.length - value) < 0.051;
});
/** The numbers in one paragraph, bullet or table row of news that are not a regular-season final or box-score line
 * from before the pick. */
function uncheckedNumbers(line, facts) {
  const bad = [];
  // A table row reads as its first cell's: "| Tyler Herro | 31:55 | 24 points, nine assists; 9-for-21 shooting |" (Oct
  // 23 2026: each cell read alone had no name, and eight correct rows left the Bucks' and Bulls' tables).
  const cells = /^\s*\|/.test(line) ? plain(line).split('|').map((c) => c.trim()).filter(Boolean) : null;
  const sentences = cells ? cells.slice(1).map((c) => `${cells[0]}: ${c}`) : sentencesOf(line);
  let carry = null;
  const zeroIn = (s, groups) => groups.some((g) => !g.team && g.members.some((names) => names.some((n) => facts.zero.has(facts.players.get(n)?.team))))
    || facts.zeroWords.some((w) => new RegExp(`\\b${esc(w)}\\b`).test(s));
  // A "finale" for a team yet to play was its preseason finale, wherever in the paragraph it falls ("Ott's assessment
  // after the finale was direct ... His praise of Green", Oct 23 2026).
  const whole = cells ? cells.join(' ') : sentences.join(' ');
  if (/\bfinale\b/i.test(whole) && zeroIn(whole, namesIn(whole, facts))) bad.push('the preseason finale');
  for (const m of whole.matchAll(/\b(?:in|over|across|through|of)\s+(?:(?:his|their|its|the|those)\s+)?(?:(?:first|last|past|previous)\s+)?(\d{1,3})\s+(?:games|appearances|starts|outings|contests)\b/gi)) if (Number(m[1]) > facts.maxGames) bad.push(m[0]);
  for (const sentence of sentences) {
    const groups = namesIn(sentence, facts);
    // "He", "his" and "him" are the player named last before them in the paragraph ("Bailey's strongest recent storyline
    // is defensive development. Against San Antonio, he produced six points").
    const he = /\b(?:he|his|him)\b/i.test(sentence) ? carry : null;
    // A team named as where or whom a game was against ("26 points and six assists at Sacramento") is not the stat's
    // owner when a player is named before it (Oct 29 2026 hunt: Avdija's correct line left the news).
    // A team named just before "game", "loss" or "win" is the opponent too ("his seven-point Memphis game"; round 10).
    const place = (g) => g.team && (/\b(?:at|against|vs\.?|versus|in|over|to|from|beat|beating)\s+(?:the\s+)?$/i.test(sentence.slice(0, g.at))
      || /^\s*(?:game|loss|win|matchup|contest)\b/i.test(sentence.slice(g.end)));
    const ownerAt = (i) => {
      const before = [...groups].reverse().filter((x) => x.end <= i);
      const g = before.find((x) => !place(x) || !before.some((y) => !y.team && y.end <= x.at)) || null;
      return he && (!g || g.team) ? he : g;
    };
    const isFinal = (a, b) => facts.finals.some(([h, v]) => (h === a && v === b) || (h === b && v === a));
    for (const re of [SCORE, NAMED_SCORE]) {
      for (const m of sentence.matchAll(re)) {
        const a = Number(m[1]), b = Number(m[2]);
        if (a < 60 || b < 60 || isFinal(a, b)) continue;
        if (IN_GAME.test(sentence) && facts.finals.some(([h, v]) => (a <= h && b <= v) || (a <= v && b <= h))) continue;
        bad.push(m[0]);
      }
    }
    for (const m of sentence.matchAll(PAIR)) {
      const after = sentence.slice(m.index + m[0].length);
      if (!/-/.test(m[0]) && !SHOT_CONTEXT.test(after) && !/(?:shot|shooting|made|making|hit|hitting|went|connected on)\s*$/i.test(sentence.slice(0, m.index))) continue;
      if (PART_OF_GAME.test(after)) continue;
      const made = numOf(m[1]), att = numOf(m[2]);
      const pairs = (r) => [[r.fgm, r.fga], [r.fg3m, r.fg3a], [r.ftm, r.fta]].some(([x, y]) => x === made && y === att);
      const owner = ownerAt(m.index);
      // A sentence naming no one can be about the paragraph's player ("Wednesday's scoring line was 12 points on 4-for-12
      // shooting", under Jalen Johnson's lines).
      const ok = owner && !owner.team ? owner.members.every((names) => claimOk(facts, names, pairs))
        : facts.teamRows.some(pairs) || !facts.allComplete || (!owner && carry && carry.members.every((names) => claimOk(facts, names, pairs)));
      if (!ok) bad.push(m[0]);
    }
    for (const m of sentence.matchAll(STAT)) {
      // "five of nine threes": nine is the attempts, checked with the pair above (round 10).
      if (/\b\S+[- ](?:of|for)[- ]$/i.test(sentence.slice(0, m.index))) continue;
      const after = sentence.slice(m.index + m[0].length);
      const perGame = /^\s*(?:per game|a game|a night)\b/i.test(after);
      if (!perGame && PART_OF_GAME.test(after)) continue;
      const key = STAT_KEYS.find(([w]) => w === m[2].toLowerCase())[1];
      const value = numOf(m[1]);
      const owner = ownerAt(m.index);
      if (!owner || owner.team) {
        // A team's own count: its final score or its box (a points number under 60 is part of a game). A count with no
        // one named before it stands, unless it is a points total no final has; or it is the paragraph's player's.
        const fits = (key === 'pts' ? value < 60 || facts.finals.some(([h, v]) => h === value || v === value) : facts.teamRows.some((r) => r[key] === value) || !facts.allComplete)
          || (!owner && carry && !perGame && groupOk(facts, carry.members, key, value, false));
        if (!fits && (owner || key === 'pts')) bad.push(m[0]);
        continue;
      }
      const each = /\b(?:apiece|each)\b/i.test(after.slice(0, 20));
      const ok = perGame || String(m[1]).includes('.') ? averageOk(facts, owner.members, key, value) : groupOk(facts, owner.members, key, value, each);
      if (!ok) bad.push(m[0]);
    }
    // A team with no games yet, or one of its players, in a game or against a team it does not play tonight: the
    // preseason ("His rebounding in Houston", "Against Charlotte, his shooting and distribution worked together"). The
    // other city is the team that has played when the sentence names it too ("Simons and Caldwell-Pope supplied 23
    // points in New York, while Cleveland's supporting group includes Tyson's shooting").
    const playedToo = groups.some((g) => (g.team ? facts.here.has(sentence.slice(g.at, g.end)) && !facts.zeroWords.includes(sentence.slice(g.at, g.end))
      : g.members.some((names) => names.some((n) => { const t = facts.players.get(n)?.team; return facts.tonight.has(t) && !facts.zero.has(t); }))));
    // "Fouled out" against the box's fouls, game by game when the sentence names the opponents (Oct 29 2026 hunt: "He
    // fouled out against Minnesota and Charlotte"; he had 5 fouls against Minnesota).
    for (const m of sentence.matchAll(/\bfoul(?:ed|s)? out\b/gi)) {
      const owner = ownerAt(m.index);
      if (!owner || owner.team) continue;
      const named = [...facts.teamWords].filter((w) => new RegExp(`\\b${esc(w)}\\b`).test(sentence.slice(m.index)));
      const vs = (r, w) => plain(String(r.opp || '')).includes(w);
      const ok = owner.members.every((names) => (named.length
        ? named.every((w) => claimOk(facts, names, (r) => vs(r, w) && r.pf >= 6) || !names.some((n) => rowsOf(facts, n).some((r) => vs(r, w))))
        : claimOk(facts, names, (r) => r.pf >= 6)));
      if (!ok) bad.push(m[0]);
    }
    const away = facts.elsewhere?.test(sentence) && !playedToo && !/\b(?:tonight|today|next|upcoming|will)\b/i.test(sentence);
    if (zeroIn(sentence, [...groups, ...(he ? [he] : [])]) && (PERFORMANCE.test(sentence) || GAME_TOLD.test(sentence) || away)) bad.push('a game by a team with no games yet');
    const last = [...groups].reverse().find((g) => !g.team);
    if (last) carry = last;
  }
  return bad;
}

// The news's own table of the projected starters repeats WHO IS PLAYING (Oct 23 2026: every rebuilt story had both).
const POSITION_CELL = /^(?:point guard|shooting guard|small forward|power forward|center|guard|forward|wing|big|position|pg|sg|sf|pf|c|g|f)$/i;
function startersTables(lines, desk) {
  const last = (n) => plain(n).toLowerCase().replace(/\s*\([a-z]{1,2}\)$/, '').replace(/,?\s+(?:jr|sr|ii|iii|iv)\.?$/, '').trim().split(' ').pop();
  const starters = new Set(sectionOf(desk, 'STARTING LINEUPS').split('\n')
    .flatMap((l) => (l.match(/^\[(?:HOME|AWAY)\] [^:]+: (.+)$/)?.[1] || '').split(', ')).filter(Boolean).map(last));
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i]) || (i > 0 && /^\s*\|/.test(lines[i - 1]))) continue;
    let e = i; while (e + 1 < lines.length && /^\s*\|/.test(lines[e + 1])) e += 1;
    const body = lines.slice(i + 1, e + 1).filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    const cells = body.flatMap((l) => l.split('|').map((c) => plain(c).trim()).filter(Boolean));
    if (starters.size && cells.length && cells.every((c) => POSITION_CELL.test(c) || starters.has(last(c)))) for (let k = i; k <= e; k += 1) out.push(k);
  }
  // The same projected fives as bullets ("- **Memphis:** Ty Jerome, Cedric Coward, ...", round 14): a bullet whose names
  // are all one side's projected starters repeats WHO IS PLAYING.
  if (starters.size) for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^\s*[-*]\s+(?:\*\*[^*]+:\*\*|[A-Z][\w .'-]+:)\s*(.+)$/);
    const names = m ? m[1].split(/,\s*/).map((x) => x.trim()).filter(Boolean) : [];
    if (names.length >= 4 && names.every((x) => starters.has(last(x)))) out.push(i);
  }
  return out;
}

// A line up to its last sentence ("Jr." and "p.m." end none).
function beforeLastSentence(line) {
  let cut = 0;
  for (const m of line.matchAll(/[.!?](?:\*\*)?\s+(?=[A-Z*"“])/g)) if (!/\b(?:Jr|Sr|St|Mr|Mrs|Dr|vs|[ap]\.m|[A-Z])\.$/.test(line.slice(0, m.index + 1))) cut = m.index + m[0].length;
  return line.slice(0, cut).trim();
}
// Lines left without what they introduced or referred to: an intro ending in ":" with nothing under it, a table with
// no rows, a heading with nothing after it, and a "That ..." after a dropped paragraph (Oct 23 2026 data audit).
function withoutOrphans(lines, drop) {
  const blank = (i) => !lines[i].trim();
  const nextIdx = (i) => { let k = i + 1; while (k < lines.length && blank(k)) k += 1; return k < lines.length ? k : -1; };
  const prevIdx = (i) => { let k = i - 1; while (k >= 0 && blank(k)) k -= 1; return k; };
  const listy = (i) => /^\s*(?:[-•*]\s|\|)/.test(lines[i]);
  // A bold line or a markdown heading (round 14: "### Breaking news" stayed over nothing).
  const heading = (i) => /^\s*(?:\*\*[^*]+\*\*|#{1,6}\s+\S.*?)\s*$/.test(lines[i]);
  for (let pass = 0, changed = true; changed && pass < 4; pass += 1) {
    changed = false;
    const set = (i) => { if (!drop[i]) { drop[i] = true; changed = true; } };
    for (let i = 0; i < lines.length; i += 1) {
      if (drop[i] || blank(i)) continue;
      // A table whose rows all left takes its header and rule with it.
      if (/^\s*\|/.test(lines[i]) && (i === 0 || !/^\s*\|/.test(lines[i - 1]))) {
        let e = i; while (e + 1 < lines.length && /^\s*\|/.test(lines[e + 1])) e += 1;
        const body = [...Array(e - i + 1).keys()].map((k) => i + k).filter((k) => !/^\s*\|[\s|:-]+\|\s*$/.test(lines[k])).slice(1);
        if (body.length && body.every((k) => drop[k])) for (let k = i; k <= e; k += 1) set(k);
      }
      if (/:\s*(?:\*\*)?\s*$/.test(lines[i]) && !listy(i)) {
        const n = nextIdx(i);
        let orphan = n < 0;
        if (n >= 0 && listy(n)) { let e = n; const kids = []; while (e < lines.length && (listy(e) || blank(e))) { if (!blank(e)) kids.push(e); e += 1; } orphan = kids.every((k) => drop[k]); } else if (n >= 0) orphan = drop[n];
        // Only the intro's own sentence goes: "**Tonight's matchup — Philadelphia at New York, 7 p.m. EDT, NBC.** Both
        // reported starting lineups remain projected:" keeps its tip and TV (Oct 23 2026).
        if (orphan) {
          const rest = beforeLastSentence(lines[i]);
          if (rest && rest !== lines[i].trim()) { lines[i] = rest; changed = true; } else set(i);
          continue;
        }
      }
      // A bullet ending in ':' whose deeper bullets all left goes the same way (round 16: "Rotowire's projections (Oct. 29,
      // unconfirmed):" over two dropped starters tables).
      if (/:\s*(?:\*\*)?\s*$/.test(lines[i]) && listy(i)) {
        const depth = (k) => lines[k].match(/^\s*/)[0].length;
        const kids = []; for (let k = i + 1; k < lines.length; k += 1) { if (blank(k)) continue; if (depth(k) <= depth(i)) break; kids.push(k); }
        if (kids.length && kids.every((k) => drop[k])) {
          const rest = beforeLastSentence(lines[i]);
          if (rest && rest !== lines[i].trim() && !/^\s*[-•*]\s*(?:\*\*[^*]+\*\*)?\s*$/.test(rest)) { lines[i] = `${lines[i].match(/^\s*[-•*]\s/)[0]}${rest.replace(/^[-•*]\s*/, '')}`; changed = true; } else set(i);
          continue;
        }
      }
      if (ANAPHOR.test(lines[i]) && !listy(i)) { const p = prevIdx(i); if (p >= 0 && drop[p] && !heading(p)) set(i); }
      // A bold heading straight over another (a team's name over its "Current storylines") owns everything to the next
      // such parent heading, its own subheadings included (round 12: the Kings' storylines read under the Pelicans' name
      // when the team heading went for having no line before its first subheading).
      if (heading(i)) {
        // From the desk as written: a heading straight over another, or (round 15: the Kings' heading, over a dropped first
        // paragraph, went and its storylines read under the Pelicans') one over only dropped lines and then a subheading,
        // when it is not itself a subheading straight under a heading (round 16: Utah's first subsection, emptied, read as a
        // parent and took the team heading with it).
        const overDropped = (k) => { const n = nextIdx(k); if (n < 0 || heading(n) || !drop[n]) return false;
          let j = n; while (j < lines.length && (blank(j) || (drop[j] && !heading(j)))) j += 1; return j < lines.length && heading(j); };
        const parentAt = (k) => heading(k) && nextIdx(k) >= 0 && (heading(nextIdx(k)) || (overDropped(k) && !(prevIdx(k) >= 0 && heading(prevIdx(k)))));
        const parent = parentAt(i);
        let k = i + 1, kept = false;
        while (k < lines.length && !(parent ? parentAt(k) : heading(k))) { if (!blank(k) && !drop[k] && !heading(k)) { kept = true; break; } k += 1; }
        if (!kept) set(i);
      }
    }
  }
  return drop;
}

// What the search did not find, the report's filing as the search saw it, and two-way players' G League duty are not
// news (Oct 29 2026 hunt: rows for three two-way players read "No accessible, dated coach statement ... was found by the
// cutoff. His uncertainty concerns G League two-way availability."; "The latest official PDF accessible ... contained
// neither team's individual submission" sat under an injury list from the 1:00 PM report with both teams filed). A
// bullet or table row left with only its name goes too.
// The wider forms (Oct 29 2026 hunt, round 7: today's Kings read kept "His uncertainty concerns two-way/G League
// availability." three times, "No confirmed starting lineup ... was verified by the 3:00:12 p.m. Eastern research
// cutoff." and "The supplied official reports identify no uncertain Sacramento player."): a "No ..." sentence that ends
// on what the search could not verify or find, any "No ..." sentence about the cutoff, what the supplied reporting held,
// and the search answering its own request ("omitted here as requested").
const NOTHING_FOUND = /^(?:No|Neither)\b[^.]*\b(?:statements?|updates?|reporting|reports?|coverage)\b[^.]*\b(?:was|were|has been|had been)?\s*(?:found|established|located|identified|confirmed)\b|^(?:No|Neither)\b.*\b(?:was|were|could be|has been|had been) (?:independently )?(?:verified|found|located|identified|available)\W*$|^A search result\b/i;
const FILING = /\b(?:official|league|injury)\b[^.]*\b(?:PDF|submissions?|report|document)\b[^.]*\b(?:timestamped|issued at|not (?:yet )?(?:filed|submitted)|had not filed|individual submission|contained neither)\b|\bsupplied (?:official )?(?:reports?|reporting|material) (?:identif(?:y|ies|ied)|establishe[sd]|contained|contains) no\b/i;
const TWO_WAY = /\bG League two-way\b|\btwo-way (?:G League )?(?:availability|assignment|duty)\b|\btwo-way\s*\/\s*G League\b|\bG League\s*\/\s*two-way\b/i;
const SEARCH_EMPTY = /^(?:No|Neither)\b.*\b(?:cutoff|supplied (?:material|reporting))\b|^As of the (?:research )?cutoff\b.*\bno verified\b|^This report (?:reflects|covers)\b|\bfound no (?:such )?(?:announcement|statement|update|report)s?\b/i;
const ASKED = /\b(?:as requested|in the request|the request(?:ed)? (?:list|format))\b/i;
// The search describing itself in other words (round 10: "per search summary", "page inaccessible, search snippet only",
// "None have reported", "There was no verified announcement", "No Memphis DNP list was available").
const SEARCH_NOTE = /\bper search summary\b|\bpage inaccessible\b|\bsearch snippets?\b|\bcould not be (?:established|verified|confirmed)\b|\breports? reviewed\b|\bunverified\b|^There (?:was|were) (?:also )?no\b[^.]*\b(?:announcements?|updates?|reports?|statements?|reporting)\b|\bdesignations are omitted\b|\bwithout repeating (?:their|the) official designations\b|\bdisplayed no publication time\b|\bparticipation reporting appears below\b|\bunresolved players identified\b|^None (?:have|has) (?:reported|said)\b|^No \w+ DNP list was available\b|\bsupplied\b[^.]{0,40}\breporting\b/i;
// A season average or per-game rate (round 10: "Avdija leads the team at 22.3 points, 7.0 rebounds and 6.3 assists per
// game", and two of them wrong); the log carries every game.
const AVERAGE = /\baverag(?:e|es|ed|ing)\b[^.]*\d|\d+(?:\.\d+)?\s+(?:points|rebounds|assists|steals|blocks|threes|three-pointers|minutes|turnovers)\s+(?:per game|a game|a night|per contest)\b/i;
// A minutes limit or plan is tonight's news, not an average (round 13: "limit them to around 30 minutes a game").
const MINUTES_PLAN = /\b(?:restrict\w*|limit\w*|cap(?:ped|s)?|minutes (?:restriction|limit)|managed|ramp\w*)\b/i;
// Month abbreviations do not end a sentence for these tests ("No Oct. 29 update was found").
const unAbbrev = (s) => s.replace(/\b(Jan|Feb|Mar|Apr|Aug|Sept?|Oct|Nov|Dec)\./g, '$1');
// More of the search's own notes (round 14): "Nothing has been reported specifically about ...", "No ... has been
// reported", "This is the latest item found", "None. The official pregame report remains the final word", "... at the
// cutoff".
const SEARCH_NOTE_2 = /^(?:Nothing (?:has been|was|is) reported|No\b[^.]*\b(?:was|were|has been|have been|is|are) reported\b|This (?:is|was) the latest item found|None\.?\s*$|None\.? (?:The official|Nothing)|The official (?:pregame )?(?:injury )?report remains the final word|.*\bat the cutoff\b)/i;
const emptyNews = (raw) => { const s = unAbbrev(raw); return SEARCH_NOTE_2.test(s.replace(/^\W*\*\*[^*]+:\*\*\s*/, '').replace(/^\W+/, '')) || NOTHING_FOUND.test(s.replace(/^\W+/, '')) || SEARCH_EMPTY.test(s.replace(/^\W+/, '')) || FILING.test(s) || TWO_WAY.test(s) || ASKED.test(s)
  || SEARCH_NOTE.test(s.replace(/^\W+/, '')) || (AVERAGE.test(s) && !MINUTES_PLAN.test(s)); };
function withoutEmptyNews(text) {
  // A bullet that leaves takes its deeper-indented sub-bullets with it (round 11: "He had a 14-point, 10-rebound game"
  // was left under Jrue Holiday when Robert Williams III's line went).
  let dropUnder = null;
  const indent = (l) => l.match(/^\s*/)[0].length;
  return String(text || '').split('\n').map((l) => {
    if (dropUnder != null) { if (l.trim() && indent(l) > dropUnder) return null; dropUnder = null; }
    const kept = keepLine(l);
    if (kept === null && /^\s*[-*•]\s/.test(l)) dropUnder = indent(l);
    return kept;
  }).filter((l) => l !== null).join('\n');
}
// One news line with its empty sentences out (a table row cell by cell), or null when nothing is left.
function keepLine(l) {
  if (/^\s*\|/.test(l)) {
    const cells = l.split('|');
    if (cells.length < 4 || /^\s*:?-{2,}/.test(cells[1] || '')) return l;
    const rest = cells.slice(2, -1).map((c) => withoutSentences(c.trim(), emptyNews));
    return rest.every((c) => !c.trim()) ? null : [cells[0], cells[1], ...rest.map((c) => ` ${c} `), cells[cells.length - 1]].join('|');
  }
  const lead = l.match(/^(\s*(?:[-*•]\s+)?(?:\*\*[^*]+\*\*[:.]?\s*)?)/)[1];
  const body = withoutSentences(l.slice(lead.length), emptyNews);
  return body.trim() || !l.slice(lead.length).trim() ? lead + body : null;
}

/** The news Gary reads (see above). `facts` is newsFacts' check list; `start` the first game date of the two teams. */
export function newsForGary(desk, { facts = null, start = null, asOf = new Date(), season = nbaSeason() } = {}) {
  const state = sectionOf(desk, 'CURRENT STATE & CONTEXT');
  const i = state.indexOf(NEWS_MARK);
  const text = i >= 0 ? state.slice(i + NEWS_MARK.length) : '';
  // The search's own opening line ("I'll use the latest roster news ...") is its note to itself, not news.
  const lines = withoutEmptyNews(withoutBettingLines(text.trim().replace(/^I(?:’|')ll [^\n]*\n+|^I will [^\n]*\n+/, ''))).split('\n');
  // TV and radio listings carry nothing about the game (round 16: "WUAB, Rock Entertainment Sports Network and DAZN, with
  // radio coverage on WTAM 1100").
  const broadcast = (l) => /^\s*(?:[-•*]\s*)?\*\*(?:TV|Radio|Broadcast|Television|Streaming)[^*]*:?\*\*/i.test(l) || /\b(?:listings? include|radio coverage|broadcast on|televised on)\b/i.test(l);
  const drop = lines.map((l) => Boolean(l.trim()) && (pastSeasonLine(l, season) || beforeTheSeason(l, start, asOf) || broadcast(l) || Boolean(facts && uncheckedNumbers(l, facts).length)));
  for (const k of startersTables(lines, desk)) drop[k] = true;
  withoutOrphans(lines, drop);
  return lines.filter((_, k) => !drop[k]).filter((p, k, a) => p.trim() || (k > 0 && a[k - 1].trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** One game on Gary's NBA board (winners/nbaBoard.js), read the way the pick reads it, without his write-up: the spread,
 * who's playing, each team's season so far and the situation. */
// Each game on the board, newest first, with the opponent's record now (Oct 24 2026: the NFL and college boards list
// their games; the NBA's gave the record alone).
function boardGames(ts, league = {}) {
  if (!ts?.games?.length) return null;
  return `  games, newest first: ${ts.games.map((g) => {
    const home = g.home_team?.id === ts.id;
    const opp = home ? g.visitor_team : g.home_team;
    const us = home ? g.home_team_score : g.visitor_team_score, them = home ? g.visitor_team_score : g.home_team_score;
    const o = league[opp?.full_name];
    return `${us > them ? 'W' : 'L'} ${us}-${them} ${home ? 'vs' : '@'} ${opp?.name || opp?.full_name}${o ? ` (${o.w}-${o.l} now)` : ''}${g.postseason ? ' (postseason)' : ''}${cupWords(g.ist_stage) ? ` (${cupWords(g.ist_stage).replace(/; the game counts in the standings$/, '')})` : ''}`;
  }).join(', ')}`;
}

export async function buildNbaBoardEntry(desk, { homeTeam, awayTeam, gameId, tip = '', asOf = new Date(), ratings = {} } = {}) {
  const tipAt = tipOf(desk, asOf);
  const [injuries, seasons] = await Promise.all([
    injurySection(desk, { homeTeam, awayTeam }),
    Promise.all([homeTeam, awayTeam].map((t) => teamSeason(t, asOf).catch(() => null))),
  ]);
  const [back, cup] = await Promise.all([outLastGameSection(desk, seasons, { homeTeam, awayTeam, tip: tipAt, asOf }), tonightCupLine(homeTeam, awayTeam, tipAt).catch(() => null)]);
  return [`### ${awayTeam} at ${homeTeam}${tip ? ` · ${tip} ET` : ''}`, ...(cup ? [cup] : []),
    spreadInWords(nbaLineOf(desk)) || 'The spread is not on file.', '',
    'Who is playing:', [projectedStarters(desk), injuries, back].filter(Boolean).join('\n\n'), '',
    'This season:', [[awayTeam, seasons[1]], [homeTeam, seasons[0]]].map(([t, ts]) => [teamHead(desk, ratings, t, ts).text, boardGames(ts, ratings)].filter(Boolean).join('\n')).join('\n\n'), '',
    'Schedule and travel:', (await situation(seasons, homeTeam, awayTeam, tipAt, asOf)) || 'Nothing unusual.'].join('\n');
}

/** The game as Gary reads it. `asOf` cuts the season at the moment of the pick; `league` (tests only) stands in for the
 * league's ratings. */
export async function buildNbaReadStory(desk, { homeTeam, awayTeam, gameId, book = null, asOf = new Date(), league = null } = {}) {
  // The spread he bets, said once in the header; not the line's path, the opener, the total or the moneylines (founder,
  // Oct 23 2026: the market is other people's opinions, and Gary reads the game; see nbaKnowledge.js).
  const [ratings, seasons] = await Promise.all([
    league ? Promise.resolve(league) : leagueRatingsAt(asOf).catch((e) => ({ [RATINGS_MISSING]: e.message })),
    Promise.all([homeTeam, awayTeam].map((t) => teamSeason(t, asOf).catch(() => null))),
  ]);
  const line = nbaLineOf(desk);
  const tip = tipOf(desk, asOf);
  const [homeLog, awayLog, injuries, back, available, nextGames, cup] = await Promise.all([
    gameLog(desk, ratings, homeTeam, asOf, seasons[0], awayTeam),
    gameLog(desk, ratings, awayTeam, asOf, seasons[1]),
    injurySection(desk, { homeTeam, awayTeam }),
    outLastGameSection(desk, seasons, { homeTeam, awayTeam, tip, asOf }),
    availableListed(desk, { homeTeam, awayTeam, tip, asOf, seasons }),
    Promise.all([awayTeam, homeTeam].map((t) => nextGameLine(t, tip).catch(() => null))),
    tonightCupLine(homeTeam, awayTeam, tip).catch(() => null),
  ]);
  const parts = [
    [matchupHeader(desk), cup, spreadInWords(line)].filter(Boolean).join('\n'),
    ['WHO IS PLAYING', [projectedStarters(desk), injuries, available, back].filter(Boolean).join('\n\n')],
    ['THIS SEASON, GAME BY GAME', `${awayLog}\n\n${homeLog}`],
    ['SCHEDULE AND TRAVEL', [await situation(seasons, homeTeam, awayTeam, tip, asOf), ...nextGames.filter(Boolean)].filter(Boolean).join('\n')],
  ];
  const [starts, teams] = await Promise.all([
    Promise.all([homeTeam, awayTeam].map((t) => firstGameDate(t).catch(() => null))).then((d) => d.filter(Boolean).sort()),
    nbaTeams().catch(() => []),
  ]);
  const facts = newsFacts(seasons, deskNames(desk, homeTeam, awayTeam), teams);
  // Recaps of the games the log shows leave the news (newsWithoutRecaps.js): the log has each one's score and quarters,
  // the newest five their boxes, and a recap can put a real number under the wrong game.
  const boxed = new Set(seasons.filter(Boolean).flatMap((ts) => ts.games.slice(0, 15)).map((g) => `${g.home_team_score}-${g.visitor_team_score}`));
  return { line, story: parts.map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n'), news: newsWithoutRecaps(newsForGary(desk, { facts, start: starts[0], asOf }), boxed) };
}

export async function runNbaRead({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NBA read: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const game = options.game || {};
    const asOf = new Date();
    const { line, story, news } = await buildNbaReadStory(desk, { homeTeam, awayTeam, gameId: game.id ?? options.gameId, book: game.line_vendor, asOf });
    console.log(`[NBA Read] the game as Gary reads it (${story.length} chars; news ${news.length} chars)`);

    const system = nbaSystemPrompt(today);
    const session = await createModelSession({
      _costTracker: costTracker,
      modelName: options.modelOverride || GAME_PICK_MODEL,
      allowPersonalAccount: options.allowPersonalAccount,
      routePinned: options.routePinned,
      codexHomes: options.codexHomes,
      systemPrompt: system,
      tools: null,
      browse: false,
      thinkingLevel: options.thinkingLevel || process.env.GARY_BRAIN_EFFORT || 'xhigh',
      enableCache: true,
    });
    // Every turn is recorded; the stat audit reads only the system and user turns (what he was given).
    const messages = [{ role: 'system', content: system }];
    const ask = async (text) => {
      messages.push({ role: 'user', content: text });
      const response = await sendToSessionWithRetry(session, text);
      messages.push({ role: 'assistant', content: response.content || '' });
      return response.content || '';
    };
    const parse = (text) => parseGaryResponse(text, homeTeam, awayTeam, sport, game);

    // A desk whose news search failed carries no news section; that says so (Oct 23 2026 source audit).
    const read = await ask(nbaGameMessage(story, news || NEWS_NOT_ON_FILE));
    console.log(`[NBA Read] ${session.modelName}: read (${read.length} chars); asking for the card`);
    try {
      const dir = `${homedir()}/Library/Logs/gary-nba-read`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/${etDate(options.gameTime || asOf)}_${awayTeam.split(' ').pop()}_at_${homeTeam.split(' ').pop()}.md`,
        `########## SYSTEM\n${system}\n\n########## ASKED\n${messages[1].content}\n\n########## ANSWERED\n${read}`);
    } catch (e) { console.warn(`[NBA Read] transcript not saved: ${e.message}`); }
    let answer = await ask(nbaCardMessage(line));
    let pick = parse(answer);
    if (!pick) {
      console.log('[NBA Read] No JSON block in the card — asking for the format only');
      answer = await ask(NBA_FORMAT_ONLY);
      pick = parse(answer);
    }
    if (!pick) return { error: 'NBA read: no parseable pick', code: 'invalid_final_answer', homeTeam, awayTeam, sport, rawAnalysis: answer };
    // HOUSE LIMIT (founder, Aug 18): a moneyline heavier than the cap gets one corrective ask, as in the agent loop.
    if (moneylinePastCap(pick)) {
      console.warn(`[NBA Read] 🧱 HOUSE LIMIT: "${pick.pick}" is heavier than ${GAME_ML_CAP} — one corrective ask`);
      answer = await ask(buildMlCapRetryMessage(sport, GAME_ML_CAP));
      pick = parse(answer);
      if (!pick || moneylinePastCap(pick)) return { error: 'NBA answer exceeded the moneyline limit', code: 'moneyline_limit', rawAnalysis: answer, homeTeam, awayTeam, sport };
    }

    // The numeric checks are diagnostic: they never commission another rationale.
    const audit = auditPickRationale(pick, messages);
    if (audit.unsupported.length) pick._statAuditWarnings = audit.unsupported;

    pick.toolCallHistory = [];
    pick.iterations = messages.filter((m) => m.role === 'assistant').length;
    pick.rawAnalysis = answer;
    pick._fullAssistantNarrative = messages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n\n---\n\n');
    pick._researchBriefing = null;
    pick._researchModel = null;
    pick._modelUsed = session.modelName;
    pick._originalToolResponses = [];
    pick._evidenceObservedAt = new Date().toISOString();
    pick._nbaRead = true;
    // His read of the game rides the pick (Oct 29 2026, founder OK on round 8 #23): the Winners bet and big-game stake
    // asks lead with it; since the read system no pick had carried it, so stakes were set from the fan-facing take
    // alone. Stored in pick_snapshot.game_read; the app never shows it, and the card ask keeps the rationale.
    pick.game_read = String(read || '').trim() || null;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
