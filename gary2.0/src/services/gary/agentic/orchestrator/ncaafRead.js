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

// HOW GOOD THEY ARE: the poll, the conferences, the season table and the per-play measures the desk carries (success
// rate, explosiveness, sacks and tackles for loss; points per trip and turnover counts are left out).
function howGood(desk) {
  const text = String(desk || '');
  const poll = sectionOf(desk, 'AP TOP 25');
  const conferences = sectionOf(desk, 'NCAAF CONFERENCE CONTEXT').split('\n').filter((l) => /^\[(?:HOME|AWAY)\]/.test(l)).map((l) => l.replace(/^\[(?:HOME|AWAY)\] /, '')).join('\n');
  const table = sectionOf(desk, 'TEAM STATISTICS').split('\n').filter((l) => !/^This section uses|^records provide|^A dash means/.test(l)).join('\n').trim();
  const block = (name) => { const i = text.indexOf(`\n${name}\n`); if (i < 0) return null; const j = text.slice(i + 1).search(/\n(?:NCAAF_[A-Z_]+|REST & SCHEDULE)/); return text.slice(i + 1, j < 0 ? undefined : i + 1 + j); };
  const side = (b, s) => { if (!b) return {}; const i = b.indexOf(`\n${s}:\n`); if (i < 0) return {}; const out = {}; for (const l of b.slice(i + s.length + 3).split('\n')) { const m = l.match(/^ {2}([a-z_]+): (.+)$/); if (!m) break; out[m[1]] = m[2]; } return out; };
  const b = { sr: block('NCAAF_SUCCESS_RATE'), ex: block('NCAAF_EXPLOSIVE_PLAYS'), pr: block('NCAAF_PRESSURE_RATE') };
  const perPlay = [];
  for (const s of ['away', 'home']) {
    const sr = side(b.sr, s), ex = side(b.ex, s), pr = side(b.pr, s);
    const team = sr.team || ex.team || pr.team;
    if (!team) continue;
    const parts = [];
    if (sr.offense_success_rate) parts.push(`plays that succeed: ${sr.offense_success_rate} on offense, ${sr.defense_success_rate_allowed} allowed on defense`);
    if (ex.offense_explosiveness) parts.push(`size of the successful plays (explosiveness): ${ex.offense_explosiveness} on offense, ${ex.defense_explosiveness_allowed} allowed`);
    if (pr.sacks) parts.push(`${pr.sacks} sacks and ${pr.tackles_for_loss} tackles for loss`);
    if (parts.length) perPlay.push(`${team}: ${parts.join('; ')}`);
  }
  return [poll, conferences, table, perPlay.join('\n')].filter(Boolean).join('\n\n');
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
    ['WHAT THE PLAYERS ON THE REPORT HAVE DONE, AND WHO ELSE PLAYS THERE', afterIntro(sectionOf(desk, 'WHO PRODUCED IT'))],
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
