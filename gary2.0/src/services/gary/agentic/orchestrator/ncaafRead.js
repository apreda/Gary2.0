// THE COLLEGE READ (Oct 21 2026, founder: "give college the NFL treatment"). Every college game pick. College's own
// copy of the NFL read's shape (nflRead.js), built from college's desk: the line and how it got to this number first,
// then the quarterbacks and coaches, who's out and who plays instead, the season game by game, who carries the offense
// and the spot, plus the news desk's latest on who plays. No articles (founder, Oct 22 2026, for every sport after TNF's
// NFL read).
// He is asked what the line is saying, what matters in this game and what doesn't, and which side he likes at this
// spread; then he writes that answer as the card. His instructions are what a sharp knows about college markets
// (ncaafKnowledge.js) and the date. Nothing weighs, scores or projects for him. A change to the NFL read never reaches
// this file (founder, Oct 14 2026: "college should have its own process").
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { ncaafSystemPrompt, ncaafGameMessage, ncaafCardMessage, NCAAF_FORMAT_ONLY } from './ncaafKnowledge.js';
import { RULE, isTitle, sectionOf, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { etDate } from '../../../sports/nfl/nflBettorData.js';
import { GAME_PICK_MODEL, GAME_RESEARCH_MODEL, GAME_RESEARCH_FALLBACK_MODEL, GAME_RESEARCH_BRIDGE_MODEL } from './orchestratorConfig.js';
import { buildResearchBriefing } from './researchBriefing.js';
import { researchBudgetMs, runResearchOnce } from './optionalResearch.js';
import { withOptionalData } from '../../pickDataIntegrity.js';
import { createModelSession, sendToSessionWithRetry } from './sessionManager.js';
import { createCostTracker } from './costTracker.js';
import { parseGaryResponse } from './responseParser.js';
import { auditPickRationale } from './statAudit.js';
import { buildSmallDogConversionMessage } from './passBuilders.js';
import { gameMarketUnavailable } from './mlbCaseMenu.js';
import { moneylinePastCap, smallDogConversion, convertedTicketOk } from './agentLoop.js';

const NEWS_NOT_ON_FILE = "The news search did not return a report for this game; today's news is not on file.";


// A sentence that carries a betting line (a spread, an opening number, a book's odds) never reaches him from an
// article: the market appears once, as THE LINE AND HOW IT GOT HERE.
const BETTING = /\b\d+(?:\.\d)?-point (?:favou?rites?|underdogs?|dogs?)\b|^[A-Z][A-Za-z&.]{1,11} [+-]\d+(?:\.5)?$|\bfavou?red by \d|\b(?:DraftKings|FanDuel|BetMGM|Caesars Sportsbook|ESPN ?BET|bet365|BetRivers|Fanatics Sportsbook|sportsbooks?|oddsmakers?)\b|\bpoint spread\b|\bthe spread\b|\bbetting (?:line|odds|market)\b|\bover\/under\b|\bmoneyline\b|\bagainst the spread\b|\bline (?:moved|has moved|opened)\b|\bopened as\b|\bodds\b/i;
// A news outlet a sportsbook owns is a source, not a line (Oct 29 2026 hunt: "DraftKings Network's October 28 report
// reproduced the team's announcement that Poole would not return" was cut). A sentence that points back at a cut one
// ("That announcement applied to Wednesday's game") goes with it.
const OUTLET = /\b(?:DraftKings Network|FanDuel (?:Research|Sports Network|TV))\b/g;
export function withoutSentences(text, cut) {
  return String(text || '').split('\n').map((p) => {
    let gone = false;
    // A sentence starts at a capital or at bold ("found. **RotoWire Staff reported ..."), not at the time zone after
    // "12:45 p.m." (Oct 29 2026 hunt).
    return p.split(/(?<=[.!?](?:\*\*)?)\s+(?=[A-Z"“]|\*\*[A-Z"“])(?!(?:\*\*)?(?:Eastern|ET|EDT|EST|Central|Mountain|Pacific)\b)/).filter((s) => { gone = cut(s) || (gone && /^(?:That|This|These|Those|It)\b/.test(s)); return !gone; }).join(' ');
  }).filter((p, i, a) => p.trim() || (i > 0 && a[i - 1].trim())).join('\n');
}
export function withoutBettingLines(text) {
  return withoutSentences(text, (s) => BETTING.test(s.replace(OUTLET, 'the outlet')));
}

// The news desk's notes on its own search, and last season, are not news (Oct 29 2026 hunt, round 7: Boise State's
// news read "The search tool did not return article URLs, so none could be listed." and "Several Boise State stories
// ... could not be opened, so they were left out."; Bengals at Ravens, "he regretted coming back too early from a
// hamstring injury last season"; the NBA news has dropped both since Oct 29). A line's team label ("BOISE STATE: ")
// stays with what is left of it.
const SEARCH_NOTE = /^(?:No|Nothing)\b[^.]*\b(?:found|verified|located|identified)\b|\bsearch (?:tool|results?)\b|\bcould not be (?:opened|dated)\b|\bso (?:they|it|none) (?:was|were|could be) (?:left out|listed)\b|\b(?:article|preview|page|post|piece)s? (?:has|have) no date\b|\bGary already has\b|^This is not new\b|\bas requested\b|\bin the request\b|\bresearch cutoff\b/i;
const LAST_SEASON = /\blast (?:season|year)\b|\b(?:previous|prior) seasons?\b|\ba year ago\b|\bpreseason\b|\btraining camp\b|\bspring (?:game|practice)\b/i;
export function footballNews(text) {
  return String(text || '').split('\n').map((l) => {
    const label = l.match(/^((?:[A-Z][A-Z0-9 .'&()-]*[A-Z)]|BOTH)\s*[:–-]\s+)/)?.[1] || '';
    const body = withoutSentences(l.slice(label.length), (x) => SEARCH_NOTE.test(x.trim()) || LAST_SEASON.test(x));
    return body.trim() ? label + body : (l.trim() ? null : l);
  }).filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The halves and the turnovers stay in each game's line (Oct 23 2026): a 42-3 halftime lead explains the yards after
// it, and a box score without turnovers hid why games went the way they did (Oregon's 15 points came with 7 giveaways).

// A section's rows without the desk's opening paragraph that explains them ("Every completed game ...", "Each player ...").
export function afterIntro(section) {
  const paras = String(section || '').split(/\n\s*\n/);
  return (/^(?:Every|Each) /.test(paras[0] || '') ? paras.slice(1) : paras).join('\n\n').trim();
}

// The two teams, as the desk's matchup line names them.
const teamsOf = (desk) => (String(desk || '').match(/^MATCHUP: (.+)$/m)?.[1] || '').split(/ @ | vs /).map((t) => t.trim()).filter(Boolean);

// A context note about who plays (a player ruled out, eligible again, returning, or who replaces whom) belongs with the
// availability report, not under the coaches (Oct 23 2026: "Evan Jackson ... the likely replacement at boundary safety
// for Phillips" sat two sections away from Phillips's line). A replacement that names one of the team's coaches is a
// staff note and stays ("Bateman as the replacement for Brad White").
const AVAILABILITY_NOTE = /availability|\bruled out\b|\beligib|\binjur|\bquestionable\b|\bdoubtful\b|\bprobable\b|\bout for\b|\breturns?\b|\breturning\b|\bsuspen|\bexpected to play\b|\bsurgery\b|\bconcussion\b|\bremoved from\b|\bresumed\b/i;
function aboutAvailability(note, coaches = []) {
  if (AVAILABILITY_NOTE.test(note)) return true;
  // A coach who is only quoted is not the replacement (Oct 29 2026 hunt: "Smart said ... Rasean Dinkins replaced Kyron
  // Jones" stayed under the coaches).
  const staff = /\bcoach|coordinator|play[- ]?call|\bstaff\b/i.test(note) || coaches.some((last) => new RegExp(`\\b${last}\\b(?!\\s+(?:said|says|told|noted|explained|announced|confirmed|added))`).test(note));
  return /\breplace/i.test(note) && !staff;
}
// Each team's coaches' last names, from the role lines.
const coachesOf = (lines, team) => lines.filter((l) => l.team === team && l.kind === 'role' && !/^Quarterback:/.test(l.text))
  .map((l) => l.text.replace(/^[^:]+: /, '').trim().split(/\s+/).pop()).filter((n) => /^[A-Za-z'-]{2,}$/.test(n || ''));

// The quarterbacks section's lines by team: { team, kind: 'team' | 'role' | 'note' | 'official' | 'source', text }.
function quarterbackSectionLines(desk) {
  const lines = String(desk || '').split('\n');
  const start = lines.findIndex((l) => /^COLLEGE STARTING QUARTERBACKS AND STAFF/.test(l));
  if (start < 0) return [];
  const teams = teamsOf(desk);
  const out = [];
  let team = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (RULE.test(l) || isTitle(l, lines[i + 1])) break;
    if (teams.includes(l.trim())) { team = l.trim(); out.push({ team, kind: 'team', text: l }); continue; }
    // The official report's line, without its link: it is when the availability was published (Oct 23 2026 data audit:
    // "doubtful" with no date read the same as a week-old listing).
    const official = l.match(/^\[official\] (.+?)(?: \(\d{4}-\d{2}-\d{2}\))? https?:\/\/\S+\s*$/);
    if (official) { out.push({ team, kind: 'official', text: `Official report: ${official[1]}` }); continue; }
    if (/^Observed |^\[[a-z0-9_]+\] |^UNCERTAINTY:|^Availability designations are/.test(l)) continue;
    // "Availability source:" says whether each side's absences were checked, and when a conference report could not be
    // read, that they are not on file (Oct 23 2026 source audit). Its standing note on what an empty list means goes:
    // the report says it per team.
    if (/^Availability source:/.test(l)) { out.push({ team, kind: 'source', text: l.replace(/ Empty list means no absences reported by these sources, not confirmed healthy\.$/, '') }); continue; }
    if (/^(?:Quarterback|head coach|offensive coordinator|defensive coordinator|co-offensive coordinator|co-defensive coordinator|offensive play caller|defensive play caller|play caller):/i.test(l)) {
      // Without the researcher's notes on its own retrieval (Oct 29 2026 hunt: Ohio State's quarterback line said the
      // availability report "could not be successfully retrieved; injuries [] means unavailable information" over the
      // report the read prints in full).
      const text = l.split(/(?<=[.!?])\s+/).filter((x) => !/could not be (?:successfully )?(?:retrieved|accessed|loaded)|\binjuries \[\]|\[\] means/i.test(x)).join(' ').trim();
      out.push({ team, kind: 'role', text }); continue;
    }
    // A context note about another season, a former player, a scheme or game plan, or someone's assessment leaves (Oct 23
    // 2026 audit: "Elliott described Duke as structurally similar to last season", "credited Duke's protection" carried a
    // live read; "describes Houston's defense as a 4-2-5", "an emphasis on running through Sanford and Hughes"). A
    // team's name is one of the matchup's two names (a note with no comma passed for a team name the same day).
    if (/last season|\b20(?:1\d|2[0-5])\b|\bformer\b|\bprevious\b|\bdescribed\b|\bcredited\b|\bscheme|\bformation|\bpersonnel group|similar to|\bpraised\b|\bemphasi[sz]ed\b|\bemphasis\b|\bgame plan|\b\d-\d-\d\b/i.test(l)) continue;
    if (l.trim()) out.push({ team, kind: 'note', text: l });
  }
  return out;
}

// The quarterbacks and coaching staff, without the desk's sourcing lines. `availability: false` leaves out each team's
// availability source, official report and notes about who plays, which the read gives with the availability report.
/** The quarterbacks and coaches without the availability notes, or "not on file" with the desk's reason (Oct 29 2026
 * hunt, round 7: a failed context search left the section out of the read without a word, and an empty heading in the
 * second system). */
export function quarterbacksAndCoachesText(desk) {
  const text = quarterbacksAndCoaches(desk, { availability: false });
  if (text) return text;
  const why = String(desk || '').match(/College availability\/context unavailable: ([^\n]+)/)?.[1]?.trim();
  return `not on file${why ? ` (${why})` : ''}`;
}

export function quarterbacksAndCoaches(desk, { availability = true } = {}) {
  const lines = quarterbackSectionLines(desk);
  return lines.filter((l) => availability || !(l.kind === 'source' || l.kind === 'official' || (l.kind === 'note' && aboutAvailability(l.text, coachesOf(lines, l.team)))))
    .map((l) => l.text).join('\n').trim();
}

// The availability report as reported, without the desk's standing notes about it.
function injuriesAsReported(desk) {
  return sectionOf(desk, 'INJURY REPORT').split('\n')
    .filter((l) => !/already in the spread|^Each row shows the reported status|^TODAY'S DATE|^ACTIVE INJURIES$|^─+$/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Each team's availability source, as the quarterbacks section gives it: the conference's report when it was read, else
// what the source line says ("checked", or "unavailable (the ACC availability report was not retrieved ...)").
function availabilitySources(desk) {
  const out = new Map();
  for (const l of quarterbackSectionLines(desk)) {
    if (l.kind === 'official') out.set(l.team, l.text.replace(/^Official report: /, ''));
    else if (l.kind === 'source' && !out.has(l.team)) out.set(l.team, l.text.replace(/^Availability source: (.+?)\.?$/, 'availability source: $1'));
  }
  return out;
}

// THE AVAILABILITY REPORT (Oct 23 2026 data audit: the report's rows and then the same players again with their season
// read as two lists of the same names). One list: each team with its report's source, each reported player once with
// his status, anything the report adds, and his season's stat rows; then who else plays at his position, and the
// week's reporting on who plays. Without the desk's player lines it is the report as reported.
export function availabilityReport(desk) {
  const teams = teamsOf(desk), source = availabilitySources(desk);
  const lines = quarterbackSectionLines(desk);
  // The researcher's own working ("after the requested 9:07 a.m. research cutoff") is not news (Oct 24 2026).
  // Its notes on its own sources too ("as transcribed by Kickoff Status; they do not establish ...", Oct 29 2026 hunt).
  // Split as withoutSentences splits, never after "8 p.m." before its time zone (Oct 29 2026 hunt, round 7: "The
  // availability designations reproduced here are from the October 28, 8 p.m." reached Gary, cut off).
  const withoutProcess = (text) => text.split(/(?<=[.!?](?:\*\*)?)\s+(?=[A-Z"“]|\*\*[A-Z"“])(?!(?:\*\*)?(?:Eastern|ET|EDT|EST|Central|Mountain|Pacific)\b)/)
    .filter((x) => !/\bcutoff\b|\bresearch\b|\brequested\b|\btranscribed\b|\breproduced (?:by|here)\b|\b(?:listed|shown) here\b|\bdo(?:es)? not establish\b|\bnot established by\b|\btimestamp\b|\breflects the\b[^.]*\breport\b|\bportal\b|\bdid not expose\b|\bunlisted players?\b/i.test(x)).join(' ').trim();
  const notes = new Map(teams.map((t) => [t, lines.filter((l) => l.team === t && l.kind === 'note' && aboutAvailability(l.text, coachesOf(lines, t)))
    .map((l) => withoutProcess(l.text)).filter(Boolean).map((text) => `  reporting: ${text}`)]));
  const rows = afterIntro(sectionOf(desk, 'WHO PRODUCED IT'));
  if (!rows) {
    return [...teams.filter((t) => source.get(t) || notes.get(t).length).map((t) => [`${t}${source.get(t) ? ` — ${source.get(t)}` : ''}`, ...notes.get(t)].join('\n')),
      injuriesAsReported(desk)].filter(Boolean).join('\n');
  }
  return rows.split(/\n\s*\n/).map((block) => {
    const [head, ...lines] = block.split('\n');
    const team = teams.find((t) => head === t || head.startsWith(`${t} (`));
    return [team && source.get(team) ? `${head} — ${source.get(team)}` : head, ...lines, ...(team ? notes.get(team) : [])].join('\n');
  }).join('\n\n');
}

// HOW GOOD THEY ARE: the poll, the conferences, and each team's season against FBS teams with who played quarterback.
// Oct 23 2026 (founder, after TNF: "its data we know its data"): the provider's season table and per-play measures
// went. Both blended games against FCS teams and games another quarterback played: Oregon's 317 passing yards a game on
// Oct 17 were mostly Dante Moore's, with Moore out and Brock Thomas (15 passes all year) starting, and an 84-0 win
// over Portland State sat inside its averages. Every game's own unit lines stay in the season game by game.
// Each team's game log opens with its record (and against FBS teams), its conference and its place in the AP poll, and,
// when this week's quarterback did not throw the most passes in every game, the record by who did. A separate HOW GOOD
// THEY ARE section repeated the log's scores and yards under a heading that told him what to conclude (Oct 23 2026).
// One quarterback is one group, whether or not a game's lineup marked him "(started)" (Oct 28 2026 sweep: UCF's Keyone
// Jenkins read as two quarterbacks, "1-0" and "2-2", the BYU game having no starting lineup on file).
const plainName = (text) => String(text || '').replace(/\s*\([^)]*\)/g, '').trim();
function byPasser(gs, none) {
  const by = new Map();
  for (const g of gs) { const k = g.qb ? plainName(g.qb) : none; const same = [...by.keys()].find((x) => x !== none && k !== none && nameKey(x) === nameKey(k)) || k; by.set(same, [...(by.get(same) || []), g]); }
  return by;
}
function qbSplit(gs, qb) {
  const by = byPasser(gs, 'passer not on file');
  const mine = qb ? [...by.keys()].find((k) => nameKey(k) === nameKey(qb)) : null;
  if (!gs.length || (mine && by.size === 1)) return null;
  const parts = [...by].sort(([a], [b]) => (a === mine ? -1 : b === mine ? 1 : 0))
    .map(([k, list]) => `${k}${k === mine ? " (this week's quarterback)" : ''} ${record(list)} (${list.map((g) => `${g.at} ${g.opponent}`).join(', ')})`);
  if (qb && !mine) {
    // A game he played in without throwing the most passes is named (Oct 24 2026: Michigan's Tommy Carr, today's
    // starter, played the second half against Penn State).
    const also = gs.filter((g) => (g.passers || []).some((n) => nameKey(n) === nameKey(qb)));
    parts.push(`${qb}, this week's quarterback, in none${also.length ? `; he also threw in ${also.map((g) => `${g.at} ${g.opponent}`).join(', ')}` : ''}`);
  }
  return `  most passes thrown by: ${parts.join('; ')}`;
}
function gameLog(desk) {
  const byTeam = (section, strip = (l) => l) => new Map(sectionOf(desk, section).split('\n').map(strip).map((l) => l.match(/^(.+?): (.+)$/)).filter(Boolean).map((m) => [m[1].trim(), m[2].trim()]));
  const poll = byTeam('AP TOP 25'), conf = byTeam('NCAAF CONFERENCE CONTEXT', (l) => (/^\[(?:HOME|AWAY)\] /.test(l) ? l.replace(/^\[(?:HOME|AWAY)\] /, '') : ''));
  const teams = seasonGames(desk);
  const starters = thisWeeksQuarterbacks(desk, teams.map((t) => t.team));
  const log = afterIntro(sectionOf(desk, 'THIS SEASON GAME BY GAME'));
  return log.replace(/^(\S.*) \((\d+-\d+(?:-\d+)?)\):$/gm, (whole, team, rec) => {
    const t = teams.find((x) => x.team === team);
    if (!t) return whole;
    const fbs = t.games.filter((g) => !g.fcs);
    const head = `${team} (${rec}${fbs.length < t.games.length ? `; ${record(fbs)} against FBS teams` : ''})${conf.get(team) ? ` · ${conf.get(team)}` : ''}${poll.get(team) ? ` · ${poll.get(team)}` : ''}, newest first:`;
    return [head, qbSplit(t.games, starters.get(team))].filter(Boolean).join('\n');
  });
}

function howGood(desk) {
  const poll = sectionOf(desk, 'AP TOP 25');
  const conferences = sectionOf(desk, 'NCAAF CONFERENCE CONTEXT').split('\n').filter((l) => /^\[(?:HOME|AWAY)\]/.test(l)).map((l) => l.replace(/^\[(?:HOME|AWAY)\] /, '')).join('\n');
  const teams = seasonGames(desk);
  const starters = thisWeeksQuarterbacks(desk, teams.map((t) => t.team));
  const seasons = teams.map(({ team, games }) => seasonLines(team, games, starters.get(team))).join('\n\n');
  return [poll, conferences, seasons].filter(Boolean).join('\n\n');
}

// A note in parentheses is not part of the name (Oct 28 2026 sweep: the log's "Gunner Stockton (started)" never matched
// "Gunner Stockton", and the read said this week's quarterback threw the most passes in none of his seven starts).
const nameKey = (name) => String(name || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

// This week's quarterback for each team, as the desk's quarterbacks section names him under the team's name.
function thisWeeksQuarterbacks(desk, teams) {
  const out = new Map(); let team = null;
  for (const l of quarterbacksAndCoaches(desk).split('\n')) {
    if (teams.includes(l.trim())) { team = l.trim(); continue; }
    const m = l.match(/^Quarterback: (.+?) — /);
    if (m && team && !out.has(team)) out.set(team, m[1].trim());
  }
  return out;
}

// Each team's games from the desk's season game by game: result, score, FCS or not, who threw the most passes, and
// the yards each side gained (runs plus passing; null when the game's unit lines are missing).
export function seasonGames(desk) {
  const teams = []; let cur = null; let game = null;
  // Sacks shown apart from the runs (Oct 25 2026) count in the yards, as the box counts them.
  const yards = (l) => { const r = l.match(/(\d+) runs for (-?\d+)/), p = l.match(/passing \d+-\d+ for (-?\d+)/), k = l.match(/\d+ sacks? for (-?\d+) yards/); return r && p ? Number(r[2]) + Number(p[1]) + (k ? Number(k[1]) : 0) : null; };
  for (const l of sectionOf(desk, 'THIS SEASON GAME BY GAME').split('\n')) {
    const t = l.match(/^(\S.*) \(\d+-\d+(?:-\d+)?\):$/);
    if (t) { cur = { team: t[1], games: [] }; teams.push(cur); game = null; continue; }
    const g = cur && l.match(/^ {2}\S.* · ([WLT]) (\d+)-(\d+)(?: \(OT\))? (vs|@) (.+?)(?: \(neutral site[^)]*\))?(?: — |$)/);
    // The opponent's conference and record now, from the line's opponent label (Oct 24 2026: the board read "W 24-21 @
    // Michigan State" without Michigan State being 2-5).
    const o = l.match(/— opponent: ([^,—]+?), now (\d+-\d+(?:-\d+)?)/);
    if (g) { game = { result: g[1], pf: Number(g[2]), pa: Number(g[3]), ot: / \(OT\) /.test(l), at: g[4], opponent: g[5].replace(/ \(neutral site[^)]*\)/g, ''), fcs: /— opponent: FCS\b/.test(l), oppNow: o ? `${o[1].trim()}, ${o[2]} now` : null, qb: null, off: null, def: null }; cur.games.push(game); continue; }
    if (!game) continue;
    // The first passer, past a starter who threw none ("Dylan Lonergan started, no pass; AJ Surace 7-of-18"; Oct 29
    // 2026 hunt: Rutgers' game read "passer not on file").
    if (/^\s+quarterback: /.test(l)) {
      // His own team's part only (round 8: with the team's lines not on file, "· opponent's quarterback: Braden Atkinson
      // 31-of-34" made Oregon State's passer Colorado State's).
      game.passers = [...l.split(" · opponent's quarterback:")[0].matchAll(/(?:quarterback: |; )([A-Z][^;:]*?) \d+-of-\d+/g)].map((m) => m[1].trim());
      game.qb = game.passers[0] || null;
    }
    else if (/^\s+offense: /.test(l)) game.off = yards(l);
    else if (/^\s+defense: /.test(l)) game.def = yards(l);
  }
  return teams;
}

// Every game listed, at every count (Oct 23 2026 data audit: from six games on the board averaged the season, and
// Virginia's last three, about 250 yards gained and 433 allowed, read as "346 yards a game, 344 allowed").
const perGame = (gs) => gs.map((g) => {
  const facts = [g.oppNow, g.off != null && g.def != null ? `${g.off} yards, allowed ${g.def}` : null].filter(Boolean);
  return `${g.result} ${g.pf}-${g.pa}${g.ot ? ' OT' : ''} ${g.at || 'vs'} ${g.opponent}${facts.length ? ` (${facts.join('; ')})` : ''}`;
}).join(', ');
const record = (gs) => { const w = gs.filter((g) => g.result === 'W').length, l = gs.filter((g) => g.result === 'L').length, t = gs.length - w - l; return `${w}-${l}${t ? `-${t}` : ''}`; };
const games = (n) => `${n} game${n === 1 ? '' : 's'}`;
// A game whose box score's player lines are not on file (or carry no passer) names no quarterback.
const NOT_ON_FILE_QB = 'not on file';
// The quarterback lines name their games and give the record only: the games themselves are listed once, above them.
const byQb = (gs) => `${record(gs)} (${gs.map((g) => `${g.at || 'vs'} ${g.opponent}`).join(', ')})`;

// One team: its games against FBS teams, newest first, the FCS games named apart, and the same games by who threw the
// most passes.
export function seasonLines(team, all, qb = null) {
  const fbs = all.filter((g) => !g.fcs), fcs = all.filter((g) => g.fcs);
  const out = [fbs.length ? `${team}, against FBS teams, ${games(fbs.length)}, newest first: ${record(fbs)}, ${perGame(fbs)}` : `${team}: no games against FBS teams yet this season.`];
  if (fcs.length) out.push(`  against FCS teams: ${fcs.map((g) => `${g.result} ${g.pf}-${g.pa} vs ${g.opponent}`).join('; ')}`);
  if (!fbs.length) return out.join('\n');
  const by = byPasser(fbs, NOT_ON_FILE_QB);
  const mine = qb ? [...by.keys()].find((k) => nameKey(k) === nameKey(qb)) : null;
  const who = (k) => (k === NOT_ON_FILE_QB ? 'With the passer not on file' : `With ${k} throwing the most passes`);
  if (mine && by.size === 1) out.push(`  ${qb}, this week's quarterback, threw the most passes in all ${fbs.length}.`);
  else if (mine) {
    out.push(`  With ${qb} (this week's quarterback) throwing the most passes, ${games(by.get(mine).length)}: ${byQb(by.get(mine))}`);
    for (const [k, gs] of by) if (k !== mine) out.push(`  ${who(k)}, ${games(gs.length)}: ${byQb(gs)}`);
  } else {
    if (qb) out.push(`  ${qb}, this week's quarterback, threw the most passes in none of these games.`);
    for (const [k, gs] of by) out.push(`  ${who(k)}, ${games(gs.length)}: ${byQb(gs)}`);
  }
  return out.join('\n');
}

export function situation(desk) {
  const road = sectionOf(desk, 'HOME AND ROAD').split('\n')
    .filter((l) => /^(?:Site|Local kickoff|Trip):|^Kickoff weather\b/.test(l) || /: \d+(?:st|nd|rd|th) (?:home|road) game of the season today\.$/.test(l));
  return [...road, sectionOf(desk, 'REST & SCHEDULE SITUATION')].filter(Boolean).join('\n');
}

/** The game as Gary reads it: the spread he bets, said once, and the football (founder, Oct 23 2026: not the line's
 * path, the opener, the total or the moneylines; see ncaafKnowledge.js). */
export async function buildNcaafReadStory(desk, { homeTeam, awayTeam } = {}) {
  const line = lineOf(desk);
  // The order (founder, Oct 23 2026): the spread, who plays, each team's season game by game, the players
  // who carry the offense, the situation.
  const parts = [
    [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
    ['THE QUARTERBACKS AND COACHES', quarterbacksAndCoachesText(desk)],
    ['THE AVAILABILITY REPORT', availabilityReport(desk)],
    // Oct 23 2026 data audit: the regulars who had no stat row in the last game, and who carried and caught the ball
    // game by game (Duke's Nate Sheppard, 20 carries and 11 catches against North Carolina, was nowhere in the story).
    ['REGULARS WITH NO STAT ROW IN THE LAST GAME', afterIntro(sectionOf(desk, 'REGULARS WITH NO STAT ROW IN THE LAST GAME'))],
    ["THIS SEASON, GAME BY GAME (a game's weather line appears only for rain, snow, a storm, wind of 15 mph or more, or freezing; a game without one was indoors or dry and calm)", gameLog(desk)],
    ['CARRIES AND CATCHES, GAME BY GAME', afterIntro(sectionOf(desk, 'CARRIES AND CATCHES, GAME BY GAME'))],
    ['SCHEDULE, TRAVEL AND WEATHER', situation(desk)],
  ];
  return { line, story: parts.map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n') };
}

/** One game on Gary's college board (winners/ncaafBoard.js), read the way the pick reads it, without his write-up: the
 * spread, the quarterbacks and coaches, the availability report, each team's season, the
 * situation and the news desk's report. */
export async function buildNcaafBoardEntry(desk, news, { homeTeam, awayTeam, gameId, kickoff, asOf = new Date() } = {}) {
  const kick = kickoff ? new Date(kickoff).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return [`### ${awayTeam} at ${homeTeam}${kick ? ` · ${kick} ET` : ''}`,
    spreadInWords(lineOf(desk)) || 'The spread is not on file.', '',
    // The availability source lines stay with the report, not the coaches (Oct 29 2026 hunt, round 7: "Availability
    // source: checked." under each team).
    // The week's reporting on who plays rides here too (round 8: the board had lost it; the reads carry it under the
    // availability report), without the bare "Availability source: checked." lines.
    'Quarterbacks and coaches:', quarterbacksAndCoaches(desk).split('\n').filter((l) => !/^Availability source:/.test(l)).join('\n').trim() || quarterbacksAndCoachesText(desk), '',
    'Availability report:', injuriesAsReported(desk) || 'Nothing reported.', '',
    'This season:', howGood(desk), '',
    'Schedule, travel and weather:', situation(desk) || 'Nothing unusual.',
    footballNews(news) ? `\nThe news desk:\n${footballNews(news)}` : ''].join('\n');
}

// The news desk's latest on who plays (nflResearchPrompts.js, college's items), from the game as Gary reads it.
// Optional: a failed or timed-out search leaves TODAY'S NEWS as "Nothing beyond the scout report."
async function latestNews(story, sport, homeTeam, awayTeam, options, costTracker) {
  if (String(process.env.GARY_RESEARCHER || 'on').toLowerCase() === 'off') return { news: null, model: null };
  const timeoutMs = researchBudgetMs({
    configuredMs: Number(process.env.GARY_RESEARCH_TIMEOUT_MS) || 20 * 60 * 1000,
    deadlineAt: process.env.GARY_CHILD_DEADLINE_AT,
    decisionReserveMs: process.env.GARY_RESEARCH_DECISION_RESERVE_MS ?? 8 * 60 * 1000,
  });
  const models = [GAME_RESEARCH_MODEL, GAME_RESEARCH_FALLBACK_MODEL, GAME_RESEARCH_BRIDGE_MODEL].filter((m, i, a) => m && a.indexOf(m) === i);
  const key = createHash('sha256').update(JSON.stringify(['ncaaf-news', sport, homeTeam, awayTeam, options.gameId, options.gameTime, story])).digest('hex');
  const research = await withOptionalData(() => runResearchOnce(key, {
    models,
    timeoutMs,
    signal: options.signal,
    build: (researchModel, signal) => buildResearchBriefing(story, sport, homeTeam, awayTeam, { ...options, _costTracker: costTracker, researchModel, signal }),
    onAttempt: (researchModel) => console.log(`[NCAAF Read] 📰 News desk (${researchModel}) looks for the latest on who plays`),
    onFailure: (researchModel, err, hasNext) => console.warn(`[NCAAF Read] ⚠️ News desk ${researchModel} failed (${err.message})${hasNext ? ' — trying the next' : ''}`),
  }));
  const news = typeof research.result === 'string' ? research.result : research.result?.briefing;
  if (!news) console.warn(`[NCAAF Read] No news desk report; TODAY'S NEWS reads "Nothing beyond the scout report." (${research.failures.join(' | ')})`);
  // Betting lines, odds and line moves are cut from the report too: Gary reads the spread he bets and the football, not
  // the market (founder, Oct 23 2026).
  return { news: news ? footballNews(withoutBettingLines(String(news).trim())) || null : null, model: news ? research.model : null };
}

export async function runNcaafRead({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NCAAF read: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const game = options.game || {};
    const asOf = new Date();
    const { line, story } = await buildNcaafReadStory(desk, { homeTeam, awayTeam, gameId: game.id ?? options.gameId, book: game.line_vendor, asOf });
    console.log(`[NCAAF Read] the game as Gary reads it (${story.length} chars)`);
    const research = await latestNews(story, sport, homeTeam, awayTeam, options, costTracker);
    if (research.news) console.log(`[NCAAF Read] News desk report ready (${research.news.length} chars, ${research.model})`);

    const system = ncaafSystemPrompt(today);
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

    // A failed news search says so (Oct 23 2026 source audit: a failure read as a quiet day).
    const read = await ask(ncaafGameMessage(story, research.news || NEWS_NOT_ON_FILE));
    console.log(`[NCAAF Read] ${session.modelName}: read (${read.length} chars); asking for the card`);
    try {
      const dir = `${homedir()}/Library/Logs/gary-ncaaf-read`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/${etDate(options.gameTime || asOf)}_${awayTeam.split(' ').pop()}_at_${homeTeam.split(' ').pop()}.md`,
        `########## SYSTEM\n${system}\n\n########## ASKED\n${messages[1].content}\n\n########## ANSWERED\n${read}`);
    } catch (e) { console.warn(`[NCAAF Read] transcript not saved: ${e.message}`); }
    let answer = await ask(ncaafCardMessage(line));
    let pick = parse(answer);
    if (!pick) {
      console.log('[NCAAF Read] No JSON block in the card — asking for the format only');
      answer = await ask(NCAAF_FORMAT_ONLY);
      pick = parse(answer);
    }
    if (!pick) return { error: 'NCAAF read: no parseable pick', code: 'invalid_final_answer', homeTeam, awayTeam, sport, rawAnalysis: answer };

    // The house's small-underdog law (Oct 1 2026): his side stands at its moneyline, and he writes that card.
    const conversion = smallDogConversion(pick, homeTeam, awayTeam);
    if (conversion) {
      console.warn(`[NCAAF Read] 🔁 SMALL UNDERDOG: "${conversion.from}" converted to ${conversion.ticket}; Gary writes the moneyline card`);
      answer = await ask(buildSmallDogConversionMessage(conversion));
      const converted = parse(answer);
      if (!convertedTicketOk(converted, conversion)) {
        return { error: `NCAAF answer did not return the converted ticket ${conversion.ticket}`, code: 'small_underdog_conversion', rawAnalysis: answer, homeTeam, awayTeam, sport };
      }
      converted.converted_from = conversion.from;
      pick = converted;
    }
    if (moneylinePastCap(pick)) return { error: 'NCAAF answer exceeded the moneyline limit', code: 'moneyline_limit', rawAnalysis: answer, homeTeam, awayTeam, sport };

    // Football's numeric checks are diagnostic: they never commission another rationale.
    const audit = auditPickRationale(pick, messages);
    if (audit.unsupported.length) pick._statAuditWarnings = audit.unsupported;

    pick.toolCallHistory = [];
    pick.iterations = messages.filter((m) => m.role === 'assistant').length;
    pick.rawAnalysis = answer;
    pick._fullAssistantNarrative = messages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n\n---\n\n');
    pick._researchBriefing = research.news;
    pick._researchModel = research.model;
    pick._modelUsed = session.modelName;
    pick._originalToolResponses = [];
    pick._evidenceObservedAt = new Date().toISOString();
    pick._ncaafRead = true;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
