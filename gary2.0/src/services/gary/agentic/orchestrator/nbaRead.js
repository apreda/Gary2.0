// THE NBA READ (Oct 21 2026, founder: "give college the NFL treatment and same with NBA then we can always go back to
// the old NBA if needed"). Every NBA game pick unless GARY_NBA_SYSTEM=april, which runs the April 2026 prompts
// (nbaWinningEra.js) through the agent loop. The NBA's own copy of the NFL read's shape (nflRead.js): the line and how
// it got to this number first, then who's playing and who's out, how good both teams are per possession with ranks,
// the season game by game, the rotation, the spot and the reporting, plus the day's news gathered for the desk. He is
// asked what the line is saying, what matters in this game and what doesn't, and which side he likes at this spread;
// then he writes that answer as the card. His instructions are what a sharp knows about NBA markets (nbaKnowledge.js)
// and the date. Nothing weighs, scores or projects for him. The 11-factor research briefing does not run: the desk's
// news is the news, as the NFL's news desk is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { nbaSystemPrompt, nbaGameMessage, nbaCardMessage, NBA_FORMAT_ONLY } from './nbaKnowledge.js';
import { esc, sectionOf, articlesOf, articleOpening, matchupHeader, spreadInWords } from './footballDeskText.js';
import { withoutBettingLines } from './ncaafRead.js';
import { linePath, lineStory, etDate } from '../../../sports/nfl/nflBettorData.js';
import { leagueRatings, strengthLine, gameByGame } from '../../../sports/nba/nbaBettorData.js';
import { GAME_PICK_MODEL, GAME_ML_CAP } from './orchestratorConfig.js';
import { createModelSession, sendToSessionWithRetry } from './sessionManager.js';
import { createCostTracker } from './costTracker.js';
import { parseGaryResponse } from './responseParser.js';
import { auditPickRationale } from './statAudit.js';
import { buildMlCapRetryMessage } from './passBuilders.js';
import { gameMarketUnavailable } from './mlbCaseMenu.js';
import { moneylinePastCap } from './agentLoop.js';

let _db = null;
async function db() {
  if (!_db) { const m = await import('../../../../supabaseClient.js'); _db = m.supabaseAdmin || m.supabase; }
  return _db;
}

/** THE LINE, held for the card: the spread, the moneylines and the tickets, from the desk's BETTING CONTEXT. */
export function nbaLineOf(desk) {
  return sectionOf(desk, 'BETTING CONTEXT').split('\n')
    .filter((l) => /^(?:Spread|Moneyline|Tickets on this game|Total|Over\/Under):/.test(l)).join('\n');
}

// The injury report as reported, in plain facts. The desk's labels steer ("PRICED IN", "ESTABLISHED ABSENCES (already
// reflected in line + all stats above — do NOT cite these players by name as reasons for your pick)"); the read keeps
// what each label stood on: since when, and how many games the team has played without him.
export function injuriesAsReported(desk) {
  return sectionOf(desk, 'INJURY REPORT').split('\n')
    .filter((l) => !/^TODAY'S DATE/.test(l))
    .map((l) => l
      .replace(/^ACTIVE INJURIES$/, 'NEW, UNCERTAIN OR PROBABLE')
      .replace(/^ESTABLISHED ABSENCES.*$/, 'ALREADY OUT (the team has played its recent games without them)')
      .replace(/\[SEASON OPENER — no regular-season games played yet\]/, '[out for the opener]')
      .replace(/\[SEASON-LONG\]/, '[has not played in any of the team\'s recent games]')
      .replace(/\[(?:FRESH|SHORT-TERM|PRICED IN|LONG-TERM|OUT) — Since ([^(\]]+) \((\d+)d(?:, ([^)]+))?\)\]/, (m, since, days, missed) => `[since ${since.trim()}, ${days} days${missed ? `, ${missed}` : ''}]`)
      .replace(/\[(?:FRESH|SHORT-TERM|PRICED IN|LONG-TERM|OUT) \(([^)]+)\)\]/, '[$1]')
      .replace(/\[(?:FRESH|SHORT-TERM|PRICED IN|LONG-TERM)\]/, ''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// THE ROTATION: each team's top players by minutes with their basic line this season (the desk's advanced and
// team-share lines stay out).
function rotation(desk) {
  return sectionOf(desk, 'AVAILABLE ROSTER').split('\n')
    .filter((l) => /^\[(?:HOME|AWAY)\] /.test(l) || /^ {2}\S.* - .*PPG/.test(l))
    .map((l) => l.replace(/^\[(?:HOME|AWAY)\] (.+):$/, (m, t) => `${t.replace(/\b([A-Z])([A-Z']+)\b/g, (w, a, b) => a + b.toLowerCase())}:`))
    .join('\n').trim();
}

// Where each team stands, from the desk's standings ("#7 in West (0-0) | Home: 0-0 | Road: 0-0").
function standings(desk) {
  return sectionOf(desk, 'NBA LEAGUE CONTEXT').split('\n').filter((l) => /^\s*\[(?:HOME|AWAY)\] /.test(l))
    .map((l) => l.trim().replace(/^\[(?:HOME|AWAY)\] /, '')).join('\n');
}

// A team before its first game: the desk's BEFORE THE FIRST GAME block for it (last season's finish, this season's
// roster and who left).
function beforeFirstGame(desk, team) {
  const block = sectionOf(desk, 'BEFORE THE FIRST GAME');
  const i = block.search(new RegExp(`^\\[(?:HOME|AWAY)\\] ${esc(team)}$`, 'm'));
  if (i < 0) return '';
  const rest = block.slice(i).split('\n');
  const end = rest.findIndex((l, k) => k > 0 && /^\[(?:HOME|AWAY)\] /.test(l));
  return (end > 0 ? rest.slice(1, end) : rest.slice(1)).join('\n').trim();
}

// The reporting: the preview and storylines, each team's identity piece and the recent run; openings only, with any
// sentence that carries a betting line left out.
export function reporting(desk, homeTeam, awayTeam) {
  const all = articlesOf(desk);
  const pick = (re) => all.find((a) => re.test(a.heading));
  const chosen = [pick(/^THE GAME PREVIEW, AS WRITTEN/), pick(/^THE STORYLINES, AS WRITTEN/),
    pick(new RegExp(`^${esc(awayTeam)} — WHO THIS TEAM IS RIGHT NOW`)), pick(new RegExp(`^${esc(homeTeam)} — WHO THIS TEAM IS RIGHT NOW`)),
    pick(/^THE RECENT RUN, AS WRITTEN/)].filter(Boolean);
  const seen = new Set();
  return chosen.filter((a) => !seen.has(a.title) && seen.add(a.title))
    .map((a) => ({ a, opening: articleOpening(withoutBettingLines(a.body)) }))
    .filter(({ opening }) => opening.trim())
    .map(({ a, opening }) => `"${a.title}"${a.published ? ` (${a.published})` : ''}\n${opening}`).join('\n\n');
}

/** The day's news gathered for the desk: the part after its own injury lists, without betting lines. */
export function deskNews(desk) {
  const state = sectionOf(desk, 'CURRENT STATE & CONTEXT');
  const i = state.indexOf("--- TODAY'S GAME CONTEXT & NEWS ---");
  const text = i >= 0 ? state.slice(i + "--- TODAY'S GAME CONTEXT & NEWS ---".length) : '';
  // The search's own opening line ("I'll use the latest roster news ...") is its note to itself, not news.
  const body = text.trim().replace(/^I(?:’|')ll [^\n]*\n+|^I will [^\n]*\n+/, '');
  return withoutBettingLines(body).replace(/\n{3,}/g, '\n\n').trim();
}

/** The game as Gary reads it. `asOf` cuts the line's path and the season at the moment of the pick; `book` is the
 * ticket's book; `league` (tests only) stands in for the league's ratings. */
export async function buildNbaReadStory(desk, { homeTeam, awayTeam, gameId, book = null, asOf = new Date(), league = null } = {}) {
  const [lines, ratings] = await Promise.all([
    linePath(await db().catch(() => null), gameId, asOf, 'basketball_nba', book).catch(() => null),
    league ? Promise.resolve(league) : leagueRatings().catch(() => ({})),
  ]);
  const line = nbaLineOf(desk);
  const how = [standings(desk), ...[awayTeam, homeTeam].map((team) => {
    const before = ratings[team] ? '' : beforeFirstGame(desk, team);
    return before ? `${team}: no games yet this season. Before the first game:\n${before}` : strengthLine(ratings, team);
  })].filter(Boolean).join('\n\n');
  const [awayGames, homeGames] = await Promise.all([awayTeam, homeTeam].map((team) => (ratings[team]
    ? gameByGame(team, ratings, asOf).catch(() => `${team}: games not on file.`)
    : Promise.resolve(`${team}: no games played yet this season.`))));
  const parts = [
    [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
    ['THE LINE AND HOW IT GOT HERE', lineStory(lines, homeTeam, awayTeam)],
    ['WHO IS PLAYING', [sectionOf(desk, 'STARTING LINEUPS'), injuriesAsReported(desk)].filter(Boolean).join('\n\n')],
    ['HOW GOOD THEY ARE', how],
    ['THIS SEASON, GAME BY GAME', `${awayGames}\n\n${homeGames}`],
    ['THE ROTATION THIS SEASON', rotation(desk)],
    ['THE SITUATION', sectionOf(desk, 'REST & SCHEDULE SITUATION')],
    ['THE REPORTING, AS WRITTEN', reporting(desk, homeTeam, awayTeam)],
  ];
  return { line, story: parts.map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n'), news: deskNews(desk) };
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

    const read = await ask(nbaGameMessage(story, news));
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
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
