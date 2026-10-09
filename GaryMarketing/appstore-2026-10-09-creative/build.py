#!/usr/bin/env python3
"""App Store creative assets for iOS 27 (Oct 9 2026): the product page header and the search
results asset. Real app captures only (Ad.md): pick.png and numbers.png are simulator captures of
build 981 on Oct 9 2026 (NCAAF Picks, Florida State +3.5 at Louisville). Apple's rules for these
assets: one clear idea, purpose obvious at a glance, real interface, 4+ content (no dollar amounts),
no prices, URLs or other platforms, key elements centered.

  python3 build.py   ->  out/header-3840x1646.png, out/search-3840x2560.png
"""
import os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

INK, GOLD, WHITE = "#0A0908", "#C9A227", "#F5F1E8"

def css(w, h):
    return f"""
@font-face {{ font-family: Bebas; src: url('BebasNeue-Regular.ttf'); }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: {w}px; height: {h}px; overflow: hidden; background: {INK}; }}
.board {{ position: relative; width: {w}px; height: {h}px; overflow: hidden; color: {WHITE}; }}
.lockup {{ display: flex; align-items: center; gap: 40px; }}
.lockup img {{ border-radius: 30%; }}
.lockup span {{ font-family: Bebas; letter-spacing: 0.04em; color: {WHITE}; padding-top: 12px; }}
h1 {{ font-family: Bebas; font-weight: 400; line-height: 0.88; letter-spacing: 0.005em; }}
h1 em {{ font-style: normal;
  background: linear-gradient(180deg, #F4D774 0%, #D9B23A 45%, #A98216 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; }}
.sub {{ font-family: -apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif; font-weight: 500;
  color: rgba(245,241,232,0.70); line-height: 1.25; }}
.card {{ position: absolute; overflow: hidden; border-radius: 86px;
  box-shadow: 0 0 0 3px rgba(201,162,39,0.30), 0 90px 200px rgba(0,0,0,0.80), 0 0 260px rgba(201,162,39,0.16); }}
.card img {{ display: block; }}
.phone {{ position: absolute; padding: 30px; border-radius: 214px;
  background: linear-gradient(145deg, #3B372F 0%, #1B1915 30%, #121110 70%, #2E2A23 100%);
  box-shadow: 0 0 0 3px rgba(255,236,190,0.10), 0 90px 200px rgba(0,0,0,0.78), 0 0 240px rgba(201,162,39,0.14); }}
.phone img {{ display: block; border-radius: 184px; }}
"""

def glow(w, h, cx, cy):
    return (f'<div style="position:absolute;inset:0;background:'
            f'radial-gradient(ellipse {int(w*0.42)}px {int(h*0.62)}px at {cx}px {cy}px, rgba(201,162,39,0.20), transparent 70%),'
            f'radial-gradient(ellipse {int(w*0.6)}px {int(h*0.3)}px at 50% 0px, rgba(201,162,39,0.08), transparent 70%),'
            f'linear-gradient(180deg, #0E0C09 0%, #0A0908 50%, #080706 100%);"></div>')

# The pick card's box in pick.png (1320 x 2868 capture), cut just outside its border.
CARD = dict(x=44, y=562, w=1188, h=704)

def card(left, top, scale):
    w, h = int(CARD["w"] * scale), int(CARD["h"] * scale)
    return (f'<div class="card" style="left:{left}px;top:{top}px;width:{w}px;height:{h}px;">'
            f'<img src="pick.png" style="width:{int(1320*scale)}px;margin-left:-{int(CARD["x"]*scale)}px;margin-top:-{int(CARD["y"]*scale)}px;"></div>')

def phone(img, left, top, width):
    inner = width - 60
    return f'<div class="phone" style="left:{left}px;top:{top}px;width:{width}px;"><img src="{img}" style="width:{inner}px;"></div>'

def header():
    # 3840 x 1646 (21:9), one idea: Gary puts a pick on every game. Apple clips the header toward its center
    # on smaller displays, so everything that matters is stacked in the middle third: the lockup, the line,
    # and the real pick card under it. Survives a 16:9 or 4:3 center crop.
    W, H = 3840, 1646
    scale = 1.02
    cw, ch = int(CARD["w"] * scale), int(CARD["h"] * scale)
    top = 190
    body = glow(W, H, W // 2, 1080)
    body += (f'<div style="position:absolute;left:0;right:0;top:{top}px;display:flex;flex-direction:column;align-items:center;">'
             '<div class="lockup"><img src="logo.png" style="width:118px;height:118px;"><span style="font-size:96px;">GARY A.I.</span></div>'
             '<h1 style="font-size:236px;margin-top:40px;white-space:nowrap;">A pick on <em>every game.</em></h1>'
             '</div>')
    body += card((W - cw) // 2, top + 118 + 40 + 236 + 70, scale)
    return W, H, body

def search():
    # 3840 x 2560: state the obvious (sports picks, every game, with reasons) beside the real screens.
    W, H = 3840, 2560
    body = glow(W, H, 2800, 1300)
    body += ('<div style="position:absolute;left:300px;top:760px;width:1560px;">'
             '<div class="lockup"><img src="logo.png" style="width:150px;height:150px;"><span style="font-size:120px;">GARY A.I.</span></div>'
             '<h1 style="font-size:320px;margin-top:60px;">A pick on<br><em>every game.</em></h1>'
             '<div class="sub" style="font-size:80px;margin-top:60px;">MLB, NFL and college football, with the reasons behind every pick.</div>'
             '</div>')
    # The numbers screen behind, the pick and its reasoning in front.
    body += phone("numbers.png", 2620, 360, 1060)
    body += phone("pick.png", 1980, 220, 1120)
    return W, H, body

def render(name, fn):
    W, H, body = fn()
    html = os.path.join(HERE, f"{name}.html")
    with open(html, "w") as f:
        f.write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css(W, H)}</style></head>'
                f'<body><div class="board">{body}</div></body></html>')
    png = os.path.join(OUT, f"{name}-{W}x{H}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--window-size={W},{H}", f"--screenshot={png}", f"file://{html}"],
                   check=True, capture_output=True, timeout=120)
    print("rendered", png)

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    render("header", header)
    render("search", search)
