"""Free-pick stake post (Sep 29 2026): today's free pick with Gary's Winners stake.
Typographic, no redrawn app card. Run: python3 stake_post.py"""
from build import page, render, ICON

def body(w, h, pad, label_px, h1, sub_px, stake_px, top, gap):
    return f"""
<div style='position:absolute;left:{pad}px;top:{top}px;right:{pad}px'>
  <div class=label style='font-size:{label_px}px'>Today's free pick · MLB postseason</div>
  <div class=h style='font-size:{h1}px;margin-top:{int(label_px*0.5)}px'>Braves<br><span class=gold>to win.</span></div>
  <div class=sub style='font-size:{sub_px}px;margin-top:{int(sub_px*0.8)}px'>Phillies at Braves · Today, 2:00 PM ET</div>
  <div style='margin-top:{gap}px;border-top:2px solid rgba(201,162,39,.35);padding-top:{int(gap*0.55)}px'>
    <div class=label style='font-size:{label_px}px'>Gary's stake</div>
    <div class=h style='font-size:{stake_px}px;margin-top:{int(label_px*0.3)}px'><span class=gold>$400</span></div>
    <div class=sub style='font-size:{sub_px}px;margin-top:{int(sub_px*0.6)}px'>A Winners pick, from his own bankroll.</div>
  </div>
</div>
<div style='position:absolute;left:{pad}px;bottom:{int(pad*0.8)}px;right:{pad}px;display:flex;align-items:center;gap:{int(label_px*0.6)}px'>
  <img src='{ICON}' style='width:{int(label_px*2.4)}px;height:{int(label_px*2.4)}px;border-radius:{int(label_px*0.55)}px'>
  <div><div class=h style='font-size:{int(label_px*1.3)}px'>Gary A.I.</div>
  <div class=legal style='font-size:{int(sub_px*0.62)}px;margin-top:4px'>21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER</div></div>
</div>"""

WIDE = f"""
<div style='position:absolute;left:110px;top:92px'>
  <div class=label style='font-size:34px'>Today's free pick · MLB postseason</div>
  <div class=h style='font-size:200px;margin-top:16px'>Braves<br><span class=gold>to win.</span></div>
  <div class=sub style='font-size:32px;margin-top:26px'>Phillies at Braves · Today, 2:00 PM ET</div>
</div>
<div style='position:absolute;left:1000px;top:250px;padding-left:64px;border-left:2px solid rgba(201,162,39,.35)'>
  <div class=label style='font-size:34px'>Gary's stake</div>
  <div class=h style='font-size:230px;margin-top:8px'><span class=gold>$400</span></div>
  <div class=sub style='font-size:30px;margin-top:18px;width:440px;line-height:1.3'>A Winners pick, from his own bankroll.</div>
</div>
<div style='position:absolute;left:110px;bottom:64px;display:flex;align-items:center;gap:20px'>
  <img src='{ICON}' style='width:72px;height:72px;border-radius:16px'>
  <div><div class=h style='font-size:40px'>Gary A.I.</div>
  <div class=legal style='font-size:20px;margin-top:4px'>21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER</div></div>
</div>"""
render("stake-braves-2026-09-29-1600x900", 1600, 900, page(1600, 900, WIDE, gx="80%", gy="45%"))
render("stake-braves-2026-09-29-1080x1920", 1080, 1920,
       page(1080, 1920, body(1080, 1920, 96, 38, 250, 38, 230, 250, 90), gx="70%", gy="45%"))
