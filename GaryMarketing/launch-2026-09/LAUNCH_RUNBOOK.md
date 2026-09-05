# Gary launch operating plan

September 4, updated September 5, 2026. Accountable owner: Adam. This replaces the offer, dates, channel assumptions and execution status in the September 1 launch plan. The implementation handoff records deployment and submission evidence; this document defines the operating decisions.

## Execution and review

The six workstreams have an explicit completion scorecard in [the September 5 execution review](EXECUTION_REVIEW_2026-09-05.md). Implementation is not audience validation. Codex handles authorized implementation, verification and analysis during active work; Adam supplies account access, founder footage and human contact decisions. The [personal-tracking pilot](PERSONAL_TRACKING_PILOT.md) must produce real observations before the integration spending gate is met.

## The promise

**Find your game. See Gary’s pick.** Free game picks with written reasoning are the first useful experience. The public record lets people judge Gary. Your Book lets them track their own decisions. Winners is the selected board; its September 4 selection process has its own history and must earn its reputation.

Use a matchup with a published pick in any demonstration. Coverage is an operational promise to earn: the September 4 check found scheduled games without generated picks. Avoid “every game, always available” claims until the production report demonstrates that reliability. Hold a slate-wide promotion when the report shows unresolved gaps for games past their scheduled start.

Use the account-based offer consistently:

> Winners is open for the launch preview until October 1, 2026 at midnight Eastern. Accounts created before that cutoff retain founding access to Winners. No purchase is needed for included access.

This matches the deployed access rules. Founding access currently has no expiry. Do not replace this with “install before October,” “free this season,” a lifetime marketing promise, or an invented season-end date. Existing free game reasoning, available props, Hub, record and private Book remain free. New purchases after preview use the current pricing page; prices and billing details must agree with checkout. The iOS external purchase link is available only for the U.S. storefront after the new build ships.

Winners and Insights can become a clearer combined experience later. Do not announce that integration or superior results before it exists and is substantiated. Confidence is Gary’s judgment, not a calibrated probability.

## Launch sequence and gates

| Window | Deliverable | Evidence before promotion |
|---|---|---|
| September 4–8 | Privacy, consent, review notes, storefront purchase behavior, unified offer, useful-session measurement, X reliability fixes | Passing relevant checks; deployed web/backend; correct uploaded binary and live App Store disclosures |
| September 5–12 | Four prepared product pieces, used at selected times alongside existing game publishing | Working destination, final copy and artwork review; accurate feature availability that day |
| September 9 | Normal NFL kickoff publishing | Actual published pregame pick; scheduled poster healthy |
| September 13 | First-Sunday marketing launch and founder introduction | Available app/site features; current release state; no promise that an unapproved binary is available |
| September 14–30 | Weekly acquisition/return review and conversations with willing adult users | Counts with observation windows and consent exclusions; recorded user feedback |
| After audience evidence | Vendor diligence and a small authorized data-import pilot | Demand, economics, data rights, privacy and sandbox acceptance criteria in the integration packet |

September 9 kickoff is Patriots at Seattle at 8:20 PM ET. The September 13 marketing date does not determine Apple's release date. [Official game preview](https://www.patriots.com/news/game-preview-patriots-at-seahawks-week-1)

## The weekly operating rhythm

Adam owns publication, support and account access until another person is assigned. Code automates the existing game feed. This plan does not create a new unattended posting schedule.

| When | Action | Decision it supports |
|---|---|---|
| Before the day's first promotional post | Run the read-only marketing readiness command; inspect scheduled-game coverage, stored-pick publishing, actual poster responses and missing metrics separately | Resolve missing-pick and publishing failures before promoting complete coverage |
| On posting days | Review and answer relevant human questions and support requests | Learn what prevents the first useful experience; avoid unsolicited automatic replies |
| Once each week | Prepare up to three original product or explanation pieces; reuse the supplied exports where appropriate | Keep quality sustainable; add product value to the pick feed |
| Monday, after the previous UTC week ends | Run the website funnel report and review the public record post | Compare acquisition and return using explicit denominators |
| After seven days of exposure | Compare sessions and useful sessions by creative; review overall mature return cohorts separately | Keep pieces that bring readers into relevant reasoning; assess return without claiming per-creative retention |

From `gary2.0`, run `node scripts/marketing-readiness.js` for the read-only social report. From `web`, run `npm run report:funnel -- --week YYYY-MM-DD` for a completed UTC week. The report definitions and evidence snapshots live alongside the implementation. Missing link-click, install, geography or retention data stays **unavailable**, not zero. X thread impressions are not unique reach; self-replies are not independent audience conversations.

The first website success metric is a consented session that visibly reads a pick's reasoning. It is a reading proxy, not proof of satisfaction, a wager or an install. Report session count, useful-session count, next-visit return and observation maturity. Do not compare older page-load “meaningful” events to the corrected event definition. Website telemetry does not cover nonconsenting users, native app installs or all devices belonging to one person.

Initial learning target: 25–50 useful sessions over a month and 5–10 conversations with willing adult users. These are internal targets, not forecasts or external audience claims. If counts are smaller, improve relevance and the first-use path before adding spend.

## Channel decisions

| Surface | Current operating decision |
|---|---|
| Gary website and first-party organic X | Prepared content is suitable for editorial review here. Preserve current game-paced publishing; do not add mass replies or automatically post the new content package. |
| Instagram | Existing @betwithgary.ai is a Business Account; bio corrected September 5. Current organic rules support a cautious adult editorial rollout, but Account Status still says under-18s can see the profile. Set the mobile minimum-age control to the 21+ house standard before publishing betting content. Prepared portraits/captions are ready. |
| TikTok | Founder video scripts are prepared. Organic gambling-related business eligibility remains unresolved; the official licensed-business route requires permission and uses 25+ in the U.S. This is not a normal unrestricted launch channel for Gary. |
| Paid creators | No TikTok gambling-related branded content. Other platforms need their own eligibility determination and clear sponsorship disclosure. |
| Platform ads | No launch spend assumed. Evaluate approved Apple search-results inventory first after listing and measurement are ready; Meta, X and TikTok have separate approval requirements. |

The old brand guide's blanket X paid ban and old age-rating assertion are not current policy conclusions. Current primary sources: [X gambling ads](https://business.x.com/en/help/ads-policies/ads-content-policies/gambling-content), [X Paid Partnerships](https://help.x.com/en/rules-and-policies/paid-partnerships-policy), [TikTok business verification](https://ads.tiktok.com/resources/help/article/about-business-registration?lang=en), [TikTok branded content](https://www.tiktok.com/legal/page/global/bc-policy/en), [Apple Ads](https://ads.apple.com/policies). On September 5 the current Meta pages were readable directly. Its organic Community Standards restrict online-gambling promotion to adults; the separate advertising policy requires ad-account authorization, including gambling-promoting landing pages. Gary provides information and manual tracking without wagering entry/prizes. Treat a 21+ editorial company rollout as an operating inference from these rules, not platform certification; keep boosts, affiliates and gambling offers out until their separate requirements are resolved. [Meta organic regulated goods](https://transparency.meta.com/policies/community-standards/regulated-goods/), [Meta gambling ads](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/gambling-games), [Instagram Terms](https://www.instagram.com/legal/terms/)

Our prepared creative uses a 21+ house audience standard. Higher platform requirements take precedence; the artwork is not evidence of permission. Do not change age labels to disguise the category.

## September 5 account and draft status

- Instagram: 33 posts and 70 followers observed; most recent grid post March 19. Business account, category Arts & entertainment, linked Facebook page Gary A.I. Account Status reported no reach limits and recommendation eligibility. Bio saved and independently reloaded: “AI sports picks with reasoning. Wins and losses on the record. Track your own Book. Built by a sports fan. 21+”. A bio age label is not the platform age control.
- Set Instagram minimum age in the mobile app: Profile → menu → Account type and tools → Other → Minimum age → default 21 → Done. Also verify the website field points to the instrumented board; the desktop editor explicitly limits link editing to mobile. [Official age instructions](https://help.instagram.com/853772598370828/)
- Instagram's current Terms require prior written consent for a domain/URL in a username. The existing `betwithgary.ai` handle needs that consent checked or a coordinated handle change with existing links updated. No username was changed or consent claimed in this pass.
- Private X draft generation v7 is deployed. It preserves prior drafts on provider errors, empty batches and failed database inserts; reports degraded generation as HTTP 503; bounds provider requests; and only attaches a uniquely matched full-team pick as context. Weekly NFL picks are included. It does not publish replies.
- Live September 5 smoke: invalid token 401, valid private page 200; 11 candidates, one attempted draft, `MODEL_CREDITS_UNAVAILABLE`, generated 0, prior sheet preserved. Restore the existing Anthropic account's credit before expecting fresh private drafts. The scheduled game poster is a separate workflow. No model, billing balance or posting schedule was changed.

## Company habits that users can see

Use one consistent name and handle, the existing Gary mark, legible typography, accessible captions and real product footage. Gary can be opinionated and funny; company statements about price, availability and support must be literal. Never imply real wagers, guaranteed returns, or a direct sportsbook relationship that does not exist.

Keep a company-domain support address, an identified account owner and recovery access, and two-factor authentication on the social and developer accounts. Verify these in the actual account settings; this file does not certify their configuration. Confirm X recharge and a spending cap in the developer account used by @BetwithGary, since the earlier credit outage came from a different login/account distinction.

Use `/contact` for help, `/corrections` for corrections, `/privacy` for data practices, `/pricing` for the offer and `/results` for the game-pick record. Set an internal next-business-day support review target; do not publish a response guarantee without coverage. Record material changes to public promises here and in the release handoff.

Do not delete losing picks or blend the new Winners history with the whole slate to imply better performance. Game-pick and core-prop results have separate scopes; home-run and touchdown fun picks are excluded. User manual entries, system-settled choices and Gary's original picks need clear labels.

## Files ready to use

- `content/README.md`: caption copy, publication order, links, alt text and export instructions.
- `content/exports/`: eight finished JPEGs, four concepts in two sizes.
- `content/VIDEO_SCRIPTS.md`: three founder-led recording scripts and shot lists; no footage has been recorded.
- `INTEGRATION_PACKET.md`: accurate company/product brief, audience limitations, vendor questions and an unsent inquiry.
- `evidence/`: aggregate operational snapshots. Refresh before making external audience claims.
- `../APP_REVIEW_2_25_899.md`: exact-build review instructions and remaining App Store actions.
