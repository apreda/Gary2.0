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
// THE RESEARCH ASSISTANT (founder GO, Oct 14 2026 night: "go on the research assistant"; "there are certain things
// that Gary might want to know or look at"): before Gary reads the game, the researcher the loop ran
// (researchBriefing.js, "beyond the desk" in nflResearchPrompts.js) reports what the desk does not have, and its
// findings fill TODAY'S NEWS. No follow-up questions. Football research stays optional, as in the loop: when it fails
// or runs out of time, the slot reads as it did in the replay.
import { createHash } from 'node:crypto';
import { NFL_CONSTITUTION } from '../constitution/nflConstitution.js';
import { esc, sectionOf, articlesOf, articleOpening, matchupHeader, spreadInWords, lineOf, RULE, isTitle } from './footballDeskText.js';
import { nflInjuryFreshnessText } from '../scoutReport/sports/nflInjuryFreshness.js';
import { nflQuarterbackSeason } from '../scoutReport/sports/nflSeasonPlay.js';
import { NFL_LAST_SEASONS_TITLE, nflLastSeasonsText } from '../scoutReport/sports/nflLastSeasons.js';
import { NFL_STARTERS_TITLE, nflStartersText, NFL_LINEUPS_TITLE, nflLineupsText, _starterKey } from '../scoutReport/sports/nflStarters.js';
import { loadNflverseFile, nflverseCode } from '../../../providers/nflverseService.js';
import { getNflSchedule } from '../../../sports/nfl/nflSchedule.js';
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

// What he knows about how good players are is his to use (founder GO, Oct 14 2026 night: a fan knows the Patriots are
// better than the Raiders from the players, "Ability: how good the players are at their jobs ... Spot on"); the
// report stays the source for who plays, who is hurt and every number.
export function nflQuestionSystemPrompt(today) {
  const view = String(NFL_CONSTITUTION.pass1Context || '').trim();
  return `${view ? `${view}\n\n` : ''}Today is ${today}. The scout report is current on rosters, injuries and every number; your memory of those may be out of date. What you know about how good players are is yours to use. Only mention players the scout report names, and never write a number, score or record that isn't in the scout report or the research notes.`;
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
      // His season so far (test switch NFL_STORY_QB_SEASON=1, founder GO Oct 14 2026 late night).
      const season = process.env.NFL_STORY_QB_SEASON === '1' && name ? nflQuarterbackSeason(desk, name.trim()) : [];
      return [line, ...(note ? [`  on the injury report: ${note.replace(/^\s*• /, '').trim()}`] : []), ...season.map((x) => `  ${x}`)].join('\n');
    }).join('\n');
}

// Only this week's news from the split injury report: each team's "New this week" players. The ones already out
// show up in who is playing (test switch NFL_STORY_LINEUPS_FIRST, founder, Oct 14 2026 night).
function newThisWeekOnly(section) {
  if (!/New this week \(in the /.test(section)) return section;
  const out = [];
  let keep = true;
  for (const line of section.split('\n')) {
    if (/^\[(HOME|AWAY)\] /.test(line)) { out.push(line); keep = false; continue; }
    if (/^\s+New this week \(in the /.test(line)) { keep = true; out.push(line); continue; }
    if (/^\s+(Already out \(|Not in a game this season)/.test(line)) { keep = false; continue; }
    if (keep || !out.some((l) => /^\[(HOME|AWAY)\] /.test(l))) out.push(line);
  }
  return out.join('\n').trim();
}

function nflStory(desk, line, homeTeam, awayTeam) {
  const injuries = sectionOf(desk, 'INJURY REPORT');
  const week = sectionOf(desk, 'WHAT THIS WEEK IS ABOUT — AS WRITTEN').replace(/^Sentences copied word for word[^\n]*\n+/, '');
  // WHO IS PLAYING FIRST (founder, Oct 14 2026 night: "it's not about who's not playing, it's about who is playing"):
  // the two lineups side by side first, then the rest, and only this week's new injuries. Live with Version M
  // ("M it is"); NFL_STORY_LINEUPS_FIRST=0 reads the earlier story.
  if (process.env.NFL_STORY_LINEUPS_FIRST !== '0') {
    return [
      [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
      ['WHO IS PLAYING THIS WEEK', sectionOf(desk, NFL_LINEUPS_TITLE)],
      ['WHO THESE TEAMS ARE: THE LAST THREE SEASONS', sectionOf(desk, NFL_LAST_SEASONS_TITLE)],
      ['THE SITUATION', sectionOf(desk, 'THE SITUATION')],
      ['THE QUARTERBACKS', nflQuarterbacks(desk, injuries)],
      ["THIS WEEK'S NEW INJURIES", newThisWeekOnly(injuries)],
      ['THIS WEEK, AS THE BEAT WRITERS TELL IT', beatWriters(desk, homeTeam, awayTeam)],
      ['WHAT THIS WEEK IS ABOUT, AS WRITTEN', week],
    ];
  }
  return [
    [matchupHeader(desk), spreadInWords(line)].filter(Boolean).join('\n'),
    ['WHO THESE TEAMS ARE: THE LAST THREE SEASONS', sectionOf(desk, NFL_LAST_SEASONS_TITLE)],
    ["WHO THESE TEAMS ARE: THIS WEEK'S STARTERS", sectionOf(desk, NFL_STARTERS_TITLE)],
    ['THE SITUATION', sectionOf(desk, 'THE SITUATION')],
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

// The research assistant's findings on this game, as the loop ran it (same models, budget and desk); null without them.
async function researchNotes(sport, homeTeam, awayTeam, options, costTracker) {
  if (String(process.env.GARY_RESEARCHER || 'on').toLowerCase() === 'off' || !options.scoutReport) return { notes: null, model: null };
  const timeoutMs = researchBudgetMs({
    configuredMs: Number(process.env.GARY_RESEARCH_TIMEOUT_MS) || 20 * 60 * 1000,
    deadlineAt: process.env.GARY_CHILD_DEADLINE_AT,
    decisionReserveMs: process.env.GARY_RESEARCH_DECISION_RESERVE_MS ?? 8 * 60 * 1000,
  });
  const models = [GAME_RESEARCH_MODEL, GAME_RESEARCH_FALLBACK_MODEL, GAME_RESEARCH_BRIDGE_MODEL].filter((m, i, a) => m && a.indexOf(m) === i);
  const key = createHash('sha256').update(JSON.stringify([sport, homeTeam, awayTeam, options.gameId, options.gameTime, options.scoutReport])).digest('hex');
  const research = await withOptionalData(() => runResearchOnce(key, {
    models,
    timeoutMs,
    signal: options.signal,
    build: (researchModel, signal) => buildResearchBriefing(options.scoutReport, sport, homeTeam, awayTeam, { ...options, _costTracker: costTracker, researchModel, signal }),
    onAttempt: (researchModel) => console.log(`[NFL Question] 🔬 Research assistant (${researchModel}) reads the desk for what it does not have`),
    onFailure: (researchModel, err, hasNext) => console.warn(`[NFL Question] ⚠️ Research ${researchModel} failed (${err.message})${hasNext ? ' — trying the next researcher' : ''}`),
  }));
  const notes = typeof research.result === 'string' ? research.result : research.result?.briefing;
  if (!notes) console.warn(`[NFL Question] No research notes; TODAY'S NEWS reads as in the replay (${research.failures.join(' | ')})`);
  return { notes: notes ? String(notes).trim() : null, model: notes ? research.model : null };
}

// This week's starters ahead of THE SITUATION (founder GO, Oct 14 2026 night: the data backstop for what Gary knows
// about players). The players out this week and the starting quarterbacks are read from the desk itself, so the
// section agrees with the injury report and the quarterback block. Without the nflverse files the desk goes as it is.
const OUT_STATUS = /^(out|ir|ir-r|ir-nfi|pup|pup-r|pup-p|nfi|nfi-r|doubtful|suspended|susp|reserve)/i;
function availabilityFromDesk(desk) {
  const out = new Set(), questionable = new Set();
  for (const l of sectionOf(desk, 'INJURY REPORT').split('\n')) {
    const m = l.match(/^\s*• (.+?) \([^)]*\) \(([^)]+)\)/);
    if (m) { (OUT_STATUS.test(m[2].trim()) ? out : /^questionable/i.test(m[2].trim()) ? questionable : new Set()).add(_starterKey(m[1])); continue; }
    const reserve = l.match(/also on reserve lists: (.+)$/);
    if (reserve) for (const name of reserve[1].split(/, (?![^()]*\))/)) out.add(_starterKey(name.replace(/\s*\([^)]*\)\s*$/, '')));
  }
  return { out, questionable };
}
function quarterbacksFromDesk(desk) {
  const qbs = {};
  for (const l of sectionOf(desk, 'STARTING QUARTERBACKS THIS WEEK').split('\n')) {
    const m = l.match(/^\[(?:HOME|AWAY)\] (.+?): (.+?) \(/);
    if (m) qbs[m[1].trim()] = m[2].trim();
  }
  return qbs;
}
export async function withStarters(desk, homeTeam, awayTeam, season, asOf) {
  const text = String(desk || '');
  if (sectionOf(text, NFL_STARTERS_TITLE)) return text;
  const load = (asset, year) => loadNflverseFile(asset, year).catch((e) => ({ unavailable: true, reason: e?.message || String(e) }));
  const [roster, snaps, priorSnaps] = await Promise.all([load('roster', season), load('snap_counts', season), load('snap_counts', season - 1)]);
  const missing = [['roster', roster], ['snap counts', snaps], ['last season\'s snap counts', priorSnaps]].filter(([, f]) => !f || f.unavailable);
  if (missing.length) { console.warn(`[NFL Question] this week's starters not added: ${missing.map(([n, f]) => `${n} (${f?.reason || 'unavailable'})`).join('; ')}`); return text; }
  const game = { homeTeam, awayTeam, season, asOf, ...availabilityFromDesk(text), quarterbacks: quarterbacksFromDesk(text) };
  const body = nflStartersText({ roster, snaps, priorSnaps }, game);
  const at = text.indexOf('THE SITUATION\n');
  if (!body || at < 0) { console.warn("[NFL Question] this week's starters could not be added"); return text; }
  const rule = '━'.repeat(70);
  // The side-by-side lineups the story leads with (see nflStory).
  const lineups = process.env.NFL_STORY_LINEUPS_FIRST !== '0' ? nflLineupsText({ roster, snaps, priorSnaps }, game) : '';
  return `${text.slice(0, at)}${NFL_STARTERS_TITLE}\n${rule}\n${body}\n${rule}\n\n${lineups ? `${NFL_LINEUPS_TITLE}\n${rule}\n${lineups}\n${rule}\n\n` : ''}${text.slice(at)}`;
}

// The injury report in two groups, new this week and already out (founder GO, Oct 14 2026 night), as the story reads
// it; the desk itself is unchanged. Without the nflverse files the report goes as it is.
function replaceSection(desk, title, body) {
  const lines = desk.split('\n');
  const i = lines.findIndex((l, k) => l.startsWith(title) && RULE.test(lines[k + 1] || ''));
  if (i < 0) return desk;
  let j = i + 2;
  while (j < lines.length && !RULE.test(lines[j]) && !isTitle(lines[j], lines[j + 1])) j++;
  return [...lines.slice(0, i + 2), body, ...lines.slice(j)].join('\n');
}
export async function withInjuryFreshness(desk, homeTeam, awayTeam, season, asOf, { snapsFile = null, scheduleFile = null } = {}) {
  const text = String(desk || '');
  const section = sectionOf(text, 'INJURY REPORT');
  if (!section || /New this week \(in the /.test(section)) return text;
  const [snaps, schedule] = await Promise.all([
    snapsFile || loadNflverseFile('snap_counts', season).catch((e) => ({ unavailable: true, reason: e?.message || String(e) })),
    scheduleFile || getNflSchedule().catch((e) => ({ unavailable: true, reason: e?.message || String(e) })),
  ]);
  if (!snaps?.rows || !schedule?.rows) { console.warn(`[NFL Question] injury report not split: ${snaps?.reason || schedule?.reason || 'files unavailable'}`); return text; }
  const before = new Date(asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const games = schedule.rows.filter((r) => Number(r.season) === Number(season) && r.game_type === 'REG' && r.home_score !== '' && r.home_score != null && r.home_score !== 'NA' && r.gameday < before);
  const ids = new Set(games.map((r) => r.game_id));
  const body = nflInjuryFreshnessText(section, { homeTeam, awayTeam, codeOf: nflverseCode, games, snaps: snaps.rows.filter((r) => ids.has(r.game_id)) });
  return body ? replaceSection(text, 'INJURY REPORT', body) : text;
}

export async function runNflQuestion({ desk, today }, sport, homeTeam, awayTeam, options = {}) {
  const marketError = gameMarketUnavailable(options.game, sport);
  if (marketError) return { ...marketError, homeTeam, awayTeam, sport };
  const costTracker = createCostTracker(`NFL question: ${awayTeam} @ ${homeTeam} (${sport})`);
  try {
    const research = await researchNotes(sport, homeTeam, awayTeam, options, costTracker);
    if (research.notes) console.log(`[NFL Question] Research notes ready (${research.notes.length} chars, ${research.model})`);
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

    const asOf = options.gameTime || new Date().toISOString();
    const withSeasons = await withLastSeasons(desk, homeTeam, awayTeam, nflSeason());
    const fullDesk = await withInjuryFreshness(await withStarters(withSeasons, homeTeam, awayTeam, nflSeason(), asOf), homeTeam, awayTeam, nflSeason(), asOf);
    const line = lineOf(fullDesk);
    const story = buildNflStory(fullDesk, line, homeTeam, awayTeam);
    console.log(`[NFL Question] ${session.modelName}: the game in words (${story.length} chars)`);
    const read = await ask(buildNflGameMessage(story, research.notes));
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
    pick._researchBriefing = research.notes;
    pick._researchModel = research.model;
    pick._modelUsed = session.modelName;
    pick._originalToolResponses = [];
    pick._evidenceObservedAt = new Date().toISOString();
    pick._nflQuestion = true;
    return pick;
  } finally {
    costTracker.logSummary();
  }
}
