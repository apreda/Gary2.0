import base64, pathlib
W = pathlib.Path(__file__).parent
def b64(p): return base64.b64encode((W/p).read_bytes()).decode()
def face(family, file, weight):
    return ("@font-face{font-family:'%s';src:url(data:font/ttf;base64,%s) format('truetype');"
            "font-weight:%d;font-style:normal;font-display:block;}" % (family, b64(file), weight))
FONTS = (face('Bebas Neue','BebasNeue-Regular.sub.ttf',400) + face('Barlow Condensed','BarlowCondensed-Bold.sub.ttf',700)
         + face('JetBrains Mono','JetBrainsMono-Bold.sub.ttf',700))
SYS = "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif"
BEBAS = "'Bebas Neue', Impact, sans-serif"
BARLOW = "'Barlow Condensed', 'Arial Narrow', sans-serif"
MONO = "'JetBrains Mono', Menlo, monospace"
GOLD = '#C9A227'; INK = '#0A0908'; LOSS = '#E5484D'
WHITE = '#F5F1E8'
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

def root(inner, bg=None):
    bg = bg or f"linear-gradient(180deg,{INK} 0%,#0f0d09 60%,#17130b 100%)"
    return (f'<div style="position:relative;width:1080px;height:1350px;overflow:hidden;background:{bg};'
            f'font-family:{SYS};color:{WHITE};box-sizing:border-box">{inner}</div>')

def footer(tagline='Free in the App Store'):
    return f'''
  <div style="position:absolute;left:72px;right:72px;bottom:56px;display:flex;flex-direction:column;gap:18px">
    <div style="height:0px;border-top:1px solid rgba(201,162,39,0.35)"></div>
    <div style="display:flex;align-items:center;gap:16px">
      <img src="gary-mark.png" alt="" style="width:56px;height:56px">
      <div style="font-family:{BEBAS};font-size:38px;line-height:38px;letter-spacing:0.05em;color:{GOLD}">GARY A.I.</div>
      <div style="margin-left:auto;font-size:26px;line-height:30px;color:rgba(245,241,232,0.8)">{tagline}</div>
    </div>
    <div style="font-size:15px;line-height:20px;color:rgba(245,241,232,0.42)">21+. Gary AI is not a sportsbook. Picks are opinions; results do not guarantee future results. Gambling problem? Call 1-800-GAMBLER.</div>
  </div>'''

def eyebrow(text, color=GOLD):
    return f'<div style="font-family:{BARLOW};font-weight:700;font-size:26px;line-height:30px;letter-spacing:0.14em;color:{color}">{text}</div>'

# 1 — RECEIPTS: the season ledger, both columns
def receipts():
    inner = f'''
  <div style="position:absolute;left:72px;top:72px;right:72px;display:flex;flex-direction:column;gap:26px">
    {eyebrow('MLB · 2026 SEASON · MARCH 25 TO SEPTEMBER 8')}
    <div style="display:flex;align-items:baseline;gap:22px">
      <div style="font-family:{BEBAS};font-size:360px;line-height:300px;letter-spacing:-0.01em;color:{WHITE}">1,769</div>
      <div style="font-family:{BEBAS};font-size:64px;line-height:64px;letter-spacing:0.04em;color:rgba(245,241,232,0.6)">picks</div>
    </div>
    <div style="height:0px;border-top:1px solid rgba(255,255,255,0.12)"></div>
    <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:40px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-family:{BEBAS};font-size:236px;line-height:206px;color:{GOLD}">930</div>
        {eyebrow('CASHED')}
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-family:{BEBAS};font-size:236px;line-height:206px;color:rgba(245,241,232,0.55)">839</div>
        {eyebrow('LOST', 'rgba(245,241,232,0.55)')}
      </div>
    </div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:900px;display:flex;flex-direction:column;gap:14px">
    <div style="font-family:{BEBAS};font-size:86px;line-height:82px;color:{WHITE}">Every one of them is on the record.</div>
    <div style="font-size:32px;line-height:40px;color:rgba(245,241,232,0.72)">Wins and losses, graded and posted by morning. That is the whole pitch.</div>
  </div>
  {footer()}'''
    return root(inner)

# 2 — THE BAD NIGHT: a losing night, run as an ad
SEP8 = [
 ('Tigers ML −132',    'Twins 3, Tigers 2',       'LOST'),
 ('Orioles ML −118',   'Guardians 9, Orioles 5',  'LOST'),
 ('Red Sox ML −144',   'Angels 6, Red Sox 1',     'LOST'),
 ('Marlins ML −124',   'Mets 7, Marlins 5',       'LOST'),
 ('Phillies ML −142',  'Astros 6, Phillies 5',    'LOST'),
 ('Yankees −1.5 −162', 'Yankees 5, Rockies 3',    'CASHED'),
 ('White Sox ML −146', 'Pirates 9, White Sox 3',  'LOST'),
 ('Rays ML −102',      'Rays 7, Braves 1',        'CASHED'),
 ('Royals ML +102',    'D-backs 5, Royals 3',     'LOST'),
 ('Brewers −1.5 +100', 'Brewers 4, Cubs 3',       'LOST'),
 ('Rangers ML +114',   'Rangers 10, Mariners 5',  'CASHED'),
]
def bad_night():
    rows = ''
    for pick, final, stamp in SEP8:
        col = GOLD if stamp == 'CASHED' else LOSS
        rows += (f'<div style="display:flex;align-items:center;gap:20px;height:60px;border-top:1px solid rgba(255,255,255,0.09)">'
                 f'<div style="flex:0 0 330px;font-family:{BARLOW};font-weight:700;font-size:31px;color:{WHITE}">{pick}</div>'
                 f'<div style="flex:1 1 auto;font-family:{MONO};font-weight:700;font-size:22px;letter-spacing:0.02em;color:rgba(245,241,232,0.62)">{final}</div>'
                 f'<div style="flex:0 0 auto;font-family:{BEBAS};font-size:30px;letter-spacing:0.08em;color:{col}">{stamp}</div></div>')
    inner = f'''
  <div style="position:absolute;left:72px;top:72px;right:72px;display:flex;flex-direction:column;gap:18px">
    {eyebrow('TUESDAY, SEPTEMBER 8 · MLB')}
    <div style="font-family:{BEBAS};font-size:150px;line-height:132px;color:{WHITE}">Tuesday was <span style="color:{LOSS}">3–8.</span></div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:360px;display:flex;flex-direction:column">
    {rows}
    <div style="height:0px;border-top:1px solid rgba(255,255,255,0.09)"></div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:1058px;font-size:34px;line-height:42px;color:rgba(245,241,232,0.8)">Same ledger as the good nights. Posted by morning, every night.</div>
  {footer()}'''
    return root(inner)

# 3 — 5:07 PM: the moment of use, answered with the real slate
SLATE = [
 ('6:35', 'Guardians at Orioles',   'Orioles ML −118'),
 ('6:40', 'Twins at Tigers',        'Tigers ML −132'),
 ('6:40', 'Mets at Marlins',        'Marlins ML −124'),
 ('6:40', 'Astros at Phillies',     'Phillies ML −142'),
 ('6:45', 'Angels at Red Sox',      'Red Sox ML −144'),
 ('7:05', 'Rockies at Yankees',     'Yankees −1.5 −162'),
 ('7:15', 'Rays at Braves',         'Rays ML −102'),
 ('7:40', 'Pirates at White Sox',   'White Sox ML −146'),
 ('7:40', 'D-backs at Royals',      'Royals ML +102'),
 ('7:40', 'Cubs at Brewers',        'Brewers −1.5 +100'),
 ('9:40', 'Rangers at Mariners',    'Rangers ML +114'),
]
def five_oh_seven():
    rows = ''
    for t, m, p in SLATE:
        rows += (f'<div style="display:flex;align-items:center;gap:22px;height:54px;border-top:1px solid rgba(255,255,255,0.09)">'
                 f'<div style="flex:0 0 96px;font-family:{MONO};font-weight:700;font-size:22px;color:rgba(245,241,232,0.5)">{t}</div>'
                 f'<div style="flex:1 1 auto;font-size:27px;color:rgba(245,241,232,0.86)">{m}</div>'
                 f'<div style="flex:0 0 auto;font-family:{BARLOW};font-weight:700;font-size:30px;color:{GOLD}">{p}</div></div>')
    inner = f'''
  <div style="position:absolute;left:72px;top:60px;right:72px;display:flex;flex-direction:column;gap:6px">
    <div style="font-family:{BEBAS};font-size:210px;line-height:186px;letter-spacing:-0.01em;color:{GOLD}">5:07 PM.</div>
    <div style="font-family:{BEBAS};font-size:100px;line-height:94px;color:{WHITE}">Who do I bet tonight?</div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:392px;display:flex;flex-direction:column;gap:14px">
    {eyebrow('TUESDAY · 11 GAMES · GARY’S PICK ON EVERY ONE')}
    <div style="display:flex;flex-direction:column">{rows}<div style="height:0px;border-top:1px solid rgba(255,255,255,0.09)"></div></div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:1072px;font-size:32px;line-height:40px;color:rgba(245,241,232,0.8)">A pick for every game, with the reasoning, by the time you are asking.</div>
  {footer('Free · every game · every day')}'''
    return root(inner)

# 4 — GROUP CHAT: Gary as the friend who actually knows
def bubble(text, side, gold=False):
    if side == 'left':
        return (f'<div style="align-self:flex-start;max-width:720px;padding:22px 30px;border-radius:34px 34px 34px 8px;background:#26221c;'
                f'font-size:38px;line-height:48px;color:{WHITE}">{text}</div>')
    return (f'<div style="align-self:flex-end;display:flex;align-items:flex-end;gap:14px;max-width:820px">'
            f'<div style="padding:22px 30px;border-radius:34px 34px 8px 34px;background:{GOLD};font-size:38px;line-height:48px;color:{INK}">{text}</div>'
            f'<img src="gary-mark.png" alt="" style="width:52px;height:52px;flex:0 0 52px"></div>')
def group_chat():
    inner = f'''
  <div style="position:absolute;left:72px;top:72px;right:72px;display:flex;flex-direction:column;gap:14px">
    <div style="font-family:{BEBAS};font-size:96px;line-height:88px;color:{WHITE}">The <span style="color:{GOLD}">sharpest friend</span> in the group chat.</div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:330px;display:flex;flex-direction:column;gap:24px">
    {bubble('who you got tonight', 'left')}
    {bubble('Rangers +114. Quantrill has 19 strikeouts against two walks over his last three starts, and Miller hasn’t finished five innings in his last three. Texas gets to the late innings ahead.', 'right')}
    {bubble('you sure?', 'left')}
    {bubble('It’s on the record by morning either way.', 'right')}
    <div style="align-self:flex-start;display:flex;align-items:center;gap:16px;margin-top:10px;padding:14px 22px;border:1px solid rgba(201,162,39,0.4);border-radius:14px">
      {eyebrow('FINAL')}<div style="font-family:{MONO};font-weight:700;font-size:24px;color:rgba(245,241,232,0.8)">Rangers 10, Mariners 5</div>
      <div style="font-family:{BEBAS};font-size:30px;letter-spacing:0.08em;color:{GOLD}">CASHED</div>
    </div>
  </div>
  {footer('Free · every game · with the reasoning')}'''
    return root(inner)

# 5 — THE REASONING: one real pick, the whole argument, untrimmed
RAYS = [
 "I expect Tampa Bay to get ahead against AJ Smith-Shawver, receive the longer start from Freddy Peralta and leave Kelly and Wells a manageable finish. Peralta has 17 strikeouts and one walk in his last 19 innings. Smith-Shawver has nine walks in his last 13⅓ innings and has not completed more than five innings in any of his four starts. That gives Tampa Bay opportunities to score and a reasonable expectation of needing fewer relief innings.",
 "The Rays have hitters positioned to use those opportunities. Yandy Díaz is 10-for-30 over the last seven days, while Jonathan Aranda is 7-for-23 with two homers. Liam Hicks has a .890 OPS against right-handed pitching this season. I expect that group to produce against Smith-Shawver before Atlanta can bring in left-handers Dylan Lee and Dylan Dodd. Aranda and Hicks have weaker season splits against lefties, so scoring early matters.",
 "The bullpen comparison keeps this competitive. Atlanta allowed three earned runs in 12⅓ relief innings in Philadelphia; Tampa Bay allowed 10 in 13⅔ innings in Texas. But the Rays had Monday off. Kevin Kelly’s three appearances from September 4–6 totaled 34 pitches, and Tyler Wells last worked September 5, delivering two scoreless innings. Wells’ demonstrated ability to cover multiple innings gives Tampa Bay some flexibility if Peralta’s start ends a little earlier than expected. Rest improves the available options; it does not erase the recent mistakes.",
 "My main assumption is that Peralta’s recent command carries into this Atlanta lineup. Michael Harris II and Drake Baldwin each have a .500 slugging percentage against four-seamers in their supplied season samples, and Ronald Acuña Jr. brings strong recent production. If they force Peralta out early while Smith-Shawver’s splitter keeps Tampa Bay contained, Atlanta can reach its available late relievers ahead. That is the strongest path against this bet.",
 "The batting orders remain provisional. My finishing expectation rests on Kelly and Wells, with Tampa Bay’s closer availability still unconfirmed. A confirmed change to the Rays’ expected top four or a pregame restriction on Wells could change the judgment. With those assumptions stated, the early offensive matchup, starter command and available finishing options support the endorsed ticket.",
]
def reasoning():
    paras = ''.join(f'<p style="margin:0px;font-size:24px;line-height:33px;color:rgba(245,241,232,0.86)">{p}</p>' for p in RAYS)
    inner = f'''
  <div style="position:absolute;left:72px;top:64px;right:72px;display:flex;flex-direction:column;gap:22px">
    <div style="font-family:{BEBAS};font-size:78px;line-height:74px;color:{WHITE}">Every pick comes with <span style="color:{GOLD}">the reasoning.</span></div>
    <div style="display:flex;align-items:center;gap:18px;padding:18px 24px;border:1px solid rgba(255,255,255,0.12);border-radius:18px;background:rgba(255,255,255,0.03)">
      <div style="font-family:{BARLOW};font-weight:700;font-size:38px;color:{WHITE}">Rays ML −102</div>
      <div style="font-size:24px;color:rgba(245,241,232,0.6)">at Braves · Tuesday, September 8</div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:14px">
        <div style="font-family:{MONO};font-weight:700;font-size:22px;color:rgba(245,241,232,0.7)">7–1</div>
        <div style="font-family:{BEBAS};font-size:30px;letter-spacing:0.08em;color:{GOLD}">CASHED</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:15px">{paras}</div>
  </div>
  {footer('Free · every game · the whole case')}'''
    return root(inner)

# 6 — EVERY GAME: the offer, stated
def every_game():
    inner = f'''
  <div style="position:absolute;left:72px;top:96px;right:72px;display:flex;flex-direction:column;gap:0px;font-family:{BEBAS};font-size:184px;line-height:168px;letter-spacing:-0.005em;color:{WHITE}">
    <div>Every game.</div>
    <div>Every day.</div>
    <div style="color:{GOLD}">Free.</div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:690px;display:flex;flex-direction:column;gap:14px">
    <div style="height:0px;border-top:1px solid rgba(201,162,39,0.35)"></div>
    <div style="font-size:38px;line-height:50px;color:rgba(245,241,232,0.86)">A pick for every game, with the reasoning written out. Every result graded and posted by morning, wins and losses.</div>
  </div>
  <img src="gary-mark.png" alt="" style="position:absolute;right:72px;top:920px;width:230px;height:230px;filter:drop-shadow(0px 20px 40px rgba(0,0,0,0.6))">
  {footer()}'''
    return root(inner)

OUT = {
 'Receipts.dc.html': receipts(), 'BadNight.dc.html': bad_night(), 'FiveOhSeven.dc.html': five_oh_seven(),
 'GroupChat.dc.html': group_chat(), 'Reasoning.dc.html': reasoning(), 'EveryGame.dc.html': every_game(),
}
for n, html in OUT.items():
    (W/n).write_text(doc(html)); print(n, (W/n).stat().st_size)
