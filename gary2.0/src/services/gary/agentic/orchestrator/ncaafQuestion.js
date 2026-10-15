// COLLEGE'S QUESTION (founder, Oct 14 2026: "college should have its own process changing NFL shouldnt necessarily
// change NCAAF"). Today it is built like the NFL question (nflQuestion.js) with college's own desk: the AP rankings,
// the site, each team's season game by game with who played quarterback, rest, the last meetings, the quarterbacks and
// coaches, the availability report, and this week as the beat writers tell it. No awareness: college has none today.
// He answers "Who do you like at this spread, and why?" and writes the card from that answer with THE LINE. A change
// to the NFL question does not reach this file. Not wired into the live pick yet: the replay on saved desks comes first.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { esc, RULE, isTitle, sectionOf, articlesOf, articleOpening, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { NCAAF_CONSTITUTION } from '../constitution/ncaafConstitution.js';
import { GAME_PICK_MODEL } from './orchestratorConfig.js';
import { createModelSession, sendToSessionWithRetry } from './sessionManager.js';
import { createCostTracker } from './costTracker.js';
import { parseGaryResponse } from './responseParser.js';
import { auditPickRationale } from './statAudit.js';
import { buildSmallDogConversionMessage } from './passBuilders.js';
import { gameMarketUnavailable } from './mlbCaseMenu.js';
import { moneylinePastCap, smallDogConversion, convertedTicketOk } from './agentLoop.js';

export function ncaafQuestionSystemPrompt(today) {
  return `Today is ${today}. Your memory of players, rosters and stats is out of date; the scout report is current. Only mention players the scout report names, and never write a number, score or record that isn't in the scout report or the research notes.`;
}

// This week as the beat writers tell it: each team's story of the week, the game preview or storylines, and the
// quarterbacks story, each once.
function beatWriters(desk, homeTeam, awayTeam) {
  const all = articlesOf(desk);
  const pick = (re) => all.find((a) => re.test(a.heading));
  const chosen = [
    pick(new RegExp(`^${esc(awayTeam)} — THIS WEEK'S CHANGES`)),
    pick(new RegExp(`^${esc(homeTeam)} — THIS WEEK'S CHANGES`)),
    pick(/^THE (?:STORYLINES THIS WEEK|GAME PREVIEW), AS WRITTEN/),
    pick(/^THE QUARTERBACKS, AS WRITTEN/),
  ].filter(Boolean);
  const seen = new Set();
  return chosen.filter((a) => !seen.has(a.title) && seen.add(a.title))
    .map((a) => `"${a.title}"${a.published ? ` (${a.published})` : ''}\n${articleOpening(a.body)}`).join('\n\n');
}

// College's season game by game: each result line and who played quarterback, without the unit lines.
function collegeSeason(desk) {
  return sectionOf(desk, 'THIS SEASON GAME BY GAME').split('\n')
    .filter((l) => /^\S.*\(\d+-\d+(?:-\d+)?\):$/.test(l) || /^ {2}\w{3}, \w{3} \d+ · /.test(l) || /^ {6}quarterback: /.test(l))
    .join('\n');
}

function collegeStaff(desk) {
  const lines = String(desk || '').split('\n');
  const start = lines.findIndex((l) => /^COLLEGE STARTING QUARTERBACKS AND STAFF/.test(l));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (RULE.test(lines[i]) || isTitle(lines[i], lines[i + 1])) break;
    if (/^Observed |^\[[a-z0-9]+\] |^\[official\] |^Availability source:/.test(lines[i])) continue;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

function collegeStory(desk, line, homeTeam, awayTeam) {
  const site = sectionOf(desk, 'HOME AND ROAD').split('\n').filter((l) => /^(?:Site|Local kickoff|Trip|Kickoff weather):/.test(l)).join('\n');
  const h2h = sectionOf(desk, 'HEAD-TO-HEAD HISTORY').split('\n').filter((l) => !/^H2H DATA VERIFIED|^\[DATA BOUNDARY\]/.test(l)).join('\n').trim();
  return [
    [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
    ['THE RANKINGS', sectionOf(desk, 'AP TOP 25')],
    ['THE SITE', site],
    ['THIS SEASON, GAME BY GAME', collegeSeason(desk)],
    ['REST', sectionOf(desk, 'REST & SCHEDULE SITUATION')],
    ['THE LAST MEETINGS', h2h],
    ['THE QUARTERBACKS AND COACHES', collegeStaff(desk)],
    ['THE INJURY REPORT', sectionOf(desk, 'INJURY REPORT')],
    ['THIS WEEK, AS THE BEAT WRITERS TELL IT', beatWriters(desk, homeTeam, awayTeam)],
  ];
}

export function buildNcaafStory(desk, line, homeTeam, awayTeam) {
  return collegeStory(desk, line, homeTeam, awayTeam).map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n');
}

export function buildNcaafGameMessage(story, notes = '') {
  return `## THE GAME

${story}

## TODAY'S NEWS (from your research assistant)

${notes || 'Nothing beyond the scout report.'}

Who do you like at this spread, and why?`;
}

// The last message: his answer is made in conversation; the card is written from it, with THE LINE.
export function buildNcaafCardMessage(line = '') {
  return `Write your answer as Gary's Take for the pick card: the same reasons, about 250-400 words, opening with a sentence or two that sets the scene. Fans read it, so write only the Take and the JSON block, with nothing before or after them. Then add this JSON block with the same pick, at that ticket's exact price from THE LINE:

THE LINE
${line || 'Not on the desk.'}

\`\`\`json
{
  "final_pick": "[Team] [spread or ML] [price]",
  "rationale": "Gary's Take\\n\\n[the Gary's Take above]",
  "confidence_score": 0.XX
}
\`\`\`

confidence_score (0.50-1.00) is how confident you are in this pick.`;
}

export const NCAAF_FORMAT_ONLY = 'Your answer did not include the JSON block. Add it now with the same pick and the same Gary\'s Take: "final_pick" ("[Team] [spread or ML] [price]" at that ticket\'s exact price from THE LINE), "rationale" ("Gary\'s Take\\n\\n" followed by the Gary\'s Take you wrote) and "confidence_score" (0.50-1.00).';

// ── COLLEGE VERSION X (Oct 15 2026, founder: "ncaaf needs massive work the way we tried to fix NFL"; test only until
// the replay reads clean). The NFL's three questions with college's desk: who's playing and how good each team is;
// this season (every game with how both sides played and who the opponent was, each team's season as a whole, the
// quarterbacks and coaches, the availability report with what each player produced, each team's last game as
// written) and how the teams match up; then the pick at the spread. The spread is in front of him from the first
// question (Oct 15 2026: with it shown only at the end he settled who was better first and then second-guessed the
// favorite at the number; shown first, he read the game against it). No web, no line history, no last meetings.

// A sentence that carries a betting line (a spread, an opening number, a book's odds) never reaches him: the market
// appears once, as THE LINE.
const BETTING = /\b\d+(?:\.\d)?-point (?:favorite|favourite|underdog|dog)\b|\bfavou?red by \d|\b(?:DraftKings|FanDuel|BetMGM|Caesars Sportsbook|ESPN ?BET|bet365|BetRivers|Fanatics Sportsbook|sportsbooks?|oddsmakers?)\b|\bpoint spread\b|\bthe spread\b|\bbetting (?:line|odds|market)\b|\bover\/under\b|\bmoneyline\b|\bagainst the spread\b|\bline (?:moved|has moved|opened)\b|\bopened as\b|\bodds\b/i;
export function withoutBettingLines(text) {
  return String(text || '').split('\n').map((p) => p.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter((s) => !BETTING.test(s)).join(' ')).filter((p, i, a) => p.trim() || (i > 0 && a[i - 1].trim())).join('\n');
}

// The players by position, names only, from the desk's key players.
function collegeNames(desk) {
  const lines = String(desk || '').split('\n');
  const start = lines.findIndex((l) => /^KEY PLAYERS \(/.test(l));
  if (start < 0) return '';
  const out = []; let team = null; let byPos = null;
  const flush = () => { if (team) out.push(`${team}\n${[...byPos].map(([p, n]) => `  ${p}: ${n.join(', ')}`).join('\n')}`); };
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^(?:NCAAF CONFERENCE CONTEXT|HEAD-TO-HEAD|THE LINE)/.test(l)) break;
    const t = l.match(/^\[(?:HOME|AWAY)\] (.+):$/);
    if (t) { flush(); team = t[1]; byPos = new Map(); continue; }
    const m = l.match(/^\s+• ([A-Z]+): #\d+ (.+?) - /);
    if (m && byPos) { if (!byPos.has(m[1])) byPos.set(m[1], []); byPos.get(m[1]).push(m[2]); }
  }
  flush();
  return out.join('\n\n');
}

function collegeStaffClean(desk) {
  return collegeStaff(desk).split('\n').filter((l) => !/^(?:UNCERTAINTY:|Availability designations are|Availability source:)/.test(l)).join('\n').trim();
}

function collegeSituation(desk) {
  const road = sectionOf(desk, 'HOME AND ROAD').split('\n')
    .filter((l) => /^(?:Site|Local kickoff|Trip|Kickoff weather):/.test(l) || /: \d+(?:st|nd|rd|th) (?:home|road) game of the season today\.$/.test(l) || / (?:at home|on the road) this season: /.test(l));
  return [...road, sectionOf(desk, 'REST & SCHEDULE SITUATION')].filter(Boolean).join('\n');
}

function afterIntro(section) {
  const lines = section.split('\n');
  const first = lines.findIndex((l) => /^\S.*(?:\(\d+-\d+(?:-\d+)?\):|^[A-Z][A-Za-z.&' ]+$)/.test(l) && !/^Every |^Each /.test(l));
  return (first > 0 ? lines.slice(first) : lines).join('\n').trim();
}

// Each team's season as a whole, in words: the season summary table and the per-play measures the desk carries.
function collegeTeamSeason(desk) {
  const text = String(desk || '');
  const table = sectionOf(desk, 'TEAM STATISTICS').split('\n').filter((l) => !/^This section uses|^records provide|^A dash means/.test(l)).join('\n').trim();
  const block = (name) => { const i = text.indexOf(`\n${name}\n`); if (i < 0) return null; const j = text.slice(i + 1).search(/\n(?:NCAAF_[A-Z_]+|REST & SCHEDULE)/); return text.slice(i + 1, j < 0 ? undefined : i + 1 + j); };
  const side = (b, s) => { if (!b) return {}; const i = b.indexOf(`\n${s}:\n`); if (i < 0) return {}; const out = {}; for (const l of b.slice(i + s.length + 3).split('\n')) { const m = l.match(/^ {2}([a-z_]+): (.+)$/); if (!m) break; out[m[1]] = m[2]; } return out; };
  const b = { sr: block('NCAAF_SUCCESS_RATE'), ex: block('NCAAF_EXPLOSIVE_PLAYS'), rz: block('NCAAF_REDZONE'), to: block('NCAAF_TURNOVER_MARGIN'), pr: block('NCAAF_PRESSURE_RATE') };
  const lines = [];
  for (const s of ['away', 'home']) {
    const sr = side(b.sr, s), ex = side(b.ex, s), rz = side(b.rz, s), to = side(b.to, s), pr = side(b.pr, s);
    const team = sr.team || ex.team || rz.team || to.team || pr.team;
    if (!team) continue;
    const parts = [];
    if (sr.offense_success_rate) parts.push(`plays that succeed: ${sr.offense_success_rate} on offense, ${sr.defense_success_rate_allowed} allowed on defense`);
    if (ex.offense_explosiveness) parts.push(`size of the successful plays (explosiveness): ${ex.offense_explosiveness} on offense, ${ex.defense_explosiveness_allowed} allowed`);
    if (rz.points_per_scoring_opportunity) parts.push(`points per trip inside the opponent's 40: ${Number(rz.points_per_scoring_opportunity).toFixed(1)}, ${Number(rz.points_allowed_per_opportunity).toFixed(1)} allowed`);
    if (to.giveaways) parts.push(`${to.giveaways} giveaways and ${to.takeaways} takeaways`);
    if (pr.sacks) parts.push(`${pr.sacks} sacks and ${pr.tackles_for_loss} tackles for loss`);
    if (parts.length) lines.push(`${team}: ${parts.join('; ')}`);
  }
  return [table, lines.join('\n')].filter(Boolean).join('\n\n');
}

function collegeLastGames(desk, homeTeam, awayTeam) {
  const all = articlesOf(desk);
  return [awayTeam, homeTeam].map((team) => all.find((a) => new RegExp(`^${esc(team)} — LAST COMPLETED GAME`).test(a.heading)))
    .filter(Boolean)
    .map((a) => `"${a.title}"${a.published ? ` (${a.published})` : ''}\n${articleOpening(withoutBettingLines(a.body))}`).join('\n\n');
}

export function ncaafXSystemPrompt(today, awareness = '') {
  const view = String(awareness || '').trim();
  return `${view ? `${view}\n\n` : ''}Today is ${today}. The scout report is current on rosters, injuries and every number; your memory of those may be out of date. What you know about how good players and teams are is yours to use. Only mention players the scout report names, and never write a number, score or record that isn't in the scout report or the research notes.`;
}

export function buildNcaafXMessages(desk, line, homeTeam, awayTeam, notes = '') {
  const block = (parts) => parts.filter((p) => p[1]).map((p) => `${p[0]}\n${p[1]}`).join('\n\n');
  return [
    `## THE GAME\n\n${matchupHeader(desk)}\n${spreadInWords(line)}\n\n${block([
      ['THE RANKINGS', sectionOf(desk, 'AP TOP 25')],
      ['THE CONFERENCES', sectionOf(desk, 'NCAAF CONFERENCE CONTEXT').split('\n').filter((l) => /^\[(?:HOME|AWAY)\]/.test(l)).map((l) => l.replace(/^\[(?:HOME|AWAY)\] /, '')).join('\n')],
      ['THE QUARTERBACKS AND COACHES', collegeStaffClean(desk)],
      ['WHO PLAYS FOR THEM', collegeNames(desk)],
    ])}\n\nWho are these two teams and these players, as you know them, and how good is each team?`,
    `## THIS SEASON\n\n${block([
      ['THE SITUATION', collegeSituation(desk)],
      ['THIS SEASON, GAME BY GAME', afterIntro(sectionOf(desk, 'THIS SEASON GAME BY GAME'))],
      ['HOW THEY HAVE PLAYED THIS SEASON', collegeTeamSeason(desk)],
      ['THE INJURY REPORT', sectionOf(desk, 'INJURY REPORT')],
      ['WHO PRODUCED IT, FOR THE PLAYERS ON THE REPORT', afterIntro(sectionOf(desk, 'WHO PRODUCED IT'))],
      ["EACH TEAM'S LAST GAME, AS THE BEAT WRITERS TELL IT", collegeLastGames(desk, homeTeam, awayTeam)],
    ])}\n\n## TODAY'S NEWS (from your research assistant)\n\n${notes || 'Nothing beyond the scout report.'}\n\nHow do these two teams match up as they'll play this week?`,
    `## THE SPREAD\n\n${spreadInWords(line)}\n\nWho do you like at this spread, and why?`,
  ];
}

// The college game pick in three questions (Version X with college's desk), as the replay ran it: the awareness
// (ncaafConstitution.js) and the date, no research notes and no web; the card from his answer with THE LINE. The house's
// small-underdog conversion and moneyline limit apply as on every football pick.
export async function runNcaafQuestion({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NCAAF question: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const system = ncaafXSystemPrompt(today, NCAAF_CONSTITUTION.pass1Context);
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
    const messages = [{ role: 'system', content: system }];
    const ask = async (text) => {
      messages.push({ role: 'user', content: text });
      const response = await sendToSessionWithRetry(session, text);
      messages.push({ role: 'assistant', content: response.content || '' });
      return response.content || '';
    };
    const parse = (text) => parseGaryResponse(text, homeTeam, awayTeam, sport, options.game || {});
    const asOf = options.gameTime || new Date().toISOString();
    const line = lineOf(desk);
    const turns = buildNcaafXMessages(desk, line, homeTeam, awayTeam);
    console.log(`[NCAAF Question] ${session.modelName}: the game in three questions (${turns.join('').length} chars)`);
    const replies = [];
    for (const t of turns) replies.push(await ask(t));
    try {
      const dir = `${homedir()}/Library/Logs/gary-ncaaf-x`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/${asOf.slice(0, 10)}_${awayTeam.split(' ').pop()}_at_${homeTeam.split(' ').pop()}.md`,
        turns.map((t, i) => `########## ASKED ${i + 1}\n${t}\n\n########## ANSWERED ${i + 1}\n${replies[i]}`).join('\n\n'));
    } catch (e) { console.warn(`[NCAAF Question] transcript not saved: ${e.message}`); }
    console.log(`[NCAAF Question] Answer (${replies.at(-1).length} chars); asking for the card`);
    let answer = await ask(buildNcaafCardMessage(line));
    let pick = parse(answer);
    if (!pick) {
      console.log('[NCAAF Question] No JSON block in the card — asking for the format only');
      answer = await ask(NCAAF_FORMAT_ONLY);
      pick = parse(answer);
    }
    if (!pick) return { error: 'NCAAF question: no parseable pick', code: 'invalid_final_answer', homeTeam, awayTeam, sport, rawAnalysis: answer };
    const conversion = smallDogConversion(pick, homeTeam, awayTeam);
    if (conversion) {
      console.warn(`[NCAAF Question] 🔁 SMALL UNDERDOG: "${conversion.from}" converted to ${conversion.ticket}; Gary writes the moneyline card`);
      answer = await ask(buildSmallDogConversionMessage(conversion));
      const converted = parse(answer);
      if (!convertedTicketOk(converted, conversion)) {
        return { error: `NCAAF answer did not return the converted ticket ${conversion.ticket}`, code: 'small_underdog_conversion', rawAnalysis: answer, homeTeam, awayTeam, sport };
      }
      converted.converted_from = conversion.from;
      pick = converted;
    }
    if (moneylinePastCap(pick)) return { error: 'NCAAF answer exceeded the moneyline limit', code: 'moneyline_limit', rawAnalysis: answer, homeTeam, awayTeam, sport };
    const audit = auditPickRationale(pick, messages);
    if (audit.unsupported.length) pick._statAuditWarnings = audit.unsupported;
    pick.toolCallHistory = [];
    pick.iterations = messages.filter((m) => m.role === 'assistant').length;
    pick.rawAnalysis = answer;
    pick._fullAssistantNarrative = messages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n\n---\n\n');
    pick._modelUsed = session.modelName;
    pick._originalToolResponses = [];
    pick._evidenceObservedAt = new Date().toISOString();
    pick._ncaafQuestion = true;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
