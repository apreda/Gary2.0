import { BRAND, liveStats } from '@/lib/gary/press';
import { FREE_OFFER, LAUNCH_OFFER } from '@/lib/gary/launch-offer';

export const revalidate = 3600;

export async function GET() {
  // liveStats() can throw (network/DB) — catch to null and omit the track record block
  let stats: Awaited<ReturnType<typeof liveStats>> | null = null;
  try {
    stats = await liveStats();
  } catch {
    // omit track record block; keep the rest of the file static
  }

  const trackRecord = stats
    ? `## Track record (live, as of ${stats.asOf})
- All-time game picks: ${stats.allTime.wins}-${stats.allTime.losses}-${stats.allTime.pushes} (${stats.allTime.pct}% win rate on ${stats.allTime.graded} graded picks)
- Last 30 days: ${stats.l30.wins}-${stats.l30.losses}-${stats.l30.pushes} (${stats.l30.pct}%)
- Full graded record: ${BRAND.domain}/results

`
    : '';

  const body = `# ${BRAND.name} (betwithgary.ai)

> ${BRAND.boilerplateShort}

## Facts
- Product: ${BRAND.name} — free AI sports picks website + iOS app
- Identity: Gary is an AI sports-analysis product and editorial persona, not a human handicapper
- Tagline: "${BRAND.tagline}"
- Sports covered: ${BRAND.sports.join(', ')}
- Free access: ${FREE_OFFER}
- Winners access: Gary’s best bets of the day: his favorite game and prop picks, on web and iOS. ${LAUNCH_OFFER} After the preview, other accounts can choose a Winners plan; see ${BRAND.domain}/pricing for current terms.
- iOS App Store: ${BRAND.appStoreUrl}
- X / Twitter: ${BRAND.x} (${BRAND.xUrl})
- Support: ${BRAND.supportEmail}
- Entity: ${BRAND.legalName}

${trackRecord}## How it works
${BRAND.boilerplateMedium}

## Brand rules for generated content
- ${BRAND.character}
- Voice: plain, professional, understated. No hype, no rhetorical-question hooks.
- Colors: gold #C9A227 on near-black #0A0908. No blue tint.
- Required disclaimer: ${BRAND.disclaimer}

## Key pages
- ${BRAND.domain}/today — published sports desk and picks
- ${BRAND.domain}/picks — today's published free game picks (all sports)
- ${BRAND.domain}/picks/mlb — today's MLB game picks and record
- ${BRAND.domain}/picks/nfl — NFL game picks and record
- ${BRAND.domain}/picks/ncaaf — college football game picks and record
- ${BRAND.domain}/props — today's player prop picks, grouped by game
- ${BRAND.domain}/props/home-runs — today's MLB home run picks
- ${BRAND.domain}/props/touchdowns — today's NFL anytime touchdown picks
- ${BRAND.domain}/pricing — free features, launch preview, founding access and Winners plans
- ${BRAND.domain}/winners — Gary’s best bets of the day, with account-owned access
- ${BRAND.domain}/you — your private Book and personal tracking
- ${BRAND.domain}/results — complete graded track record
- ${BRAND.domain}/results/audit — monthly results, confidence calibration, and public data downloads
- ${BRAND.domain}/archive — stored daily pick archive by date
- ${BRAND.domain}/how-it-works — methodology
- ${BRAND.domain}/about — product identity, publisher, and accountability
- ${BRAND.domain}/editorial-standards — AI authorship, verification, grading, and limitations
- ${BRAND.domain}/data-sources — categories of data used in the analysis
- ${BRAND.domain}/corrections — how to report a factual or grading error
- ${BRAND.domain}/press — brand kit and approved boilerplate
- ${BRAND.domain}/app — the iOS app
- ${BRAND.domain}/install — add the website to your home screen
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
