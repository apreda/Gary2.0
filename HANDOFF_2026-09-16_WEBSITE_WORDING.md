# Website wording — September 16, 2026

Adam asked to fix confusing website wording, specifically “Gary’s card is the product” on Pricing and repeated references to “the Board” where he expects “The Picks.”

Pricing now leads with “Free picks. Winners is Gary’s shortlist.” It explains free game picks and reasoning, Winners selections with a separate record, single-sport and All-Access plans, and existing launch/founding access. Displayed prices and account/purchase destinations remain the existing ones.

Public copy uses picks, Winners picks, research, schedule, or leaderboard according to meaning. This covers page headings, actions, empty/error states, account messages, archives, metadata, the reviewer guide, and matching email templates. “Card” remains when describing the actual flip/expand card control. Internal component names, API contracts, identifiers, analytics/campaign keys, and historical pick reasoning are preserved. No email campaign was invoked.

Verification: all 78 web test files / 890 tests pass. Typecheck and production build pass. Lint has zero errors and the two existing BookClient/DeleteAccount navigation warnings. Fixture smoke passes including picks, results, archive/permanent pages, exports and sitemap discovery. Browser QA checked Pricing at 390px and 1440px (no horizontal overflow), single-sport selection, pick flip/expand controls, live fixture scores and results rendering. Four existing text assertions were updated for renamed labels; no new string-matching test suite was added.

The broader production-truth command cannot verify edge parity or support queue without a Supabase CLI token in this shell. Its working-tree warning includes this patch, the intentionally local private iOS plist, and another session’s untracked Winners migration. Neither the plist nor migration is part of this change. Final live website/deployment receipt belongs to the task; do not infer backend parity from this wording release.
