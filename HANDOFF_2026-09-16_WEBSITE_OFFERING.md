# Website offering and plain language — September 16, 2026

Adam approved implementing the discussion's three-part offering on the website:
- The Picks: Gary's game and player prop picks for every game he covers.
- Winners: Gary's best bets of the day, the bets he likes most and would bet on.
- The Hub: insights and betting connections, useful stats, trends and matchups.

Reasoning is a useful supporting detail, not a headline value proposition. Home is a starting screen, not a separate offering. Avoid board, card-as-product, shortlist and internal selection jargon in marketing. Keep Gary's personable voice and clear AI identity. Home run and touchdown picks can be highlighted when available; no unverified competitor claims or parlay feature were added.

## Implementation

Homepage introduces the three destinations together below the hero and sports strip, with direct links. Main navigation and footer now surface the Hub alongside Picks and Winners. Pricing leads with “Gary's best bets. That's Winners.” Picks, Winners, Hub, App, About, membership descriptions, press boilerplate, metadata, structured data and llms.txt use the same explanation. Picks links directly to player props. Full original pick explanations remain untouched.

Outdated App-page automatic-underdog/favorites language and stale flat-$100 description were removed. Methodology states the current maximum of six game Winners per sport and six prop Winners across all active sports combined; see PROP_WINNERS_HR for the current selection implementation. Marketing does not promise a fixed daily count.

The App page's screenshot grid now fits narrow screens. The homepage's decorative glow stays within tablet width. The established styling and native pick cards remain intact. No prices, entitlements, API contracts, model prompts, selection logic, actual picks or results changed. No native build, campaign dispatch, or parlay implementation.

## Verification

Web Vitest: 78 files / 890 tests pass. Production build, typecheck and lint pass; lint retains two preexisting window.location.assign warnings in BookClient and DeleteAccount. Existing marketing assertions were updated for the approved copy. Fixture smoke passes, including permanent analysis discovery, archive/feed/sitemap routes and authoritative results exports.

Browser review: homepage, pricing and App page fit 320, 390, 768 and 1440px widths after responsive fixes; Picks, Hub, About, methodology and Results reviewed at 390px. New Winners and player-prop links navigate correctly. NFL plan selection shows the new caption. Fixture pick flips, expands, exposes original rationale and share control, and shows live score 2–1 / TOP 5. Fixture record is 1–1. These fixtures do not simulate authentication or purchases.

The required production-truth audit confirmed 15/15 MLB game picks and a running Winners worker but could not verify edge deployment parity or the support queue without Supabase CLI sign-in. This does not establish backend parity. The machine's private ios/GaryApp/GoogleService-Info.plist remains intentionally uncommitted and untouched.

Publication and live-page receipt will be saved in the task workspace as WEBSITE_OFFERING_RECEIPT_2026-09-16.json. CLI GitHub authentication remains invalid; use the connected GitHub API with a matching verified tree and a non-force main update, then align the checkout to the published commit.
