import { ACTIVE_COVERAGE, LAUNCH_OFFER } from './launch-offer';
import { fetchAllGameResults, computeRecord, sinceDate } from './results';
import { estDateStr } from './dates';

export const BRAND = {
  name: 'Gary AI',
  legalName: 'Gary A.I. LLC',
  domain: 'https://www.betwithgary.ai',
  tagline: 'Find your game. See Gary’s pick.',
  cta: 'Explore Gary’s game picks and player props for free. Find his best bets in Winners and insights in the Hub.',
  appStoreUrl: 'https://apps.apple.com/us/app/gary-ai/id6751238914',
  appStoreId: '6751238914',
  x: '@BetwithGary',
  xUrl: 'https://x.com/BetwithGary',
  supportEmail: 'support@betwithgary.ai',
  sports: ['MLB', 'NFL', 'NCAAF', 'NBA (relaunch planned)', 'Earlier sports and 2026 FIFA World Cup archives'],
  character:
    'Gary is the bear persona for the Gary AI sports-analysis product, not a real human handicapper. Always use the real character assets; never generate a bear, and never a lion.',
  boilerplateShort:
    'Gary AI makes game picks and player prop picks for MLB, NFL and college football. Winners brings you Gary’s best bets of the day, and the Hub surfaces insights and betting connections.',
  boilerplateMedium:
    `Gary AI gives sports fans game picks and player props for the games they follow. Winners holds Gary’s best bets of the day—the picks he would bet on. The Hub surfaces useful stats, trends, and betting connections. ${ACTIVE_COVERAGE} Game picks, available player props, the Hub and the public record stay free. Gary is available on web and iOS, with a private Book for tracking your own bets.`,
  boilerplateLong:
    `Gary AI makes game picks and player prop picks, chooses his favorite bets, and finds insights across the sports fans follow. The Picks gives you Gary’s take on every game he covers, including home run and touchdown picks when available. Winners holds his best bets of the day: the game and prop picks he likes most. The Hub surfaces useful stats, trends, and betting connections that help users spot something they might otherwise miss. Published picks include an explanation, and wins and losses stay on the public record. ${ACTIVE_COVERAGE} Game picks, available props, the Hub, the public record, and your private Book stay free. ${LAUNCH_OFFER} After the preview, other accounts can choose Winners from $9.99/month per sport or All-Access. Gary is available on web and iOS for informational and entertainment purposes. Gary does not place wagers or guarantee results.`,
  disclaimer:
    "Gary is for informational and entertainment purposes only. We don't accept wagering deposits or place bets. 18+. If you or someone you know has a gambling problem, call 1-800-GAMBLER.",
};

export async function liveStats() {
  const games = await fetchAllGameResults(3600);
  const allTime = computeRecord(games);
  const l30 = computeRecord(sinceDate(games, estDateStr(new Date(Date.now() - 30 * 86400000))));
  return { allTime, l30, asOf: estDateStr(new Date()) };
}
