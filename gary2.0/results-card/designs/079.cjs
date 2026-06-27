// 079 — "Asymmetric Type Poster" (big tilted record number + THE RECEIPT list).
// Faithful data inject: swaps date / record / net / season + rebuilds the 6 receipt rows
// with real picks AND surfaces each pick's $100-flat-stake P/L, keeping the exact CSS/layout.
// Minimal treatment (matches the approved lead card): each row carries ONLY three things —
// the league/sport tag (large), the pick name (large), and the +/- P/L (green win / red loss).
const money = (n) => (n == null ? '—' : (n >= 0 ? '+$' : '−$') + Math.abs(n).toFixed(2));
const LEAGUE = { MLB: 'MLB', WC: 'WORLD CUP', NBA: 'NBA', NHL: 'NHL', NFL: 'NFL' };

module.exports = function inject(html, card, bear) {
  const total = card.picks.length;
  const rate = total ? Math.round((card.wins / total) * 100) : 0;

  const ROWS = card.picks.map((p) => {
    const win = p.result === 'won';
    const league = LEAGUE[p.league] || p.league;
    return `
      <div class="row">
        <div class="league">${league}</div>
        <div class="pick">
          <div class="title">${p.name}</div>
        </div>
        <div class="result">
          <div class="money" style="color:${win ? '#5BD08A' : '#F0736B'}">${money(p.profit)}</div>
        </div>
      </div>`;
  }).join('\n');

  return html
    .replace('Mon · June 23, 2026', card.cardLong)
    .replace('<span>5</span><span class="dash">–</span><span>1</span>',
             `<span>${card.wins}</span><span class="dash">–</span><span>${card.losses}</span>`)
    .replace('+4.1u', card.netLabel)
    .replace('on the day', 'on the day')
    .replace('ON THE YEAR&nbsp;&nbsp;<b>147–118</b>&nbsp;&nbsp;·&nbsp;&nbsp;55.5%',
             `ON THE YEAR&nbsp;&nbsp;<b>${card.ytd.w}–${card.ytd.l}</b>&nbsp;&nbsp;·&nbsp;&nbsp;${rate}% today`)
    .replace('6 graded · 5 W / 1 L', `${total} graded · ${card.wins} W / ${card.losses} L`)
    .replace(/<div class="row">[\s\S]*<!-- FOOTER -->/,
             `${ROWS}\n    </div>\n\n    <!-- FOOTER -->`)
    .replace('{{BEAR}}', bear);
};
