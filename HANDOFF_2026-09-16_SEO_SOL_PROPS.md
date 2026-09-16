# SEO implementation and Sol props — September 16, 2026

## Founder direction and model change

Adam asked to execute the SEO recommendations (fresh Search Console data, clearer MLB/NFL wording, useful game pages, relevant reviews/earned links) and explicitly selected Sol for props. His “keep” referred to an assumption: the previous live props primary was Luna, with Claude fallbacks. The switch was explained before implementation.

New props route: **Sol medium on dedicated Plus → Claude Sonnet → Claude Fable**. Existing props effort handling and Claude subscription fallbacks remain; no props data, prompts, scoring, publication checks or metered API access changed. Personal Pro remains excluded from props. Game order is still Fable/xhigh → Astra/xhigh on Plus → Opus/max → Astra/xhigh on personal Pro as final reserve. Nothing in the props request selected a new game primary.

Updated source defaults, the canonical scheduler template and the installed com.gary.scheduler plist. Waited for current children to finish before reloading. The first immediate launchctl bootstrap raced the old process teardown and returned error 5; a state check established that the old job was gone, and the next bootstrap succeeded. Scheduler PID 8541 is running from the canonical checkout with GARY_PROPS_MODEL_OVERRIDE=codex-gpt-5.6-sol. No live pick was terminated to change its model.

A real, non-publishing Sol/medium adapter call returned SOL_PROPS_READY on codex-plus. It explicitly disallowed personal Pro. This proves current model/account connectivity, not a guarantee of future quota or every props job's success. Existing completed props were not regenerated.

## Website changes

- Homepage title/description and visible eyebrow explain AI sports betting picks for MLB, NFL and college football, while keeping the approved brand headline and artwork.
- Homepage sport strip links to active league hubs; sport metadata explains betting picks, AI analysis, original odds and results. NBA's future relaunch is not promoted as an active homepage league.
- Permanent matchup pages have a server-rendered original ticket/odds/result/final-score receipt beside the existing card and full original rationale. Price is parsed only from published ticket text, never substituted from conflicting generic metadata or current market prices. Missing prices are disclosed. Another market's result is not attached; duplicate grade rows/repeated game identities are marked unresolved.
- Existing publication timestamp and source disclosures remain; no backdated timestamps or invented analysis. Article schema remains Article, not SportsEvent.
- Press page includes an independent reviewer walkthrough and downloadable /brand/gary-reviewer-guide.txt. No ratings, endorsements, paid links or independently verified profit claims were invented.
- Phone QA fixed sport-link typography and the existing decorative hero glow's horizontal overflow. The homepage, game page and press page fit a 390px viewport.

## SEO work requiring account/user input

Read [fresh-access baseline](GaryMarketing/launch-2026-09/SEO_BASELINE_2026-09-16.md) and [tailored outreach drafts](GaryMarketing/launch-2026-09/SEO_OUTREACH_2026-09-16.md).

The personal Google session does not own Gary's Search Console property. Its agentrunapps.com figures are unrelated and were not used. The business Google account is signed out; Adam has been asked to complete its sign-in. Fresh query/indexing counts and new URL Inspection requests remain pending. Do not re-label the September 8 report as current.

Three exact drafts are prepared for SGPN, Sports Business Journal and App Review Central using official contact/submission routes. Explicit dispatch approval was requested after preparation; preserve the September 20 campaign hold. No pitches were sent, subscriptions purchased, newsletter opt-ins submitted, or future automation created. Earned reviews and links are not yet accomplished outcomes.

## Verification

Backend: 393 files / 4,296 tests passed. Edge: 242 tests passed. Web: 78 files / 890 tests passed, including four new receipt cases for conflicting metadata, missing prices, wrong markets and ambiguous identities. Type checks and production build passed. Lint has zero errors and two pre-existing internal-navigation warnings in BookClient/DeleteAccount.

Production sitemap outage/recovery test passed: runtime inventories, cold outage errors, recovery, preservation of last successful XML and subsequent fresh inventory publication. Live archive sitemap returned 200. The first dev smoke attempt hit the shared-node_modules symlink's Next request-context issue; the production sitemap test independently passed. The full fixture smoke then passed with a physical cloned dependency directory, restoring a single Next request-context instance. This was a preview dependency-layout issue, not a production sitemap failure.

Production-truth confirmed 12/15 MLB picks, no started game missing, 3 pending at 17:38 ET; game/Fable and props/Sol installed configuration, Winners running. Its broader edge parity/support queue checks could not authenticate the Supabase CLI in this shell, so the overall command returned unverified. No edge runtime files changed in this patch. The private ios/GaryApp/GoogleService-Info.plist remains an intentional uncommitted local exception and must not be included.

Deployment and CI receipts are recorded in the task's completion message. Preserve earlier handoffs for known historical ticket/rationale discrepancies and auth-concurrency work; this SEO patch does not claim those separately scoped issues were repaired.
