// THE NFL READ (Oct 19 2026, the new NFL system; founder: "create your own pie instead of trying to fix the pie that
// we have now"). Every NFL game pick. Gary reads the game the way a sharp does before betting it: the line and how it
// got to this number first, then who's playing at quarterback, who's out, how good both teams are play after play
// (with ranks), the season game by game, the spot and the week's reporting, plus the news desk's latest on who plays.
// He is asked what the line is saying, what matters in this game and what doesn't, and who he likes at this spread;
// then he writes that answer as the card. His instructions are what a sharp knows about NFL markets (nflKnowledge.js)
// and the date. Nothing weighs, scores or projects for him. The scout report stays the source of the injury report,
// the starting quarterbacks and the articles; this file decides what he reads and in what order.
import { createHash } from 'node:crypto';
import { nflSystemPrompt, nflGameMessage, nflCardMessage, NFL_FORMAT_ONLY } from './nflKnowledge.js';
import { sectionOf, articlesOf, articleOpening, matchupHeader, spreadInWords, lineOf, esc } from './footballDeskText.js';
import { nflLastSeasonsText } from '../scoutReport/sports/nflLastSeasons.js';
import { getNflSchedule } from '../../../sports/nfl/nflSchedule.js';
import { loadBettorData, strength, gameByGame, quarterbacks, spot, linePath, lineStory, etDate } from '../../../sports/nfl/nflBettorData.js';
import { nflSeason } from '../../../../utils/dateUtils.js';
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

// The injury report as reported, without the desk's standing notes about it.
export function injuriesAsReported(desk) {
  return sectionOf(desk, 'INJURY REPORT').split('\n')
    .filter((l) => !/already in the spread|^Each row shows the reported status|^TODAY'S DATE/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// This week's reporting: each team's week, the storylines or preview, the quarterbacks story; openings only.
export function reporting(desk, homeTeam, awayTeam) {
  const all = articlesOf(desk);
  const pick = (re) => all.find((a) => re.test(a.heading));
  const chosen = [pick(new RegExp(`^${esc(awayTeam)} — THIS WEEK'S CHANGES`)), pick(new RegExp(`^${esc(homeTeam)} — THIS WEEK'S CHANGES`)),
    pick(/^THE (?:STORYLINES THIS WEEK|GAME PREVIEW), AS WRITTEN/), pick(/^THE QUARTERBACKS, AS WRITTEN/)].filter(Boolean);
  const seen = new Set();
  return chosen.filter((a) => !seen.has(a.title) && seen.add(a.title))
    .map((a) => `"${a.title}"${a.published ? ` (${a.published})` : ''}\n${articleOpening(a.body)}`).join('\n\n');
}

/** The game as Gary reads it. `asOf` cuts every fact: games before its ET date, line moves up to it. */
export async function buildNflReadStory(desk, { homeTeam, awayTeam, gameId, gameDate, asOf = new Date(), season = nflSeason() } = {}) {
  const before = etDate(asOf);
  const [data, schedule, lines] = await Promise.all([
    loadBettorData(season),
    getNflSchedule().catch(() => null),
    linePath(await db().catch(() => null), gameId, asOf).catch(() => null),
  ]);
  const line = lineOf(desk);
  const where = spot(data, homeTeam, awayTeam, gameDate || before);
  const header = where.neutral
    ? String(matchupHeader(desk)).replace(/^Venue: .*$/m, `Venue: ${where.neutral} (neutral site; ${homeTeam} are the designated home team)`)
    : matchupHeader(desk);
  const situation = [where.text, (desk.match(/^Kickoff: [^\n]*/m) || [])[0], (desk.match(/^Kickoff weather[^\n]*/m) || [])[0]].filter(Boolean).join('\n');
  const parts = [
    [header, spreadInWords(line)].filter(Boolean).join('\n'),
    ['THE LINE AND HOW IT GOT HERE', lineStory(lines, homeTeam, awayTeam, line)],
    ['THE QUARTERBACKS', quarterbacks(data, sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK'), homeTeam, awayTeam, before)],
    ['THE INJURY REPORT', injuriesAsReported(desk)],
    ['HOW GOOD THEY ARE', `${strength(data, awayTeam, before)}\n${strength(data, homeTeam, before)}`],
    ['WHO THESE TEAMS ARE: THE LAST THREE SEASONS', schedule && !schedule.unavailable ? nflLastSeasonsText(schedule, { homeTeam, awayTeam, season }) : ''],
    ['THIS SEASON, GAME BY GAME', `${gameByGame(data, awayTeam, before)}\n\n${gameByGame(data, homeTeam, before)}`],
    ['THE SITUATION', situation],
    ['THIS WEEK, AS THE BEAT WRITERS TELL IT', reporting(desk, homeTeam, awayTeam)],
  ];
  return { line, story: parts.map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n') };
}

/** One game on Gary's morning board (winners/nflBoard.js): the line's path, the quarterbacks, who's out, how good, the
 * spot and the news desk's report. `data` is loadBettorData's, shared across the board. */
export async function buildNflBoardEntry(desk, news, { homeTeam, awayTeam, gameId, gameDate, kickoff, asOf = new Date(), data }) {
  const before = etDate(asOf);
  const lines = await linePath(await db().catch(() => null), gameId, asOf).catch(() => null);
  const kick = kickoff ? new Date(kickoff).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const where = spot(data, homeTeam, awayTeam, gameDate || before);
  return [`### ${awayTeam} at ${homeTeam}${kick ? ` · ${kick} ET` : ''}${where.neutral ? ` · ${where.neutral}` : ''}`,
    lineStory(lines, homeTeam, awayTeam, lineOf(desk)), '',
    'Quarterbacks:', quarterbacks(data, sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK'), homeTeam, awayTeam, before), '',
    'Injury report:', injuriesAsReported(desk), '',
    'How good they are:', `${strength(data, awayTeam, before)}\n${strength(data, homeTeam, before)}`, '',
    'The spot:', where.text || 'Nothing unusual.',
    news ? `\nThe news desk:\n${news}` : ''].join('\n');
}

// The news desk's latest on who plays (nflResearchPrompts.js), from the game as Gary reads it. Optional: a failed or
// timed-out search leaves TODAY'S NEWS as "Nothing beyond the scout report."
async function latestNews(story, sport, homeTeam, awayTeam, options, costTracker) {
  if (String(process.env.GARY_RESEARCHER || 'on').toLowerCase() === 'off') return { news: null, model: null };
  const timeoutMs = researchBudgetMs({
    configuredMs: Number(process.env.GARY_RESEARCH_TIMEOUT_MS) || 20 * 60 * 1000,
    deadlineAt: process.env.GARY_CHILD_DEADLINE_AT,
    decisionReserveMs: process.env.GARY_RESEARCH_DECISION_RESERVE_MS ?? 8 * 60 * 1000,
  });
  const models = [GAME_RESEARCH_MODEL, GAME_RESEARCH_FALLBACK_MODEL, GAME_RESEARCH_BRIDGE_MODEL].filter((m, i, a) => m && a.indexOf(m) === i);
  const key = createHash('sha256').update(JSON.stringify(['nfl-news', sport, homeTeam, awayTeam, options.gameId, options.gameTime, story])).digest('hex');
  const research = await withOptionalData(() => runResearchOnce(key, {
    models,
    timeoutMs,
    signal: options.signal,
    build: (researchModel, signal) => buildResearchBriefing(story, sport, homeTeam, awayTeam, { ...options, _costTracker: costTracker, researchModel, signal }),
    onAttempt: (researchModel) => console.log(`[NFL Read] 📰 News desk (${researchModel}) looks for the latest on who plays`),
    onFailure: (researchModel, err, hasNext) => console.warn(`[NFL Read] ⚠️ News desk ${researchModel} failed (${err.message})${hasNext ? ' — trying the next' : ''}`),
  }));
  const news = typeof research.result === 'string' ? research.result : research.result?.briefing;
  if (!news) console.warn(`[NFL Read] No news desk report; TODAY'S NEWS reads "Nothing beyond the scout report." (${research.failures.join(' | ')})`);
  return { news: news ? String(news).trim() : null, model: news ? research.model : null };
}

export async function runNflRead({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NFL read: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const game = options.game || {};
    const { line, story } = await buildNflReadStory(desk, { homeTeam, awayTeam, gameId: game.id ?? options.gameId, gameDate: game.commence_time ? etDate(game.commence_time) : null });
    console.log(`[NFL Read] the game as Gary reads it (${story.length} chars)`);
    const research = await latestNews(story, sport, homeTeam, awayTeam, options, costTracker);
    if (research.news) console.log(`[NFL Read] News desk report ready (${research.news.length} chars, ${research.model})`);

    const system = nflSystemPrompt(today);
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

    const read = await ask(nflGameMessage(story, research.news));
    console.log(`[NFL Read] ${session.modelName}: read (${read.length} chars); asking for the card`);
    let answer = await ask(nflCardMessage(line));
    let pick = parse(answer);
    if (!pick) {
      console.log('[NFL Read] No JSON block in the card — asking for the format only');
      answer = await ask(NFL_FORMAT_ONLY);
      pick = parse(answer);
    }
    if (!pick) return { error: 'NFL read: no parseable pick', code: 'invalid_final_answer', homeTeam, awayTeam, sport, rawAnalysis: answer };

    // The house's small-underdog law (Oct 1 2026): his side stands at its moneyline, and he writes that card.
    const conversion = smallDogConversion(pick, homeTeam, awayTeam);
    if (conversion) {
      console.warn(`[NFL Read] 🔁 SMALL UNDERDOG: "${conversion.from}" converted to ${conversion.ticket}; Gary writes the moneyline card`);
      answer = await ask(buildSmallDogConversionMessage(conversion));
      const converted = parse(answer);
      if (!convertedTicketOk(converted, conversion)) {
        return { error: `NFL answer did not return the converted ticket ${conversion.ticket}`, code: 'small_underdog_conversion', rawAnalysis: answer, homeTeam, awayTeam, sport };
      }
      converted.converted_from = conversion.from;
      pick = converted;
    }
    if (moneylinePastCap(pick)) return { error: 'NFL answer exceeded the moneyline limit', code: 'moneyline_limit', rawAnalysis: answer, homeTeam, awayTeam, sport };

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
    pick._nflRead = true;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
