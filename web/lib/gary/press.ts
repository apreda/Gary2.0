import { ACTIVE_COVERAGE, LAUNCH_OFFER } from './launch-offer';
import { fetchAllGameResults, computeRecord, sinceDate } from './results';
import { estDateStr } from './dates';

export const BRAND = {
  name: 'Gary AI',
  legalName: 'Gary A.I. LLC',
  domain: 'https://www.betwithgary.ai',
  tagline: 'Find your game. See Gary’s pick.',
  cta: "Full slate of Gary's picks are live. Every game covered. Completely free.",
  appStoreUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
  appStoreId: '6751238914',
  x: '@BetwithGary',
  xUrl: 'https://x.com/BetwithGary',
  supportEmail: 'support@betwithgary.ai',
  sports: ['MLB', 'NFL', 'NCAAF', 'NBA (relaunch planned)', 'Earlier sports and 2026 FIFA World Cup archives'],
  character:
    'Gary is the bear persona for the Gary AI sports-analysis product, not a real human handicapper. Always use the real character assets; never generate a bear, and never a lion.',
  boilerplateShort:
    'Gary AI delivers free daily sports picks for every game on the board, with written reasoning, a morning research desk, and a public graded track record at betwithgary.ai.',
  boilerplateMedium:
    `Gary AI helps sports fans find their game and see what Gary thinks, with free picks, written reasoning and a public record that includes losses. ${ACTIVE_COVERAGE} Winners adds a reviewed shortlist; web and iOS share account-owned access and a private bet tracker.`,
  boilerplateLong:
    `Gary AI is a sports-analysis product built for fans who want to see what AI thinks about their game. The full game slate, written reasoning, available props, the Hub and public graded record stay free. ${ACTIVE_COVERAGE} Gary uses a sport-specific data desk; MLB also uses a research assistant. Winners is a separately reviewed shortlist of exact published tickets. Confidence expresses model judgment, not a calibrated win probability, and no review guarantees accuracy or profit. Your Book supports private manual bet tracking and verified tail/fade comparisons without placing wagers. ${LAUNCH_OFFER} After the preview, other accounts can choose Winners from $9.99/month per sport or All-Access. Gary is available on web and iOS for informational and entertainment purposes.`,
  disclaimer:
    "Gary is for informational and entertainment purposes only. We don't facilitate gambling, accept deposits, or place bets. 18+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.",
};

export async function liveStats() {
  const games = await fetchAllGameResults(3600);
  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 30 * 86400000))));
  return { allTime, l30, asOf: estDateStr(new Date()) };
}
