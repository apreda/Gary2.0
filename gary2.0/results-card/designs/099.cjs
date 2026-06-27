// 099 — "Panini Sticker Album Page". Faithful data injection into the source design.
// Win = collected glossy sticker, loss = empty dashed "Sticker Missing" slot.
// Adds the $100-flat-stake $ P/L per slot and makes the day NET the hero money figure.
const CHIP = { MLB: 'c-mlb', WC: 'c-wc', NBA: 'c-nba', NHL: 'c-nhl', NFL: 'c-wc' };
const LEAGUE_LABEL = { MLB: 'MLB', WC: 'World Cup', NBA: 'NBA', NHL: 'NHL', NFL: 'NFL' };
const money = (n) => (n == null ? '&mdash;' : (n >= 0 ? '+$' : '&minus;$') + Math.abs(n).toFixed(2));

module.exports = function inject(html, card, bear) {
  const SLOTS = card.picks.map((p, i) => {
    const win = p.result === 'won';
    const num = String(i + 1).padStart(2, '0');
    const chip = CHIP[p.league] || 'c-mlb';
    const label = LEAGUE_LABEL[p.league] || p.league;
    const nameHtml = p.name.replace(/&/g, '&amp;');
    const pl = money(p.profit);
    if (win) {
      return `
      <div class="slot win">
        <div class="num">${num}</div>
        <div class="corner"></div>
        <div class="top-row"><span class="sport-chip ${chip}">${label}</span></div>
        <div class="pick-title">${nameHtml}</div>
        <div class="result-tag"><span class="pl">${pl}</span></div>
      </div>`;
    }
    return `
      <div class="slot loss">
        <div class="num">${num}</div>
        <div class="missing">Sticker Missing</div>
        <div class="top-row"><span class="sport-chip ${chip}">${label}</span></div>
        <div class="pick-title">${nameHtml}</div>
        <div class="result-tag"><span class="pl">${pl}</span></div>
      </div>`;
  }).join('\n');

  const netColor = card.net >= 0 ? '#7FD18B' : '#E58A8A';
  const winRate = Math.round((card.wins / (card.wins + card.losses)) * 100);

  return html
    // header title record
    .replace('5&ndash;1', `${card.wins}&ndash;${card.losses}`)
    // header sub: date + picks-graded count
    .replace(
      'June 23, 2026 &nbsp;&middot;&nbsp; <b>6 picks graded</b>',
      `${card.cardLong} &nbsp;&middot;&nbsp; <b>${card.picks.length} picks graded</b>`
    )
    // hero money figure: day NET dollars (was "+4.3u")
    .replace(
      '<div class="u">+4.3u</div>',
      `<div class="u" style="color:${netColor}">${card.netLabel}</div>`
    )
    .replace(
      '<div class="ulab">Day &middot; Units Won</div>',
      `<div class="ulab">Day Net &middot; $100 / pick</div>`
    )
    // meta strip middle — keep "every result graded" messaging, add win rate truthfully
    .replace(
      'Every result graded &middot; win or loss',
      `Every result graded &middot; ${winRate}% on the day`
    )
    // on-the-year season record
    .replace('184&thinsp;/&thinsp;343', `${card.ytd.w}&thinsp;&ndash;&thinsp;${card.ytd.l}`)
    // swap the whole sticker grid for the real slots
    .replace(/<div class="grid">[\s\S]*?<\/div>\s*<!-- FOOTER -->/, `<div class="grid">\n${SLOTS}\n    </div>\n\n    <!-- FOOTER -->`)
    .replace('{{BEAR}}', bear);
};
