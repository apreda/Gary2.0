# Season Arc Pin — "$100 flat, every pick, all season"

## The pinned tweet (post once, founder pins it)

    Every pick I post. $100 flat on each. All season.

    Wins and losses stay up. The standing posts here every Monday.

    This is the tape.

## First reply to the pin (carries the install link, ct=x_pinned)

    The full tape, graded daily, is in the app:
    https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=3c207d81-dc0d-4cc3-a50d-b5f47e29b18f&ct=x_pinned

## Launch runbook (manual, founder-gated)
1. Post the pin text via post-single-tweet (curl or session helper). Save the returned tweetId.
2. Post the reply via post-reply-tweet with replyToId=<pin tweetId>.
3. Founder pins the tweet in the X app (replacing pin 2067647642495029725).
4. Insert the anchor row so the weekly update can find the pin:
   insert into social_post_log (post_date, slot, league, pick_text, thread_format, hook_tweet_id, thread_url, posted_at)
   values ('<ET date>', 'pin', 'ARC', 'SEASON ARC PIN', 'arc_pin', '<pin tweetId>', 'https://x.com/BetwithGary/status/<pin tweetId>', now());
5. Verify: force_mode=arc&dry_run=1 returns the standing reply text.

ARC_START is 2026-07-06 (the season ledger starts the day the arc goes live).
