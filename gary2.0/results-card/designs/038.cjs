// 038 — "Hallmarked Gold Bar". Injects real data into the founder's source design.
// Keeps the solid-gold-ingot look (debossed stamps, struck record); each row shows
// only three things — big league tag, big pick, big green/red $ (the color IS the W/L
// signal). No odds, no win/loss punch. The day NET stays the hero money figure.
const CHIP = {
  MLB: 'linear-gradient(#1e3a8a,#2156c9)',
  WC:  'linear-gradient(#0a7a3f,#15c06a)',
  NBA: 'linear-gradient(#9a4a08,#e08010)',
  NHL: 'linear-gradient(#0a6b3c,#119955)',
  NFL: 'linear-gradient(#5a2a8a,#8a4ad0)',
};
const money = (n) => (n == null ? '—' : (n >= 0 ? '+$' : '&minus;$') + Math.abs(n).toFixed(2));

module.exports = function inject(html, card, bear) {
  const ROWS = card.picks.map((p) => {
    const win = p.result === 'won';
    const chip = CHIP[p.league] || CHIP.MLB;
    return `
          <div class="row${win ? '' : ' lossrow'}">
            <div class="sport"><span class="chip" style="background:${chip}"></span>${p.league}</div>
            <div class="pick">${p.name}</div>
            <div class="pl ${win ? 'plw' : 'pll'}">${money(p.profit)}</div>
          </div>`;
  }).join('\n');

  const winPct = Math.round((card.wins / card.picks.length) * 100);

  return html
    // header date tag
    .replace('MON · JUNE 23 · 2026', card.cardLong.toUpperCase())
    // top strip: fineness day-yield -> day NET dollars ; registry note -> truthful win rate
    .replace('+4.3u', card.netLabel)
    .replace('184&ndash;159', `${card.ytd.w}&ndash;${card.ytd.l}`)
    .replace('53.6% · FULL LEDGER, NOTHING RE-CUT',
      `${Math.round((card.ytd.w / (card.ytd.w + card.ytd.l)) * 100)}% · FULL LEDGER, NOTHING RE-CUT`)
    // hero record + counts
    .replace('5&ndash;1', `${card.wins}&ndash;${card.losses}`)
    .replace('SIX PLAYS GRADED', `${card.picks.length} PLAYS GRADED`)
    .replace('5W&nbsp;/&nbsp;1L', `${card.wins}W&nbsp;/&nbsp;${card.losses}L`)
    .replace('EVERY RESULT GRADED · WIN OR LOSS',
      `${winPct}% ON $100/PICK · EVERY RESULT GRADED`)
    // swap the 6 sample rows for the real rows (grid + P/L styling live in the source HTML)
    .replace(/<div class="rows">[\s\S]*?<!-- BAR EDGE -->/,
      `<div class="rows">\n${ROWS}\n\n        </div>\n\n        <!-- BAR EDGE -->`)
    .replace('{{BEAR}}', bear);
};
