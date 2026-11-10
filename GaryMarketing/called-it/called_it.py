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

SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"}

def last_name(player):
    words = [w for w in str(player).split() if w.lower() not in SUFFIXES]
    return words[-1] if words else str(player)

def bet_phrase(d, who=None):
    """'Cook to score', 'Wentz over 1.5 pass TDs': how a bettor says the prop."""
    kind, line = (str(d["prop"]).split(" ") + [""])[:2]
    who = who or last_name(d["player"])
    if kind == "anytime_td": return f"{who} to score"
    side = "over" if str(d.get("bet") or "over").lower() == "over" else "under"
    return f"{who} {side} {line} {SAY.get(kind, kind.replace('_', ' '))}"

SAY = {"threes": "threes", "points": "points", "rebounds": "rebounds", "assists": "assists", "steals": "steals", "blocks": "blocks",
       "points_rebounds_assists": "pts+reb+ast", "points_rebounds": "pts+reb", "points_assists": "pts+ast", "rebounds_assists": "reb+ast",
       "passing_tds": "pass TDs", "passing_yards": "pass yards", "rushing_yards": "rush yards", "receiving_yards": "rec yards",
       "receptions": "catches", "rushing_attempts": "carries"}

def post_text(d, darts=()):
    """Gary's account is Gary, so he speaks for himself (founder, Nov 9 2026, on "Gary called it at 5:55 this morning":
    "what value does that provide our users?"). Three short beats, each one something the reader can use:
    what just happened and the price; what Gary said about it before the game, in his own words; what he still
    has live in the same game. The player's full name leads, because that is what people search the minute it happens."""
    kind, line = (str(d["prop"]).split(" ") + [""])[:2]
    did = PROPS.get(kind, ("", ""))[1]
    over = str(d.get("bet") or "over").lower() == "over"
    n = num(d.get("actual"))
    if kind == "anytime_td": lead = f"{d['player']} touchdown. {price(d['odds'])}."
    elif did and n and over: lead = f"{d['player']} {did.format(n=n)}. {price(d['odds'])}."
    elif did and n: lead = f"{d['player']} {did.format(n=n)}. Under {line} cashed, {price(d['odds'])}."
    else: lead = f"{bet_phrase(d, d['player'])} cashed. {price(d['odds'])}."
    said = first_sentence(d.get("reason"), 170)
    earlier = "This morning I said" if when(d["created_at"]).astimezone(ET).hour < 12 else "Before the game I said"
    why = f"{earlier}: {said}" if said else ""
    others = sorted([x for x in darts if str(x.get("game_id")) == str(d.get("game_id")) and x["id"] != d["id"]
                     and x.get("result") is None and not x.get("scratched_at")], key=lambda x: -int(x["odds"]))[:3]
    live = "Still live in this one: " + ", ".join(f"{bet_phrase(x)} {price(int(x['odds']))}" for x in others) + "." if others else ""
    for parts in ([lead, why, live], [lead, why], [lead, live], [lead]):
        text = "\n\n".join(x for x in parts if x)
        if len(text) <= 280: return text
    return lead

def first_sentence(text, limit=165):
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    m = re.match(r"^(.*?[.!?])(\s|$)", t)
    s = (m.group(1) if m else t).strip()
    if len(s) <= limit: return s
    cut = s[:limit]
    return cut[: cut.rfind(",")].rstrip() + "." if "," in cut else ""

def week_line(d):
    try:
        h, m = week_record(d["game_date"])
        return f"THIS WEEK {h + (0 if d.get('result') == 'hit' else 1)} HIT {m} MISSED"
    except Exception:
        return ""

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
        "no": week_line(d),
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

def link_reply(tweet_id, words):
    """One reply under our own post carrying the tracked App Store link; returns its id or None."""
    try:
        j = json.loads(http(f"{SB}/functions/v1/post-reply-tweet", "POST", H, json.dumps({"text": words, "replyToId": tweet_id}).encode(), timeout=60))
        return j.get("tweetId")
    except Exception as e:
        log(f"link reply failed: {e}"); return None

def week_record(darts_day):
    """Hits and misses since Monday, for the ticket's corner: every receipt shows the whole week, misses included."""
    day = datetime.strptime(darts_day, "%Y-%m-%d")
    monday = (day - timedelta(days=day.weekday())).strftime("%Y-%m-%d")
    rows = rest(f"darts?select=result&game_date=gte.{monday}&game_date=lte.{darts_day}&scratched_at=is.null&result=in.(hit,miss)") or []
    return sum(r["result"] == "hit" for r in rows), sum(r["result"] == "miss" for r in rows)

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

# ── tonight's card ───────────────────────────────────────────────────────────────────────────────────────
CARD_FROM_MIN, CARD_TO_MIN = 95, 40          # posts once, between 95 and 40 minutes before the game

def card(now, today, darts, dry=False):
    """What a follower gets before the game: Gary's props for tonight's big one, in a list they can use.
    An NFL night game with 3 or more of his props is the card; on a night without one, his five best-priced props."""
    live = [d for d in darts if d["game_date"] == today and d.get("result") is None]
    night = lambda d: when(d["commence_time"]).astimezone(ET).hour >= 17
    games = {}
    for d in live:
        if d["league"] == "NFL" and night(d): games.setdefault(str(d["game_id"]), []).append(d)
    games = {g: ds for g, ds in games.items() if len(ds) >= 3}
    if games:
        ds = max(games.values(), key=lambda ds: (when(ds[0]["commence_time"]), len(ds)))
        start = when(ds[0]["commence_time"])
        head = f"{str(ds[0].get('matchup') or '').replace(' @ ', ' at ')}, {start.astimezone(ET).strftime('%-I:%M')}. My props:"
        picks = sorted(ds, key=lambda d: -int(d["odds"]))[:6]
    else:
        pool = [d for d in live if night(d) and int(d["odds"]) > 0]
        if len(pool) < 3: return
        picks = sorted(pool, key=lambda d: -int(d["odds"]))[:5]
        start = min(when(d["commence_time"]) for d in picks)
        head = "Tonight's props:"
    lead_min = (start - now).total_seconds() / 60
    if not dry and not (CARD_TO_MIN <= lead_min <= CARD_FROM_MIN): return
    key = f"CARD {today}"
    if not dry and rest(f"social_post_log?select=id&post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}"): return
    lines = [f"{bet_phrase(d, d['player'])} {price(int(d['odds']))}" for d in picks]
    foot = "The why on each one is free in the app."
    text = ""
    while lines:
        text = f"{head}\n\n" + "\n".join(lines) + f"\n\n{foot}"
        if len(text) <= 280: break
        lines.pop()
    if dry: print(f"[card, {lead_min:.0f} min out] {text!r}"); return
    try:
        rest("social_post_log", "POST", {"post_date": today, "slot": "card", "league": picks[0]["league"], "pick_text": key,
                                         "commence_time": picks[0]["commence_time"], "thread_format": "card"})
    except Exception as e:
        log(f"card: claim failed ({e})"); return
    try:
        j = json.loads(http(f"{SB}/functions/v1/post-single-tweet", "POST", H, json.dumps({"text": text}).encode(), timeout=60))
        if not j.get("success") or not j.get("tweetId"): raise RuntimeError(str(j)[:300])
        rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {
            "hook_tweet_id": j["tweetId"], "thread_url": f"https://x.com/BetwithGary/status/{j['tweetId']}",
            "posted_at": datetime.now(timezone.utc).isoformat(), "post_text": text,
            "audience_selection": {"format": "card_v1", "darts": [d["id"] for d in picks[: len(lines)]]}})
        reply = link_reply(j["tweetId"], "The reason behind each one: betwithgary.ai/c/xcard")
        if reply: rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {"cta_tweet_id": reply})
        log(f"card: https://x.com/BetwithGary/status/{j['tweetId']}")
    except Exception as e:
        rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "DELETE")
        log(f"card: FAILED {e}")

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
        full = rest(f"darts?select={COLS}&game_date=eq.{d['game_date']}&scratched_at=is.null") or []
        print(post_text(d, full)); print(draw(ticket_data(d, cashed, day), os.path.join(OUT, f"dart-{dart_id}.png")))
        return

    found, darts = due(now, [today, yesterday])
    try: card(now, today, darts, dry="--dry" in args)
    except Exception as e: log(f"card: FAILED {e}")
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
        text = post_text(d, darts)
        if "--dry" in args: print(f"[{how}] {text!r}"); continue
        try:
            rest("social_post_log", "POST", {"post_date": today, "slot": "called_it", "league": d["league"], "pick_text": key,
                                             "pick_id": str(d["id"]), "commence_time": d["commence_time"], "thread_format": "called_it"})
        except Exception as e:
            log(f"{d['player']}: claim failed ({e})"); continue
        try:
            # TEXT ONLY (Nov 10 2026). The ticket image went out on the first three: 62, 333 and 29 views, against 122 and
            # 205 for that day's text posts. The log had said so for months (image posts 138-245 views, text 574-1,255),
            # and the founder on the art: "so bad they just look like A.I slop". No images on X.
            j = json.loads(http(f"{SB}/functions/v1/post-single-tweet", "POST", H, json.dumps({"text": text}).encode(), timeout=60))
            if not j.get("success") or not j.get("tweetId"): raise RuntimeError(str(j)[:300])
            rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {
                "hook_tweet_id": j["tweetId"], "thread_url": f"https://x.com/BetwithGary/status/{j['tweetId']}",
                "posted_at": datetime.now(timezone.utc).isoformat(), "post_text": text,
                "audience_selection": {"format": "called_it_text_v2", "how": how, "odds": d["odds"], "prop": d["prop"]}})
            reply = link_reply(j["tweetId"], "Tonight's whole board, with the reason on each one, is free in the app: betwithgary.ai/c/xcash")
            if reply: rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "PATCH", {"cta_tweet_id": reply})
            log(f"{d['player']} ({how}, {price(d['odds'])}): https://x.com/BetwithGary/status/{j['tweetId']}")
        except Exception as e:
            rest(f"social_post_log?post_date=eq.{today}&pick_text=eq.{urllib.parse.quote(key)}", "DELETE")
            log(f"{d['player']}: FAILED {e}")
        return                                                     # one post a run; the gap rule spaces the rest

if __name__ == "__main__":
    main()
