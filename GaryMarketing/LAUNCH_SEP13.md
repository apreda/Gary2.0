> **September 4 update:** Use [the current launch runbook](launch-2026-09/LAUNCH_RUNBOOK.md) for the account-based founding offer, execution order and current channel-policy decisions. Use [the 2.25/899 review pack](APP_REVIEW_2_25_899.md) for submission facts. Earlier offer, release-state and policy statements below are historical.

# LAUNCH — release Sat Sep 5, marketing launch Sun Sep 13
## The rulings from the Sep 1 marketing review, and every piece of copy they need

> Sep 1 2026. Owner: Claude (co-founder, marketing). Founder said GO on the review and delegated the
> decisions. This file is the working runbook; FALL_LAUNCH_GTM.md keeps the long plan, CMO_STRATEGY.md
> the strategy. Review artifact: https://claude.ai/code/artifact/44ec1d0f-50be-4043-9244-c2ecfbf6b893

---

## 0. Outage — RESOLVED Sep 1 ~4:30 PM ET

The account was silent from Sat Aug 30, 6 PM ET: every Aug 31 pick failed to post with `402 credits depleted`
from the X API (pay-per-use balance hit zero). Founder topped up. **Lesson:** console.x.com creates a separate
developer account per X login — the first $25 went to the account under his personal login (zero API usage,
the tell), and the poster's app lives on the account tied to the @BetwithGary login. Fund THAT one (sign in as
@BetwithGary in a private window → console.x.com → Billing → Credits). Still to confirm there: Auto Recharge
ON and a monthly spend cap.

Done once credits returned: scratch-work tweet `2089177964537635183` deleted; new launch pin posted
(`x.com/BetwithGary/status/2094884302810910895`) with the install-link reply; log anchor `launch_pin`.
**Founder: pin that tweet in the X app (replacing the Jul 5 arc pin) and paste the bio in §2.**
Aug 31's twelve picks were never tweeted; today's slate resumes on the normal game-paced windows.

## 1. The rulings (Sep 1)

| Decision | Ruling | Status |
|---|---|---|
| Delete the Aug 16 scratch-work verdict tweet | Yes | **Done** Sep 1 4:30 PM ET. |
| Verdict shape gate so scratch work can never post | Yes | **Shipped** — `isValidVerdict` in verdicts.ts, 16/16 tests, deployed. |
| Winners free through September; founding cohort keeps it free for the season; paywall for new installs Oct 1 | Yes | **iOS written** (`FoundingCohort`, WinnersView.swift) — ships in the next build. Checkout path (3.1.1 / external link) still needs the product call before Oct 1. |
| One weekly Monday record post | Yes | **Shipped** — `week_tape` mode, Mondays 11 AM–3 PM ET, deterministic, deployed. First fire Mon Sep 7. |
| Cut the daily MLB volume | **No — founder overruled.** Every MLB game keeps posting until NFL kicks off; different games reach different audiences. Revisit at football. | Unchanged (PICKS_PER_DAY 30). |
| Founder-voice launch thread from his own account | Yes | Draft below (§4). Founder posts Sep 13. |
| On camera sixty seconds a week | Video is **off the September plan**. No faceless clips. Reopens only if the founder wants to be on camera. | Closed. |
| Sep 13 (first NFL Sunday) = the marketing launch | Yes | Calendar §5. |
| Per-game pages on betwithgary.ai | Yes | **Built** — `/picks/<sport>/<date>/<away>-at-<home>` + `/picks/<sport>/<date>`, sitemap, 11 tests. |
| Sportsbook affiliate revenue | Not now. Built so it stays possible (game pages carry the lines block). | Closed. |
| Waitlist table that never existed | Applied — the /nfl form works now. | **Done.** |

---

## 2. X profile — apply in the X app (founder, 2 minutes, after credits)

**Bio (replace; current one lists NHL and college, both deleted Aug 27):**

    AI that picks every game. MLB now, NFL from Kickoff, NBA in October. My plays post before they start and every result stays up, win or loss. Free in the app below.

**New pin (replaces the Jul 5 arc pin, whose Monday standing stopped Jul 7).** POSTED Sep 1 as tweet
`2094884302810910895` (reply `2094884401628778549` carries the link). Founder pins it in the X app. Text as posted:

    A pick on every game, posted before it starts, with the reasoning. Every result stays up, win or loss.

    Baseball every day. NFL starts at Kickoff, September 9.

    Free in the app. Get in before October 1 and every board stays free for the rest of the season.

**Reply under the pin (carries the install link, ct=x_pinned):**

    The full tape, graded daily, is in the app:
    https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=3c207d81-dc0d-4cc3-a50d-b5f47e29b18f&ct=x_pinned

Then the log anchor row (thread_format `launch_pin`) so the pin id is on file.

**Sep 13 morning:** the first NFL Sunday card thread posts as normal; founder pins THAT for launch week,
then returns the pin above on Sep 15.

---

## 3. The Monday week tape (shipped — sample from the live dry run)

Deterministic, no model. Fires Mondays between 11 AM and 3 PM ET, once. Shape:

    Last week on the board, Aug 24 to Aug 30: 41-38.

    Last 30 days: 176-152.

    Wins and losses stay up.

With two or more leagues in the week (from Sep 14 on), one line per league follows the headline
(`NFL 8-7` / `MLB 44-39`). Preview any time: `?dry_run=1&force_mode=week_tape`.

---

## 4. Founder thread — @AdamPreda007, Sunday Sep 13, morning (founder posts; his words, his edits)

One thread, plain, first person. The company voice is allowed to say "AI"; Gary's account never does.
Pull the live numbers the morning of (results page, all-time and since Opening Day).

1. I've bet on sports most of my adult life. Last year I started building an AI that bets the way a
   bettor does: reads the matchup, makes a call, puts it on the record before the game. His name is Gary.

2. The one rule since day one: I never tell Gary what to conclude. No formula, no "when X, take Y." He
   gets the same information a serious fan would dig up, and he makes his own read. My job is the
   information, not the answer.

3. Every pick posts before the game and gets graded after. Wins and losses both stay up. Since April 2025
   that's [LIVE NUMBER] graded game picks, every one still visible in the app.

4. He picked every MLB game this summer, every day, in public. Today he starts picking every NFL game,
   every week.

5. It's free: the full slate with the reasoning, the props, the whole record. A paid board arrives in
   October. Anyone in before October 1 keeps it free for the season.

6. Gary is @BetwithGary. The app is betwithgary.ai/get. If you bet, tell me where he's wrong. That's
   the whole point of putting it in public.

---

## 5. Calendar

- **Tue Sep 1** — poster gate + week tape deployed; waitlist table live; game pages built (deploying on
  push); iOS founding-cohort gate written for the next build. Founder: X credits.
- **Wed Sep 2 – Fri Sep 4** — game pages indexed (sitemap live); pin + bio applied once credits return;
  App Store promo text (§6) entered in ASC. Pricing page reordered to lead with $9.99 / annual.
- **Sat Sep 5** — v2.24 (build 895) releases. Promo text swap. Nothing else changes on the account:
  MLB keeps posting every game.
- **Mon Sep 7** — first Monday week tape fires (11 AM ET window).
- **Wed Sep 9** — Kickoff. First NFL pick thread posts before Patriots–Seahawks, as normal.
- **Sun Sep 13 — MARKETING LAUNCH.** Founder thread (§4) in the morning. First Sunday card thread pinned
  for the week. Apple Search Ads on if the account exists and Apple approved it.
- **Mon Sep 14** — week tape carries the first NFL line.
- **By Sep 30** — v2.25 with the founding-cohort gate in review; checkout path decided; Stripe live-mode
  annual + trial created. **Oct 1** — paywall meets new installs.

---

## 6. App Store promo text (170 max, no review needed)

**Sep 5 (release):**
`NFL is coming to Gary: a pick for every game, every week, with the full reasoning. In before October 1 and every board stays free all season.` (139)

**Sep 9 (Kickoff):**
`NFL is live: a pick for every game, every week, free, with the reasoning and every result on Gary's public record. In before October 1 and every board stays free all season.` (167)

---

## 7. Still founder-only (ranked by leverage per minute)

1. Pin tweet 2094884302810910895 + paste the bio (X app, 2 min). Confirm Auto Recharge + spend cap on the Gary dev account.
2. Apple Search Ads account + billing (30 min). Apple's policy puts "statistical analysis for gambling" in
   Search Results only, adults only, possible review. Only creating the account answers it.
3. Approve one queued reply (reply-engine) to learn whether Gary can answer people.
4. Resend signup (10 min) so the waitlist, now collecting, can be emailed.
5. App Store Connect: seller name to Gary A.I. LLC; share weekly installs; featuring-nomination status.
6. Creator DMs: send this week or the lane drops for September.
