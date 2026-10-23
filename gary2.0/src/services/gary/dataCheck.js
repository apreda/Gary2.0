// THE DATA CHECK (Oct 23 2026, founder: "its all data data data ... we also need a way to auto analyze and fix data
// day after day so it always stays up to date"). TNF's Patriots +3 came from data, not reasoning: the Bears' season
// blended three backup-quarterback starts, last season sat beside this one, and a per-play rank turned an even
// defense into "32nd". Once the data showed who started each game, Gary took the Bears in 6 of 6 reads.
//
// The morning after, each settled game pick's data (rebuilt with today's code, cut at the moment of the pick) goes to a
// background checker with web search, with Gary's write-up and the final score. It reports where the data misstated
// the game or left out what mattered: the four questions for every number (same team, against whom, measured fairly,
// current), the line's moves the data can't explain, and what decided the game if it was knowable before kickoff.
// It audits the data only. It never grades Gary, never reaches him, and fixes nothing itself: the report is for the
// session that owns the pick system, which fixes the source.
import { subscriptionSearch } from './agentic/orchestrator/subscriptionSearch.js';
import { BACKGROUND_GPT } from './agentic/orchestrator/subscriptionRoutes.js';

export const DATA_CHECK_LEAGUES = ['NFL', 'NCAAF', 'NBA'];
const SPORT_KEY = { NFL: 'americanfootball_nfl', NCAAF: 'americanfootball_ncaaf', NBA: 'basketball_nba' };

/** The data Gary read for one pick, rebuilt from its saved desk with the live story builder at the pick's time. */
export async function dataGaryRead({ league, desk, homeTeam, awayTeam, gameId, gameDate, asOf, news = null }) {
  if (league === 'NFL') {
    const { buildNflReadStory } = await import('./agentic/orchestrator/nflRead.js');
    const { story } = await buildNflReadStory(desk, { homeTeam, awayTeam, gameId, gameDate, asOf });
    return { story, news };
  }
  if (league === 'NCAAF') {
    const { buildNcaafReadStory } = await import('./agentic/orchestrator/ncaafRead.js');
    const { story } = await buildNcaafReadStory(desk, { homeTeam, awayTeam, gameId, asOf });
    return { story, news };
  }
  if (league === 'NBA') {
    const { buildNbaReadStory } = await import('./agentic/orchestrator/nbaRead.js');
    const r = await buildNbaReadStory(desk, { homeTeam, awayTeam, gameId, asOf });
    return { story: r.story, news: r.news || news };
  }
  throw new Error(`no data check for ${league}`);
}

export const dataCheckPrompt = ({ league, matchup, gameDate, kickoff, story, news, asked, answered, pick, rationale, finalScore, closingLine }) => `You audit the DATA a betting model was given before a ${league} game. You are not grading the model or its pick. The question is whether the data told the truth about this game, and what it left out that mattered.

The game: ${matchup}, ${gameDate}${kickoff ? `, kickoff ${kickoff}` : ''}. Final score (away-home): ${finalScore || 'not on file'}.
Evidence window: what was true before the game comes from sources published in the week before kickoff; what happened in the game comes from sources published after it.

${asked ? `## WHAT THE MODEL WAS ASKED, EXACTLY AS IT SAW IT

${asked}

## ITS READ

${answered || 'Not on file.'}` : `## WHAT THE MODEL WAS GIVEN (rebuilt from the saved desk at the moment of the pick)

${story}

## THE NEWS IT HAD

${news || 'None.'}`}

## ITS PICK AND WRITE-UP

${pick || 'Not on file.'}

${rationale || 'No write-up on file.'}

## THE LINE THROUGH KICKOFF

${closingLine || 'Not on file.'}

## OUR RULES FOR THE DATA (never suggest breaking them)

The data is this season only: never suggest adding last season's numbers or preseason results. No other people's picks, predictions or betting records. Nothing that tells the model which side to take.

## YOUR JOB

Search the web for what was true BEFORE kickoff (injury reports, who started, depth charts, lineup news, reporting from that week), and for what happened in the game. Then check the data:

1. Every number the write-up leaned on, and any number in the data that paints a team, with four questions:
   - Same team? Were those games played by the team that took the field in this game (same quarterback or stars, same coordinator)? A season that blends games a different starter played misstates the team.
   - Against whom? Results against weak (or FCS) opponents read as strength.
   - Measured fairly? A rank or rate that turns a tiny gap into a big one, one blowout carrying an average, totals over unequal numbers of games.
   - Current? Last season, preseason, or games from before a change.
2. Up to date at the moment of the pick? A season number is an accumulation; it is not where the team is now. Did the data show what happened in each team's last game (who played, who got hurt in it, how it went), and every change since (lineups, injuries, returns, news)? Where did a season total stand in for what was true that day?
3. The line: can the data explain each spread move of a point or more? If not, what did the market know that the data didn't carry? The model is shown only the spread it bets, by design: never report the line's path, the opener, the total, moneylines or betting percentages as missing. A move is a clue to a football fact the data lacked (an injury, a starter, weather), and that fact is the issue. Any betting or market content in the data is an issue.
4. After the game: what decided it? Was that knowable before kickoff, and was it in the data or the news?

Report only problems in the data, each as one kind: wrong (a number or fact that was false), needs_context (true but misleading without context, like a season total that blends games a different quarterback played), not_current (stale at the moment of the pick), or missing (knowable before kickoff, mattered, absent). Say nothing about whether the pick was right. If the data was sound, say so and report no issues. Give evidence (a source and its date) for each issue.

End with this JSON block and nothing after it:
\`\`\`json
{"data_sound": true, "issues": [{"kind": "wrong|needs_context|not_current|missing", "question": "same_team|opponents|measured|current|line|after_game", "section": "where in the data", "data_said": "what the data showed", "truth": "what was true before kickoff", "evidence": "source and date", "mattered": "how it bore on this game", "fix": "what the data should show instead"}], "line": "one sentence on whether the data explained the line's moves", "decided": "one sentence on what decided the game and whether it was knowable before kickoff"}
\`\`\``;

/** Parses the checker's closing JSON block; null when there isn't one. */
export function parseDataCheck(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = blocks.length ? blocks[blocks.length - 1][1] : null;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return { data_sound: Boolean(j.data_sound), issues: Array.isArray(j.issues) ? j.issues : [], line: j.line || '', decided: j.decided || '' };
  } catch { return null; }
}

/** One pick's data check: the checker's answer and its parsed JSON. */
export async function runDataCheck(input, { search = subscriptionSearch, timeoutMs = 15 * 60 * 1000 } = {}) {
  // The week before kickoff is the window for what was known; the default 48 hours would stop at the check's own morning.
  const r = await search(dataCheckPrompt(input), { model: BACKGROUND_GPT, effort: 'high', timeoutMs, maxTokens: 12000, freshnessHours: 8 * 24 });
  const text = typeof r?.data === 'string' ? r.data : r?.data?.text || r?.data?.content || (r?.data ? JSON.stringify(r.data) : '');
  return { ok: Boolean(r?.success), text, check: parseDataCheck(text), transport: r?.transport || null, error: r?.success ? null : r?.error };
}

export const sportKeyOf = (league) => SPORT_KEY[league];
