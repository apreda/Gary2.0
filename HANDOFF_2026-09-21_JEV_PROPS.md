# Jev props integration — September 21, 2026

Adam approved implementation, then narrowed scope to **props only**. No NFL game-pick integration. The earlier NFL-game portions of the research plan are superseded.

## Saved implementation and activation

Canonical backend: `/Users/adam.preda/Gary2.0/gary2.0`, main. The running `com.gary.scheduler` points here and launches new Node children for prop runs. The local backend `.env` enables `GARY_JEV_ENABLED=true`, `GARY_JEV_MODE=assist`, `GARY_JEV_PROP_LEAGUES=MLB,NFL,NCAAF`, `GARY_JEV_MODEL=jev-1.13.0`. The supplied `TYPESAFE_API_KEY` is in that ignored, mode-0600 file. `.env.local` has no Jev override. No key appears in tracked source or receipts.

Jev is configured for the next **fresh scheduled prop process**. A direct real-data assessment succeeded, but no scheduled Jev-assisted published pick has yet been observed. Do not equate the direct assessment with published picks or proven betting improvement. No scheduler restart, native build, push, release, test suite or smoke suite was performed. Existing in-flight processes retain their loaded modules. Unrelated dirty files were preserved.

- MLB: `src/services/pickdesk/propsBrain.js`, after the existing desk/screen/sheets and before Gary's final decision; CORE and HR candidates.
- NFL: `src/services/pickdesk/footballPropsDesk.js`, before the props decision; CORE and TD candidates.
- NCAAF: `src/services/pickdesk/ncaafPiggybackProps.js`, after the game pick and before the one-prop decision. The separate full football desk is also hooked, but the scheduler still uses piggyback.
- NBA has no active prop desk in this CLI; no imaginary NBA integration. The shared prop evidence interface supports the three current sports.
- No Jev text is added to shared scout reports or any game brain. Jev reads no already-published game prediction as independent source evidence. Existing game calls may still be present in Gary's prop prompt as before.

`src/services/jev/client.js` implements the direct TypeSafe HTTP API, pinned model, response validation, exact-input cache (120 seconds), two requests per process, eight-second request budget including slot wait/retry, at most one bounded 429/5xx retry, private receipts and sanitized failures. The desk has a 60-second aggregate Jev budget. Concurrency across processes remains bounded by existing scheduler process limits, not a new global lock. Jev/storage failure retains the original Gary desk and an unavailable status.

`src/services/jev/propAssessments.js` prepares bounded verbatim named-player passages with nearby context, section headers and available article dates/URLs. It asks independent questions about role change, observed involvement versus stated plans, workload reporting, conflicting reports, role-source selection, workload-source selection and per-market matchup relevance. Unknown/no-source alternatives are explicit. Scores/confidence are interpretations of supplied evidence, never outcome probabilities. Gary receives the original desk plus these labeled assessments before deciding; no post-answer critic or automatic bet direction/conviction adjustment was added.

Private receipts: `gary2.0/logs/jev/assessments`, `runs`, and `decisions` (ignored, files 0600). Each decision receipt explicitly describes model selection **before** publication gates. Actual published props carry `jev.run_id` and version/status metadata through the existing storage path, alongside the actual quote receipt. Join stored results to those run IDs for later analysis. No comparison model, learned betting probability, automated evaluation dashboard or periodic monitoring task has been created.

## Standard-market and price repair included in the approved plan

`src/services/standardPropMarkets.js` corroborates each BDL side against the exact named book/player/statistic/line in The Odds API's **main** prop markets. Alternate keys are neither requested nor accepted. Explicit alternate BDL rows and milestone ladders are excluded; 1+ HR/anytime TD retain their existing fun-lane settlement meaning only when corroborated against the corresponding standard market. Unsupported or ambiguous identity stays excluded. Quotes keep the original BDL prices; the second provider supplies standard-market identity, not a replacement price.

MLB/NFL/full-college menus and college piggyback require this proof. `propQuoteReceipt.js` carries it independently of the BDL quote hash. `verifyPropQuotes.js` rechecks the selected BDL quote and then the same sportsbook's main-market identity before publication. No corroboration means no publication of that ticket. This adds a data-provider dependency and can reduce coverage. The upstream best-price merge can discard an alternative book's row before corroboration; current filtering does not rebuild those lost book offers.

The shared prop odds floor is now **−179**, with existing positive-price limits retained. Invalid American prices are rejected. MLB's favorite screening band follows that floor. This does not rewrite or settle the historical McCaffrey 104.5 ticket; its disposition remains a separate decision.

## Actual operational receipts

At approximately 3:48–3:52 PM ET on September 21:

- BDL game `1392247`, Giants at Rams, kickoff September 22 00:15 UTC: 820 aggregated full-game prop rows; 123 had same-book standard-market corroboration. This count includes eligible and later-filtered market families/prices; it is not a published-pick count.
- Source: Giants.com, “Players to watch in Monday’s primetime matchup,” published September 18, 2026. Source URL: https://www.giants.com/news/week-2-monday-night-football-jaxson-dart-cam-skattebo-malik-nabers-tremaine-edmunds-deonte-banks-greg-newsome
- Initial extraction through the existing shared NFL Readability helper selected a historical photo gallery. No named-player passages survived and Jev was not called. Receipt: `ce452337-ce8c-41ef-b2f4-95e5a87f5760`. **The shared article-extraction defect was not changed**, since it also feeds game picks. This is a known source-quality limitation; the prop helper does not invent missing reports.
- For the direct onboarding assessment, the actual publisher article text blocks were retrieved with `.nfl-c-article__container > .nfl-c-body-part--text`. That corrected onboarding source is saved privately; this is not a claim that the shared extractor has been repaired.
- Successful run `c88befac-50c4-4941-8ec8-cd5f8e94a154`: Jaxson Dart, Cam Skattebo, Malik Nabers; all three completed; 25,111 API-reported input tokens; request times 597, 582 and 207 ms. Each reported observed involvement, no established role change and no stated upcoming workload limit. These classifications are model judgments, not independently validated truths.
- Onboarding receipt: `gary2.0/logs/jev/onboarding/first-assessment.json`. Menu and original article are alongside it. No onboarding pick was generated or published.

## TypeSafe skill and future evaluation

The exact user-linked skill was read and saved directly at `.agents/skills/typesafe-ai/SKILL.md`, with provenance in `SOURCE.md`. No marketplace/npx installer was needed. Use its live-doc guidance; Adam's newer iteration rules override generic test guidance.

Official references: https://docs.typesafe.ai/api, https://docs.typesafe.ai/primitives, https://docs.typesafe.ai/models, https://the-odds-api.com/sports-odds-data/betting-markets.html.

Next evidence to collect through normal operation: scheduled run/decision/publication receipts, source omissions, latency/availability, and settled outcomes by sport/market/CORE-HR-TD. Report observed performance without claiming Jev caused an improvement. Any future paired baseline or calibrated outcome model needs actual pregame observations and held-out outcomes; it is not part of this first assist delivery.
