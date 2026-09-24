#!/usr/bin/env python3
"""App Store 6.9" screenshots for Gary 2.27 (1320 x 2868). Real app captures only."""
import os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1320, 2868

BASE_CSS = """
@font-face { font-family: Bebas; src: url('BebasNeue-Regular.ttf'); }
@font-face { font-family: Caveat; src: url('Caveat-SemiBold.ttf'); }
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
.copy { position: absolute; left: 100px; right: 100px; top: 190px; }
.eyebrow { font-family: Oswald; font-size: 40px; letter-spacing: 0.2em; color: #C9A227; text-transform: uppercase; }
.lockup { display: flex; align-items: center; gap: 26px; }
.lockup img { width: 96px; height: 96px; border-radius: 22px; }
.lockup span { font-family: Bebas; font-size: 74px; letter-spacing: 0.04em; color: #F5F1E8; padding-top: 8px; }
h1 { font-family: Bebas; font-weight: 400; font-size: 212px; line-height: 0.9; letter-spacing: 0.005em; margin-top: 34px; }
h1 em { font-style: normal;
  background: linear-gradient(180deg, #F4D774 0%, #D9B23A 45%, #A98216 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif; font-weight: 500;
  font-size: 50px; line-height: 1.28; color: rgba(245,241,232,0.68); margin-top: 38px; max-width: 1100px; }
.phone { position: absolute; left: 50%; transform: translateX(-50%); width: 1010px;
  padding: 22px; border-radius: 156px;
  background: linear-gradient(145deg, #3B372F 0%, #1B1915 30%, #121110 70%, #2E2A23 100%);
  box-shadow: 0 0 0 2px rgba(255,236,190,0.10), 0 60px 140px rgba(0,0,0,0.75), 0 0 180px rgba(201,162,39,0.14); }
.phone img { display: block; width: 966px; border-radius: 134px; }
.note { position: absolute; font-family: Caveat; color: #E2BE4E; font-size: 70px; line-height: 1; }
.note svg { position: absolute; overflow: visible; }
.crop { position: absolute; left: 60px; width: 1200px; border-radius: 64px; overflow: hidden;
  box-shadow: 0 0 0 2px rgba(201,162,39,0.35), 0 60px 140px rgba(0,0,0,0.8), 0 0 200px rgba(201,162,39,0.12); }
.crop img { display: block; }
.fade { position: absolute; left: 0; right: 0; bottom: 0; height: 520px;
  background: linear-gradient(180deg, rgba(8,7,6,0) 0%, rgba(8,7,6,0.92) 70%, #080706 100%); }
"""

def phone(img, top):
    return f'<div class="phone" style="top:{top}px"><img src="{img}"></div>'

def copy(eyebrow, headline, sub, lockup=False):
    eb = ('<div class="lockup"><img src="logo.png"><span>GARY A.I.</span></div>' if lockup
          else f'<div class="eyebrow">{eyebrow}</div>')
    return f'<div class="copy">{eb}<h1>{headline}</h1><div class="sub">{sub}</div></div>'

BOARDS = [
    # 1. Breadth: the one thing a single card can't say is that there's one for every game.
    ("01-every-game",
     copy("", "A pick on<br><em>every game.</em>", "Every MLB and NFL game, plus college football’s biggest.", lockup=True)
     + phone("m0.png", 1010)
     + '''<div class="note" style="left:600px; top:880px;">his last 7 days
          <svg width="260" height="300" style="left:170px; top:44px">
            <path d="M 196 14 C 236 70, 160 176, 88 250" fill="none" stroke="#E2BE4E" stroke-width="7" stroke-linecap="round"/>
            <path d="M 70 214 L 84 256 L 126 244" fill="none" stroke="#E2BE4E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg></div>'''),
    # 2. Trust: the reasoning is written by a character, before the game.
    ("02-his-take",
     copy("Every pick, explained", "He shows<br><em>his work.</em>", "Gary’s full take on each game, in plain English, before first pitch."),
     ),
    # 3. Fun: the dartboard is the app's own playful lane.
    ("03-darts",
     copy("Darts", "Fun picks,<br><em>thrown daily.</em>", "Touchdowns, home runs and hot streaks on Gary’s dartboard."),
     ),
    # 4. Ritual: the best plays arrive sealed and open like a pack.
    ("04-unveil",
     copy("Winners", "His best plays,<br><em>sealed.</em>", "A few every day, sealed until you tap."),
     ),
    # 5. Proof: the numbers behind a top play, circled by hand.
    ("05-scorebook",
     copy("The receipts", "The numbers,<br><em>circled.</em>", "Every top play shows the stats that put it there."),
     ),
    # 6. Live: the whole day on one board.
    ("06-home",
     copy("Game day", "Every game,<br><em>one board.</em>", "Live scores next to Gary’s pick for each one."),
     ),
    # 7. Honesty: losses stay on the record.
    ("07-record",
     copy("The record", "The losses<br><em>stay up too.</em>", "Every pick is graded in public. Nothing gets deleted."),
     ),
]

SHOT = {"02-his-take": "m3f.png", "03-darts": "d1.png", "04-unveil": "wu1.png",
        "06-home": "h1.png", "07-record": "y0.png"}

def page(name, body):
    extra = ""
    if name in SHOT:
        extra = phone(SHOT[name], 1010)
    if name == "04-unveil":
        # The sealed pack on the phone; the play it opens to, from the next frame of the same unveil.
        extra += ('<div class="crop" style="top:2120px; left:77px; width:1166px; height:643px; border-radius:40px;">'
                  '<img src="wu2.png" style="width:1426px; margin-left:-130px; margin-top:-1134px;"></div>')
    if name == "05-scorebook":
        # Scorebook crop from the unveil (source px 920..2640 of the 1320-wide capture).
        extra = ('<div class="crop" style="top:900px; height:1640px;">'
                 '<img src="wu3.png" style="width:1320px; margin-left:-60px; margin-top:-935px;">'
                 '<div style="position:absolute;left:0;right:0;bottom:0;height:300px;'
                 'background:linear-gradient(180deg,rgba(14,12,9,0),#0E0C09 92%);"></div></div>')
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE_CSS}</style></head>'
            f'<body><div class="board">{body}{extra}</div></body></html>')

def main():
    os.makedirs(OUT, exist_ok=True)
    for b in BOARDS:
        name, body = b[0], b[1]
        html = os.path.join(HERE, f"{name}.html")
        with open(html, "w") as f:
            f.write(page(name, body))
        png = os.path.join(OUT, f"{name}.png")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", f"--window-size={W},{H}",
                        f"--screenshot={png}", f"file://{html}"],
                       check=True, capture_output=True, timeout=90)
        print("rendered", name)

if __name__ == "__main__":
    main()
