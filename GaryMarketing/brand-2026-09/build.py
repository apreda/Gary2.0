"""Gary brand kit, Sep 29 2026. Renders every asset from HTML with headless Chrome.
The look ports the Sep 24 App Store frames: black with a warm gold glow, Bebas
headlines in cream and gold, real app screens. Run: python3 build.py"""
import pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parents[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BEBAS = (REPO / "ios/GaryApp/Fonts/BebasNeue-Regular.ttf").as_uri()
INTER = (REPO / "web/assets/og/Inter-Regular.ttf").as_uri()
INTER_SB = (REPO / "web/assets/og/Inter-SemiBold.ttf").as_uri()
ICON = (REPO / "ios/GaryApp/Assets.xcassets/AppIcon.appiconset/icon-1024.png").as_uri()
def phone(name): return (ROOT / "src" / f"{name}-phone.png").as_uri()

BASE = f"""
@font-face {{ font-family: Bebas; src: url({BEBAS}); }}
@font-face {{ font-family: Inter; src: url({INTER}); font-weight: 400; }}
@font-face {{ font-family: Inter; src: url({INTER_SB}); font-weight: 600; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: 100%; height: 100%; overflow: hidden; background: #0B0A08; }}
.stage {{ position: relative; width: 100%; height: 100%; overflow: hidden;
  background: radial-gradient(ellipse 55% 70% at var(--gx, 72%) var(--gy, 38%), rgba(201,162,39,.24), rgba(201,162,39,0) 70%), #0B0A08; }}
.label {{ font-family: Bebas; color: #C9A227; letter-spacing: .22em; }}
.h {{ font-family: Bebas; line-height: .9; color: #F2EDE4; }}
.gold {{ background: linear-gradient(180deg, #F0CD62 0%, #C9A227 100%); -webkit-background-clip: text; color: transparent; }}
.sub {{ font-family: Inter; color: #BDB6AA; }}
.phone {{ position: absolute; filter: drop-shadow(0 30px 50px rgba(0,0,0,.65)); }}
.legal {{ font-family: Inter; color: #7D776D; letter-spacing: .02em; }}
"""

def page(w, h, body, gx="72%", gy="38%"):
    return f"<!doctype html><html><head><meta charset=utf-8><style>{BASE}</style></head><body><div class=stage style='--gx:{gx};--gy:{gy}'>{body}</div></body></html>"

ASSETS = {}

# X header, 1500x500. X lays the avatar over the lower left, so the copy stays above y≈320.
ASSETS["x-banner-1500x500"] = (1500, 500, page(1500, 500, f"""
<div style='position:absolute;left:92px;top:62px'>
  <div class=h style='font-size:100px'>Game and prop picks<br><span class=gold>for every game.</span></div>
  <div class=sub style='font-size:25px;margin-top:22px'>The reasoning behind each one, and every result on the record.</div>
</div>
<img class=phone src='{phone("04-unveil")}' style='left:905px;top:118px;width:300px;transform:rotate(-6deg)'>
<img class=phone src='{phone("03-darts")}' style='left:1215px;top:118px;width:300px;transform:rotate(6deg)'>
<img class=phone src='{phone("06-home")}' style='left:1040px;top:52px;width:330px'>
""", gx="78%", gy="30%"))

# Pinned post image, 1600x900: the three things Gary does, one real screen each.
def col(img, label, x):
    return f"""<img class=phone src='{phone(img)}' style='left:{x}px;top:262px;width:380px'>
<div class=label style='position:absolute;left:{x}px;width:380px;top:205px;text-align:center;font-size:34px'>{label}</div>"""
ASSETS["x-pinned-1600x900"] = (1600, 900, page(1600, 900, f"""
<div style='position:absolute;left:0;right:0;top:58px;text-align:center'>
  <div class=h style='font-size:96px'>Game and prop picks <span class=gold>for every game.</span></div>
</div>
{col("06-home", "Home", 170)}{col("02-his-take", "Picks", 620)}{col("03-darts", "Darts", 1070)}
""", gx="50%", gy="42%"))

# YouTube channel art, 2560x1440. Everything lives in the 1546x423 center safe area.
ASSETS["youtube-banner-2560x1440"] = (2560, 1440, page(2560, 1440, f"""
<div style='position:absolute;left:520px;top:560px'>
  <div class=h style='font-size:130px'>Game and prop picks<br><span class=gold>for every game.</span></div>
  <div class=sub style='font-size:30px;margin-top:22px'>The reasoning behind each one, and every result on the record.</div>
</div>
<img class=phone src='{phone("04-unveil")}' style='left:1520px;top:600px;width:470px;transform:rotate(-6deg)'>
<img class=phone src='{phone("03-darts")}' style='left:1960px;top:600px;width:470px;transform:rotate(6deg)'>
<img class=phone src='{phone("06-home")}' style='left:1710px;top:520px;width:520px'>
""", gx="60%", gy="45%"))

# Instagram launch posts, 1080x1350 (4:5): the App Store frames re-laid for the feed.
def ig(label, top, bottom, sub, img, gy="62%"):
    hs = 112 if len(top) > 14 else 128
    return (1080, 1350, page(1080, 1350, f"""
<div style='position:absolute;left:84px;top:92px;right:84px'>
  <div class=label style='font-size:34px'>{label}</div>
  <div class=h style='font-size:{hs}px;margin-top:14px'>{top}<br><span class=gold>{bottom}</span></div>
  <div class=sub style='font-size:30px;margin-top:22px;line-height:1.3'>{sub}</div>
</div>
<img class=phone src='{phone(img)}' style='left:190px;top:560px;width:700px'>
""", gx="50%", gy=gy))
ASSETS["ig-01-picks-1080x1350"] = ig("Gary A.I.", "Game and prop picks", "for every game.", "Every MLB and NFL game, plus college football's biggest.", "06-home")
ASSETS["ig-02-reasoning-1080x1350"] = ig("Picks", "Every pick,", "explained.", "Gary's reasoning behind each one, in plain English.", "02-his-take")
def ig_card(label, top, bottom, sub, img, top_px, width):
    hs = 112 if len(top) > 14 else 128
    return (1080, 1350, page(1080, 1350, f"""
<div style='position:absolute;left:84px;top:92px;right:84px'>
  <div class=label style='font-size:34px'>{label}</div>
  <div class=h style='font-size:{hs}px;margin-top:14px'>{top}<br><span class=gold>{bottom}</span></div>
  <div class=sub style='font-size:30px;margin-top:22px;line-height:1.3'>{sub}</div>
</div>
<img src='{(ROOT / "src" / img).as_uri()}' style='position:absolute;left:{(1080 - width) // 2}px;top:{top_px}px;width:{width}px'>
""", gx="50%", gy="66%"))
ASSETS["ig-03-winners-1080x1350"] = ig_card("Winners", "His best picks,", "sealed.", "A select set of Gary's best picks each day, sealed until you tap.", "winners-ticket.png", 600, 1000)
ASSETS["ig-04-scorebook-1080x1350"] = ig_card("Winners", "The numbers,", "circled.", "Every Winners pick shows the stats behind it.", "scorebook-card.png", 540, 860)
ASSETS["ig-05-darts-1080x1350"] = ig("Darts", "Fun picks,", "thrown daily.", "Touchdowns, home runs and hot streaks on Gary's dartboard.", "03-darts")
ASSETS["ig-06-record-1080x1350"] = ig("The record", "The losses", "stay up too.", "Every result is posted, win or loss.", "07-record")

def render(name, w, h, html):
    src = ROOT / "out" / f"{name}.html"
    src.write_text(html)
    out = ROOT / "out" / f"{name}.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    f"--window-size={w},{h}", "--force-device-scale-factor=1", f"--screenshot={out}", src.as_uri()],
                   check=True, capture_output=True)
    src.unlink()
    print(out.name)

if __name__ == "__main__":
    for name, (w, h, html) in ASSETS.items():
        render(name, w, h, html)
