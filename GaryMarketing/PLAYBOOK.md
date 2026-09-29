# Gary brand playbook

September 29, 2026. Owner: Claude (CMO), approved direction from Adam the same day. This is the only
marketing strategy document; the July to September plans were deleted and are not to be restored. Ad
production rules and the caption standard stay in [Ad.md](Ad.md). The image kit lives in
[brand-2026-09/](brand-2026-09/) and rebuilds with `python3 build.py`.

## 1. What Gary is

**A pick on every game, with the reasoning behind it, and every result on the record.**

Gary A.I. is an iPhone app. Gary, the app's named character, makes a pick on every MLB and NFL game and
college football's biggest games, explains each one in plain English, and posts every result, wins and
losses. Around that core: Winners (a few of his strongest picks each day, sealed until you open them),
Darts (the fun picks: touchdown scorers, home runs, hot streaks), Home (every game on one board with live
scores) and Billfold (his full record, and yours beside it).

What makes it different, in order of how much a new person cares:
1. **Every game.** Not three plays a day. Whatever game you care about tonight, Gary has a pick on it.
2. **The reasoning.** Each pick comes with why, written out, with the numbers that matter.
3. **The record.** Every result stays up. Nothing is deleted.
4. **It's fun to open.** Winners unseals like a pack; Darts lands on a dartboard.

## 2. Who it's for

Adults who follow sports and bet casually, or just like having an opinion on tonight's game. They want
a quick, honest read before a game, not spreadsheets. They distrust touts and hype accounts. Never build
or market EV calculators, "sharp money" tools or line-movement systems.

## 3. How Gary sounds

- **Third person, plain and professional.** Gary is the app's character, written about the way a product
  talks about its mascot. Never first-person roleplay, never "our AI", no persona act, no catchphrases.
- **Say what Gary does, what you get, why you can trust it.** Terms: picks, reasoning, results, Winners,
  Darts. Leave out dollar amounts, records, pick counts, hook questions, "!", emoji and betting slang
  (lock, hammer, fade, sharp). One sentence per line. Full rules: Ad.md §11.
- **The account never argues.** No replies to critics or to people disputing a pick. A factual support
  question from a user gets one plain answer; everything else is left alone.
- **Legal line** on every ad and caption where there's room: `21+ | Not a sportsbook | Gambling problem?
  Call 1-800-GAMBLER`.

## 4. How Gary looks

One system, taken from the September 24 App Store screenshots, used everywhere:
- **Logo:** the app icon (the gold bear with GARY A.I. glasses). It is the avatar on every channel. No
  other character art: the suit-and-cigar banner illustration is retired.
- **Canvas:** near-black `#0B0A08` with one warm gold glow (`#C9A227` at ~25%) behind the product.
- **Type:** Bebas Neue headlines, first line cream `#F2EDE4`, second line gold (`#F0CD62` to `#C9A227`);
  a small gold tracked label above; Inter for the supporting line in `#BDB6AA`.
- **Product:** real app screens only, cut out of the App Store frames or captured from the app. Never a
  redrawn card (Ad.md §2).
- **Headlines** reuse the App Store lines: "A pick on every game." / "His best plays, sealed." / "Fun
  picks, thrown daily." / "The losses stay up too." / "Every game, one board."

## 5. Channels

| Channel | Job | What goes there | Cadence |
|---|---|---|---|
| **X** @BetwithGary | Brand news desk and updates for users | The daily free pick (automatic); product posts with real screens; big-game posts that point to the app; release notes; outage or schedule notices | Free pick daily + 1-2 hand-written posts a day at most |
| **Instagram** @betwithgary.ai | The product showcase | Feed: feature posts and reels from the app. Stories: the free pick, big-game posts, release news | 3 feed posts a week (at least 1 reel), stories on game days |
| **Threads** (via the Instagram account) | Mirror of X news, zero extra work | Product and release posts only | When X posts news |
| **TikTok** (new, @garyaiapp suggested) | Awareness through sports, not betting | 20-30 s vertical: tonight's biggest game, three real facts from Gary's research, who Gary expects to win, app end card. No odds, lines, spreads, money, sportsbooks or "bet" | 3-5 a week once live |
| **YouTube Shorts** (new, same handle) | Same videos as TikTok, searchable | Same cut | Same |
| **Website** betwithgary.ai | Search and the install hand-off | Picks and results pages already live | Always on |
| **App Store** | Where installs happen | Listing copy in `appstore-2026-09-24-v2.27/`; screenshots are the source of the whole visual system | Refresh with each release |

**Parked:** Reddit and Discord betting communities (most ban promotion; posting there needs Adam's own
voice), paid creators, and paid ads until installs are measured per channel.

**TikTok and gambling.** TikTok removes content that promotes gambling and restricts gambling-related
businesses (its licensed-business route requires permission and a 25+ audience in the U.S.). So TikTok and
YouTube Shorts carry sports analysis, not betting: the videos say who Gary expects to win and why, never a
spread, a price or a stake, and never name a sportsbook. The profile links to the app. If a video is ever
flagged, stop and review before posting again. We don't disguise the category or change age labels.

**Instagram age setting.** Before any betting-related post, set the account's minimum age to 21 (the house
standard); a "21+" in the bio is not an age restriction.

## 6. Weekly rhythm

| When | X | Instagram |
|---|---|---|
| Every day | Free pick posts automatically before its game | Story: the free pick card on game days |
| Monday | The week ahead (what's on the board: NFL week, playoff series) | Story |
| Tuesday | Product post (one feature, real screens) | Feed post or reel |
| Thursday | Big-game post for TNF or the night's playoff game | Reel |
| Weekend | Big-game post for the marquee college and NFL games | Feed post + stories |
| App release | Release note with the new screen | Feed post |

Every hand-written post: Claude drafts, Adam approves the exact words before it goes out.

## 7. Measurement

What counts, in order: **installs by channel** (App Store Connect → Analytics → Campaigns, by `ct` token),
**App Store hand-offs** from our links (`web_link_clicks`, by surface), and website sessions that read a
pick's reasoning. Followers, likes and impressions are not goals.

Baseline, September 29: the X bio link has 2 real taps ever despite ~40 profile visits a day, so the
profile gives people no reason to tap. The new banner, bio and pinned post exist to fix that.

Each channel needs its own tagged link (`ct=x_bio`, `x_pinned`, `ig_bio`, `tiktok`, `youtube`). Today
only `betwithgary.ai/get` exists (tagged `x_bio`); per-channel paths are the next web change.

A one-page review every Monday: installs and hand-offs by channel, the best and worst post, one change.

## 8. The next two weeks

| # | Step | Owner |
|---|---|---|
| 1 | Approve the kit and copy in this playbook's review page | Adam |
| 2 | X: new banner, bio and pinned post; old pinned post unpinned | Claude posts, Adam pins (X has no pin API) |
| 3 | Instagram: minimum age 21, website link `betwithgary.ai/get` (mobile app only), new bio | Adam |
| 4 | Instagram: first two feature posts at once, then the rest of the six-post set over two weeks | Claude drafts, Adam posts or approves |
| 5 | TikTok and YouTube accounts (handle suggestion: @garyaiapp on both) | Adam creates; Claude hands over bios, avatar, banners |
| 6 | First five analysis videos from the reel pipeline, sports-only cut | Claude |
| 7 | Per-channel tagged links on betwithgary.ai | Claude (ships with the next web deploy) |
| 8 | First Monday review | Claude |

## 9. Copy, ready to use

**X bio** (142 characters): Gary A.I. picks every MLB and NFL game, plus college football's biggest, with the reasoning behind each one. Every result stays on the record.

**X pinned post** (with `x-pinned-1600x900.png`):

> Gary A.I. makes a pick on every MLB and NFL game, plus college football's biggest.
>
> Each one comes with the reasoning behind it, in plain English.
>
> Every result stays on the record, wins and losses.
>
> Free on iPhone: betwithgary.ai/get
>
> 21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER

**Instagram bio** (129 characters): A pick on every MLB and NFL game, plus college football's biggest. The reasoning behind each one. Every result on the record. 21+

**TikTok bio** (68 characters): Gary A.I. breaks down tonight's biggest games. The stats, the story.

**YouTube description:** Gary A.I. breaks down the biggest games in baseball and football: the matchups, the players who matter tonight and the numbers behind them. Gary is an iPhone app with a pick on every MLB and NFL game.

**Instagram captions** for the six-post set, in grid order:
1. Gary makes a pick on every MLB and NFL game, plus college football's biggest. / Open the app and every game of the day is on one board, with Gary's pick next to it. / Every result is posted, win or loss.
2. Every pick comes with Gary's reasoning. / The matchup, the players who matter tonight and the numbers behind his thinking, in plain English.
3. Every day, Gary narrows the full slate to the picks he believes in most. / Open one and you get the pick, the numbers behind it, and his reasoning. / As the games finish, every result is posted, win or loss.
4. Every Winners pick shows the numbers that put it there. / Gary circles the stats that matter and explains each one.
5. Darts is Gary's lighter side. / Touchdown scorers, home run hitters and hot streaks land on his dartboard every day.
6. Gary posts every result the morning after, and the losses stay up with the wins. / His full record lives in Billfold, and you can keep yours right next to it.

Each caption ends with the legal line and `#NFL #MLB`. No links in Instagram captions.
