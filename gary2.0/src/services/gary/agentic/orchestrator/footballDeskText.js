// Reading a saved desk's text (sections, THE LINE, articles). Plumbing shared by the NFL read (nflRead.js), college's
// read (ncaafRead.js) and the NBA read (nbaRead.js); what each one reads and is asked lives in its own file.
export const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const RULE = /^━{10,}/;
export const isTitle = (line, next) => /^[A-Z][A-Z0-9 ’'&/(),.:—-]{5,}$/.test(line || '') && RULE.test(next || '');

// One desk section: the lines between its title's rule and the next rule or the next section title.
export function sectionOf(desk, title) {
  const lines = String(desk || '').split('\n');
  const start = lines.findIndex((l, i) => new RegExp(`^${esc(title)}`).test(l) && RULE.test(lines[i + 1] || ''));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 2; i < lines.length; i++) {
    if (RULE.test(lines[i]) || isTitle(lines[i], lines[i + 1])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

// THE LINE, held for the card: the spread, the moneylines and the tickets (the raw odds values are for the parser).
export function lineOf(desk) {
  return sectionOf(desk, 'THE LINE').split('\n')
    .filter((l) => /^(?:Spread|Moneyline|Tickets on this game|Total|Over\/Under):/.test(l)).join('\n');
}

// Who's favored, in words: "The Chicago Bears are favored by 1.5 points."
export function spreadInWords(line = '') {
  const m = String(line).match(/^Spread: (.+?) ([+-]?\d+(?:\.\d+)?|PK) \([^)]*\) \| (.+?) ([+-]?\d+(?:\.\d+)?|PK) \(/m);
  if (!m) return '';
  const a = { team: m[1].trim(), pts: m[2] === 'PK' ? 0 : Number(m[2]) };
  const b = { team: m[3].trim(), pts: m[4] === 'PK' ? 0 : Number(m[4]) };
  if (!a.pts && !b.pts) return 'The spread is a pick\'em: neither team is favored.';
  const fav = a.pts < b.pts ? a : b;
  const pts = Math.abs(fav.pts);
  return `The ${fav.team} are favored by ${pts} point${pts === 1 ? '' : 's'}.`;
}

// The desk's articles: { heading, title, published, body }, with "appears above" references resolved by title.
export function articlesOf(desk) {
  const lines = String(desk || '').split('\n');
  const out = [];
  let heading = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^## /.test(l)) { heading = l.slice(3).trim(); continue; }
    if (RULE.test(l)) { heading = null; continue; }
    if (!heading || !/https?:\/\//.test(lines[i + 1] || '') || /https?:\/\//.test(l) || !l.trim()) continue;
    const published = ((lines[i + 2] || '').match(/^Published: (\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    let j = i + 2;
    while (j < lines.length && !/^<original_article>|^Full article appears above/.test(lines[j]) && !/^## /.test(lines[j]) && !RULE.test(lines[j])) j++;
    let body = '';
    if (/^<original_article>/.test(lines[j] || '')) {
      let k = j;
      while (k < lines.length && !/<\/original_article>/.test(lines[k])) k++;
      body = lines.slice(j, k + 1).join('\n').replace(/<\/?original_article>/g, '').trim();
      i = k;
    } else {
      i = j;
    }
    out.push({ heading, title: l.trim(), published, body });
  }
  const byTitle = new Map(out.filter((a) => a.body).map((a) => [a.title, a.body]));
  return out.map((a) => ({ ...a, body: a.body || byTitle.get(a.title) || '' })).filter((a) => a.body);
}

// An article's opening paragraphs, as written, up to about 1,200 characters (odds lines left for the card).
export function articleOpening(body, max = 1200) {
  const paras = body.split(/\n+/).map((p) => p.trim()).filter((p) => p && !/^(?:Spread|Moneyline|Over\/Under|Total|Odds):/i.test(p));
  let text = '';
  for (const p of paras) { if (text && text.length + p.length > max) break; text += `${text ? '\n' : ''}${p}`; }
  return text;
}


export function matchupHeader(desk) {
  const text = String(desk || '');
  const matchup = (text.match(/^MATCHUP: (.+)$/m) || [])[1] || '';
  const when = ((text.match(/^Sport: [^|\n]+\| (.+)$/m) || [])[1] || '').trim();
  const venue = (text.match(/^Venue: .+$/m) || [])[0] || '';
  return [matchup, when, venue].filter(Boolean).join('\n');
}
