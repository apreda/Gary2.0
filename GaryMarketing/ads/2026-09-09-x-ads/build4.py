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
def root(inner, glow=0.22):
    return (f'<div style="position:relative;width:1080px;height:1350px;overflow:hidden;background:radial-gradient(70% 45% at 50% 100%, rgba(201,162,39,{glow}), rgba(201,162,39,0) 100%), linear-gradient(180deg,{INK} 0%,#121009 100%);'
            f'font-family:{SYS};color:{WHITE}">{inner}</div>')
def brand():
    return (f'<div style="position:absolute;left:64px;top:56px;display:flex;align-items:center;gap:14px"><img src="gary-mark.png" alt="" style="width:64px;height:64px">'
            f'<div style="font-family:{BEBAS};font-size:42px;line-height:42px;letter-spacing:0.05em;color:{GOLD}">GARY A.I.</div></div>')
def cta(label='Get Gary free', bottom=86):
    return (f'<div style="position:absolute;left:0px;right:0px;bottom:{bottom}px;display:flex;flex-direction:column;align-items:center;gap:16px">'
            f'<div style="display:inline-flex;align-items:center;justify-content:center;height:96px;padding:0px 64px;border-radius:999px;background:{GOLD};font-family:{BARLOW};font-weight:700;font-size:44px;letter-spacing:0.02em;color:{INK};box-shadow:0px 16px 40px rgba(201,162,39,0.35)">{label}</div>'
            f'<div style="font-size:24px;line-height:28px;color:rgba(245,241,232,0.7)">Gary AI on the App Store · free</div></div>'
            f'<div style="position:absolute;left:64px;right:64px;bottom:30px;text-align:center;font-size:14px;line-height:18px;color:rgba(245,241,232,0.42)">21+. Gary AI is not a sportsbook. Picks are opinions; results do not guarantee future results. Gambling problem? Call 1-800-GAMBLER.</div>')
def headline(lines, size=132, lh=118, top=150, gold_last=False):
    ls = ''.join(f'<div style="color:{GOLD if (gold_last and i == len(lines)-1) else WHITE}">{l}</div>' for i, l in enumerate(lines))
    return f'<div style="position:absolute;left:64px;right:64px;top:{top}px;display:flex;flex-direction:column;font-family:{BEBAS};font-size:{size}px;line-height:{lh}px;letter-spacing:0.005em">{ls}</div>'
def sub(text, top, size=34):
    return f'<div style="position:absolute;left:64px;right:64px;top:{top}px;font-size:{size}px;line-height:{round(size*1.3)}px;color:rgba(245,241,232,0.82)">{text}</div>'

# 1 · FADE THE BEAR — the card back is the hero: his take, and the two buttons nobody else offers
def ad_fade():
    inner = brand() + headline(['Bet with Gary.', 'Or fade the bear.'], gold_last=True) + \
        '<img src="card-back-culpepper.png" alt="" style="position:absolute;left:130px;top:436px;width:820px;filter:drop-shadow(0px 30px 60px rgba(0,0,0,0.6))">' + \
        sub('His take on every pick. Agree with it, or bet the other side.', 1044) + cta()
    return root(inner)

# 2 · THE GRADED BOARD — six real cards from Tuesday, wins and losses, as they sit in the app the next morning
CARDS = ['card-rangers.png','card-yankees.png','card-rays.png','card-tigers.png','card-marlins.png','card-royals.png']
def ad_graded():
    grid = ''.join(f'<img src="{c}" alt="" style="width:300px;height:auto;display:block">' for c in CARDS)
    inner = brand() + headline(['Every game.', 'Graded by morning.']) + \
        f'<div style="position:absolute;left:64px;top:410px;font-family:{BARLOW};font-weight:700;font-size:24px;letter-spacing:0.14em;color:{GOLD}">TUESDAY, SEPTEMBER 8 · MLB · AS IT SITS IN THE APP</div>' + \
        f'<div style="position:absolute;left:66px;top:456px;width:948px;display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:24px">{grid}</div>' + \
        sub('Wins and losses on the same board, with the final score. Nothing gets deleted the next day.', 900) + cta()
    return root(inner)

# 3 · 5 PM — the real phone, fitted: the board as it opens
def ad_phone():
    inner = brand() + \
        f'<div style="position:absolute;left:64px;right:64px;top:150px;display:flex;flex-direction:column;font-family:{BEBAS};letter-spacing:0.005em"><div style="font-size:170px;line-height:150px;color:{GOLD}">5 PM.</div><div style="font-size:104px;line-height:96px;color:{WHITE}">Who do I bet tonight?</div></div>' + \
        sub('Gary’s pick on every game, priced, before first pitch.', 420) + \
        '<div style="position:absolute;left:250px;top:520px;width:580px;height:1200px;border-radius:96px;background:#000000;border:12px solid #221f1a;box-shadow:0px 40px 90px rgba(0,0,0,0.7);box-sizing:border-box;overflow:hidden">' + \
        '<div style="width:556px;height:1176px;border-radius:84px;overflow:hidden;background:#0d0c0a"><img src="phone-picks.jpg" alt="" style="display:block;width:556px;height:auto"></div></div>' + \
        f'<div style="position:absolute;left:0px;bottom:0px;width:1080px;height:400px;background:linear-gradient(180deg, rgba(10,9,8,0) 0%, rgba(10,9,8,0.94) 58%, {INK} 100%)"></div>' + cta()
    return root(inner)

# 4 · HE HAD IT — Monday night's recap card from the Home page, the pick that cashed
def ad_hadit():
    inner = brand() + headline(['Monday night:', 'SMU −2.5.', 'He had it.'], size=124, lh=112, gold_last=True) + \
        '<img src="card-recap-smu.png" alt="" style="position:absolute;left:100px;top:520px;width:880px;filter:drop-shadow(0px 30px 60px rgba(0,0,0,0.6))">' + \
        sub('Picked Monday with the reasoning, at −115. Graded by morning.', 1016) + cta()
    return root(inner)

ADS = {'AdFade.dc.html': ad_fade(), 'AdGraded.dc.html': ad_graded(), 'AdPhone.dc.html': ad_phone(), 'AdHadIt.dc.html': ad_hadit()}
for n, html in ADS.items():
    (W/n).write_text(doc(html)); print(n, (W/n).stat().st_size)
