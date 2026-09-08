# Product Hunt launch extras — September 8, 2026

Updated at approximately 10:35 AM Eastern. This receipt covers the extra items Adam requested from the prelaunch checklist. Website and marketing only: no native app, pick generation, scoring, grading or publishing process was changed by this work.

## Completed account actions

| Checklist item | Verified result |
| --- | --- |
| Product categories | **Predictive AI**, under Engineering & Development, saved in the product editor and freshly reloaded. Existing launch tags **Sports** and **Artificial Intelligence** remain unchanged. No unrelated categories added to fill a quota. |
| Shoutouts | **Vercel, Supabase and Next.js** saved and freshly read back in the launch editor. All three appear under **Launch Team / Built With** in the product preview. These are factual descriptions of Gary's actual website stack, not invented praise, competitor evaluations or performance claims. No alternatives selected. |
| Video / Loom | [30-second website overview](https://youtu.be/DsPIea4KyD0) uploaded once to the existing **Gary A.I. / @betwithgary** YouTube channel and published **Unlisted**. URL saved and freshly read back in Product Hunt. The gallery's first card opens the working YouTube embed. |
| Captions | English timed captions uploaded from [the SRT](product-hunt/video/gary-website-overview-en.srt). Studio's subtitles table reports **Published — September 8, 2026**. Actual caption text rendered during the Product Hunt embedded playback. |
| First comment | Existing shortened maker introduction preserved; no new automated community comment or reply. |
| Additional makers | Actual maker **Adam Preda / @adam_preda1** preserved. No invented collaborators or unnecessary invitations. |
| Product forum | [Feedback thread published once](https://www.producthunt.com/p/gary-ai/what-would-make-gary-s-public-sports-picks-record-more-useful), then read back at its own URL and on the product page. No comments, votes, follows or artificial engagement added. |

The [product preview](https://www.producthunt.com/products/gary-ai?launch=gary-ai) continues to show **scheduled for September 13, 2026 at 12:01 AM PDT / 3:01 AM EDT**. The launch was not rescheduled, duplicated or represented as already live. A dashboard checkmark alone is not evidence of playback, successful moderation or featuring.

### Saved technology credit text

**Vercel:** Vercel hosts the Gary website at betwithgary.ai. Our Next.js production deployments and custom domain are managed there, with Web Analytics and Speed Insights integrated into the website.

**Supabase:** Gary uses Supabase for website authentication and PostgreSQL-backed data. The website combines cookie-backed sign-in with server-side data access and row-level access policies for private account data.

**Next.js:** Gary’s website is built with Next.js and React. We use server-rendered public pages, permanent matchup URLs and route metadata so people can open a dated pick, read its reasoning and return to the original page.

Source checks used the existing `web/package.json`, website auth/data source and [deployment receipt](evidence/website-deployment-2026-09-08.json). Shoutouts become attributed founder reviews and can notify the credited product; they are not private notes. The first unsaved attempt was corrected after discovering that Product Hunt's floating tips panel covered the Save button. The later successful save and fresh reload establish persistence.

### Video scope and settings

This is a **silent still-image overview**, not a continuous demo, founder recording or native-app walkthrough. It uses the three unchanged September 7 website gallery images, ten seconds each, in board → reasoning → record order. Historical-example, record-scope and 21+ labels are retained. [Local verification and hashes](product-hunt/video/verification.json), [assembly notes](product-hunt/video/README.md).

Saved title: **Gary website overview: picks, reasoning and the public record**.

Saved description:

> A 30-second still-image overview of the Gary website using September 7, 2026 examples. Find a posted game pick, read the reasoning and inspect the public game-pick record, including losses.
>
> This is a caption-led overview, not a continuous screen recording. Historical examples, not current picks. Figures will change. Game picks and player props are reported separately; Home Run and Touchdown fun picks are excluded from the headline record.
>
> 21+. Sports information and entertainment only. Gary does not accept wagering deposits or place bets. No guaranteed outcomes. Past results do not guarantee future outcomes.
>
> Website: https://www.betwithgary.ai/picks

Visibility **Unlisted**, not made for kids, English, Science & Technology, embedding enabled, subscriber-feed publication/notifications disabled and remixing disabled. No paid promotion, synthetic person/real-world scene, music or generated voice. Automatic places/concepts disabled. The house 21+ labels are not a YouTube age-verification gate. The software overview does not connect viewers to a betting operator or place wagers.

At the last Studio inspection, YouTube's copyright check was **still running longer than usual**; the video was playable and Unlisted. This is not a copyright-clearance or platform-policy-approval receipt. Studio also reports that external description links require one-time channel verification to become clickable; that verification was not completed. Product Hunt's separate clean website Visit link works independently. The first watch-page load temporarily said captions unavailable; the later published subtitle table and actual captioned Product Hunt playback are the stronger receipt.

## Website promotion

The official dark **Find us on Product Hunt** badge was added to the website footer in **`a729d9c1`**, using the existing product/post rather than a fabricated award. It is a 250×54 lazy-loaded SVG image, with reserved dimensions, a descriptive accessible name, keyboard focus styling and `no-referrer`. No embed script, iframe, extra client component or dependency was added.

- Destination: `https://www.producthunt.com/products/gary-ai?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-gary-ai`
- Official image: `https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1244756&theme=dark`
- Independent code review: no findings; image returned HTTP 200 and contained no scripts.
- Focused tests: **3/3 pass** at 10:29 AM ET.
- Integrated release-owner receipt: **838/838 web tests across 72 suites**, full TypeScript and ESLint pass, including these two footer/promotion paths. Other account fixes belong to the separate release owner.
- Production deployment: **READY**, `dpl_49QP7SoBHoDR4FETafF8PYbCa6UF`, exact SHA `a729d9c13fc6bf1a7ec6353023408cac3a65d39c`. Release owner verified all seven canonical aliases with no alias error. Integrated release used the existing Vercel Git workflow; no second deployment or hosting migration.
- Independent live readback at approximately 10:34 AM ET: `https://www.betwithgary.ai/` rendered the badge after footer scrolling, image complete with natural 250×54 dimensions, correct accessible name/link and no horizontal page overflow at the observed 1119px viewport. Visual inspection passed; clicking the actual live badge opened the existing Gary Product Hunt listing. No separate narrow-mobile browser receipt is claimed.
- Read-only `production-truth.js`: all listed edge deployment parity checks passed, no unpushed commits and zero started games missing a pick. Exit 1 reflected **13 uncommitted shared-worktree paths** (concurrent native/readiness work and these pending marketing documents), not a clean-tree pass. No jobs or pick/grading actions were run.

## Prepared social posts

**Prepared, not posted or platform-scheduled.** Publish only after the September 13 public launch and website destination are verified. No vote request or incentive. Product Hunt engagement and Gary useful sessions/returns must be reported separately.

The dashboard exposes separate **Copy Link** buttons for X and LinkedIn. Their URLs were not retrievable through the browser's virtual clipboard; Adam was asked to paste both. Do not invent platform tracking IDs or call the clean fallback below a captured platform-tracked URL. Replace the clean link with the corresponding copied URL when supplied.

### X — combine with the September 13 record slot

> Gary is on Product Hunt today. Free sports picks, written reasoning, and a public record—including losses. Take a look and tell us what would make the record clearer.
>
> https://www.producthunt.com/products/gary-ai
>
> 21+. No wagers placed. No guaranteed outcomes.

This **replaces/combines with P10**, not a fourth original product piece that week. September 8's published introduction and September 10's planned reasoning piece remain separate. Use the verified website overview or website gallery, not unverified native-release footage. Recheck the post's final character count with the actual platform link and preview before publishing.

### LinkedIn — factual company update

> Gary is on Product Hunt today.
>
> The website brings together free sports picks, written reasoning and a public game-pick record—including losses. The record shows its date window and scope; player props are reported separately, and Home Run and Touchdown fun picks are excluded from the headline record.
>
> We’re looking for practical feedback: what information would make that record easier to evaluate, and what would help you understand the reasoning behind a pick?
>
> Explore Gary and join the discussion: https://www.producthunt.com/products/gary-ai
>
> 21+. Sports information only. Gary does not place wagers. No guaranteed outcomes.

LinkedIn sign-in, the intended posting identity and publishing access are **not verified** by this preparation. Do not publish from an unrelated personal/company identity or invent a company page. Adam's genuine maker replies and launch-day availability remain human responsibilities.

## Final check / remaining items

1. **Done:** production badge deployment, rendered image and actual destination verified.
2. Capture the two dashboard sharing URLs, replace the clean social fallback links, and preserve source attribution.
3. Recheck YouTube's pending copyright notice; do not upload another copy to work around processing.
4. On launch day, verify the actual public state before using “today,” publish the applicable prepared slot and answer real questions personally.

The broader [completion tracker](LAUNCH_COMPLETION_TRACKER.md) still has factual/account dependencies: company mailing address and chosen email test recipient, Reddit signup completion, applicable Instagram controls, account recovery and human rehearsal/support coverage. This extras receipt does not close those unrelated gates or guarantee traffic.

## Guidance used

[Product categories](https://help.producthunt.com/en/articles/8104478-how-to-add-a-category-to-a-product), [shoutouts](https://help.producthunt.com/en/articles/9097078-how-to-add-a-shoutout), [product forum guide](https://help.producthunt.com/en/articles/11432379-maker-s-guide-to-product-forums), [forum guidelines](https://help.producthunt.com/en/articles/10478791-product-hunt-forum-guidelines), [commenting guidelines](https://help.producthunt.com/en/articles/10030102-commenting-guidelines), [community guidelines](https://help.producthunt.com/en/articles/3615694-community-guidelines), [YouTube regulated goods policy](https://support.google.com/youtube/answer/9229611?hl=en). Read September 8. These sources are guidance, not a platform clearance for Gary.
