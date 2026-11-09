#!/usr/bin/env python3
"""THE TAPE (Nov 9 2026). Every Monday morning @BetwithGary posts last week's whole prop record on one printed tape:
each day's hits and misses, Monday to Sunday, and the week's count. Bad weeks go up exactly like good ones.

It is a count and nothing else. The first version ran nightly with "$10 on every one of them: up $0.88"; the founder,
Nov 9: "how is this good? where did you even get that from?" A dollar figure on one night's props is noise, a small
one makes a winning night look worthless, and nobody had asked for that yardstick. One night is too small a sample
to say anything with; a week is about 200 props.

Gary's art follows the week: throwing cash, counting it, a shrug, a quiet cigar, tearing the ticket.
Runs from launchd com.gary.tape, Mondays 9:30 AM. One post a week (social_post_log, slot tape, "TAPE <monday>").

  python3 tape.py                    post last week's tape (Mon to Sun)
  python3 tape.py --post             the same, on any day of the week
  python3 tape.py --draw [monday]    draw a week's tape to out/ and print the post text (posts nothing)
"""
import base64, json, os, sys, urllib.parse
from datetime import datetime, timedelta, timezone
import called_it as ci

HERO = f"file://{ci.ROOT}/web/public/site/hero"

def mood(rate):
    """(art, Gary stands still) by the share of props that hit. At the usual -110, about 52 in 100 breaks even."""
    if rate >= .57: return "gary-fire.webp", False
    if rate >= .53: return "gary-cooking.webp", True
    if rate >= .48: return "gary-icecold.webp", True
    if rate >= .44: return "gary-beer.webp", True
    return "gary-doomsday.webp", True

def build(monday):
    start = datetime.strptime(monday, "%Y-%m-%d"); end = start + timedelta(days=6)
    darts = ci.rest(f"darts?select=game_date,result&game_date=gte.{monday}&game_date=lte.{end.strftime('%Y-%m-%d')}&scratched_at=is.null&result=in.(hit,miss)") or []
    if not darts: return None
    rows, hits, misses = [], 0, 0
    for i in range(7):
        day = (start + timedelta(days=i)); key = day.strftime("%Y-%m-%d")
        h = sum(1 for d in darts if d["game_date"] == key and d["result"] == "hit")
        m = sum(1 for d in darts if d["game_date"] == key and d["result"] == "miss")
        hits += h; misses += m
        rows.append({"a": day.strftime("%a %b %-d").upper(), "b": f"{h} HIT   {m} MISSED" if h + m else "NO PROPS", "dim": h + m == 0})
    art, still = mood(hits / max(1, hits + misses))
    data = {"day": f"{start.strftime('%b %-d')} TO {end.strftime('%b %-d')}".upper(), "title": "The tape", "shout": ["LAST", "WEEK."],
            "rows": rows, "each": "Every prop I posted, Monday to Sunday:", "net": f"{hits}-{misses}", "count": f"{hits} hit   {misses} missed",
            "free": "Every prop goes up on my Darts board before the games. All free in the app.", "gary": f"{HERO}/{art}", "still": still}
    text = f"Last week's props: {hits} hit, {misses} missed.\n\nEvery one was posted before its game. This week's are going up in the app now."
    return data, text, {"hits": hits, "misses": misses, "week": monday}

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
    today = now.strftime("%Y-%m-%d")
    last_monday = (now - timedelta(days=now.weekday() + 7)).strftime("%Y-%m-%d")
    if "--draw" in args:
        i = args.index("--draw"); monday = args[i + 1] if len(args) > i + 1 else last_monday
        built = build(monday)
        if not built: sys.exit(f"no graded props in the week of {monday}")
        print(built[1]); print(built[2]); print(draw(built[0], os.path.join(ci.OUT, f"tape-{monday}.png"))); return
    if now.weekday() != 0 and "--post" not in args: return
    key = f"TAPE {last_monday}"
    if ci.rest(f"social_post_log?select=id&pick_text=eq.{urllib.parse.quote(key)}"): return
    built = build(last_monday)
    if not built: ci.log(f"tape: no graded props in the week of {last_monday}"); return
    data, text, facts = built
    try:
        ci.rest("social_post_log", "POST", {"post_date": today, "slot": "tape", "pick_text": key, "thread_format": "tape"})
    except Exception as e:
        ci.log(f"tape: claim failed ({e})"); return
    try:
        jpg = draw(data, os.path.join(ci.OUT, f"tape-{last_monday}.png"))
        body = json.dumps({"text": text, "images_base64": [base64.b64encode(open(jpg, "rb").read()).decode()]}).encode()
        j = json.loads(ci.http(f"{ci.SB}/functions/v1/post-tweet-media", "POST", ci.H, body, timeout=180))
        if not j.get("success") or not j.get("tweetId"): raise RuntimeError(str(j)[:300])
        reply = ci.link_reply(j["tweetId"], "This week's board: betwithgary.ai/c/xtape")
        ci.rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {
            "hook_tweet_id": j["tweetId"], "cta_tweet_id": reply, "thread_url": f"https://x.com/BetwithGary/status/{j['tweetId']}",
            "posted_at": datetime.now(timezone.utc).isoformat(), "post_text": text, "audience_selection": dict(facts, format="tape_v2")})
        ci.log(f"tape week of {last_monday}: https://x.com/BetwithGary/status/{j['tweetId']}")
    except Exception as e:
        ci.rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "DELETE")
        ci.log(f"tape: FAILED {e}")

if __name__ == "__main__":
    main()
