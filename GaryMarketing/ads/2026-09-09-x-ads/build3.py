import base64, pathlib
W = pathlib.Path(__file__).parent
def b64(p): return base64.b64encode((W/p).read_bytes()).decode()
def face(family, file, weight):
    return ("@font-face{font-family:'%s';src:url(data:font/ttf;base64,%s) format('truetype');font-weight:%d;font-style:normal;font-display:block;}" % (family, b64(file), weight))
FONTS = face('Bebas Neue','BebasNeue-Regular.sub.ttf',400) + face('Barlow Condensed','BarlowCondensed-Bold.sub.ttf',700)
SYS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"
BEBAS = "'Bebas Neue', Impact, sans-serif"; BARLOW = "'Barlow Condensed', 'Arial Narrow', sans-serif"
GOLD = '#C9A227'; INK = '#0A0908'; WHITE = '#F5F1E8'
def doc(body):
    return f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    {FONTS}
    body {{ margin: 0; background: {INK}; }}
    a {{ color: {GOLD}; }} a:hover {{ color: #E8D48B; }}
  </style>
</helmet>
{body}
</x-dc>
</body>
</html>'''

def ad(headline_lines, sub, screen, screen_w=900, cta='Download free'):
    # 1080x1350 install ad: brand, headline, one benefit, real phone screen bleeding off the bottom, CTA pill over a scrim
    hl = ''.join(f'<div>{l}</div>' for l in headline_lines)
    return f'''
<div style="position:relative;width:1080px;height:1350px;overflow:hidden;background:radial-gradient(70% 45% at 50% 100%, rgba(201,162,39,0.28), rgba(201,162,39,0) 100%), linear-gradient(180deg,{INK} 0%,#121009 100%);font-family:{SYS};color:{WHITE}">
  <div style="position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:14px">
    <img src="gary-mark.png" alt="" style="width:64px;height:64px">
    <div style="font-family:{BEBAS};font-size:42px;line-height:42px;letter-spacing:0.05em;color:{GOLD}">GARY A.I.</div>
  </div>
  <div style="position:absolute;left:64px;right:64px;top:150px;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;flex-direction:column;font-family:{BEBAS};font-size:124px;line-height:112px;letter-spacing:0.005em;color:{WHITE}">{hl}</div>
    <div style="font-size:38px;line-height:48px;color:rgba(245,241,232,0.82);max-width:900px">{sub}</div>
  </div>
  <div style="position:absolute;left:240px;top:490px;width:600px;height:1000px;border-radius:92px;background:#000000;border:12px solid #221f1a;box-shadow:0px 40px 90px rgba(0,0,0,0.7);box-sizing:border-box;overflow:hidden">
    <div style="width:576px;height:976px;border-radius:80px;overflow:hidden;background:#0d0c0a">
      <img src="{screen}" alt="" style="display:block;width:576px;height:auto">
    </div>
  </div>
  <div style="position:absolute;left:0px;bottom:0px;width:1080px;height:420px;background:linear-gradient(180deg, rgba(10,9,8,0) 0%, rgba(10,9,8,0.92) 55%, {INK} 100%)"></div>
  <div style="position:absolute;left:0px;right:0px;bottom:86px;display:flex;flex-direction:column;align-items:center;gap:18px">
    <div style="display:inline-flex;align-items:center;justify-content:center;height:96px;padding:0px 64px;border-radius:999px;background:{GOLD};font-family:{BARLOW};font-weight:700;font-size:44px;letter-spacing:0.02em;color:{INK};box-shadow:0px 16px 40px rgba(201,162,39,0.35)">{cta}</div>
    <div style="font-size:26px;line-height:30px;color:rgba(245,241,232,0.7)">Gary AI on the App Store · a pick for every game, free</div>
  </div>
  <div style="position:absolute;left:64px;right:64px;bottom:30px;text-align:center;font-size:14px;line-height:18px;color:rgba(245,241,232,0.42)">21+. Gary AI is not a sportsbook. Picks are opinions; results do not guarantee future results. Gambling problem? Call 1-800-GAMBLER.</div>
</div>'''

ADS = {
 'AdPick.dc.html':      ad(['A pick for', 'every game.'], 'Priced, graded, and on the board by morning.', 'screen-pick.jpg'),
 'AdReasoning.dc.html': ad(['Every pick comes', 'with the reasoning.'], 'Flip the card and read Gary’s take first.', 'screen-reasoning.jpg'),
 'AdTonight.dc.html':   ad(['Who do I', 'bet tonight?'], 'Every game tonight, priced, with Gary’s pick.', 'screen-tonight.jpg'),
 'AdIntel.dc.html':     ad(['The intel before', 'first pitch.'], 'Heat checks, records and streaks on every game.', 'screen-intel.jpg'),
}
for n, html in ADS.items():
    (W/n).write_text(doc(html)); print(n, (W/n).stat().st_size)
