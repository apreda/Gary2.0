#!/usr/bin/env python3
"""THE TAPE (Nov 9 2026). Every morning @BetwithGary posts last night's whole record on one printed tape: every
dart Gary posted, hit or miss, the count, and what $10 on every one of them did. It goes up on bad nights exactly
as on good ones; without it the "called it" receipts (called_it.py) would only ever show the winners.

Gary's art follows the money: throwing cash, counting it, a shrug, a quiet cigar, tearing the ticket.
Runs from launchd com.gary.tape at 9:30 AM. One post a day (social_post_log, slot tape, pick_text "TAPE <date>").

  python3 tape.py                 post yesterday's tape
  python3 tape.py --draw [date]   draw a day's tape to out/ and print the post text (posts nothing)
"""
import base64, json, os, sys, urllib.parse
from datetime import datetime, timedelta, timezone
import called_it as ci

HERO = f"file://{ci.ROOT}/web/public/site/hero"
SHORT = {"anytime_td": "anytime TD", "threes": "threes", "points": "points", "rebounds": "rebounds", "assists": "assists",
         "steals": "steals", "blocks": "blocks", "points_rebounds_assists": "pts+reb+ast", "points_rebounds": "pts+reb",
         "points_assists": "pts+ast", "rebounds_assists": "reb+ast", "passing_tds": "pass TDs", "passing_yards": "pass yds",
         "rushing_yards": "rush yds", "receiving_yards": "rec yds", "receptions": "catches", "rushing_attempts": "carries"}

def money(x):
    return f"{'+' if x >= 0 else '-'}${abs(x):,.2f}"

def mood(net):
    """(art, headline, Gary stands still) by what the night paid."""
    if net >= 40: return "gary-fire.webp", ["PAID."], False
    if net >= 5: return "gary-cooking.webp", ["UP."], True
    if net > -5: return "gary-icecold.webp", ["EVEN."], True
    if net > -40: return "gary-beer.webp", ["DOWN."], True
    return "gary-doomsday.webp", ["ROUGH", "NIGHT."], True

def build(day):
    darts = ci.rest(f"darts?select={ci.COLS}&game_date=eq.{day}&scratched_at=is.null&result=in.(hit,miss)") or []
    if not darts: return None
    hits = [d for d in darts if d["result"] == "hit"]; misses = [d for d in darts if d["result"] == "miss"]
    net = sum(ci.won_on_10(int(d["odds"])) for d in hits) - 10 * len(misses)
    def row(d):
        kind, line = (str(d["prop"]).split(" ") + [""])[:2]
        over = str(d.get("bet") or "over").lower() == "over"
        bet = SHORT.get(kind, kind.replace("_", " ")) if kind == "anytime_td" else f"{'over' if over else 'under'} {line} {SHORT.get(kind, kind.replace('_', ' '))}"
        return {"who": d["player"], "bet": bet, "price": ci.price(int(d["odds"])), "hit": d["result"] == "hit"}
    order = sorted(hits, key=lambda d: -int(d["odds"])) + sorted(misses, key=lambda d: -int(d["odds"]))
    art, shout, still = mood(net)
    when = datetime.strptime(day, "%Y-%m-%d")
    data = {"day": when.strftime("%a %b %-d").upper(), "title": "The tape", "shout": shout, "rows": [row(d) for d in order],
            "count": f"{len(hits)} hit   {len(misses)} missed", "net": money(net),
            "free": "Every prop goes up on Gary's Darts board before the games. All free in the app.", "gary": f"{HERO}/{art}", "still": still}
    direction = "even" if abs(net) < 0.005 else (f"up ${net:,.2f}" if net > 0 else f"down ${abs(net):,.2f}")
    text = f"Last night's props: {len(hits)} hit, {len(misses)} missed.\n\n$10 on every one of them: {direction}.\n\nTonight's go up in the app this morning. Free."
    return data, text, {"hits": len(hits), "misses": len(misses), "net": round(net, 2)}

def draw(data, out_png):
    q = base64.b64encode(json.dumps(data).encode()).decode()
    url = f"file://{ci.HERE}/tape.html?d={urllib.parse.quote(q)}"
    if os.path.exists(out_png): os.remove(out_png)
    ci.subprocess.run([ci.CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                       "--allow-file-access-from-files", "--window-size=1080,1350", "--virtual-time-budget=3000",
                       f"--screenshot={out_png}", url], capture_output=True, text=True, timeout=120)
    if not os.path.exists(out_png): raise RuntimeError("chrome did not draw the tape")
    jpg = out_png[:-4] + ".jpg"
    ci.subprocess.check_call(["/opt/homebrew/bin/magick", out_png, "-quality", "92", jpg])
    return jpg

def main():
    args = sys.argv[1:]
    os.makedirs(ci.OUT, exist_ok=True)
    now = datetime.now(timezone.utc).astimezone(ci.ET)
    today, yesterday = now.strftime("%Y-%m-%d"), (now - timedelta(days=1)).strftime("%Y-%m-%d")
    if "--draw" in args:
        i = args.index("--draw"); day = args[i + 1] if len(args) > i + 1 else yesterday
        built = build(day)
        if not built: sys.exit(f"no graded darts on {day}")
        print(built[1]); print(built[2]); print(draw(built[0], os.path.join(ci.OUT, f"tape-{day}.png"))); return
    key = f"TAPE {yesterday}"
    if ci.rest(f"social_post_log?select=id&post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}"): return
    built = build(yesterday)
    if not built: ci.log(f"tape: no graded darts on {yesterday}"); return
    data, text, facts = built
    try:
        ci.rest("social_post_log", "POST", {"post_date": today, "slot": "tape", "pick_text": key, "thread_format": "tape"})
    except Exception as e:
        ci.log(f"tape: claim failed ({e})"); return
    try:
        jpg = draw(data, os.path.join(ci.OUT, f"tape-{yesterday}.png"))
        body = json.dumps({"text": text, "images_base64": [base64.b64encode(open(jpg, "rb").read()).decode()]}).encode()
        j = json.loads(ci.http(f"{ci.SB}/functions/v1/post-tweet-media", "POST", ci.H, body, timeout=180))
        if not j.get("success") or not j.get("tweetId"): raise RuntimeError(str(j)[:300])
        ci.rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {
            "hook_tweet_id": j["tweetId"], "thread_url": f"https://x.com/BetwithGary/status/{j['tweetId']}",
            "posted_at": datetime.now(timezone.utc).isoformat(), "post_text": text, "audience_selection": dict(facts, format="tape_v1")})
        ci.log(f"tape {yesterday}: https://x.com/BetwithGary/status/{j['tweetId']}")
    except Exception as e:
        ci.rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "DELETE")
        ci.log(f"tape: FAILED {e}")

if __name__ == "__main__":
    main()
