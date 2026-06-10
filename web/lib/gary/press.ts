import { fetchAllGameResults, computeRecord, sinceDate } from './results';
import { estDateStr } from './dates';

export const BRAND = {
  name: 'Gary AI',
  legalName: 'Gary A.I. LLC',
  domain: 'https://www.betwithgary.ai',
  tagline: 'Every Game. Every Day. Always Free.',
  cta: "Full slate of Gary's picks are live. Every game covered. Completely free.",
  appStoreUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
  appStoreId: '6751238914',
  x: '@BetwithGary',
  xUrl: 'https://x.com/BetwithGary',
  supportEmail: 'support@betwithgary.ai',
  sports: ['NBA', 'NFL', 'NHL', 'MLB', 'NCAAB', 'NCAAF', '2026 FIFA World Cup'],
  character:
    'Gary is a bear — a 30-year-veteran bettor who owns his losses. Always use the real character assets; never generate a bear, and never a lion.',
  boilerplateShort:
    'Gary AI delivers free daily sports picks for every game on the board, with written reasoning and a public graded track record. Free on iOS.',
  boilerplateMedium:
    'Gary AI is a free AI sports handicapper covering the full slate — NBA, NFL, NHL, MLB, college basketball and football, and the 2026 World Cup. A research agent investigates every matchup with live data; Gary makes the call with a confidence rating and a written rationale. Every pick is graded the next morning and stays on the public record. Free on iOS, with picks, props, the insight Hub, and the track record also published at betwithgary.ai.',
  boilerplateLong:
    'Gary AI is an AI-powered sports handicapper built around one promise: every game, every day, on the record — with the full slate free. For each matchup, a research agent investigates live sportsbook odds, season and recent statistics, injuries, platoon splits, ballpark factors, and situational angles. Gary then weighs that evidence against sport-specific rules, assigns a confidence rating, and writes out the full reasoning behind the pick — game lines and player props across NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 FIFA World Cup. Numeric claims are fact-checked against the underlying data before publishing, every pick is graded against final scores the next morning, and the complete win-loss record — including losing streaks — is public at betwithgary.ai/results. The iOS app adds Winners — Gary\'s highest-conviction board, sold as a subscription from $9.99/mo — plus live score tracking and the full Billfold performance ledger. Gary is for informational and entertainment purposes only and does not facilitate gambling.',
  disclaimer:
    "Gary is for informational and entertainment purposes only. We don't facilitate gambling, accept deposits, or place bets. 18+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.",
};

export async function liveStats() {
  const games = await fetchAllGameResults(3600);
  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 30 * 86400000))));
  return { allTime, l30, asOf: estDateStr(new Date()) };
}
