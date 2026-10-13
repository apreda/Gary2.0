/**
 * NHL game prompts (founder, Oct 3 2026). The lane is MLB's shape with
 * hockey's nouns: the desk, two cases, then the bare bet question. The ticket
 * is the moneyline on every game: no puck line, no total, no price limit, and
 * a pick is never rewritten into a different bet.
 */
import { mlbCaseOrder } from './mlbCaseMenu.js';

export const isNhlSport = sport => sport === 'icehockey_nhl' || sport === 'NHL';

/**
 * The two Pass 1 case headings, in MLB's alternating case order (which case
 * is written last alternates by game id, so neither side is always read last).
 */
export function nhlCaseHeadings(homeTeam, awayTeam, game) {
  const home = `CASE FOR ${String(homeTeam || '').toUpperCase()}:`;
  const away = `CASE FOR ${String(awayTeam || '').toUpperCase()}:`;
  const order = mlbCaseOrder(game);
  return { home, away, order,
    first: order === 'home-first' ? home : away,
    second: order === 'home-first' ? away : home };
}

/** Calendar facts about where the season is. Awareness, never a conclusion. */
export function getNhlSeasonAwareness(now = new Date()) {
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric' }).format(now));
  const lines = ['## NHL SEASON AWARENESS', '',
    '- **Hockey runs on heavy game-to-game variance.** Games are low scoring and many are decided by one goal, in overtime or in a shootout. Winning and losing streaks happen to every team.'];
  if (month === 10) {
    lines.push('- **October: the season is young.** Team and player season stats here rest on a handful of games; the desk labels the season and games played behind every figure.');
  }
  return lines.join('\n');
}

/** Pass 1: the desk, the season awareness, the two cases. No side yet. */
export function buildNhlPass1(scoutReport, today, homeTeam, awayTeam, game = null) {
  const headings = nhlCaseHeadings(homeTeam, awayTeam, game);
  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<season_context>
${getNhlSeasonAwareness()}
</season_context>

<instructions>
## YOUR TASK

Before completing this pass, end with BOTH sections, using these EXACT headings on their own lines (the system stores each case under its heading):

${headings.first}

${headings.second}

Do NOT declare a side or a pick yet — the bet question comes at the end. When your investigation is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}
