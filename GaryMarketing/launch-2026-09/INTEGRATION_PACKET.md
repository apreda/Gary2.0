# Gary sportsbook integration packet

September 4, 2026. Prepared for diligence; no vendor contact, sportsbook application, purchase or integration has been made through this package.

## Product brief

Gary is a sports-information product with free game picks and written reasoning, a public record, a selected Winners board, and personal tracking through Your Book. Its website is [betwithgary.ai](https://www.betwithgary.ai/). Adam is the founder and operating contact. Use the verified entity name and registration details from the company's actual records when submitting an application; a site footer is not documentary proof of entity or licensing status.

The proposed integration is **consented, read-only import of a user's supported sportsbook bet history** into their private Book. It would reduce manual entry and support clearly labeled comparisons with Gary over the same window. Wager placement, deposits, cash prizes and referral compensation are outside this initial data-import proposal.

Your Book already supports manual tracking. A sportsbook connection must earn its additional cost and data responsibilities by serving actual users.

## Audience evidence available today

The initial audit's August 21–September 3 ET stored X snapshot contained 196 logged posts/threads, 101,022 summed thread impressions and 590 profile clicks. Standard game threads accounted for 162 rows. These are platform activity totals, not unique reach, qualified users or customer acquisition. Observation ages differ; automated self-replies affect reply totals; link-click values were unavailable for every row. Newer operational snapshots belong in `evidence/` and supersede these numbers when used externally.

No verified App Store install count, retained-user total, adult-audience percentage, geographic split or paid conversion rate is claimed here. Website useful-session measurement is newly corrected and needs observation time. The evidence packet is deliberately incomplete until those facts exist.

Before external outreach, attach dated seven-day and 30-day reports describing consent exclusions, useful sessions and mature return cohorts. The current reporter produces one UTC week at a time; a 30-day summary needs a separately defined analysis, with browser cohorts deduplicated rather than weekly browser counts added together. The percentage of all visitors who consent is not measured. Add actual native acquisition figures if available, clearly labeled. Ask willing adult users about the sports/books they use and the difficulty of manual entry; do not infer age or sportsbook relationships from X impressions.

Internal readiness threshold for a paid pilot: at least 10 willing adult users who already use Your Book and specifically request importing, plus a quote whose monthly cost fits a documented acquisition/retention hypothesis. This is a proposed spending gate, not a vendor minimum or a promise to those users.

## September 5 validation update

A read-only query at 12:23 UTC found 129 retained Book rows placed in the preceding 30 days, zero manual entries and zero accounts making manual entries on multiple Eastern dates. This aggregate is not a retention metric and does not exclude internal accounts or recover deleted rows. Manual import demand is unproven. The new [personal-tracking pilot](PERSONAL_TRACKING_PILOT.md) defines usability tasks, voluntary seven-day return and explicit import-request evidence. Do not attach the old X totals as proof of active Book demand or proceed to a paid import pilot from this baseline.

## Routes to investigate

| Route | What it establishes | What it does not establish |
|---|---|---|
| [FanDuel affiliate portal](https://affiliates.fanduel.com/) | A route to inquire about referral arrangements | Permission to access customer bet histories |
| [DraftKings affiliates](https://www.draftkings.com/affiliates) | A route for a promotion-plan inquiry | A public self-service account-data API |
| [SharpSports](https://docs.sharpsports.io/docs/quickstart-1) | A candidate linking/import SDK and API vendor; documentation lists [FanDuel](https://docs.sharpsports.io/reference/fanduel) and [DraftKings](https://docs.sharpsports.io/reference/draftkings) support | A direct Gary partnership with either sportsbook, guaranteed uninterrupted syncing, or contractually verified data rights |

SharpSports' indexed official pricing advertised betSync from $500/month during the September 4 review. Obtain a current written quote covering setup, minimums, active connections and refreshes; do not budget from the indexed starting price alone. Its documented flow includes API-triggered refresh and reauthentication. No public self-service FanDuel/DraftKings bet-history authorization was established in the review. [Vendor pricing](https://app.sharpsports.io/)

## Diligence questions and acceptance criteria

| Area | Written answer or sandbox evidence required |
|---|---|
| Rights | Contractual basis for access and reuse, permitted territories, sportsbook restrictions, termination and change-notice terms |
| User control | Explicit linking consent, plain data scope, disconnect, deletion, reauthentication; no credentials stored in Gary logs or app database |
| Coverage | iOS and web behavior; supported books, jurisdictions, history depth, props, parlays and same-game parlays |
| Accuracy | Stable source IDs and idempotency; corrected settlements, voids, pushes, cash-outs, free/bonus bets, partial settlements and odds changes |
| Reliability | Refresh limits and cost, freshness timestamp, outage behavior, reconnect flow; imported rows remain usable when the vendor is down |
| Security | Data flow, subprocessors, security evidence, retention, breach notification and server-only credentials |
| Comparison | User's actual original odds and stake; Gary's publication odds; identical periods and disclosed market/sample differences |
| Economics | Written all-in quote, cancellation terms, engineering cost and a measurable pilot decision date |

Start in a vendor sandbox. Match fixtures to expected records without real customer data. A subsequent 10-user opt-in pilot should preserve manual entry and allow disconnect without losing the user's saved history, subject to the agreed data rights. Imported, manual and Gary-derived entries must stay labeled. No public leaderboard enrollment by default.

## Unsent vendor inquiry

**Subject:** Gary: consented sportsbook history import for a small iOS/web pilot

Hello,

I’m Adam, the founder of Gary. We publish sports picks with written reasoning and a public record, and our users can keep a private Book of their own picks, odds and results.

We’re evaluating read-only sportsbook history import for users who explicitly opt in. We’re interested in FanDuel and DraftKings coverage on iOS and web. Our first step would be sandbox evaluation, followed by a small consented pilot if the demand and economics support it.

Could you share current coverage and pricing, the contractual basis for supported-book access, the linking and deletion flows, refresh/reconnect requirements, and how you handle corrected settlements, cash-outs, bonus bets and parlays?

We can share a current product demo and a dated audience report once the measurement cohort has matured. We are not claiming a direct sportsbook partnership or proposing wager placement in this pilot.

Thank you,
Adam

Do not send this draft until the audience attachment is accurate and Adam authorizes the outreach. An affiliate inquiry should be a separate message about distribution, with verified adult audience/geography and proposed placements.
