// Render a given design with a given card -> PNG path. Each design has an inject() module in designs/.
const path = require('path');
const L = require('./lib.cjs');

function renderCard(designId, card) {
  const inject = require(path.join(__dirname, 'designs', `${designId}.cjs`));
  const html = inject(L.loadSource(designId), card, L.bear());
  return L.renderToPng(html, designId);
}
module.exports = { renderCard };

// CLI: `node render.cjs <designId> [YYYY-MM-DD]` — render one design with that day's real Winners.
if (require.main === module) {
  (async () => {
    const designId = process.argv[2] || '077';
    const ymd = process.argv[3] || L.etDateStr(new Date(), -1);
    const [winners, ytd] = await Promise.all([L.fetchWinners(ymd), L.fetchYtdWinners()]);
    if (!winners.length) { console.error('no Winners for', ymd); process.exit(1); }
    const card = L.buildCard(winners, ymd, ytd);
    const png = renderCard(designId, card);
    console.log(`${designId} | ${card.record} | ${card.netLabel} | ${png}`);
  })().catch((e) => { console.error('ERR', e.message); process.exit(1); });
}
