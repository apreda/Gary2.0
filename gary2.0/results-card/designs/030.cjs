// 030 — "Confusion Matrix Grid" (dark quant terminal). Injects real Winners data into the source design.
// Faithful: only swaps data via targeted string-replace, preserves all CSS/layout. Adds $100-stake P/L per tile + NET hero.
const CHIP = { MLB: '#2C5FA6', WC: '#E0B43A', NBA: '#178A5A', NHL: '#C7541F', NFL: '#5FAE72' };
const oddsHtml = (o) => (o == null ? 'ML' : o > 0 ? '+' + o : '&minus;' + Math.abs(o));
const money = (n) => (n == null ? '&mdash;' : (n >= 0 ? '+$' : '&minus;$') + Math.abs(n).toFixed(2));

module.exports = function inject(html, card, bear) {
  const total = card.wins + card.losses;
  const acc = total ? (card.wins / total) : 0;
  const accStr = acc.toFixed(3).replace(/^0/, ''); // .667
  const ytdTotal = card.ytd.w + card.ytd.l;
  const ytdAcc = ytdTotal ? (card.ytd.w / ytdTotal).toFixed(3).replace(/^0/, '') : '.000';

  const TILES = card.picks.map((p) => {
    const win = p.result === 'won';
    const cls = win ? 'win' : 'loss';
    const chip = CHIP[p.league] || '#2C5FA6';
    const mk = win ? '&#10003;' : '&#10007;';
    const moneyColor = win ? '#74C99A' : '#E08A8A';
    return `
      <div class="tile ${cls}">
        <div class="tile-top">
          <div class="sport-tag"><span class="chip" style="background:${chip};"></span>${p.league}</div>
          <div class="marker ${win ? 'w' : 'l'}">${mk}</div>
        </div>
        <div class="tile-body">
          <div class="pick-name">${p.name}</div>
          <div class="tile-meta"><span class="res ${win ? 'w' : 'l'}">${win ? 'Win' : 'Loss'}</span><span class="odds">${oddsHtml(p.odds)}</span></div>
          <div class="tile-pl" style="margin-top:12px;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:44px;letter-spacing:-0.5px;color:${moneyColor};">${money(p.profit)}</div>
        </div>
      </div>`;
  }).join('\n');

  // Build season heatmap from this day's results (one cell per pick, in order), padded with neutral if needed.
  const cells = card.picks.map((p) =>
    `<span class="cell" style="background:${p.result === 'won' ? '#3F9D6A' : '#C04C4C'};"></span>`
  ).join('\n        ');

  return html
    .replace('JUN 23, 2026', card.cardShort.toUpperCase())
    .replace('6 picks &middot; settled', `${total} picks &middot; settled`)
    .replace('5<span class="dash">&ndash;</span>1', `${card.wins}<span class="dash">&ndash;</span>${card.losses}`)
    .replace('<div class="stat-lbl">Units</div>', '<div class="stat-lbl">Net &middot; $100/pick</div>')
    .replace('+4.30u', card.netLabel)
    .replace('.833', accStr)
    .replace(/<div class="grid">[\s\S]*?<\/div>\s*<!-- SEASON STRIP -->/, `<div class="grid">${TILES}\n    </div>\n\n    <!-- SEASON STRIP -->`)
    .replace('184<span>&ndash;</span>159', `${card.ytd.w}<span>&ndash;</span>${card.ytd.l}`)
    .replace('&middot; .536 acc', `&middot; ${ytdAcc} acc`)
    .replace(/<div class="heatmap">[\s\S]*?<\/div>/, `<div class="heatmap">\n        ${cells}\n      </div>`)
    .replace('{{BEAR}}', bear);
};
