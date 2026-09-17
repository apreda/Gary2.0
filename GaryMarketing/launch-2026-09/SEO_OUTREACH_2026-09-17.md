# Gary SEO outreach package — September 17, 2026

Prepared for Adam as Workstream E of the September 16 SEO/growth handoff (spec §9.2–9.4, 9.6, 9.7; plan Task 22). It updates, and does not overwrite, `SEO_OUTREACH_2026-09-16.md`.

State of every item in this file: **prepared, not sent.** No message was sent, no form submitted, no review service joined, no newsletter opted into, nothing paid. The September 20 campaign hold stands; reaching that date is not permission to send. The sending identity is still unselected. Adam approves the exact messages before any dispatch.

Companion tracker: `SEO_OUTREACH_TRACKER_2026-09-17.csv` (one row per prospect, every row `prepared`, hold date `2026-09-20`, send/reply/placement/visit fields empty).

All times below are Eastern (America/New_York). The route re-verification and prospect research ran between **11:46 PM and 11:52 PM ET on September 16, 2026** (03:46–03:52 UTC September 17); the individual retrieval times are on each row. Raw fetches are in the session scratchpad `outreach-probe/` (`stamp.txt` has the per-fetch log).

## 1. What the drafts point to now

The drafts use Adam's approved product language (spec §1): **The Picks** (Gary's game and player prop picks for the sports he covers), **Winners** (Gary's best bets of the day; the number varies; a Winners designation is not a result), **The Hub** (insights and betting connections). Gary is an AI character, not a human handicapper. No draft quotes a win percentage, a units figure, a "certified" record, or a favorable short window as the all-time record.

Approved Winners sentence, used verbatim in every draft: `Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.` (source: `web/components/site/Sections.tsx:107`).

Website changes the drafts rely on (all in the plan; commit SHAs: see HANDOFF):

| Destination | What it is after the plan lands | Where implemented |
|---|---|---|
| `/picks/mlb`, `/picks/nfl`, `/picks/ncaaf` | Sport pages with today's picks, recent dated listings, the sport record link, cross-links and the Winners invitation | Task 6 (commit: see HANDOFF) |
| `/picks/<sport>/<date>/<game>` | Permanent game page: original reasoning, published ticket and price, graded result, related props, Hub link, Winners invitation | already live; next steps added in Task 8 (commit: see HANDOFF) |
| `/props` | Today's player props grouped by game, dated, with truthful empty states and links to the two lanes | Task 4 (commit: see HANDOFF) |
| `/props/home-runs` | Today's MLB home run picks: batter, matchup, listed odds, reasoning. Explainer states they are long shots, never counted in the game record and not part of Winners | Task 3 (commit: see HANDOFF) |
| `/props/touchdowns` | Today's **NFL anytime** touchdown scorer picks. NFL only; Gary does not publish first-touchdown picks | Task 3 (commit: see HANDOFF) |
| `/winners` | Gary's best bets of the day, with its own record | already live |
| `/hub` | Insights and betting connections, each insight now anchored and linked to Gary's pick for that game | Task 9 (commit: see HANDOFF) |
| `/results`, `/results/audit`, `/results.csv` | Complete public record, wins and losses, downloadable | already live |
| `/press` + `/brand/gary-reviewer-guide.txt` | Reviewer walkthrough, brand mark, boilerplate, embeddable record badge; guide realigned to the product language and lists the props, lane, Winners and Hub URLs | Task 14 (commit: see HANDOFF) |
| `https://betwithgary.com/*` | Redirects to `https://www.betwithgary.ai/*` so any earned link on the old host lands on the canonical one | Task 11 (commit: see HANDOFF) |

Dispatch prerequisite: `/props/home-runs` and `/props/touchdowns` must be live and returning 200 on production (plan Task 24 live checks) before any draft that links them is sent. The September 20 hold already sits after the planned release; re-check the two URLs on the day of dispatch regardless.

Facts the drafts may use (sources: `web/lib/gary/press.ts`, `web/lib/gary/launch-offer.ts`, `web/app/press/page.tsx`):

- Gary AI makes game picks and player prop picks for MLB, NFL and college football. NBA is preparing for relaunch; earlier sports records remain in the archive.
- Game picks, available player props, the Hub, the public record and the private Book are free. Winners is the paid selection; during the launch preview Winners is open until October 1, 2026 at midnight Eastern, and accounts created before that cutoff retain founding access. After the preview, Winners is offered from $9.99/month per sport or All-Access (current terms at `/pricing`).
- iPhone app: `https://apps.apple.com/us/app/gary-ai/id6751238914` (US storefront). Reviewers outside the US must be able to install from their own storefront; confirm availability before sending to a non-US reviewer.
- Support: `support@betwithgary.ai`. X: `@BetwithGary`.
- Gary does not accept wagers or place bets.

Facts the drafts must not use: any win rate, net units, streak or "44–35"-style window as a headline; "independently verified" or "certified"; a public home run tally or record (HR is a published card, never a tally); first-touchdown coverage; NCAAF touchdown picks; "board", "card" or "shortlist" as the product name; a human biography for Gary.

## 2. Route re-verification for the three September 16 prospects

| Prospect | Route as published | Re-verified | Result | Fee / service requirement |
|---|---|---|---|---|
| Sports Gambling Podcast Network (SGPN) | Website contact form `https://www.sportsgamblingpodcast.com/contact/` | 11:46 PM ET (WebFetch) and 11:47/11:49 PM ET (curl, desktop Safari UA) | **Not re-verifiable from the command line tonight:** the contact page, home page and about page all returned HTTP 403 with a Cloudflare "Just a moment..." challenge. The form was last verified in a browser on September 16 (`SEO_OUTREACH_2026-09-16.md`). Fallback route found in the show's public RSS feed (Simplecast `https://feeds.simplecast.com/MqvHchJZ`, read via the iTunes podcast lookup at 11:50 PM ET): owner email `podcast@sportsgamblingpodcast.com`, owner "Sports Gambling Podcast Network", site `https://www.sportsgamblingpodcast.com`, latest episode published 2026-09-16 09:30 UTC (active daily). The network also runs "The College Football Experience" and a daily "MLB Gambling Podcast" (SGPN pages seen in search results at 11:50 PM ET). | None seen. Adam re-opens the contact form in Chrome before dispatch; if the form is still walled, the feed-listed owner email is the published alternative. |
| Sports Business Journal | `news@sportsbusinessjournal.com` per the FAQ `https://www.sportsbusinessjournal.com/Corporate/FAQ/` | 11:47 PM ET (curl, HTTP 200; WebFetch is blocked for this host) | Verified. FAQ text: "Press releases, story ideas or news can be submitted by email to news@sportsbusinessjournal.com." The same page lists `advertise@`, `help@` and event addresses; none of those is the route. | None for a story idea. Reading SBJ content requires a subscription; that does not affect sending an idea. |
| App Review Central | App Submission page `https://www.appreviewcentral.net/app-submission/` | 11:47 PM ET (WebFetch and curl, HTTP 200) | Verified. Page text: "If you are an Android or iOS app developer and would like to have your app considered for App of the Day, please feel out the form below. Due to the high amount of submissions, not every app will be listed. Make sure to opt-in to our newsletter." It adds a bracketed note that a "new submission service via YourPitch" (`https://www.yourpitch.io/influencers/app-review-central`) increases the chance of the pitch being seen. | **Two things to avoid:** (1) the site's Advertising page (`/advertising/`, 11:49 PM ET) sells "custom, search engine optimized reviews and/or article" with undisclosed pricing ("we can discuss pricing and options"); that is a paid placement and is declined. (2) The YourPitch service could not be checked (TLS certificate mismatch at 11:49 PM ET; no public pricing found by search at 11:50 PM ET); do not enroll. Use only the on-page free submission form, and do not opt into the newsletter as a condition; if the form makes newsletter opt-in mandatory, stop and record it. |

AppAdvice was tried again (`appadvice.com/contact`, 11:49 PM ET) and failed DNS resolution (`ENOTFOUND`), as on September 16. Still not a verified target.

## 3. Refreshed drafts for the three existing prospects

Sender line in every draft: `[sender: unselected — an authenticated Gary address, chosen by Adam]`. Replies route to `support@betwithgary.ai` where a contact address is required by a form.

### Draft D1 — SGPN (contact form; fallback `podcast@sportsgamblingpodcast.com`)

Subject: Put an AI's picks on trial for one full slate

Hi Sean, Ryan and the SGPN team,

I'm Adam, the founder of Gary AI. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football, publishes the reasoning with each one, and keeps the result on a public record next to the original ticket and price.

Three things your listeners can inspect without buying anything:

- The Picks, game by game: https://www.betwithgary.ai/picks/nfl and https://www.betwithgary.ai/picks/ncaaf (MLB at https://www.betwithgary.ai/picks/mlb). Each game has a permanent page with the reasoning, the published price and the graded result.
- Winners: Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. https://www.betwithgary.ai/winners
- The Hub: insights and betting connections for the day's games. https://www.betwithgary.ai/hub

Long shots have their own pages: NFL anytime touchdown picks at https://www.betwithgary.ai/props/touchdowns and MLB home run picks at https://www.betwithgary.ai/props/home-runs. They are published as picks and kept out of the game record, so nobody can dress them up as a win rate.

The idea: pick one Sunday (or one MLB day), open every game page before kickoff, log the ticket and price, then come back after the finals and hold the same tickets against the record at https://www.betwithgary.ai/results. Say what held up and what didn't. We are asking for an honest review, not a rating. Reviewer notes and the brand mark are at https://www.betwithgary.ai/press.

Happy to answer questions, including what Gary gets wrong.

Adam Preda
Founder, Gary AI

### Draft D2 — Sports Business Journal (`news@sportsbusinessjournal.com`)

Subject: Story idea: an AI sports-picks product that keeps its losses on the page

Hi SBJ news desk,

I'm Adam Preda, founder of Gary AI, an AI sports-analysis product for MLB, NFL and college football.

What it does, in plain terms: Gary makes game picks and player prop picks and explains each one. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections. Game picks, props, the Hub and the record are free; Winners is the paid tier.

The angle for your technology and betting coverage is accountability in consumer AI: every published pick has a permanent page that ties the original written reasoning and price to the graded result, including losses, with the full record downloadable as CSV. We do not describe win rate as profit, and the record is public rather than independently certified.

- Reviewer materials: https://www.betwithgary.ai/press
- Complete record and audit: https://www.betwithgary.ai/results and https://www.betwithgary.ai/results/audit
- An example permanent game page is one click from https://www.betwithgary.ai/picks/nfl
- Methodology: https://www.betwithgary.ai/how-it-works

If it fits, I can walk through the product and talk about the unglamorous part: keeping model output, source data and graded results consistent. No purchase is needed to review the game analysis.

Thanks,
Adam Preda
Founder, Gary AI

### Draft D3 — App Review Central (on-page free submission form only)

App name: Gary AI
Platform: iPhone; companion website
App Store: https://apps.apple.com/us/app/gary-ai/id6751238914
Website: https://www.betwithgary.ai/
Contact: support@betwithgary.ai

Pitch: Gary AI is an AI that makes game picks and player prop picks for MLB, NFL and college football, with the reasoning on every pick. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections. Every published pick keeps a permanent page with its price and graded result, and the full record, wins and losses, is public at https://www.betwithgary.ai/results. The app also includes a private Book for tracking your own bets separately from Gary's record. Gary provides analysis and does not accept wagers.

The app is free to download. Game picks, player props, the Hub and the public record can be evaluated on the website without a purchase (https://www.betwithgary.ai/picks/nfl, https://www.betwithgary.ai/props). Winners is a paid selection; current terms at https://www.betwithgary.ai/pricing.

Reviewer notes and the real brand mark: https://www.betwithgary.ai/press

Please evaluate it independently. No positive review, rating or link is required.

Form handling: use the free App of the Day form on `/app-submission/` only; do not use the Advertising page, do not enroll in YourPitch, and do not opt into the newsletter as a purchase of coverage. If the form requires an opt-in to submit, stop and record that in the tracker instead of submitting.

## 4. New prospects (10), verified September 16, 11:46–11:52 PM ET

Selection rule: audiences that already read or listen to sports betting analysis for the active leagues (MLB, NFL, NCAAF), or independent iOS app reviewers with a published, free editorial route. No paid placements, no affiliate round-ups, no link directories. Each row records the route exactly as the outlet publishes it.

| # | Prospect (type) | Audience fit | Official route (as published) | Tailored angle | Links to include | Verified |
|---|---|---|---|---|---|---|
| 4 | **Ben Fawkes' Sports Betting Substack** (newsletter) | Ben Fawkes is a sports betting journalist (ESPN, Yahoo, The Athletic per his About page; ex-ESPN Chalk and VSiN per search results). The newsletter promises "Reporting on betting action from my regular conversations with bookmakers and bettors", aggregated picks and "Interviews with sports and betting industry professionals". Header states "Over 6,000 subscribers". Free and paid tiers. Strong fit: a journalist who already tests handicappers' claims. | No email or X handle on the About page. Route: Substack profile `https://substack.com/@bfawkes22` (direct message / reply to a Note) and the publication `https://bfawkes22.substack.com/about`. | Offer a journalist's test: he picks the NFL week, opens the game pages before kickoff, and compares tickets with the record afterwards. Winners as "the bets Gary likes most", with its own record. | `/picks/nfl`, `/props/touchdowns`, `/winners`, `/results`, `/press` | About page 11:49 PM ET (WebFetch); home page "Over 6,000 subscribers" 11:49 PM ET; profile handle via search 11:50 PM ET |
| 5 | **Circles Off / The Hammer Betting Network** (podcast) | Feed description: "your source for educational sports betting content powered by The Hammer Betting Network", flagship hosted by Rob Pizzola (professional bettor) plus "Circle Back", which "covers the latest from Gambling Twitter". Latest episode 2026-09-16 17:30 UTC (active). Strong fit for a skeptical examination; their audience distrusts unaudited pick sellers, which is exactly why the public ledger is the pitch. | Public RSS feed owner email `atodds.podcast1@gmail.com` (Megaphone feed `https://feeds.megaphone.fm/HAMMR1717066516`, read 11:50 PM ET); The Hammer site footer mailto decodes to `contatc@thehammer.bet` (published that way on `https://thehammer.bet/`, 11:49 PM ET; appears misspelled on their side, so pair it with another route); X `@thehammerhq` (site footer). | "Circle Back" segment: put an AI pick product on the table, read the reasoning aloud, check the ticket against the record a week later. No rating asked. | `/picks/nfl`, `/picks/ncaaf`, `/winners`, `/results/audit`, `/press` | Site 11:49 PM ET (curl, HTTP 200); feed 11:50 PM ET |
| 6 | **Gambling With an Edge** (podcast + radio, Las Vegas Advisor) | Hosts Bob Dancer and Richard Munchkin: "Learn to Gamble With an Edge from authors, and professional gamblers" (feed description). Contributors on the site include Jack Andrews (sports). Latest episode 2026-08-26 (feed). Audience: advantage players who interrogate tools and edges; a fit for an honest "what does an AI pick product actually give you" conversation. Moderate fit (casino advantage play is a large share of the show). | Public RSS feed owner email `rwmunchkin@gmail.com` (Feedburner feed, read 11:50 PM ET); X `@gwae_superblog` linked from `https://www.lasvegasadvisor.com/gambling-with-an-edge/` (11:49 PM ET, HTTP 200). No form or press address on the site page. | Guest segment: how an AI's picks are published, priced and graded in public, and where the limits are. | `/how-it-works`, `/results/audit`, `/picks/mlb`, `/winners`, `/press` | Site 11:49 PM ET; feed 11:50 PM ET |
| 7 | **Sharp Football Analysis** (NFL analytics newsletter + podcast, Warren Sharp) | NFL and college football analytics audience; weekly podcast with the Sharp Football team (site podcast page in search results 11:47 PM ET). Warren Sharp sells his own NFL betting content, so this is a press/analysis request, not a partnership, and a decline is likely; still the best-matched NFL analytics audience found. | Contact page `https://www.sharpfootballanalysis.com/contact/` lists `sharp@sharpfootballanalysis.com` ("Warren Sharp Direct") and `support@sharpfootballanalysis.com`; no media route. | Football-only: NFL game pages and the NFL anytime touchdown lane, judged against the record. | `/picks/nfl`, `/props/touchdowns`, `/picks/ncaaf`, `/results`, `/press` | 11:49 PM ET (WebFetch) |
| 8 | **VSiN** (betting broadcast network and podcasts) | Runs daily league betting shows including "The Baseball Betting Show with Greg Peterson" and the "VSiN College Football Betting Podcast" (Apple Podcasts listings in search results, 11:50 PM ET). Covers all three active leagues. Owned by DraftKings; treat as media, not a partner. Moderate fit: large audience, but segment slots are editorial decisions. | Contact form at `https://www.vsin.com/contact/` with Name, Email (confirmed), Comments and a Reason dropdown that includes "I have an idea for VSiN". No email addresses published. | Segment idea: an AI pick product whose picks, prices and results are inspectable on a permanent page; offer a producer walkthrough. | `/picks/mlb`, `/picks/ncaaf`, `/winners`, `/results`, `/press` | 11:49 PM ET (WebFetch) |
| 9 | **Front Office Sports** (sports business publisher and newsletters) | Same accountability-in-AI angle as SBJ for a sports-business readership. | Contact page `https://frontofficesports.com/contact/` lists `editors@frontofficesports.com` (editorial/newsroom), `comms@frontofficesports.com` (press inquiries), `info@frontofficesports.com`. The Tips page (`/tips/`, 11:47 PM ET) says "Please do not send general story pitches, press releases, or feedback through this channel", so the tips form is not the route. | Story idea, not a tip: a consumer AI product publishing its full pick record with losses, and why the ledger, not the model, is the product claim. | `/press`, `/results/audit`, `/how-it-works`, `/picks/nfl` | 11:49 PM ET (WebFetch) |
| 10 | **MacStories** (iOS app reviews) | About page: "We focus on in-depth app reviews; we always use our own screenshots", "We have never done and never will do paid reviews". Highly selective; a sports betting analysis app is outside their usual categories, so expect silence. Included because the ethics match ours exactly. | About page `https://www.macstories.net/about/` lists editor contacts (Federico Viticci, John Voorhees) as encrypted mailto links plus Mastodon and Bluesky profiles; `/contact/` returns 404. | Indie iOS app with a public ledger and a private Book; offer TestFlight or the App Store build; no rating asked. | App Store link, `/app`, `/picks/nfl`, `/results`, `/press` | 11:49 PM ET (WebFetch) |
| 11 | **TapSmart Indie Apps Showcase** (iOS app reviews) | Monthly showcase of "under-the-radar apps that haven't had the attention they deserve yet" for iPhone and iPad users; September 2026 edition invites developers to "email it over". Fit: independent iOS app; a betting-adjacent app may be declined on category grounds. | Email `tomjrolfe@intelligenti.com` (published in the September 2026 showcase at `https://www.tapsmart.com/apps/indie-apps-showcase-sept-2026/`). No fee or sponsorship mentioned. | Short showcase blurb: what the app shows on a game day and that the record is public. | App Store link, `/app`, `/results`, `/press` | 11:49 PM ET (WebFetch) |
| 12 | **Springboard by Daryl Baxter** (indie iOS app column) | Monthly indie iOS/tvOS/Mac picks; the author "explicitly invites submissions" about apps in TestFlight or with a major update. Manchester-based: **confirm Gary is installable on the UK App Store before sending; if the app is US-only, drop this row.** | Email `springboard@darylbaxter.com`; Bluesky `@dbspringboard.bsky.social`; Mastodon `@springboard@darylbaxter.com` (published at `https://darylbaxter.com/posts/app-picks-june-2026/`). | Indie app pitch with the Book feature and the public ledger; flag any upcoming major update. | App Store link, `/app`, `/results`, `/press` | 11:49 PM ET (WebFetch) |
| 13 | **THE WINDOW with Matt Russell** (football betting newsletter) | Matt Russell, "two-time Las Vegas Supercontest cash winner and former lead betting analyst at theScore"; focus on "football - College and the NFL - as well as March Madness and the NHL". Paid newsletter (Monthly $20, Annual $150, Founding $150 per the About page). Good NFL/NCAAF audience match; smaller and Substack-only for contact. | No email or X handle on the About page `https://mrussauthentic.substack.com/about`; route is Substack (message or comment). | NFL and college football test of Gary's game pages for one week; Winners explained as the bets he likes most. | `/picks/nfl`, `/picks/ncaaf`, `/winners`, `/results`, `/press` | 11:49 PM ET (WebFetch) |

### Draft D4 — Ben Fawkes (Substack message)

Subject: A journalist's test of an AI's picks, with the record open

Hi Ben,

I'm Adam, founder of Gary AI. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football and explains each one. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections.

Every pick has a permanent page with the reasoning, the published price and the graded result, and the whole record, losses included, is public and downloadable. Nothing is independently certified; that is the point of putting it in the open.

If you want to test it the way you'd test a handicapper: pick an NFL week, open the game pages before kickoff (https://www.betwithgary.ai/picks/nfl), note the tickets, then hold them against https://www.betwithgary.ai/results after the finals. Anytime touchdown picks are separate and kept out of the game record: https://www.betwithgary.ai/props/touchdowns. Winners: https://www.betwithgary.ai/winners.

Honest review, no rating asked. Reviewer notes: https://www.betwithgary.ai/press.

Adam Preda
Founder, Gary AI

### Draft D5 — Circles Off / The Hammer (email; X as the second route)

Subject: An AI pick product for Circle Back, record included

Hi Rob and The Hammer team,

I'm Adam, founder of Gary AI. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football, publishes the reasoning, and keeps every result on a public record next to the original ticket and price. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections.

Your audience is right to distrust pick sellers who hide the losses, so the pitch is the ledger, not the model: open any game page from https://www.betwithgary.ai/picks/nfl or https://www.betwithgary.ai/picks/ncaaf, read the reasoning, log the ticket, and check it against https://www.betwithgary.ai/results/audit a week later. The audit recomputes monthly results and confidence-band outcomes from the same public rows anyone can download.

If Circles Off or Circle Back wants to take it apart on air, I'll answer anything, including what the analysis misses. Honest review, no rating required. Reviewer notes and the mark: https://www.betwithgary.ai/press.

Adam Preda
Founder, Gary AI

### Draft D6 — Gambling With an Edge (email; X as the second route)

Subject: Guest idea: what an AI's published pick record does and doesn't tell you

Hi Bob and Richard,

I'm Adam Preda, founder of Gary AI. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections.

What might interest your listeners is the accountability mechanism rather than the picks themselves: each pick gets a permanent page with the reasoning, the published price and the graded result; the complete record, losses included, is public and downloadable; and the methodology is written up at https://www.betwithgary.ai/how-it-works. None of it is independently certified, and I'd rather talk about the limits of that than oversell it.

If a segment on AI tools for bettors fits, I'm glad to be a guest or just answer questions in writing. Record and audit: https://www.betwithgary.ai/results/audit. Today's MLB picks: https://www.betwithgary.ai/picks/mlb. Reviewer notes: https://www.betwithgary.ai/press.

Adam Preda
Founder, Gary AI

### Draft D7 — Sharp Football Analysis (`sharp@sharpfootballanalysis.com`)

Subject: Football-only: an AI's NFL picks with the record open

Hi Warren,

I'm Adam, founder of Gary AI. Quick and football-only: Gary is an AI that makes NFL and college football game picks and player prop picks, explains each one, and keeps every result on a public record next to the published ticket and price. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.

NFL game pages: https://www.betwithgary.ai/picks/nfl. NFL anytime touchdown picks, kept separate from the game record: https://www.betwithgary.ai/props/touchdowns. College football: https://www.betwithgary.ai/picks/ncaaf. Record: https://www.betwithgary.ai/results.

I know you publish your own analysis; this is a request for an honest look if it ever fits a podcast or a note, not a partnership ask, and no rating is expected. Reviewer notes: https://www.betwithgary.ai/press.

Adam Preda
Founder, Gary AI

### Draft D8 — VSiN (contact form, reason "I have an idea for VSiN")

Name: Adam Preda
Email: [sender: unselected]

Comments: I'm the founder of Gary AI, an AI that makes game picks and player prop picks for MLB, NFL and college football, with the reasoning on every pick. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections. Every pick has a permanent page with its published price and graded result, and the complete record, losses included, is public at https://www.betwithgary.ai/results.

Segment idea for the baseball or college football shows: put the day's picks on screen before first pitch or kickoff, then revisit the same tickets after the finals. Today's picks: https://www.betwithgary.ai/picks/mlb and https://www.betwithgary.ai/picks/ncaaf. Winners: https://www.betwithgary.ai/winners. I can give a producer a walkthrough; no purchase is needed to review the game analysis, and no rating or endorsement is asked. Reviewer notes: https://www.betwithgary.ai/press.

### Draft D9 — Front Office Sports (`editors@frontofficesports.com`)

Subject: Story idea: the ledger is the product claim for this AI sports-picks app

Hi FOS editors,

I'm Adam Preda, founder of Gary AI, an AI sports-analysis product for MLB, NFL and college football. Gary makes game picks and player prop picks and explains them. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections.

The business angle: consumer AI products in betting are mostly judged on marketing. Gary's claim is narrower and checkable: every pick has a permanent page tying the written reasoning and price to the graded result, losses included, with the full record downloadable and a public audit that recomputes it. We don't describe win rate as profit and don't call the record certified.

- Reviewer materials: https://www.betwithgary.ai/press
- Record and audit: https://www.betwithgary.ai/results/audit
- Methodology: https://www.betwithgary.ai/how-it-works
- A live example is one click from https://www.betwithgary.ai/picks/nfl

Happy to do a walkthrough. This is a story idea, not a tip, which is why it's coming to this address rather than the tip line.

Adam Preda
Founder, Gary AI

### Draft D10 — MacStories (editor contact from the About page)

Subject: Indie iOS app with a public ledger: Gary AI

Hi Federico and John,

I'm Adam, the founder of Gary AI, an indie iOS app. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football and explains each one. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections. Every pick keeps a permanent page with its price and graded result, and the complete record is public: https://www.betwithgary.ai/results.

Two things that might make it worth a look even if betting isn't your beat: the app keeps a private Book for the user's own bets, kept separate from Gary's record, and everything the app shows can be inspected on the web without an account.

App Store: https://apps.apple.com/us/app/gary-ai/id6751238914. Web: https://www.betwithgary.ai/picks/nfl. Brand mark and notes: https://www.betwithgary.ai/press. I can add you to TestFlight if you prefer. Honest review only; nothing is required in return.

Adam Preda
Founder, Gary AI

### Draft D11 — TapSmart Indie Apps Showcase (`tomjrolfe@intelligenti.com`)

Subject: Indie app for the showcase: Gary AI (sports picks with a public record)

Hi Tom,

For the indie showcase: Gary AI is an iPhone app by a one-founder company. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football and explains each one. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections. Every pick keeps its published price and graded result on a public record (https://www.betwithgary.ai/results), and users can keep a private Book of their own bets. Gary provides analysis and does not accept wagers.

App Store: https://apps.apple.com/us/app/gary-ai/id6751238914. Screenshots and the mark: https://www.betwithgary.ai/press. Free to download; game picks, props, the Hub and the record are free on the web too.

Adam Preda
Founder, Gary AI

### Draft D12 — Springboard / Daryl Baxter (`springboard@darylbaxter.com`) — send only if the app installs from the UK App Store

Subject: Indie iOS app: Gary AI, sports picks with the record open

Hi Daryl,

I'm Adam, founder of Gary AI, an indie iPhone app. Gary is an AI that makes game picks and player prop picks for MLB, NFL and college football and explains each one. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most. The Hub surfaces insights and betting connections. Every pick keeps its published price and graded result on a public record (https://www.betwithgary.ai/results), and the app has a private Book for the user's own bets.

App Store: https://apps.apple.com/us/app/gary-ai/id6751238914 (I'll confirm availability in your storefront or add you to TestFlight). Mark and notes: https://www.betwithgary.ai/press. Honest look only; nothing is required in return.

Adam Preda
Founder, Gary AI

### Draft D13 — THE WINDOW / Matt Russell (Substack message)

Subject: Football test: an AI's NFL and college picks with the record open

Hi Matt,

I'm Adam, founder of Gary AI. Gary is an AI that makes NFL and college football game picks and player prop picks (MLB too), explains each one, and keeps every result on a public record next to the published ticket and price. Winners is Gary’s best bets of the day. From everything he’s picked, these are the bets he likes most.

If you want to test it for a week: open the game pages before kickoff (https://www.betwithgary.ai/picks/nfl, https://www.betwithgary.ai/picks/ncaaf), log the tickets, then hold them against https://www.betwithgary.ai/results. Winners: https://www.betwithgary.ai/winners. Honest review, no rating asked. Reviewer notes: https://www.betwithgary.ai/press.

Adam Preda
Founder, Gary AI

## 5. Considered and not included

| Candidate | Why not (with retrieval time) |
|---|---|
| The Unabated Podcast | Public feed's latest episode is 2025-06-04 (feed read 11:50 PM ET); `unabated.com/podcast` returns 404 (11:49 PM ET); only `support@unabated.com` and Discord are published (11:49 PM ET). Dormant show; no editorial route. Re-evaluate if the feed resumes. |
| Building Bankroll (beehiiv newsletter) | Archive's latest issue is #74, dated December 27, 2025; no 2026 issues (11:50 PM ET). Inactive. |
| Sports Handle "best AI tool for sports betting" round-up (and the similar FantasyLabs piece) | Better Collective property; page states "This site contains commercial content"; no author route (11:49 PM ET). Affiliate-driven round-ups are outside "no paid placements, no link schemes". |
| The Action Network podcasts | Feed owner is `podcasts@bettercollective.com` (11:50 PM ET); corporate inbox for a company that sells its own picks and tools. Not an independent review route. |
| AppAdvice | DNS resolution failed again (11:49 PM ET). Not a verified target. |
| 9to5Mac | `tips@9to5mac.com` is published (11:49 PM ET) but the page states "Submitting a tip constitutes permission to publish and syndicate", and the site covers Apple news rather than sports apps. Weak fit; keep as a later option. |
| The Advantage Sports Betting Newsletter (Michael Fiddle) | NBA and NFL focus; NBA is not active for Gary; Substack-only route (11:49 PM ET). Lower fit than THE WINDOW. |
| Bet The Process | No published contact route found (11:50 PM ET). |
| AI tool directories (There's An AI For That and similar), Discover Indie Apps, Indie Dev Monday | Directory listings or developer-audience newsletters, several with paid tiers; not earned coverage for a reader audience. Not pursued. |
| Rephonic / MillionPodcasts / Feedspot contact databases | Gate contact details behind paid accounts (Rephonic SGPN page, 11:50 PM ET). Not used; every route above comes from the outlet's own pages or public RSS. |

## 6. Honest customer-review invitation (copy, not an installed campaign)

Unchanged from September 16. After a reader has actually used Gary, an optional invitation can say:

"Have you tried Gary through a full game day? An honest App Store review helps other fans understand the app. Tell them what worked and what needs work. You can also send problems directly to support@betwithgary.ai."

Do not filter the request to winning bettors or happy users, offer incentives, ask for five stars, or post reviews on users' behalf. No native review prompt was changed by this work.

## 7. Tracker and measurement

`SEO_OUTREACH_TRACKER_2026-09-17.csv` columns: `prospect,route,draft_ref,approval_status,hold_date,send_date,reply,placement_url,link_destination,referral_visits,useful_visits`. Thirteen rows (D1–D13). Every row is `approval_status=prepared` and `hold_date=2026-09-20`; `send_date`, `reply`, `placement_url`, `link_destination`, `referral_visits` and `useful_visits` are empty until something actually happens. A draft, a submission, a paid placement and an earned editorial link are different outcomes; record only the one that occurred.

How the visit columns get filled, later and only from real data:

- `referral_visits`: consented `session_started` rows whose referrer host is the outlet's domain, from the weekly report (`cd web && node --env-file=../gary2.0/.env.local --experimental-strip-types scripts/weekly-funnel.mjs --week <Monday>`; the report's `first_touch_channels` and `landing_pages` keys are added in Task 17, commit: see HANDOFF). Vercel Analytics referrers (Production) are the cross-check. Google account and same-site referrers are never counted as outlet referrals.
- `useful_visits`: the same report's `meaningful_pick_view` (`reasoning_v2`, five continuous foreground seconds) sessions attributed to that referrer. Small numbers are directional only; consent scope and the internal-test exclusion (Task 15) apply.
- Never add a `utm_` label to an outlet's editorial link request; earned links stay clean so they resolve to the canonical page.

Rules that stay in force: one tailored message per outlet after approval; no mass send; at most one short follow-up, at least a week later, and only if Adam approves it separately (none is scheduled); no incentives, no promised coverage, no paid links. Google's spam policies on link schemes and its helpful-content guidance are the reference points, as on September 16.

## 8. Dispatch-ready summary

Awaiting Adam's approval, none sent, September 20 hold preserved, sender identity unselected:

| Draft | Prospect | Route | Pre-send check |
|---|---|---|---|
| D1 | SGPN | Website contact form (Cloudflare-walled from the CLI; re-open in Chrome); fallback `podcast@sportsgamblingpodcast.com` from the public feed | Lane URLs live; form reachable |
| D2 | Sports Business Journal | `news@sportsbusinessjournal.com` | None |
| D3 | App Review Central | Free App of the Day form on `/app-submission/` only | Form must not require newsletter opt-in or YourPitch; Advertising page declined |
| D4 | Ben Fawkes' Sports Betting Substack | Substack message via `@bfawkes22` | Lane URL live |
| D5 | Circles Off / The Hammer | `atodds.podcast1@gmail.com` (feed owner); `contatc@thehammer.bet` as published; X `@thehammerhq` | Pick one route; do not send to all three |
| D6 | Gambling With an Edge | `rwmunchkin@gmail.com` (feed owner); X `@gwae_superblog` | None |
| D7 | Sharp Football Analysis | `sharp@sharpfootballanalysis.com` | Lane URL live |
| D8 | VSiN | Contact form, reason "I have an idea for VSiN" | Sender email required by the form |
| D9 | Front Office Sports | `editors@frontofficesports.com` | Not the tips form |
| D10 | MacStories | Editor contact links on `/about/` | TestFlight offer must be honored if accepted |
| D11 | TapSmart Indie Apps Showcase | `tomjrolfe@intelligenti.com` | None |
| D12 | Springboard / Daryl Baxter | `springboard@darylbaxter.com` | UK App Store availability confirmed first, else drop |
| D13 | THE WINDOW / Matt Russell | Substack message | None |

Before any send: re-run the live checks for `/props/home-runs`, `/props/touchdowns`, `/picks/nfl`, `/picks/mlb`, `/results` and `/press` (200, canonical, content present), confirm the reviewer guide at `/brand/gary-reviewer-guide.txt` shows the September 17 text, and pick the sending address. Ordering and any trimming of this list are Adam's decisions; nothing here was chosen on his behalf.
