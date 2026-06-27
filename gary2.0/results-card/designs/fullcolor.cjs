// fullcolor — the founder's LEAD design: full-bleed green/red result blocks (the blocks ARE the whole card).
// Each block shows only the league/sport tag (large), the pick name (large), and the +/- $100-stake money
// (green win / red loss — the COLOR carries win/loss; no odds, no check mark). Self-building: it ignores the
// (stub) source HTML and renders the entire card from `card`.
const DOT = { MLB: '#2C5FA6', WC: '#E0B43A', NBA: '#C7541F', NHL: '#6FA0C2', NFL: '#178A5A' };
const dash = (s) => String(s).replace('-', '&ndash;');

module.exports = function inject(_html, card, bear) {
  const cells = card.picks.map((p) => {
    const win = p.result === 'won';
    return `
      <div class="cell ${win ? 'win' : 'loss'}">
        <div class="ctop"><span class="lg"><span class="dot" style="background:${DOT[p.league] || '#888'}"></span>${p.league}</span></div>
        <div class="cmid">${p.name}</div>
        <div class="cbot"><div class="pl ${win ? 'w' : 'l'}">${p.profitLabel}</div></div>
      </div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&family=JetBrains+Mono:wght@600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-family:'Inter',sans-serif;}
body{width:1080px;height:1350px;background:#0A0A0A;display:flex;flex-direction:column;overflow:hidden;}
.top{display:flex;justify-content:space-between;align-items:center;padding:30px 36px 24px;}
.brand{display:flex;align-items:center;gap:14px;}
.brand img{width:54px;height:54px;border-radius:10px;}
.wm{font-weight:900;font-size:32px;color:#F4F1E8;line-height:1;}
.wm b{color:#C9A227;}
.sub{font-family:'JetBrains Mono',monospace;font-weight:600;font-size:13px;letter-spacing:2px;color:#8E8A7E;margin-top:6px;text-transform:uppercase;}
.rec{display:flex;align-items:baseline;gap:18px;}
.rec .r{font-family:'JetBrains Mono',monospace;font-weight:800;font-size:60px;color:#F4D77A;line-height:1;letter-spacing:-2px;}
.rec .n{text-align:right;}
.rec .n .big{font-family:'JetBrains Mono',monospace;font-weight:800;font-size:34px;color:#EDE9DF;line-height:1;}
.rec .n .lbl{font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;letter-spacing:2px;color:#8E8A7E;text-transform:uppercase;margin-top:4px;}
.grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:12px;padding:0 14px;}
.cell{border-radius:18px;padding:30px 32px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,0.12);box-shadow:0 24px 44px rgba(0,0,0,0.6), 0 6px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12);}
.cell.win{background:radial-gradient(320px 210px at 50% -8%, rgba(82,192,132,0.40), transparent 72%), linear-gradient(168deg, rgba(36,70,52,0.98), rgba(9,18,13,0.98));border-color:rgba(74,168,112,0.50);box-shadow:0 24px 46px rgba(0,0,0,0.6), 0 0 36px rgba(46,130,86,0.16), inset 0 1px 0 rgba(150,235,190,0.24), inset 0 -30px 50px rgba(0,0,0,0.34);}
.cell.loss{background:radial-gradient(320px 210px at 50% -8%, rgba(222,82,82,0.42), transparent 72%), linear-gradient(168deg, rgba(66,28,28,0.98), rgba(20,9,9,0.98));border-color:rgba(190,76,76,0.52);box-shadow:0 24px 46px rgba(0,0,0,0.6), 0 0 36px rgba(150,50,50,0.16), inset 0 1px 0 rgba(240,150,150,0.22), inset 0 -30px 50px rgba(0,0,0,0.34);}
.ctop{display:flex;justify-content:space-between;align-items:flex-start;}
.lg{font-family:'JetBrains Mono',monospace;font-weight:800;font-size:30px;letter-spacing:3px;color:#E6E2D6;background:rgba(255,255,255,0.10);padding:11px 22px;border-radius:12px;display:flex;align-items:center;gap:13px;text-transform:uppercase;}
.lg .dot{width:16px;height:16px;border-radius:50%;}
.cmid{font-weight:800;font-size:82px;line-height:0.94;color:#F4F1E8;letter-spacing:-0.5px;}
.cbot{display:flex;flex-direction:column;gap:14px;}
.pl{font-family:'JetBrains Mono',monospace;font-weight:800;font-size:66px;letter-spacing:-1px;line-height:1;}
.pl.w{color:#4FD17F;}
.pl.l{color:#F0736B;}
.bot{display:flex;justify-content:space-between;align-items:center;padding:20px 36px 26px;}
.bot .t{font-family:'JetBrains Mono',monospace;font-weight:600;font-size:15px;letter-spacing:1px;color:#8E8A7E;}
.bot .site{font-weight:800;font-size:22px;color:#C9A227;}
</style></head>
<body>
  <div class="top">
    <div class="brand"><img src="${bear}"><div><div class="wm">GARY <b>A.I.</b></div><div class="sub">Daily Results &middot; ${card.cardShort}</div></div></div>
    <div class="rec"><div class="r">${dash(card.record)}</div><div class="n"><div class="big">${card.netLabel}</div><div class="lbl">Net &middot; $100 / pick</div></div></div>
  </div>
  <div class="grid">${cells}</div>
  <div class="bot"><span class="t">Every result graded, win or loss.</span><span class="site">betwithgary.ai</span></div>
</body></html>`;
};
