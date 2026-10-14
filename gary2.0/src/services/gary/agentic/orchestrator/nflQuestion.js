// THE NFL QUESTION (founder, Oct 14 2026: "lets try and since we can test past picks right? same way we did with
// MLB"): the MLB playoff question with the NFL's nouns. Gary takes in the game the way a fan does: who's favored and
// by how much, each team's season game by game with the headlines, last season, the quarterbacks, who's out, this
// week as the beat writers tell it, and the week's storylines. He answers "Who do you like at this spread, and why?";
// then he writes that answer as the card's Gary's Take with THE LINE in front of him. His instructions are Adam's NFL
// awareness (nflConstitution.js, his approved words) and the date. The stat sections stay on the desk; they are not in
// front of him. College has its own process (ncaafQuestion.js; founder, Oct 14 2026: "changing NFL shouldnt
// necessarily change NCAAF"). Who each team is comes before this season (founder, Oct 14 2026: "who this team is is
// kind of the missing piece for Gary to connect the dots"). Not wired into the live pick yet: the replay on saved
// desks comes first.
// LIVE (founder GO, Oct 14 2026: "let's make this the real version ... Thursday and the rest of the week will be on
// what just went 11-4"; "you're not supposed to be making any more edits than making it just like the system that
// went 11-4-1"): runNflQuestion is every NFL game pick, exactly as the replay ran it: Version D's awareness
// (nflConstitution.js) and the date as his instructions, the story with each team's last three seasons first, no
// research notes and no web, the card from his answer. The house's small-underdog conversion and moneyline limit
// apply to the ticket as they do on every football pick. College keeps its own lane.
import { NFL_CONSTITUTION } from '../constitution/nflConstitution.js';
import { esc, sectionOf, articlesOf, articleOpening, matchupHeader, spreadInWords, lineOf } from './footballDeskText.js';
import { NFL_LAST_SEASONS_TITLE, nflLastSeasonsText } from '../scoutReport/sports/nflLastSeasons.js';
import { getNflSchedule } from '../../../sports/nfl/nflSchedule.js';
import { nflSeason } from '../../../../utils/dateUtils.js';
import { GAME_PICK_MODEL } from './orchestratorConfig.js';
import { createModelSession, sendToSessionWithRetry } from './sessionManager.js';
import { createCostTracker } from './costTracker.js';
import { parseGaryResponse } from './responseParser.js';
import { auditPickRationale } from './statAudit.js';
import { buildSmallDogConversionMessage } from './passBuilders.js';
import { gameMarketUnavailable } from './mlbCaseMenu.js';
import { moneylinePastCap, smallDogConversion, convertedTicketOk } from './agentLoop.js';

export function nflQuestionSystemPrompt(today) {
  const view = String(NFL_CONSTITUTION.pass1Context || '').trim();
  return `${view ? `${view}\n\n` : ''}Today is ${today}. Your memory of players, rosters and stats is out of date; the scout report is current. Only mention players the scout report names, and never write a number, score or record that isn't in the scout report or the research notes.`;
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

// The quarterbacks: the desk's starter line for each team, with that player's injury-report line when he has one.
function nflQuarterbacks(desk, injuries) {
  return sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK').split('\n')
    .filter((l) => /^\[(?:HOME|AWAY)\] /.test(l))
    .map((l) => {
      const line = l.replace(/^\[(?:HOME|AWAY)\] /, '').replace(/ \(#\d+\)$/, '');
      const name = (line.match(/: ([^(]+?) \(/) || [])[1];
      const last = name ? name.trim().split(' ').pop() : '';
      const note = last && injuries.split('\n').find((i) => /^\s*• /.test(i) && i.includes(name.trim()) && /Quarterback/.test(i));
      return note ? `${line}\n  on the injury report: ${note.replace(/^\s*• /, '').trim()}` : line;
    }).join('\n');
}

function nflStory(desk, line, homeTeam, awayTeam) {
  const injuries = sectionOf(desk, 'INJURY REPORT');
  const week = sectionOf(desk, 'WHAT THIS WEEK IS ABOUT — AS WRITTEN').replace(/^Sentences copied word for word[^\n]*\n+/, '');
  return [
    [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
    ['WHO THESE TEAMS ARE: THE LAST THREE SEASONS', sectionOf(desk, NFL_LAST_SEASONS_TITLE)],
    ['THE SITUATION', sectionOf(desk, 'THE SITUATION')],
    ['LAST SEASON', sectionOf(desk, "LAST SEASON'S RECORD")],
    ['THE QUARTERBACKS', nflQuarterbacks(desk, injuries)],
    ['THE INJURY REPORT', injuries],
    ['THIS WEEK, AS THE BEAT WRITERS TELL IT', beatWriters(desk, homeTeam, awayTeam)],
    ['WHAT THIS WEEK IS ABOUT, AS WRITTEN', week],
  ];
}

export function buildNflStory(desk, line, homeTeam, awayTeam) {
  return nflStory(desk, line, homeTeam, awayTeam).map((p) => (Array.isArray(p) ? (p[1] ? `${p[0]}\n${p[1]}` : null) : p)).filter(Boolean).join('\n\n');
}

export function buildNflGameMessage(story, notes = '') {
  return `## THE GAME

${story}

## TODAY'S NEWS (from your research assistant)

${notes || 'Nothing beyond the scout report.'}

Who do you like at this spread, and why?`;
}

// The last message: his answer is made in conversation; the card is written from it, with THE LINE.
export function buildNflCardMessage(line = '') {
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

export const NFL_FORMAT_ONLY = 'Your answer did not include the JSON block. Add it now with the same pick and the same Gary\'s Take: "final_pick" ("[Team] [spread or ML] [price]" at that ticket\'s exact price from THE LINE), "rationale" ("Gary\'s Take\\n\\n" followed by the Gary\'s Take you wrote) and "confidence_score" (0.50-1.00).';

// The desk with each team's last three seasons ahead of THE SITUATION, as the replay's desks had it (the desk
// itself is unchanged; this copy is what the story reads). Without the schedule file the desk goes as it is.
export async function withLastSeasons(desk, homeTeam, awayTeam, season) {
  const text = String(desk || '');
  if (sectionOf(text, NFL_LAST_SEASONS_TITLE)) return text;
  const schedule = await getNflSchedule().catch((e) => { console.warn(`[NFL Question] schedule file unavailable: ${e?.message || e}`); return null; });
  const body = schedule && !schedule.unavailable ? nflLastSeasonsText(schedule, { homeTeam, awayTeam, season }) : '';
  const at = text.indexOf('THE SITUATION\n');
  if (!body || at < 0) { console.warn('[NFL Question] the last three seasons could not be added'); return text; }
  const rule = '━'.repeat(70);
  return `${text.slice(0, at)}${NFL_LAST_SEASONS_TITLE}\n${rule}\n${body}\n${rule}\n\n${text.slice(at)}`;
}

export async function runNflQuestion({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NFL question: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const system = nflQuestionSystemPrompt(today);
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
    const parse = (text) => parseGaryResponse(text, homeTeam, awayTeam, sport, options.game || {});

    const fullDesk = await withLastSeasons(desk, homeTeam, awayTeam, nflSeason());
    const line = lineOf(fullDesk);
    const story = buildNflStory(fullDesk, line, homeTeam, awayTeam);
    console.log(`[NFL Question] ${session.modelName}: the game in words (${story.length} chars)`);
    const read = await ask(buildNflGameMessage(story));
    console.log(`[NFL Question] Answer (${read.length} chars); asking for the card`);
    let answer = await ask(buildNflCardMessage(line));
    let pick = parse(answer);
    if (!pick) {
      console.log('[NFL Question] No JSON block in the card — asking for the format only');
      answer = await ask(NFL_FORMAT_ONLY);
      pick = parse(answer);
    }
    if (!pick) return { error: 'NFL question: no parseable pick', code: 'invalid_final_answer', homeTeam, awayTeam, sport, rawAnalysis: answer };

    // The house's small-underdog law (Oct 1 2026): his side stands at its moneyline, and he writes that card.
    const conversion = smallDogConversion(pick, homeTeam, awayTeam);
    if (conversion) {
      console.warn(`[NFL Question] 🔁 SMALL UNDERDOG: "${conversion.from}" converted to ${conversion.ticket}; Gary writes the moneyline card`);
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
    pick._researchBriefing = null;
    pick._researchModel = null;
    pick._modelUsed = session.modelName;
    pick._originalToolResponses = [];
    pick._evidenceObservedAt = new Date().toISOString();
    pick._nflQuestion = true;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
