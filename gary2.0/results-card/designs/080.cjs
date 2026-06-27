// 080 — "Index Card Catalog" — faithful data-injection into the founder's source design.
// Keeps the bordered index-card, numbered 01-06 rows, WON/LOST stamp boxes, and FILED stamp.
// Surfaces the $100-flat-stake P/L per row and makes the day NET the hero money figure (replaces +units).
const CHIP = { MLB: '#2456b3', WC: '#1f9d4d', NBA: '#0a7d4e', NHL: '#d27a1e', NFL: '#5FAE72' };
const LEAGUE = { MLB: 'MLB', WC: 'WORLD CUP', NBA: 'NBA', NHL: 'NHL', NFL: 'NFL' };
const minus = (s) => String(s).replace(/-/g, '&minus;');
const money = (n) => (n >= 0 ? '+$' : '&minus;$') + Math.abs(n).toFixed(2);

module.exports = function inject(html, card, bear) {
  // Each row = three things only: big league tag, big pick name, big +/- money (green win / red loss).
  const ROWS = card.picks.map((p, i) => {
    const win = p.result === 'won';
    const chip = CHIP[p.league] || '#2456b3';
    const league = LEAGUE[p.league] || p.league;
    const dollarColor = win ? '#3aa862' : '#d65a4d';
    return `
        <div class="row">
          <div class="idx">${String(i + 1).padStart(2, '0')}</div>
          <div class="pickcol">
            <div class="sportline">
              <span class="chip" style="background:${chip}"></span>
              <span class="sport">${league}</span>
            </div>
            <div class="pick">${minus(p.name)}</div>
          </div>
          <div class="pl" style="color:${dollarColor}">${money(p.profit)}</div>
        </div>`;
  }).join('\n');

  const winPct = Math.round((card.wins / (card.wins + card.losses)) * 100);
  const netColor = card.net >= 0 ? '#C9A227' : '#cf4b3e';

  return html
    // recolor net hero if negative
    // header field code
    .replace('CARD No. 0623-26', `CARD No. ${card.cardShort.replace(/[^0-9]/g, '').slice(0, 4)}-26`)
    // record (day W-L) hero
    .replace('5&#8202;-&#8202;1', `${card.wins}&#8202;-&#8202;${card.losses}`)
    // UNITS field -> NET dollars hero money, ROI sub -> win rate
    .replace('<div class="lbl">Units</div>', '<div class="lbl">Net / $100 stake</div>')
    .replace(
      '<div class="val">+6.4u</div>',
      `<div class="val" style="color:${netColor};font-size:46px">${card.netLabel.replace('+$', '+$').replace('-$', '&minus;$')}</div>`
    )
    .replace('<div class="sub">ROI +106%</div>', `<div class="sub">${winPct}% won &middot; ${card.wins}/${card.wins + card.losses}</div>`)
    // date filed
    .replace('JUN 23<br>2026', card.cardShort.toUpperCase().replace(',', '').replace(/(\w+) (\d+) (\d+)/, '$1 $2<br>$3'))
    .replace('<div class="sub">6 GRADED</div>', `<div class="sub">${card.picks.length} GRADED</div>`)
    // body rows (function replacer so $ in dollar P/L is not treated as a backreference)
    .replace(/(<div class="body">)[\s\S]*?(<\/div>\s*<div class="filed">)/, (m, a, b) => `${a}\n${ROWS}\n\n      ${b}`)
    // YTD on the year
    .replace('YTD 184&minus;159', `YTD ${card.ytd.w}&minus;${card.ytd.l}`)
    .replace(
      '<div class="pct">.537 · every result graded, win or loss</div>',
      `<div class="pct">.${String(Math.round((card.ytd.w / (card.ytd.w + card.ytd.l)) * 1000)).padStart(3, '0')} · every result graded, win or loss</div>`
    )
    .replace('{{BEAR}}', bear);
};
