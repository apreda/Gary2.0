// 088 — "Ransom Note Ledger" — cut-out magazine letters for the record,
// torn receipt strips per pick. Injects real Winners + the $100-flat-stake P/L.
// Faithful to designs-src/088.html: only the data is string-replaced.

const TAG = { MLB: 'mlb', WC: 'wc', NBA: 'nba', NHL: 'nhl', NFL: 'nfl' };
const money = (n) =>
  (n == null ? '—' : (n >= 0 ? '+$' : '&minus;$') + Math.abs(n).toFixed(2));

module.exports = function inject(html, card, bear) {
  // ---- per-pick torn receipt rows ----
  const ROWS = card.picks
    .map((p) => {
      const win = p.result === 'won';
      const tag = TAG[p.league] || 'mlb';
      const pl = money(p.profit);
      const plClass = win ? 'plWin' : 'plLoss';
      return `
      <div class="row">
        <div class="strip">
          <div class="sportTag tag-${tag}">${p.league}<span class="acc"></span></div>
          <div class="pickwrap">
            <div class="pick"><b>${p.name}</b></div>
          </div>
          <div class="plBig ${plClass}">${pl}</div>
        </div>
      </div>`;
    })
    .join('\n');

  // ---- the NET dollars as the cut-out "ransom note" hero figure ----
  // net e.g. 118.01 -> "+ $ 118 . 01"  (loss -> "&minus; $ ...")
  const net = card.net;
  const pos = net >= 0;
  const abs = Math.abs(net);
  const whole = Math.floor(abs);
  const cents = String(Math.round((abs - whole) * 100)).padStart(2, '0');
  const signGlyph = pos
    ? `<span class="u uPlus">+</span>`
    : `<span class="u uPlus" style="background:#e06151;">&minus;</span>`;
  const NETBLOCK = `<div class="units" style="left:8px;">
        ${signGlyph}
        <span class="u u3" style="font-size:64px;padding:0 8px;">$</span>
        <span class="u u4">${whole}</span>
        <span class="u uDot">.</span>
        <span class="u u3">${cents}</span>
      </div>`;

  const accuracy = Math.round((card.wins / (card.wins + card.losses)) * 100);

  // uppercase long date for the datestamp (e.g. "JUNE 24TH, 2026")
  const dateUpper = card.cardLong.toUpperCase();

  return html
    // datestamp date
    .replace('JUNE 23, 2026', dateUpper)
    // hero record glyphs  5 - 1  ->  wins - losses
    .replace(
      '<span class="glyph g5">5</span>\n        <span class="glyph gdash">&ndash;</span>\n        <span class="glyph g1">1</span>',
      `<span class="glyph g5">${card.wins}</span>\n        <span class="glyph gdash">&ndash;</span>\n        <span class="glyph g1">${card.losses}</span>`
    )
    // net-dollar hero replaces the units block
    .replace(/<div class="units">[\s\S]*?<\/div>\s*<div class="unitsCap">/, `${NETBLOCK}\n      <div class="unitsCap">`)
    // units caption -> truthful $100/pick + accuracy
    .replace('UNITS BANKED &middot; 83% OF CARD', `NET ON $100 / PICK &middot; ${accuracy}% OF CARD`)
    // season record
    .replace('<b>184</b>&ndash;159', `<b>${card.ytd.w}</b>&ndash;${card.ytd.l}`)
    // swap the 6 sample rows for the real ones
    .replace(/<div class="rows">[\s\S]*?<\/div>\s*<!-- FOOTER -->/, `<div class="rows">\n${ROWS}\n    </div>\n\n    <!-- FOOTER -->`)
    .replace('{{BEAR}}', bear);
};
