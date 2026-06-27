// 077 — "The Ledger" with the gold rail REMOVED (founder-approved). Injects real data into the source design.
const CHIP = { MLB: '#5C6FB0', WC: '#E0B43C', NBA: '#C97D4A', NHL: '#6FA0C2', NFL: '#5FAE72' };
const money = (n) => (n == null ? '—' : (n >= 0 ? '+$' : '−$') + Math.abs(n).toFixed(2));

module.exports = function inject(html, card, bear) {
  // Minimal row: big league chip + big pick + big green/red money. No odds, no win/loss marker —
  // the green/red of the money (plus the dimmed/red-tinted loss row) is the only win/loss signal.
  const ROWS = card.picks.map((p, i) => {
    const win = p.result === 'won';
    const chip = win ? (CHIP[p.league] || '#5C6FB0') : '#9A958B';
    return `
        <div class="row${win ? '' : ' lost'}">
          <div class="num">${String(i + 1).padStart(2, '0')}</div>
          <div class="body">
            <div class="meta"><span class="sport" style="background:${chip}">${p.league}</span></div>
            <div class="pick">${p.name}</div>
          </div>
          <div class="res ${win ? 'w' : 'l'}">${money(p.profit)}</div>
        </div>`;
  }).join('\n');
  return html
    .replace('Jun 23, 2026', card.cardShort)
    .replace('5<span class="dash">&ndash;</span>1', `${card.wins}<span class="dash">&ndash;</span>${card.losses}`)
    .replace('+4.3u', card.netLabel)
    .replace('+71% ROI', 'on $100 / pick')
    .replace('184&ndash;159', `${card.ytd.w}&ndash;${card.ytd.l}`)
    .replace(/<aside class="rail">[\s\S]*?<\/aside>/, '')
    .replace(/<div class="rows">[\s\S]*?<footer/, `<div class="rows">${ROWS}\n      </div>\n\n      <footer`)
    .replace('{{BEAR}}', bear);
};
