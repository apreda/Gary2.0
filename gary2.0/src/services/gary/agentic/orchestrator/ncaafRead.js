// THE COLLEGE READ (Oct 21 2026, founder: "give college the NFL treatment"). Every college game pick. College's own
// copy of the NFL read's shape (nflRead.js), built from college's desk: the line and how it got to this number first,
// then the quarterbacks and coaches, who's out and who plays instead, how good both teams are play after play and
// against whom, the season game by game and the spot, plus the news desk's latest on who plays. No articles (founder,
// Oct 22 2026, for every sport after TNF's NFL read).
// He is asked what the line is saying, what matters in this game and what doesn't, and which side he likes at this
// spread; then he writes that answer as the card. His instructions are what a sharp knows about college markets
// (ncaafKnowledge.js) and the date. Nothing weighs, scores or projects for him. A change to the NFL read never reaches
// this file (founder, Oct 14 2026: "college should have its own process").
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { ncaafSystemPrompt, ncaafGameMessage, ncaafCardMessage, NCAAF_FORMAT_ONLY } from './ncaafKnowledge.js';
import { RULE, isTitle, sectionOf, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { linePath, lineStory, etDate } from '../../../sports/nfl/nflBettorData.js';
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

let _db = null;
async function db() {
  if (!_db) { const m = await import('../../../../supabaseClient.js'); _db = m.supabaseAdmin || m.supabase; }
  return _db;
}

// A sentence that carries a betting line (a spread, an opening number, a book's odds) never reaches him from an
// article: the market appears once, as THE LINE AND HOW IT GOT HERE.
const BETTING = /\b\d+(?:\.\d)?-point (?:favou?rites?|underdogs?|dogs?)\b|^[A-Z][A-Za-z&.]{1,11} [+-]\d+(?:\.5)?$|\bfavou?red by \d|\b(?:DraftKings|FanDuel|BetMGM|Caesars Sportsbook|ESPN ?BET|bet365|BetRivers|Fanatics Sportsbook|sportsbooks?|oddsmakers?)\b|\bpoint spread\b|\bthe spread\b|\bbetting (?:line|odds|market)\b|\bover\/under\b|\bmoneyline\b|\bagainst the spread\b|\bline (?:moved|has moved|opened)\b|\bopened as\b|\bodds\b/i;
export function withoutBettingLines(text) {
  return String(text || '').split('\n').map((p) => p.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter((s) => !BETTING.test(s)).join(' ')).filter((p, i, a) => p.trim() || (i > 0 && a[i - 1].trim())).join('\n');
}

// What a scoreboard says about the next game (Oct 18 2026, founder: "it's common sports betting sense that this
// logic is flawed"): how the halves went, comebacks and turnover counts are left out of the season he reads. Each game
// keeps its final score, its opponent and how every unit played.
const HALVES = / — (?:led|trailed|tied) \d+-\d+ at half, outscored \d+-\d+ after(?:, overtime included)?| — won after trailing at half| — lost a halftime lead/g;
const TURNOVER_COUNT = / · \d+ (?:giveaways?|takeaways?)(?= · |$)/gm;
export function withoutScoreboardNoise(text) {
  return String(text || '').replace(HALVES, '').replace(TURNOVER_COUNT, '');
}

// A section's rows without the desk's opening paragraph that explains them ("Every completed game ...", "Each player ...").
function afterIntro(section) {
  const paras = String(section || '').split(/\n\s*\n/);
  return (/^(?:Every|Each) /.test(paras[0] || '') ? paras.slice(1) : paras).join('\n\n').trim();
}

// The quarterbacks and coaching staff, without the desk's sourcing lines.
function quarterbacksAndCoaches(desk) {
  const lines = String(desk || '').split('\n');
  const start = lines.findIndex((l) => /^COLLEGE STARTING QUARTERBACKS AND STAFF/.test(l));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (RULE.test(lines[i]) || isTitle(lines[i], lines[i + 1])) break;
    if (/^Observed |^\[[a-z0-9_]+\] |^\[official\] |^Availability source:|^UNCERTAINTY:|^Availability designations are/.test(lines[i])) continue;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

// The availability report as reported, without the desk's standing notes about it.
function injuriesAsReported(desk) {
  return sectionOf(desk, 'INJURY REPORT').split('\n')
    .filter((l) => !/already in the spread|^Each row shows the reported status|^TODAY'S DATE/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// HOW GOOD THEY ARE: the poll, the conferences, and each team's season against FBS teams with who played quarterback.
// Oct 23 2026 (founder, after TNF: "its data we know its data"): the provider's season table and per-play measures
// went. Both blended games against FCS teams and games another quarterback played: Oregon's 317 passing yards a game on
// Oct 17 were mostly Dante Moore's, with Moore out and Brock Thomas (15 passes all year) starting, and an 84-0 win
// over Portland State sat inside its averages. Every game's own unit lines stay in the season game by game.
function howGood(desk) {
  const poll = sectionOf(desk, 'AP TOP 25');
  const conferences = sectionOf(desk, 'NCAAF CONFERENCE CONTEXT').split('\n').filter((l) => /^\[(?:HOME|AWAY)\]/.test(l)).map((l) => l.replace(/^\[(?:HOME|AWAY)\] /, '')).join('\n');
  const teams = seasonGames(desk);
  const starters = thisWeeksQuarterbacks(desk, teams.map((t) => t.team));
  const seasons = teams.map(({ team, games }) => seasonLines(team, games, starters.get(team))).join('\n\n');
  return [poll, conferences, seasons].filter(Boolean).join('\n\n');
}

const nameKey = (name) => String(name || '').toLowerCase().replace(/\b(?:jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

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
  const yards = (l) => { const r = l.match(/(\d+) runs for (-?\d+)/), p = l.match(/passing \d+-\d+ for (-?\d+)/); return r && p ? Number(r[2]) + Number(p[1]) : null; };
  for (const l of sectionOf(desk, 'THIS SEASON GAME BY GAME').split('\n')) {
    const t = l.match(/^(\S.*) \(\d+-\d+(?:-\d+)?\):$/);
    if (t) { cur = { team: t[1], games: [] }; teams.push(cur); game = null; continue; }
    const g = cur && l.match(/^ {2}\S.* · ([WLT]) (\d+)-(\d+)(?: \(OT\))? (vs|@) (.+?)(?: \(neutral site[^)]*\))?(?: — |$)/);
    if (g) { game = { result: g[1], pf: Number(g[2]), pa: Number(g[3]), opponent: g[5], fcs: /— opponent: FCS\b/.test(l), qb: null, off: null, def: null }; cur.games.push(game); continue; }
    if (!game) continue;
    const q = l.match(/^\s+quarterback: ([^;]+?) \d+-of-\d+/);
    if (q) game.qb = q[1].trim();
    else if (/^\s+offense: /.test(l)) game.off = yards(l);
    else if (/^\s+defense: /.test(l)) game.def = yards(l);
  }
  return teams;
}

const one = (x) => (Math.round(x * 10) / 10).toFixed(1);
// Five games or fewer are listed game by game instead of averaged (an average of two carried by one blowout reads as
// who the team is; Oct 23 2026 data check).
function perGame(gs) {
  const n = gs.length;
  if (n <= 5) return gs.map((g) => `${g.result} ${g.pf}-${g.pa}${g.off != null && g.def != null ? ` (${g.off} yards, allowed ${g.def})` : ''}`).join(', ');
  const pts = `${one(gs.reduce((a, g) => a + g.pf, 0) / n)} points a game, ${one(gs.reduce((a, g) => a + g.pa, 0) / n)} allowed`;
  const y = gs.filter((g) => g.off != null && g.def != null);
  if (!y.length) return pts;
  const yds = `${Math.round(y.reduce((a, g) => a + g.off, 0) / y.length)} yards a game, ${Math.round(y.reduce((a, g) => a + g.def, 0) / y.length)} allowed`;
  return `${pts} · ${yds}${y.length < n ? ` (yards from ${y.length} of the ${n})` : ''}`;
}
const record = (gs) => { const w = gs.filter((g) => g.result === 'W').length, l = gs.filter((g) => g.result === 'L').length, t = gs.length - w - l; return `${w}-${l}${t ? `-${t}` : ''}`; };
const games = (n) => `${n} game${n === 1 ? '' : 's'}`;

// One team: its games against FBS teams, the FCS games named apart, and the same games by who threw the most passes.
export function seasonLines(team, all, qb = null) {
  const fbs = all.filter((g) => !g.fcs), fcs = all.filter((g) => g.fcs);
  const out = [fbs.length ? `${team}, against FBS teams, ${games(fbs.length)}: ${record(fbs)}, ${perGame(fbs)}` : `${team}: no games against FBS teams yet this season.`];
  if (fcs.length) out.push(`  against FCS teams: ${fcs.map((g) => `${g.result} ${g.pf}-${g.pa} vs ${g.opponent}`).join('; ')}`);
  if (!fbs.length) return out.join('\n');
  const by = new Map();
  for (const g of fbs) { const k = g.qb || 'no passing rows'; by.set(k, [...(by.get(k) || []), g]); }
  const mine = qb ? [...by.keys()].find((k) => nameKey(k) === nameKey(qb)) : null;
  if (mine && by.size === 1) out.push(`  ${qb}, this week's quarterback, threw the most passes in all ${fbs.length}.`);
  else if (mine) {
    out.push(`  With ${qb} (this week's quarterback) throwing the most passes, ${games(by.get(mine).length)}: ${record(by.get(mine))}, ${perGame(by.get(mine))}`);
    for (const [k, gs] of by) if (k !== mine) out.push(`  With ${k} throwing the most passes, ${games(gs.length)}: ${record(gs)}, ${perGame(gs)}`);
  } else {
    if (qb) out.push(`  ${qb}, this week's quarterback, threw the most passes in none of these games.`);
    for (const [k, gs] of by) out.push(`  With ${k} throwing the most passes, ${games(gs.length)}: ${record(gs)}, ${perGame(gs)}`);
  }
  return out.join('\n');
}

// Who else plays there, without the offensive line: linemen record no stats in the feed, so the "others" it listed
// were linemen's stray tackles (Oklahoma's three doubtful linemen on Oct 17 read as "Fred Hinton: Sep 4 1 tackle").
function whoElsePlays(desk) {
  return afterIntro(sectionOf(desk, 'WHO PRODUCED IT')).split('\n').filter((l) => !/^\s+others at (?:OL|OT|OG|IOL|C|G|T): /.test(l)).join('\n');
}

function situation(desk) {
  const road = sectionOf(desk, 'HOME AND ROAD').split('\n')
    .filter((l) => /^(?:Site|Local kickoff|Trip|Kickoff weather):/.test(l) || /: \d+(?:st|nd|rd|th) (?:home|road) game of the season today\.$/.test(l));
  return [...road, sectionOf(desk, 'REST & SCHEDULE SITUATION')].filter(Boolean).join('\n');
}

/** The game as Gary reads it. `asOf` cuts the line's path at the moment of the pick; `book` is the ticket's book. */
export async function buildNcaafReadStory(desk, { homeTeam, awayTeam, gameId, book = null, asOf = new Date() } = {}) {
  const lines = await linePath(await db().catch(() => null), gameId, asOf, 'americanfootball_ncaaf', book).catch(() => null);
  const line = lineOf(desk);
  const parts = [
    [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
    ['THE LINE AND HOW IT GOT HERE', lineStory(lines, homeTeam, awayTeam)],
    ['THE QUARTERBACKS AND COACHES', quarterbacksAndCoaches(desk)],
    ['THE AVAILABILITY REPORT', injuriesAsReported(desk)],
    ['WHAT THE PLAYERS ON THE REPORT HAVE DONE, AND WHO ELSE PLAYS THERE', whoElsePlays(desk)],
    ['HOW GOOD THEY ARE', howGood(desk)],
    ['THIS SEASON, GAME BY GAME', withoutScoreboardNoise(afterIntro(sectionOf(desk, 'THIS SEASON GAME BY GAME')))],
    ['THE SITUATION', situation(desk)],
  ];
  return { line, story: parts.map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n') };
}

/** One game on Gary's college board (winners/ncaafBoard.js), read the way the pick reads it, without his write-up: the
 * line and how it got here, the quarterbacks and coaches, the availability report, how good both teams are, the
 * situation and the news desk's report. */
export async function buildNcaafBoardEntry(desk, news, { homeTeam, awayTeam, gameId, kickoff, asOf = new Date() } = {}) {
  const lines = await linePath(await db().catch(() => null), gameId, asOf, 'americanfootball_ncaaf').catch(() => null);
  const kick = kickoff ? new Date(kickoff).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  return [`### ${awayTeam} at ${homeTeam}${kick ? ` · ${kick} ET` : ''}`,
    lineStory(lines, homeTeam, awayTeam), '',
    'Quarterbacks and coaches:', quarterbacksAndCoaches(desk) || 'Not on the desk.', '',
    'Availability report:', injuriesAsReported(desk) || 'Nothing reported.', '',
    'How good they are:', howGood(desk), '',
    'The situation:', situation(desk) || 'Nothing unusual.',
    news ? `\nThe news desk:\n${news}` : ''].join('\n');
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
  return { news: news ? String(news).trim() : null, model: news ? research.model : null };
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

    const read = await ask(ncaafGameMessage(story, research.news));
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
