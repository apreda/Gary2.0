// 032 — "Trading Heatmap Mosaic" (tiles sized like a heatmap; gold record card).
// Faithful data-injection into the founder's source design. Tile size = $ profit (heatmap).
const money = (n) => (n == null ? '—' : (n >= 0 ? '+$' : '−$') + Math.abs(n).toFixed(2));
const oddsHtml = (o) => (o == null ? 'ML' : o > 0 ? '+' + o : '&minus;' + Math.abs(o));
const dash = (s) => String(s).replace('-', '&ndash;');
// turn a pick name into a 2-line headline (split before ML / Over / Under / handicap)
const nameHtml = (name) => {
  const m = name.match(/^(.*?)\s+(ML|Over .*|Under .*|[+−-][\d.]+.*)$/i);
  if (m) return `${m[1]}<br>${m[2].replace(/^-/, '&minus;')}`;
  return name;
};

// The 6 fixed tile slots in the source, in visual-size order (biggest first).
// 4 win slots (big→small) then 2 loss slots (the bottom-right stack).
const WIN_SLOTS = ['t-dodgers', 't-celtics', 't-brazil', 't-oilers'];
const LOSS_SLOTS = ['t-mbappe', 't-judge'];

module.exports = function inject(html, card, bear) {
  const wins = card.picks.filter((p) => p.result === 'won').slice().sort((a, b) => b.profit - a.profit);
  const losses = card.picks.filter((p) => p.result !== 'won');

  const tileHtml = (p, cls) => {
    const win = p.result === 'won';
    return `
      <div class="tile ${win ? 'win' : 'loss'} ${cls}">
        <div class="top">
          <span class="sporttag">${p.league}</span>
          <span class="mark">${win ? '&#10003;' : '&#10007;'}</span>
        </div>
        <div class="pickname">${nameHtml(p.name)}</div>
        <div class="bottom">
          <div class="meta"><span class="odds">${oddsHtml(p.odds)}</span> &nbsp;&middot;&nbsp; Final ${dash(p.final)}</div>
          <div class="units"><small>${win ? 'PROFIT' : 'RESULT'}</small>${money(p.profit)}</div>
        </div>
      </div>`;
  };

  // assign biggest win → biggest tile; losses → bottom-right stack
  const TILES = [
    ...wins.map((p, i) => tileHtml(p, WIN_SLOTS[i] || 't-oilers')),
    ...losses.map((p, i) => tileHtml(p, LOSS_SLOTS[i] || 't-judge')),
  ].join('\n');

  const winRate = Math.round((card.wins / (card.wins + card.losses)) * 100);

  return html
    // header date
    .replace('June 23, 2026', card.cardLong)
    // gold badge record  5–1 -> wins–losses
    .replace(
      '<span class="num">5</span><span class="dash">&ndash;</span><span class="num">1</span>',
      `<span class="num">${card.wins}</span><span class="dash">&ndash;</span><span class="num">${card.losses}</span>`
    )
    // hero money figures in the gold badge
    .replace('Net Units', 'Net P/L')
    .replace('+4.3u', card.netLabel)
    .replace('Day ROI', 'Win Rate')
    .replace('+47%', `${winRate}%`)
    // season line
    .replace('184&ndash;159 &middot; +61.4u', `${card.ytd.w}&ndash;${card.ytd.l} &middot; Winners`)
    // legend: tile size now reflects $ profit
    .replace('tile size = units', 'tile size = $ won')
    // green/red colors: keep — but if net is negative recolor hero
    .replace(/class="sv green">(\+\$|−\$)/, card.net >= 0 ? 'class="sv green">$1' : 'class="sv">$1')
    // swap the 6 sample tiles for the real ones
    .replace(/<!-- Dodgers ML[\s\S]*?<!-- GOLD RECORD BADGE -->/,
      `${TILES}\n\n    </div>\n\n    <!-- GOLD RECORD BADGE -->`)
    .replace('{{BEAR}}', bear);
};
