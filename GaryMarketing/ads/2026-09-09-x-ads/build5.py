import pathlib
from build4 import doc, root, brand, cta, headline, sub, BEBAS, BARLOW, GOLD, INK, WHITE, SYS, W
import build as feedlib

def slot(w, h, top, left=None, compact=False):
    left = left if left is not None else (1080 - w) // 2
    if compact:
        body = (f'<div style="display:flex;align-items:center;gap:22px;padding:0px 36px"><img src="gary-mark.png" alt="" style="width:56px;height:56px;opacity:0.9">'
                f'<div style="display:flex;flex-direction:column;gap:4px"><div style="font-family:{BEBAS};font-size:38px;line-height:38px;letter-spacing:0.04em;color:{GOLD}">Gary’s pick · NE @ SEA · drops before kickoff</div>'
                f'<div style="font-size:20px;line-height:26px;color:rgba(245,241,232,0.62)">PLACEHOLDER: capture the live card from Picks → NFL tonight and drop it in this slot.</div></div></div>')
    else:
        body = (f'<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100%;padding:0px 60px;text-align:center"><img src="gary-mark.png" alt="" style="width:84px;height:84px;opacity:0.9">'
                f'<div style="font-family:{BEBAS};font-size:40px;line-height:40px;letter-spacing:0.05em;color:{GOLD}">Gary’s pick · NE @ SEA · 8:20 PM ET</div>'
                f'<div style="font-family:{BEBAS};font-size:64px;line-height:60px;color:{WHITE}">The real card goes here.</div>'
                f'<div style="font-size:22px;line-height:29px;color:rgba(245,241,232,0.62)">PLACEHOLDER: capture the live pick card from Picks → NFL once it posts tonight, then replace this slot with it.</div></div>')
    return (f'<div style="position:absolute;left:{left}px;top:{top}px;width:{w}px;height:{h}px;box-sizing:border-box;border:3px dashed rgba(201,162,39,0.7);border-radius:36px;'
            f'background:rgba(201,162,39,0.06);display:flex;align-items:center;justify-content:{"flex-start" if compact else "center"}">{body}</div>')

# N1 · TONIGHT — the game strip from Home, and the slot the live card drops into
def n1():
    inner = brand() + headline(['Patriots at Seahawks.', 'Gary has a pick.'], size=118, lh=106, gold_last=True) + \
        '<img src="nfl-home-strip.png" alt="" style="position:absolute;left:100px;top:404px;width:880px;filter:drop-shadow(0px 24px 50px rgba(0,0,0,0.55))">' + \
        slot(760, 470, 636) + cta()
    return root(inner)

# N2 · THE INTEL — real Hub rows for tonight's game, then the slot
def n2():
    inner = brand() + headline(['Patriots at Seahawks.', 'What matters tonight.'], size=118, lh=106, gold_last=True) + \
        f'<div style="position:absolute;left:100px;top:398px;font-family:{BARLOW};font-weight:700;font-size:24px;letter-spacing:0.14em;color:{GOLD}">FROM THE HUB · NE @ SEA · 8:20 PM ET</div>' + \
        '<img src="nfl-hub-field.png" alt="" style="position:absolute;left:100px;top:440px;width:880px;filter:drop-shadow(0px 24px 50px rgba(0,0,0,0.55))">' + \
        slot(880, 150, 940, compact=True) + cta()
    return root(inner)

# N3 · THE OFFER — the app's own launch card: every board free through September
def n3():
    inner = brand() + headline(['NFL is back.', 'Every board is free.'], size=118, lh=106, gold_last=True) + \
        '<img src="launch-card.png" alt="" style="position:absolute;left:100px;top:404px;width:880px;filter:drop-shadow(0px 24px 50px rgba(0,0,0,0.55))">' + \
        sub('Game picks and props, open to everyone through September. A free account before October 1 keeps founding access.', 826, size=30) + \
        slot(880, 150, 930, compact=True) + cta()
    return root(inner)

for n, html in {'NflTonight.dc.html': n1(), 'NflIntel.dc.html': n2(), 'NflOffer.dc.html': n3()}.items():
    (W/n).write_text(doc(html)); print(n, (W/n).stat().st_size)

# N4 · the X feed version of N1
feed_html = feedlib.feed('gary-app-icon.png', 'Gary AI', '@BetwithGary',
    'Patriots at Seahawks tonight. Gary’s pick drops before kickoff, with the reasoning. Free in the app.',
    'Gary AI - Sports Betting Picks', feedlib.stars_gary, n1())
(W/'NflFeed.dc.html').write_text(feedlib.doc(feedlib.GARY_FONTS, 'body { background: #ffffff; }', feed_html)); print('NflFeed.dc.html', (W/'NflFeed.dc.html').stat().st_size)
