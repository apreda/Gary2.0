# N1 with the live card (Sep 9 2026, 6:53 PM: Seahawks ML -176 as it sits on the Picks board).
from build4 import doc, root, brand, cta, headline, W
def n1_live():
    card = '<img src="card-sea-ml.png" alt="" style="position:absolute;left:100px;top:420px;width:880px;filter:drop-shadow(0px 24px 50px rgba(0,0,0,0.55))">'
    return root(brand() + headline(['Read why', 'before kickoff.'], size=124, lh=112, gold_last=True) + card + cta())
(W/'NflTonightLive.dc.html').write_text(doc(n1_live())); print('NflTonightLive.dc.html')
