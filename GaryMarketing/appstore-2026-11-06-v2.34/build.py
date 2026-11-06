#!/usr/bin/env python3
"""App Store 6.9" screenshots for Gary 2.34 (1320 x 2868). Real app captures and the app's own art only.
The first three show in App Store search, so they lead with what nothing else in search has: Gary himself,
then the two best-looking screens. Captures: the card is from the Sep 28 capture in brand-2026-09/captures;
Home, Darts and Billfold are the Nov 5 captures on the website; Winners pack and scorebook are Oct 9.

  python3 build.py  ->  out/01-gary.png ... out/06-record.png
"""
import os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1320, 2868

BASE_CSS = """
@font-face { font-family: Bebas; src: url('BebasNeue-Regular.ttf'); }
@font-face { font-family: Oswald; src: url('Oswald-Bold.ttf'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1320px; height: 2868px; overflow: hidden; background: #0A0908; }
.board {
  position: relative; width: 1320px; height: 2868px; overflow: hidden;
  background:
    radial-gradient(ellipse 900px 700px at 50% 1150px, rgba(201,162,39,0.22), transparent 70%),
    radial-gradient(ellipse 1200px 500px at 50% 0px, rgba(201,162,39,0.10), transparent 70%),
    linear-gradient(180deg, #0E0C09 0%, #0A0908 45%, #080706 100%);
  color: #F5F1E8;
}
.copy { position: absolute; left: 90px; right: 70px; top: 170px; }
.eyebrow { font-family: Oswald; font-size: 42px; letter-spacing: 0.2em; color: #C9A227; text-transform: uppercase; }
.lockup { display: flex; align-items: center; gap: 26px; }
.lockup img { width: 96px; height: 96px; border-radius: 22px; }
.lockup span { font-family: Bebas; font-size: 74px; letter-spacing: 0.04em; color: #F5F1E8; padding-top: 8px; }
h1 { font-family: Bebas; font-weight: 400; font-size: 244px; line-height: 0.88; letter-spacing: 0.005em; margin-top: 30px; text-transform: uppercase; }
h1 em { font-style: normal;
  background: linear-gradient(180deg, #F4D774 0%, #D9B23A 45%, #A98216 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif; font-weight: 500;
  font-size: 54px; line-height: 1.24; color: rgba(245,241,232,0.74); margin-top: 34px; max-width: 1140px; }
.phone { position: absolute; left: 50%; transform: translateX(-50%); width: 1010px;
  padding: 22px; border-radius: 156px;
  background: linear-gradient(145deg, #3B372F 0%, #1B1915 30%, #121110 70%, #2E2A23 100%);
  box-shadow: 0 0 0 2px rgba(255,236,190,0.10), 0 60px 140px rgba(0,0,0,0.75), 0 0 180px rgba(201,162,39,0.14); }
.phone img { display: block; width: 966px; border-radius: 134px; }
.crop { position: absolute; left: 60px; width: 1200px; border-radius: 64px; overflow: hidden;
  box-shadow: 0 0 0 2px rgba(201,162,39,0.35), 0 60px 140px rgba(0,0,0,0.8), 0 0 200px rgba(201,162,39,0.12); }
.crop img { display: block; }
.card { position: absolute; left: 72px; width: 1176px; top: 930px; filter: drop-shadow(0 40px 70px rgba(0,0,0,0.75)); }
.gary { position: absolute; left: 50%; transform: translateX(-50%); bottom: 58px; height: 1230px; z-index: 2;
  filter: drop-shadow(0 30px 40px rgba(0,0,0,0.6)); }
.floor { position: absolute; left: 50%; bottom: 26px; width: 900px; height: 110px; transform: translateX(-50%);
  border-radius: 50%; background: rgba(0,0,0,0.7); filter: blur(22px); }
.glow { position: absolute; left: 50%; bottom: 200px; width: 1200px; height: 1100px; transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(201,162,39,0.34), rgba(201,162,39,0)); }
"""

def phone(img, top):
    return f'<div class="phone" style="top:{top}px"><img src="{img}"></div>'

def copy(eyebrow, headline, sub, lockup=False):
    eb = ('<div class="lockup"><img src="logo.png"><span>GARY A.I.</span></div>' if lockup
          else f'<div class="eyebrow">{eyebrow}</div>')
    return f'<div class="copy">{eb}<h1>{headline}</h1><div class="sub">{sub}</div></div>'

BOARDS = [
    # 1. Gary himself: no other app in search has a character. Breadth is the one thing his card can't say.
    ("01-gary",
     copy("", "A pick on<br><em>every game.</em>", "Every NFL and NBA game, plus college football’s biggest.", lockup=True)
     + '<img class="card" src="pick-card.png"><div class="glow"></div><div class="floor"></div><img class="gary" src="gary-paper.png">'),
    # 2. The app's best-looking screen: the whole day around Gary.
    ("02-home",
     copy("Home", "Game day,<br><em>one screen.</em>", "Tonight’s big game, last night’s result and what Gary has coming.")
     + phone("home.png", 1010)),
    # 3. Fun: the dartboard is the app's own playful lane.
    ("03-darts",
     copy("Darts", "Fun picks,<br><em>thrown daily.</em>", "Touchdowns, hot streaks and the parlay of the day.")
     + phone("darts.png", 1010)),
    # 4. Ritual: the best plays arrive sealed and open like a pack.
    ("04-winners",
     copy("Winners", "Best plays,<br><em>sealed.</em>", "A few every day, sealed until you tap.")
     + phone("pack.png", 1010)),
    # 5. Trust: the numbers behind a top play, circled by hand.
    ("05-his-work",
     copy("Every pick, explained", "He shows<br><em>his work.</em>", "The numbers behind each top play, and why they matter.")
     + '<div class="crop" style="top:1010px; height:1640px;">'
       '<img src="scorebook.png" style="width:1320px; margin-left:-60px; margin-top:-760px;">'
       '<div style="position:absolute;left:0;right:0;bottom:0;height:300px;'
       'background:linear-gradient(180deg,rgba(14,12,9,0),#0E0C09 92%);"></div></div>'),
    # 6. Honesty: the record, losses included.
    ("06-record",
     copy("Billfold", "The losses<br><em>stay up too.</em>", "Every pick is graded in public, wins and losses.")
     + phone("billfold.png", 1010)),
]

def main():
    os.makedirs(OUT, exist_ok=True)
    for name, body in BOARDS:
        html = os.path.join(HERE, f"{name}.html")
        with open(html, "w") as f:
            f.write(f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}</style></head>'
                    f'<body><div class="board">{body}</div></body></html>')
        png = os.path.join(OUT, f"{name}.png")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", f"--window-size={W},{H}",
                        f"--screenshot={png}", f"file://{html}"],
                       check=True, capture_output=True, timeout=120)
        print("rendered", name)

if __name__ == "__main__":
    main()
