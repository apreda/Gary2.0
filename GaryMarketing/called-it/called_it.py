#!/usr/bin/env python3
"""CALLED IT (Nov 9 2026). When one of Gary's darts cashes, @BetwithGary posts the receipt: who did what, when Gary
called it, the price, and a printed ticket stamped CASHED with Gary throwing cash (ticket.html, drawn by headless
Chrome). Why: the accounts that win on X post the moment a bet cashes, in one line and one picture that reads with
the sound off; our pick-and-reasoning posts never drew more than 5 likes, and the darts are what Gary is good at
(133 hit, 96 missed, Nov 1 to 8).

  Touchdown darts post live, from live_boards.hits, a minute or two after the score.
  Every other dart posts when it is graded 'hit' (darts.graded_at), plus money only.

Limits: 5 posts a day, 10 minutes apart, nothing graded more than 40 minutes ago. Each dart posts once
(social_post_log, slot called_it, pick_text "CALLED <dart id>"). Every word on the ticket is a field of the darts
row. Runs from launchd com.gary.called-it every minute.

  python3 called_it.py                  post what is due
  python3 called_it.py --dry            say what would post, draw nothing
  python3 called_it.py --draw <dart id> draw one dart's ticket to out/ and print the post text (posts nothing)
"""
import base64, json, os, re, subprocess, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "/Users/adam.preda/Gary2.0"
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ART = f"file://{ROOT}/web/public/site/hero/gary-fire.webp"
ET = ZoneInfo("America/New_York")

MAX_PER_DAY = 5
MIN_GAP_MIN = 10
FRESH_MIN = 40            # a graded dart older than this is yesterday's news
MIN_ODDS_GRADED = 120     # plus money that pays; a -130 under cashing is not a post
MIN_ODDS_LIVE_TD = 100

def log(*a): print(datetime.now(timezone.utc).isoformat(timespec="seconds"), "[called-it]", *a, flush=True)

ENV = {}
for _line in open(f"{ROOT}/gary2.0/.env", encoding="utf-8"):
    _m = re.match(r"^([A-Z0-9_]+)=(.*)$", _line.strip())
    if _m: ENV[_m.group(1)] = _m.group(2).strip("'\"")
SB, KEY = ENV["SUPABASE_URL"], ENV["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def http(url, method="GET", headers=None, body=None, timeout=120):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()

def rest(path, method="GET", body=None, prefer=None):
    h = dict(H, **({"Prefer": prefer} if prefer else {}))
    raw = http(f"{SB}/rest/v1/{path}", method, h, json.dumps(body).encode() if body is not None else None)
    return json.loads(raw) if raw else None

def when(iso):
    """Postgres timestamps carry 1 to 6 fraction digits; Python 3.9 reads only 0, 3 or 6."""
    t = str(iso).replace("Z", "+00:00")
    t = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], t, count=1)
    return datetime.fromisoformat(t)
def clock(dt): return dt.astimezone(ET).strftime("%-I:%M %p")

# ── the words ────────────────────────────────────────────────────────────────────────────────────────────
# prop type -> (ticket label, what the player did, with {n} = darts.actual)
PROPS = {
    "anytime_td": ("ANYTIME TOUCHDOWN", "touchdown"),
    "threes": ("THREES", "made {n} threes"),
    "points": ("POINTS", "scored {n}"),
    "rebounds": ("REBOUNDS", "had {n} rebounds"),
    "assists": ("ASSISTS", "had {n} assists"),
    "steals": ("STEALS", "had {n} steals"),
    "blocks": ("BLOCKS", "had {n} blocks"),
    "points_rebounds_assists": ("PTS + REB + AST", "finished with {n} points, rebounds and assists"),
    "points_rebounds": ("PTS + REB", "finished with {n} points and rebounds"),
    "points_assists": ("PTS + AST", "finished with {n} points and assists"),
    "rebounds_assists": ("REB + AST", "finished with {n} rebounds and assists"),
    "passing_tds": ("PASSING TDS", "threw {n} touchdown passes"),
    "passing_yards": ("PASSING YARDS", "threw for {n} yards"),
    "rushing_yards": ("RUSHING YARDS", "ran for {n} yards"),
    "receiving_yards": ("RECEIVING YARDS", "had {n} receiving yards"),
    "receptions": ("RECEPTIONS", "caught {n} passes"),
    "rushing_attempts": ("RUSH ATTEMPTS", "had {n} carries"),
}

def num(x):
    try: f = float(x)
    except (TypeError, ValueError): return None
    return str(int(f)) if f == int(f) else str(f)

def price(odds): return f"+{odds}" if odds > 0 else str(odds)
def won_on_10(odds): return 10 * odds / 100 if odds > 0 else 1000 / abs(odds)

def called_words(d):
    made = when(d["created_at"]).astimezone(ET)
    return f"at {made.strftime('%-I:%M')} this morning" if made.hour < 12 else f"at {made.strftime('%-I:%M %p')}"

def post_text(d):
    """Two lines. The player's full name leads, because that is what people are searching the minute it happens."""
    kind, line = (str(d["prop"]).split(" ") + [""])[:2]
    label, did = PROPS.get(kind, (kind.replace("_", " ").upper(), ""))
    over = str(d.get("bet") or "over").lower() == "over"
    n = num(d.get("actual"))
    if kind == "anytime_td":
        return f"{d['player']} touchdown.\n\nGary called it {called_words(d)}. {price(d['odds'])}."
    if over and did and n:
        return f"{d['player']} {did.format(n=n)}.\n\nGary called it {called_words(d)}. {price(d['odds'])}."
    if not over and did and n:
        return f"{d['player']} {did.format(n=n)}.\n\nGary had the under {line} {called_words(d)}. {price(d['odds'])}."
    return f"{d['player']} {'over' if over else 'under'} {line} {label.lower()} cashed.\n\nGary called it {called_words(d)}. {price(d['odds'])}."

def first_sentence(text, limit=165):
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    m = re.match(r"^(.*?[.!?])(\s|$)", t)
    s = (m.group(1) if m else t).strip()
    if len(s) <= limit: return s
    cut = s[:limit]
    return cut[: cut.rfind(",")].rstrip() + "." if "," in cut else ""

def ticket_data(d, cashed_at, day_darts):
    kind, line = (str(d["prop"]).split(" ") + [""])[:2]
    label = PROPS.get(kind, (kind.replace("_", " ").upper(), ""))[0]
    over = str(d.get("bet") or "over").lower() == "over"
    bet = label if kind == "anytime_td" else f"{'OVER' if over else 'UNDER'} {line} {label}"
    same = sorted([x["id"] for x in day_darts if x["league"] == d["league"]])
    idx = same.index(d["id"]) + 1 if d["id"] in same else 1
    name = str(d["player"]).upper().split()
    cut = 1 if len(name) > 1 else len(name)                        # first name / the rest
    made = when(d["created_at"])
    return {
        "no": f"DART {idx:02d} OF {len(same) or 1}",
        "game": f"{made.astimezone(ET).strftime('%a %b %-d').upper()}  {str(d.get('matchup') or '').upper()}",
        "player": [" ".join(name[:cut]), " ".join(name[cut:])] if len(name) > 1 else [" ".join(name)],
        "bet": bet, "price": price(d["odds"]),
        "called": f"{clock(made)} ET", "cashed": f"{clock(cashed_at)} ET",
        "won": f"$10 WON ${won_on_10(d['odds']):.2f}",
        "saidAt": f"GARY, {clock(made)}:", "said": first_sentence(d.get("reason")),
        "free": f"One of {len(same) or 1} props on Gary's Darts board this morning. All free in the app.",
        "gary": ART,
    }

def draw(data, out_png):
    q = base64.b64encode(json.dumps(data).encode()).decode()
    url = f"file://{HERE}/ticket.html?d={urllib.parse.quote(q)}"
    if os.path.exists(out_png): os.remove(out_png)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--allow-file-access-from-files", "--window-size=1080,1350", "--virtual-time-budget=3000",
                    f"--screenshot={out_png}", url], capture_output=True, text=True, timeout=120)
    if not os.path.exists(out_png): raise RuntimeError("chrome did not draw the ticket")
    jpg = out_png[:-4] + ".jpg"                                    # smaller upload, same picture
    subprocess.check_call(["/opt/homebrew/bin/magick", out_png, "-quality", "92", jpg])
    return jpg

# ── what is due ──────────────────────────────────────────────────────────────────────────────────────────
COLS = "id,game_date,league,player,player_id,matchup,game_id,commence_time,prop,bet,odds,reason,created_at,result,actual,graded_at,scratched_at"

def due(now, days):
    """(dart, cashed_at, how) for every dart that just cashed and qualifies, best price first."""
    darts = rest(f"darts?select={COLS}&game_date=in.({','.join(days)})&scratched_at=is.null") or []
    out = []
    # graded hits, plus money
    for d in darts:
        if d.get("result") == "hit" and d.get("graded_at") and int(d.get("odds") or 0) >= MIN_ODDS_GRADED:
            g = when(d["graded_at"])
            if (now - g).total_seconds() / 60 <= FRESH_MIN: out.append((d, g, "graded"))
    # touchdown darts, live off the scoreboard
    tds = [d for d in darts if str(d["prop"]).startswith("anytime_td") and str(d.get("bet") or "over").lower() == "over"
           and d.get("result") is None and int(d.get("odds") or 0) >= MIN_ODDS_LIVE_TD and when(d["commence_time"]) <= now]
    if tds:
        ids = ",".join(sorted({str(d["game_id"]) for d in tds}))
        boards = rest(f"live_boards?select=game_id,status,hits,updated_at&game_id=in.({ids})") or []
        by_game = {str(b["game_id"]): b for b in boards}
        for d in tds:
            b = by_game.get(str(d["game_id"]))
            if not b or (now - when(b["updated_at"])).total_seconds() / 60 > FRESH_MIN: continue
            if any(str(h.get("key", "")).startswith(f"{d['player_id']}|anytime_td") for h in (b.get("hits") or [])):
                out.append((d, now, "live"))
    out.sort(key=lambda x: (-int(x[0]["odds"]), x[0]["id"]))
    return out, darts

def main():
    args = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    now = datetime.now(timezone.utc)
    today = now.astimezone(ET).strftime("%Y-%m-%d")
    yesterday = (now.astimezone(ET) - timedelta(days=1)).strftime("%Y-%m-%d")

    if "--draw" in args:
        dart_id = args[args.index("--draw") + 1]
        d = (rest(f"darts?select={COLS}&id=eq.{dart_id}") or [None])[0]
        if not d: sys.exit(f"no dart {dart_id}")
        day = rest(f"darts?select=id,league&game_date=eq.{d['game_date']}&scratched_at=is.null") or []
        cashed = when(d["graded_at"]) if d.get("graded_at") else now
        print(post_text(d)); print(draw(ticket_data(d, cashed, day), os.path.join(OUT, f"dart-{dart_id}.png")))
        return

    found, darts = due(now, [today, yesterday])
    if not found: return
    posted = rest(f"social_post_log?select=pick_text,posted_at&slot=eq.called_it&post_date=in.({today},{yesterday})") or []
    done = {p["pick_text"] for p in posted}
    todays = [p for p in posted if p.get("posted_at") and when(p["posted_at"]).astimezone(ET).strftime("%Y-%m-%d") == today]
    last = max([when(p["posted_at"]) for p in todays], default=None)
    for d, cashed_at, how in found:
        key = f"CALLED {d['id']}"
        if key in done: continue
        if len(todays) >= MAX_PER_DAY: log(f"{d['player']}: held, {MAX_PER_DAY} already posted today"); return
        if last and (now - last).total_seconds() / 60 < MIN_GAP_MIN: log(f"{d['player']}: waiting, last post under {MIN_GAP_MIN} min ago"); return
        text = post_text(d)
        if "--dry" in args: print(f"[{how}] {text!r}"); continue
        try:
            rest("social_post_log", "POST", {"post_date": today, "slot": "called_it", "league": d["league"], "pick_text": key,
                                             "pick_id": str(d["id"]), "commence_time": d["commence_time"], "thread_format": "called_it"})
        except Exception as e:
            log(f"{d['player']}: claim failed ({e})"); continue
        try:
            day = [x for x in darts if x["game_date"] == d["game_date"]]
            jpg = draw(ticket_data(d, cashed_at, day), os.path.join(OUT, f"dart-{d['id']}.png"))
            body = json.dumps({"text": text, "images_base64": [base64.b64encode(open(jpg, "rb").read()).decode()]}).encode()
            j = json.loads(http(f"{SB}/functions/v1/post-tweet-media", "POST", H, body, timeout=180))
            if not j.get("success") or not j.get("tweetId"): raise RuntimeError(str(j)[:300])
            rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {
                "hook_tweet_id": j["tweetId"], "thread_url": f"https://x.com/BetwithGary/status/{j['tweetId']}",
                "posted_at": datetime.now(timezone.utc).isoformat(), "post_text": text,
                "audience_selection": {"format": "called_it_v1", "how": how, "odds": d["odds"], "prop": d["prop"]}})
            log(f"{d['player']} ({how}, {price(d['odds'])}): https://x.com/BetwithGary/status/{j['tweetId']}")
        except Exception as e:
            rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "DELETE")
            log(f"{d['player']}: FAILED {e}")
        return                                                     # one post a run; the gap rule spaces the rest

if __name__ == "__main__":
    main()
