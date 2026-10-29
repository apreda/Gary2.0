// THE NFL READ (Oct 19 2026, the new NFL system; founder: "create your own pie instead of trying to fix the pie that
// we have now"). Every NFL game pick. Gary reads the game the way a sharp does before betting it: the line and how it
// got to this number first, then who's playing at quarterback (with this week's starter's record apart from his
// backups' games), who's out, the season game by game, the players the ball goes to, and the schedule, travel and
// weather, plus the news desk's latest on who plays. This season only, no per-play numbers (founder, Oct 23
// 2026: "last season is old news"; see nflBettorData.js). No articles (founder,
// Oct 22 2026: TNF's read built its Patriots case from a Patriots.com game plan cut to its opening, and read more evenly
// without the articles).
// He is asked what the line is saying, what matters in this game and what doesn't, and who he likes at this spread;
// then he writes that answer as the card. His instructions are what a sharp knows about NFL markets (nflKnowledge.js)
// and the date. Nothing weighs, scores or projects for him. The scout report stays the source of the injury report
// and the starting quarterbacks; this file decides what he reads and in what order.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { nflSystemPrompt, nflGameMessage, nflCardMessage, NFL_FORMAT_ONLY } from './nflKnowledge.js';
import { sectionOf, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { withoutBettingLines, footballNews } from './ncaafRead.js';
import { loadBettorData, strength, gameByGame, notOnReport, skillPlayers, quarterbacks, deskStarter, spot, etDate, rosterMoves } from '../../../sports/nfl/nflBettorData.js';
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

export const NEWS_NOT_ON_FILE = "The news search did not return a report for this game; today's news is not on file.";


// Regulars who missed or left the last game and are not on this week's report, under it (nflBettorData notOnReport).
export function backOffReport(data, desk, awayTeam, homeTeam, before) {
  const report = sectionOf(desk, 'INJURY REPORT');
  const lines = [awayTeam, homeTeam].map((t) => notOnReport(data, t, before, report)).filter(Boolean);
  return lines.length ? `MISSED OR LEFT THE LAST GAME, NOT ON THIS WEEK'S INJURY REPORT\n${lines.join('\n')}` : null;
}

// The injury report as reported, without the desk's standing notes about it or its own title and rule under the
// section's heading (Oct 23 2026 section review).
export function injuriesAsReported(desk) {
  return sectionOf(desk, 'INJURY REPORT').split('\n')
    .filter((l) => !/already in the spread|^Each row shows the reported status|^TODAY'S DATE|^NFL INJURY REPORT$|^─+$/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The game as Gary reads it. `asOf` cuts every fact: games before its ET date. */
export async function buildNflReadStory(desk, { homeTeam, awayTeam, gameId, gameDate, asOf = new Date(), season = nflSeason(), book = null } = {}) {
  const before = etDate(asOf);
  // The spread he bets, said once in the header; not the line's path, the opener, the total or the moneylines (founder,
  // Oct 23 2026: the market is other people's opinions, and Gary reads the game; see nflKnowledge.js).
  const data = await loadBettorData(season);
  data.asOf = asOf;   // same-day finals count once over (nflBettorData played())
  const qbs = sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK');
  const line = lineOf(desk);
  const where = spot(data, homeTeam, awayTeam, gameDate || before);
  const header = where.neutral
    ? String(matchupHeader(desk)).replace(/^Venue: .*$/m, `Venue: ${where.neutral} (neutral site; ${homeTeam} are the designated home team)`)
    : matchupHeader(desk);
  const situation = [where.text, (desk.match(/^Kickoff: [^\n]*/m) || [])[0], (desk.match(/^Kickoff weather[^\n]*/m) || [])[0]].filter(Boolean).join('\n');
  // The order a bettor reads a game in: the spread; who plays (the quarterbacks, the injury report, who is
  // back); each team's season game by game; the players the ball goes to; the schedule, travel and weather. Headings
  // name the data, never what to make of it (Oct 23 2026 section review: "WHO THE OFFENSE RUNS THROUGH" and "THE
  // SITUATION" went the way of "HOW GOOD THEY ARE").
  const parts = [
    [header, spreadInWords(line)].filter(Boolean).join('\n'),
    ['THE QUARTERBACKS', quarterbacks(data, qbs, homeTeam, awayTeam, before)],
    ['THE INJURY REPORT', [injuriesAsReported(desk), backOffReport(data, desk, awayTeam, homeTeam, before)].filter(Boolean).join('\n\n')],
    ["ROSTER MOVES", await rosterMoves(data, homeTeam, awayTeam, before)],
    // The record and the kickers head each team's game log; a separate HOW GOOD THEY ARE repeated its scores and yards
    // (Oct 23 2026 data review), and the record with and without this week's quarterback is in THE QUARTERBACKS.
    ["THIS SEASON, GAME BY GAME (a game's weather line appears only for rain, snow, a storm, wind of 15 mph or more, or freezing; a game without one was indoors or dry and calm)", `${gameByGame(data, awayTeam, before)}\n\n${gameByGame(data, homeTeam, before)}`],
    ["CARRIES AND TARGETS, GAME BY GAME (each team's top two in carries and top four in targets this season and in each of its last three games, quarterbacks aside)",
      `${skillPlayers(data, awayTeam, before, sectionOf(desk, 'INJURY REPORT'))}\n${skillPlayers(data, homeTeam, before, sectionOf(desk, 'INJURY REPORT'))}`],
    ['SCHEDULE, TRAVEL AND WEATHER', situation],
  ];
  return { line, story: parts.map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n') };
}

/** One game on Gary's morning board (winners/nflBoard.js): the spread, the quarterbacks, who's out, how good, the
 * spot and the news desk's report. `data` is loadBettorData's, shared across the board. */
export async function buildNflBoardEntry(desk, news, { homeTeam, awayTeam, gameId, gameDate, kickoff, asOf = new Date(), data }) {
  const before = etDate(asOf);
  const qbs = sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK');
  const kick = kickoff ? new Date(kickoff).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const where = spot(data, homeTeam, awayTeam, gameDate || before);
  return [`### ${awayTeam} at ${homeTeam}${kick ? ` · ${kick} ET` : ''}${where.neutral ? ` · ${where.neutral}` : ''}`,
    spreadInWords(lineOf(desk)) || 'The spread is not on file.', '',
    'Quarterbacks:', quarterbacks(data, qbs, homeTeam, awayTeam, before, { byGame: true }), '',
    'Injury report:', injuriesAsReported(desk), '',
    'This season:', `${strength(data, awayTeam, before, deskStarter(qbs, awayTeam))}\n${strength(data, homeTeam, before, deskStarter(qbs, homeTeam))}`, '',
    'Schedule, travel and weather:', where.text || 'Nothing unusual.',
    footballNews(news) ? `\nThe news desk:\n${footballNews(news)}` : ''].join('\n');
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
  // Betting lines, odds and line moves are cut from the report too: Gary reads the spread he bets and the football, not
  // the market (founder, Oct 23 2026).
  return { news: news ? footballNews(withoutBettingLines(String(news).trim())) || null : null, model: news ? research.model : null };
}

/** The news desk's report for the props desk, from the same story (Oct 29 2026 hunt: NFL props read no news, so a
 * game-day downgrade or inactive never reached them; NBA props read the desk's news). Null when nothing came back. */
export async function nflNewsFor(story, sport, homeTeam, awayTeam, options = {}) {
  const costTracker = createCostTracker(`NFL props news: ${awayTeam} @ ${homeTeam} (${sport})`);
  try { return (await latestNews(story, sport, homeTeam, awayTeam, options, costTracker)).news; } finally { costTracker.logSummary(); }
}

export async function runNflRead({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NFL read: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const game = options.game || {};
    const { line, story } = await buildNflReadStory(desk, { homeTeam, awayTeam, gameId: game.id ?? options.gameId, gameDate: game.commence_time ? etDate(game.commence_time) : null, book: game.line_vendor });
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

    // A failed news search says so; "Nothing beyond the scout report" is kept for a search that found nothing (Oct 23
    // 2026 source audit: a failure read as a quiet day).
    const read = await ask(nflGameMessage(story, research.news || NEWS_NOT_ON_FILE));
    console.log(`[NFL Read] ${session.modelName}: read (${read.length} chars); asking for the card`);
    // What he was asked and answered, as college and the NBA keep it: the morning data check reads it (Oct 23 2026).
    try {
      const dir = `${homedir()}/Library/Logs/gary-nfl-read`;
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}/${etDate(game.commence_time || new Date())}_${awayTeam.split(' ').pop()}_at_${homeTeam.split(' ').pop()}.md`,
        `########## SYSTEM\n${system}\n\n########## ASKED\n${messages[1].content}\n\n########## ANSWERED\n${read}`);
    } catch (e) { console.warn(`[NFL Read] transcript not saved: ${e.message}`); }
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
