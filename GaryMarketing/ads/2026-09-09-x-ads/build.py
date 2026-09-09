import base64, pathlib
W = pathlib.Path(__file__).parent
def b64(p): return base64.b64encode((W/p).read_bytes()).decode()
def face(family, file, weight):
    return ("@font-face{font-family:'%s';src:url(data:font/ttf;base64,%s) format('truetype');"
            "font-weight:%d;font-style:normal;font-display:block;}" % (family, b64(file), weight))

GARY_FONTS = (face('Bebas Neue','BebasNeue-Regular.sub.ttf',400)
            + face('Barlow Condensed','BarlowCondensed-Bold.sub.ttf',700)
            + face('JetBrains Mono','JetBrainsMono-Bold.sub.ttf',700))
SYNCD_FONTS = (face('Outfit','Outfit-Light.sub.ttf',300) + face('Outfit','Outfit-Regular.sub.ttf',400)
             + face('Outfit','Outfit-Medium.sub.ttf',500)
             + face('Hanken Grotesk','HankenGrotesk-Regular.sub.ttf',400)
             + face('Hanken Grotesk','HankenGrotesk-Medium.sub.ttf',500)
             + face('Hanken Grotesk','HankenGrotesk-SemiBold.sub.ttf',600))

SYS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"

# ---------- icons (inline SVG, stroke style) ----------
def svg_football(size, color):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
            '<ellipse cx="12" cy="12" rx="10.5" ry="6.2" transform="rotate(-45 12 12)"></ellipse>'
            '<path d="M8.6 15.4l6.8-6.8"></path><path d="M10.4 11.4l1.4 1.4"></path><path d="M12.2 9.6l1.4 1.4"></path><path d="M9.4 13.6l1.4 1.4"></path></svg>' % (size, size, color))
def svg_viewfinder(size, color):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9"></path><path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9"></path>'
            '<path d="M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15"></path><path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"></path><path d="M7 12h10"></path></svg>' % (size, size, color))
def svg_check_badge(size, fill):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10.5" fill="%s"></circle>'
            '<path d="M7.5 12.4l3 3 6-6.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>' % (size, size, fill))
def svg_star(size, fill, half=False):
    path = 'M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8z'
    if not half:
        return '<svg width="%d" height="%d" viewBox="0 0 24 24"><path d="%s" fill="%s"></path></svg>' % (size, size, path, fill)
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24"><defs><clipPath id="h"><rect x="0" y="0" width="12" height="24"></rect></clipPath></defs>'
            '<path d="%s" fill="%s" opacity="0.28"></path><path d="%s" fill="%s" clip-path="url(#h)"></path></svg>' % (size, size, path, fill, path, fill))
def svg_brackets(size, color):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9"></path><path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9"></path>'
            '<path d="M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15"></path><path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"></path></svg>' % (size, size, color))

def field_lines():
    # faint yard lines + hash marks, like a field seen from above
    parts = []
    for i in range(1, 13):
        y = i * 108
        parts.append('<line x1="0" y1="%d" x2="1080" y2="%d" stroke="rgba(255,255,255,0.06)" stroke-width="2"></line>' % (y, y))
    for x in (372, 708):
        for i in range(0, 50):
            y = 27 * i + 27
            parts.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="rgba(255,255,255,0.09)" stroke-width="2"></line>' % (x - 8, y, x + 8, y))
    return '<svg width="1080" height="1350" viewBox="0 0 1080 1350" style="position:absolute;left:0;top:0">' + ''.join(parts) + '</svg>'

# ---------- GARY creative (1080 x 1350) ----------
def gary_creative():
    gold = '#C9A227'
    return f'''
<div style="position:relative;width:1080px;height:1350px;overflow:hidden;background:linear-gradient(180deg,#0a0908 0%,#100e0a 38%,#2b2210 78%,#4f3d12 100%);font-family:{SYS};color:#ffffff">
  <div style="position:absolute;left:0;top:0;width:1080px;height:1350px;background:radial-gradient(58% 42% at 50% 104%, rgba(232,212,139,0.42), rgba(232,212,139,0) 100%)"></div>
  {field_lines()}
  <div style="position:absolute;left:0;top:78px;width:1080px;text-align:center;font-family:'Bebas Neue',Impact,sans-serif;font-size:66px;line-height:66px;letter-spacing:0.05em;color:{gold}">GARY A.I.</div>
  <div style="position:absolute;left:0;top:178px;width:1080px;display:flex;flex-direction:column;align-items:center;gap:0px;font-family:'Bebas Neue',Impact,sans-serif;font-size:86px;line-height:82px;letter-spacing:0.02em;color:#ffffff">
    <div>Every game.</div>
    <div>Every night.</div>
  </div>
  <div style="position:absolute;left:0;top:372px;width:1080px;display:flex;justify-content:center">
    <div style="display:inline-flex;align-items:center;height:60px;padding:0px 30px;border:2px solid {gold};border-radius:999px;font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:700;font-size:36px;letter-spacing:0.03em;color:{gold}">Free daily picks</div>
  </div>
  <img src="gary-mark.png" alt="" style="position:absolute;left:340px;top:450px;width:400px;height:400px;filter:drop-shadow(0px 24px 40px rgba(0,0,0,0.6))">
  <img src="gary-card.png" alt="" style="position:absolute;left:147px;top:650px;width:786px;filter:drop-shadow(0px 30px 60px rgba(0,0,0,0.6))">
  <div style="position:absolute;left:80px;right:80px;bottom:30px;text-align:center;font-size:19px;line-height:26px;color:rgba(255,255,255,0.55)">21+. Gary AI is not a sportsbook and does not accept or place wagers. Picks are opinions for entertainment and information; results on the public record are real but do not guarantee future results. Gambling problem? Call 1-800-GAMBLER.</div>
</div>'''

# ---------- SYNC'D creative (1080 x 1350) ----------
def syncd_wordmark(size, tracking):
    return ('<span style="font-family:Outfit,\'Avenir Next\',sans-serif;font-weight:300;font-size:%dpx;letter-spacing:%.2fem;color:#2A2E33">SYNC</span>'
            '<span style="font-family:Outfit,\'Avenir Next\',sans-serif;font-weight:300;font-size:%dpx;letter-spacing:%.2fem;color:#5B6CB8">’D</span>' % (size, tracking, size, tracking))

def syncd_chip(dot, border, text):
    return ('<div style="display:inline-flex;align-items:center;gap:10px;height:46px;padding:0px 18px;background:#ffffff;border:1.5px solid %s;border-radius:999px;font-family:\'Hanken Grotesk\',\'Helvetica Neue\',sans-serif;font-weight:500;font-size:23px;color:#2A2E33;white-space:nowrap">'
            '<span style="width:10px;height:10px;border-radius:999px;background:%s"></span>%s</div>' % (border, dot, text))

def syncd_creative():
    return f'''
<div style="position:relative;width:1080px;height:1350px;overflow:hidden;background:linear-gradient(160deg,#D8CFE8 0%,#EAF0EE 46%,#BFD3E6 100%);font-family:'Hanken Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif;color:#2A2E33">
  <div style="position:absolute;left:0;top:0;width:1080px;height:1350px;background:radial-gradient(52% 38% at 50% 104%, rgba(91,108,184,0.34), rgba(91,108,184,0) 100%), radial-gradient(40% 30% at 18% 8%, rgba(255,255,255,0.7), rgba(255,255,255,0) 100%)"></div>
  <div style="position:absolute;left:0;top:78px;width:1080px;text-align:center;line-height:72px">{syncd_wordmark(68, 0.06)}</div>
  <div style="position:absolute;left:0;top:176px;width:1080px;display:flex;flex-direction:column;align-items:center;gap:0px;font-family:Outfit,'Avenir Next',sans-serif;font-weight:300;font-size:68px;line-height:76px;color:#2A2E33">
    <div>Scan any product.</div>
    <div>Get a straight answer.</div>
  </div>
  <div style="position:absolute;left:0;top:372px;width:1080px;display:flex;justify-content:center">
    <div style="display:inline-flex;align-items:center;height:60px;padding:0px 30px;border:2px solid #5B6CB8;border-radius:999px;font-family:'Hanken Grotesk','Helvetica Neue',sans-serif;font-weight:600;font-size:32px;color:#46559C">Free. No sign-in needed.</div>
  </div>
  <div style="position:absolute;left:390px;top:478px;width:300px;height:300px;border-radius:999px;background:radial-gradient(circle at 34% 28%, #9aa7e6 0%, #5B6CB8 48%, #3a4789 100%);box-shadow:0px 34px 70px rgba(70,85,156,0.45), inset 0px -18px 40px rgba(0,0,0,0.18), inset 0px 14px 30px rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center">{svg_brackets(150, 'rgba(255,255,255,0.95)')}</div>
  <div style="position:absolute;left:147px;top:650px;width:786px;box-sizing:border-box;padding:34px 44px 40px 44px;background:rgba(255,255,255,0.94);border:1px solid rgba(255,255,255,0.9);border-radius:36px;box-shadow:0px 26px 60px rgba(42,46,51,0.16);display:flex;flex-direction:column;gap:20px">
    <div style="display:flex;align-items:center;gap:14px">
      {svg_viewfinder(28, '#5A6470')}
      <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:24px;letter-spacing:0.2em;color:#6B7682">SCAN RESULT</div>
      <div style="margin-left:auto;line-height:32px">{syncd_wordmark(30, 0.06)}</div>
    </div>
    <div style="height:0px;border-top:2px dotted #D7DBEA"></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:20px;letter-spacing:0.22em;color:#5B6CB8">JIF</div>
      <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:400;font-size:40px;line-height:46px;color:#2A2E33">Creamy Peanut Butter</div>
    </div>
    <div style="display:flex;align-items:center;gap:24px">
      <div style="width:100px;height:100px;flex:0 0 100px;border-radius:999px;border:3px solid #DFC498;background:#F7F5EF;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0px">
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:300;font-size:50px;line-height:50px;color:#2A2E33">56</div>
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:12px;letter-spacing:0.14em;color:#6B7682">/ 100</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:400;font-size:44px;line-height:48px;color:#2A2E33">Middle of the aisle.</div>
        <div style="display:inline-flex;align-self:flex-start;align-items:center;gap:8px;height:36px;padding:0px 16px;border-radius:999px;background:#F4E9D5;font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:20px;letter-spacing:0.12em;color:#8F6420"><span style="width:8px;height:8px;border-radius:999px;background:#C8923E"></span>MID BAND</div>
      </div>
    </div>
    <div style="margin:4px -44px 0px -44px;padding:0px 44px;display:flex;gap:12px;overflow:hidden;white-space:nowrap;-webkit-mask-image:linear-gradient(90deg,#000 82%,rgba(0,0,0,0) 100%);mask-image:linear-gradient(90deg,#000 82%,rgba(0,0,0,0) 100%)">
      {syncd_chip('#A04A33', '#EBCFC6', 'Has palm oil')}
      {syncd_chip('#A04A33', '#EBCFC6', 'Recall on record (2022)')}
      {syncd_chip('#C8923E', '#EEDDBF', '1 empty marketing claim')}
      {syncd_chip('#C8923E', '#EEDDBF', '4 ingredients worth watching')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:24px;margin-top:4px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:22px;letter-spacing:0.18em;color:#6B7682">INGREDIENTS</div>
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:44px;line-height:48px;color:#2A2E33">3 clean · 4 watch</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:22px;letter-spacing:0.18em;color:#6B7682">CLEANER PICK</div>
        <div style="font-family:Outfit,'Avenir Next',sans-serif;font-weight:500;font-size:44px;line-height:48px;color:#2E6B4F">Peanuts + salt</div>
      </div>
    </div>
  </div>
  <div style="position:absolute;left:80px;right:80px;bottom:34px;text-align:center;font-size:19px;line-height:26px;color:#5A6470">General information, not medical advice. Scores come from public data and published ingredient watchlists. Brands, certifications and sponsorships never influence a score. Method at syncdbymadison.com/methodology.</div>
</div>'''

# ---------- feed mock (600 wide, X light theme) ----------
def feed(avatar, name, handle, body, app_name, rating_html, creative_html):
    scale = 490 / 1080
    return f'''
<div style="width:600px;box-sizing:border-box;padding:14px 16px 18px 16px;background:#ffffff;font-family:{SYS};color:#0f1419">
  <div style="display:flex;gap:14px;align-items:flex-start">
    <img src="{avatar}" alt="" style="width:64px;height:64px;border-radius:14px;flex:0 0 64px">
    <div style="display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:23px;font-weight:700;line-height:28px;color:#0f1419">{name}</span>
        {svg_check_badge(22, '#E2B13C')}
        <span style="font-size:22px;line-height:28px;color:#536471">{handle}</span>
        <span style="margin-left:auto;font-size:22px;line-height:28px;color:#536471">Ad &nbsp;···</span>
      </div>
      <div style="font-size:23px;line-height:30px;color:#0f1419">{body}</div>
    </div>
  </div>
  <div style="margin:14px 0px 0px 78px;width:490px;border:1px solid #cfd9de;border-radius:16px;overflow:hidden;background:#ffffff">
    <div style="width:490px;height:612px;overflow:hidden">
      <div style="width:1080px;height:1350px;transform:scale({scale:.6f});transform-origin:0 0">{creative_html}</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px 16px 18px;border-top:1px solid #cfd9de">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div style="font-size:22px;font-weight:700;line-height:26px;color:#0f1419;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{app_name}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:20px;line-height:24px;color:#536471">{rating_html}</div>
      </div>
      <div style="margin-left:auto;flex:0 0 auto;height:54px;padding:0px 26px;border-radius:999px;background:#0f1419;color:#ffffff;font-size:22px;font-weight:700;display:flex;align-items:center">Install</div>
    </div>
  </div>
</div>'''

def doc(fonts, extra_css, body):
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
    {fonts}
    body {{ margin: 0; background: #e9e9ec; }}
    a {{ color: #5B6CB8; }} a:hover {{ color: #46559C; }}
    {extra_css}
  </style>
</helmet>
{body}
</x-dc>
</body>
</html>'''

stars_gary = ''.join([svg_star(18, '#536471')]*4 + [svg_star(18, '#536471', half=True)]) + '<span>4.5 · 4 ratings</span>'
gary_feed = feed('gary-app-icon.png', 'Gary AI', '@BetwithGary',
                 'Gary makes picks for every game, free in the app, with reasoning for every game.',
                 'Gary AI - Sports Betting Picks', stars_gary, gary_creative())
syncd_feed = feed('syncd-app-icon.png', 'SYNC’D', '@syncdbymadison',
                  'Scan any product and get a straight answer: a 0 to 100 score, an ingredient-by-ingredient read, and live recall research. Free, no sign-in needed.',
                  'SYNC’D by Madison', '<span>New on the App Store</span>', syncd_creative())

(W/'Main.dc.html').write_text(doc(GARY_FONTS, 'body { background: #ffffff; }', gary_feed))
(W/'GaryCreative.dc.html').write_text(doc(GARY_FONTS, '', gary_creative()))
(W/'SyncdFeed.dc.html').write_text(doc(SYNCD_FONTS, 'body { background: #ffffff; }', syncd_feed))
(W/'SyncdCreative.dc.html').write_text(doc(SYNCD_FONTS, '', syncd_creative()))
for n in ['Main.dc.html','GaryCreative.dc.html','SyncdFeed.dc.html','SyncdCreative.dc.html']:
    print(n, (W/n).stat().st_size)
