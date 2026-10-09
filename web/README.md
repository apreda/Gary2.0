Gary's web app uses Next.js. Follow the repository's `AGENTS.md` and the installed Next docs before changing rendering or deployment behavior.

## Database outages and deployment builds

Public database reads in `lib/gary/supabase.ts` wait for a request through
`connection()`. Their explicit Next fetch cache remains enabled, including
last-good responses during failed background refreshes. Data-backed pages
render at request time; builds do not require a healthy production database.

Database-backed sitemaps use `app/sitemap-data/[inventory]/route.ts` with an
empty `generateStaticParams()` list and ten-minute ISR. The public archive,
index, and game-shard URLs rewrite to this route. They generate on first
request and keep their last successful XML if regeneration fails. A cold
outage must return an error, never a successful empty inventory. Do not move
these back into build-time metadata generators: Next 16.3 can also classify
prerendered `.xml` outputs as static files and discard their ISR interval.

Run `npm run smoke:sitemaps` from the repository root. It builds a disposable
copy with a local database returning HTTP 503, verifies cold failures, primes
real XML, checks last-good data during a second outage, and confirms new dates
appear after recovery. The test shortens cache intervals only in that copy,
uses dummy credentials and Next's font fixture hook, and cleans up its servers.
CI runs it alongside the normal web unit, type, and fixture-page checks.

## Current website

The website is drawn as the iOS app (founder, Oct 9 2026). `components/site/app.css` carries the app's colors and pieces, each from its Swift source: the page header and the phone's floating dock (`components/Nav.tsx`, after GaryPageHeader and GaryCenteredTabBar), tabs as words that turn gold (`components/UnderlineTabs.tsx`, after LabTextTabs), section heads in gold display type, and actions as gold words with a chevron. `design.md` at the repository root applies: no capsule buttons, pills or underlined tabs, no machine dates, no "…".

Home (`app/page.tsx`) leads with the free pick of the day (`lib/gary/free-pick.ts`, `components/site/FreePick.tsx`): `get_streak` names the ticket, `get_winners_board` carries it with its reasons and grade, and it is drawn as the app's Winners ticket (LabTicketPlate) with WHY IT MADE THE BOARD under it. Until Gary chooses today's, yesterday's shows with its date and result. Then today's picks, the record and the journal.

Every App Store link is `AppStoreButton`, which links to `/c/web_<place>`: the redirect logs each tap in `web_link_clicks` and hands Apple `ct=cr_web_<place>`. Page loads are counted without cookies by the proxy (`lib/gary/visit-count.ts`, table `web_visits`: path, source, medium and crawler name only); `web_events` remains consent-only.

Pick cards share `components/picks/native-card.tsx`, its app-derived headline, check, surface, and styles. Use the PickCard and PropCard adapters on all boards and historical pages. Do not invent another website card style. Ordinary cards are dark; Winners games are gold and Winners props are silver. Winners admission does not imply a winning result. Grade only from the public result feed with a matching date, league, matchup, and exact call; ambiguous doubleheaders remain ungraded. Keep full original analysis in server-rendered markup.

The public record lives at `/results`; `/record` permanently redirects there. Preserve permanent pick, archive, sitemap, account, consent, Book, Winners access, and payment routes when updating the design. The journal's three `public/site/venue-*.webp` illustrations stay; keep headings and links in HTML.

## Development and verification

Run `npm run dev` from this directory with the configured local environment, or use `node --experimental-strip-types web/scripts/fixture-preview.mjs --port=3100` from a disposable repository mirror with no real environment files. Fixture previews must never be deployed.

Before publishing, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Review desktop and mobile layouts, card flip/expand/share controls, the live record, and account/purchase links. The repository CI also checks fixture routes and sitemap recovery.

Production is the Vercel `gary2.0` project, rooted at `web`, attached to `www.betwithgary.ai` and `betwithgary.ai`. Follow root AGENTS.md for main-branch publication and production-truth verification. Do not replace this application with the standalone concept runtime.
