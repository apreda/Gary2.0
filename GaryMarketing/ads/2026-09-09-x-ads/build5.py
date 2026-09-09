import pathlib
from build4 import doc, root, brand, cta, headline, sub, BEBAS, BARLOW, GOLD, INK, WHITE, SYS, W
import build as feedlib

def slot(w, h, top, left=None, compact=False):
    left = left if left is not None else (1080 - w) // 2
    tag = f'<div style="position:absolute;right:28px;bottom:20px;font-family:{BEBAS};font-size:26px;line-height:26px;letter-spacing:0.08em;color:rgba(201,162,39,0.7)">Live pick card</div>'
    return (f'<div style="position:absolute;left:{left}px;top:{top}px;width:{w}px;height:{h}px;box-sizing:border-box;border:3px dashed rgba(201,162,39,0.6);border-radius:36px;background:rgba(201,162,39,0.05)">{tag}</div>')

# N1 · TONIGHT — the game strip from Home, and the slot the live card drops into
def n1():
    inner = brand() + headline(['Read why', 'before kickoff.'], size=124, lh=112, gold_last=True) + slot(880, 575, 420) + cta()
    return root(inner)

# N2 · THE INTEL — real Hub rows for tonight's game, then the slot
def n2():
    inner = brand() + headline(['Read this before you bet.'], size=110, lh=100) + \
        '<img src="nfl-hub-field.png" alt="" style="position:absolute;left:100px;top:300px;width:880px;filter:drop-shadow(0px 24px 50px rgba(0,0,0,0.55))">' + \
        slot(880, 300, 760, compact=True) + cta()
    return root(inner)

# N3 · THE OFFER — the app's own launch card: every board free through September
def n3():
    inner = brand() + headline(['NFL is back.'], size=124, lh=112) + \
        '<img src="launch-card.png" alt="" style="position:absolute;left:100px;top:300px;width:880px;filter:drop-shadow(0px 24px 50px rgba(0,0,0,0.55))">' + \
        slot(880, 330, 730, compact=True) + cta()
    return root(inner)

for n, html in {'NflTonight.dc.html': n1(), 'NflIntel.dc.html': n2(), 'NflOffer.dc.html': n3()}.items():
    (W/n).write_text(doc(html)); print(n, (W/n).stat().st_size)

# N4 · the X feed version of N1
feed_html = feedlib.feed('gary-app-icon.png', 'Gary AI', '@BetwithGary',
    'Patriots at Seahawks tonight. Gary’s pick drops before kickoff, with the reasoning. Free in the app.',
    'Gary AI - Sports Betting Picks', feedlib.stars_gary, n1())
(W/'NflFeed.dc.html').write_text(feedlib.doc(feedlib.GARY_FONTS, 'body { background: #ffffff; }', feed_html)); print('NflFeed.dc.html', (W/'NflFeed.dc.html').stat().st_size)
