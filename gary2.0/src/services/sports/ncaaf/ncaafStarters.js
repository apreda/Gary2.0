/**
 * WHO STARTED EACH COLLEGE GAME, FROM THE OFFICIAL BOX (Oct 27 2026 data loop). ESPN's college box has no starters and
 * ESPN has no college depth charts, so an offensive lineman on the availability report read "OL (out)" with nothing to
 * say whether he was the starting left tackle or a reserve, and a defender's tackle count was the only sign he played.
 * The official box a school's athletics site posts (the stat crew's) lists both teams' 22 starters by name, number and
 * position. 106 of the 137 FBS sites post it in one format (Sidearm); a game is found on either team's site. A game
 * neither site has is left out and named, so a count says how many games it covers.
 */
import { cachedResearch } from '../../gary/sharedResearchCache.js';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Gary college desk)', Accept: 'text/html' };
const HOUR = 3_600_000;

// The athletics site of each FBS school whose official box was readable on Oct 27 2026, by the feed's college name. The
// other 31 (Auburn, Clemson, LSU, Notre Dame, Penn State among them) post theirs in a format this does not read.
const SITES = {
  'Air Force': 'goairforcefalcons.com', Akron: 'gozips.com', Alabama: 'rolltide.com', 'App State': 'appstatesports.com',
  Arizona: 'arizonawildcats.com', 'Arkansas State': 'astateredwolves.com', Army: 'goarmywestpoint.com',
  'Ball State': 'ballstatesports.com', Baylor: 'baylorbears.com', 'Boise State': 'broncosports.com',
  'Boston College': 'bceagles.com', 'Bowling Green': 'bgsufalcons.com', Buffalo: 'ubbulls.com',
  California: 'calbears.com', 'Central Michigan': 'cmuchippewas.com', Charlotte: 'charlotte49ers.com',
  'Coastal Carolina': 'goccusports.com', Colorado: 'cubuffs.com', 'Colorado State': 'csurams.com',
  Delaware: 'bluehens.com', Duke: 'goduke.com', 'East Carolina': 'ecupirates.com', 'Eastern Michigan': 'emueagles.com',
  FIU: 'fiusports.com', Florida: 'floridagators.com', 'Florida Atlantic': 'fausports.com',
  'Florida State': 'seminoles.com', 'Fresno State': 'gobulldogs.com', Georgia: 'georgiadogs.com',
  'Georgia Southern': 'gseagles.com', 'Georgia State': 'georgiastatesports.com', "Hawai'i": 'hawaiiathletics.com',
  Houston: 'uhcougars.com', Illinois: 'fightingillini.com', Indiana: 'iuhoosiers.com', 'Iowa State': 'cyclones.com',
  'Jacksonville State': 'jaxstatesports.com', 'James Madison': 'jmusports.com', Kansas: 'kuathletics.com',
  'Kansas State': 'kstatesports.com', 'Kennesaw State': 'ksuowls.com', 'Kent State': 'kentstatesports.com',
  Liberty: 'libertyflames.com', Louisiana: 'ragincajuns.com', 'Louisiana Tech': 'latechsports.com',
  Louisville: 'gocards.com', Marshall: 'herdzone.com', Maryland: 'umterps.com', Massachusetts: 'umassathletics.com',
  Memphis: 'gotigersgo.com', 'Miami (OH)': 'miamiredhawks.com', Michigan: 'mgoblue.com',
  'Michigan State': 'msuspartans.com', 'Middle Tennessee': 'goblueraiders.com', Minnesota: 'gophersports.com',
  'Mississippi State': 'hailstate.com', 'Missouri State': 'missouristatebears.com', Navy: 'navysports.com',
  'NC State': 'gopack.com', Nevada: 'nevadawolfpack.com', 'New Mexico State': 'nmstatesports.com',
  'North Carolina': 'goheels.com', 'North Texas': 'meangreensports.com', 'Northern Illinois': 'niuhuskies.com',
  Ohio: 'ohiobobcats.com', 'Ohio State': 'ohiostatebuckeyes.com', Oklahoma: 'soonersports.com',
  'Oklahoma State': 'okstate.com', 'Ole Miss': 'olemisssports.com', Oregon: 'goducks.com',
  'Oregon State': 'osubeavers.com', Pittsburgh: 'pittsburghpanthers.com', Rice: 'riceowls.com',
  Rutgers: 'scarletknights.com', 'Sacramento State': 'hornetsports.com', 'Sam Houston': 'gobearkats.com',
  SMU: 'smumustangs.com', 'South Alabama': 'usajaguars.com', 'South Florida': 'gousfbulls.com',
  'Southern Miss': 'southernmiss.com', Syracuse: 'cuse.com', TCU: 'gofrogs.com', Temple: 'owlsports.com',
  Tennessee: 'utsports.com', Texas: 'texassports.com', 'Texas State': 'txst.com', 'Texas Tech': 'texastech.com',
  Toledo: 'utrockets.com', Troy: 'troytrojans.com', Tulane: 'tulanegreenwave.com', Tulsa: 'tulsahurricane.com',
  UAB: 'uabsports.com', UConn: 'uconnhuskies.com', 'UL Monroe': 'ulmwarhawks.com', UNLV: 'unlvrebels.com',
  USC: 'usctrojans.com', Utah: 'utahutes.com', 'Utah State': 'utahstateaggies.com', UTEP: 'utepminers.com',
  'Wake Forest': 'godeacs.com', Washington: 'gohuskies.com', 'West Virginia': 'wvusports.com',
  'Western Kentucky': 'wkusports.com', 'Western Michigan': 'wmubroncos.com', Wisconsin: 'uwbadgers.com',
  Wyoming: 'gowyo.com',
};

const get = (url, fetchImpl) => fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(25_000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
const decode = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&amp;/g, '&').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"');
const text = (html) => decode(String(html).replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// A quoted nickname is left out (Oct 29 2026 hunt, round 7: 'Brenten "Inky" Jones' never met the box's Brenten Jones).
export const nameKey = (s) => String(s || '').replace(/\s*["“”][^"“”]*["“”]\s*/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const schoolKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// "Hawkins Jr., Michael" is Michael Hawkins Jr.
// "Glover,Jr." (a site that kept only the suffix as the first name) is Glover Jr.
const displayName = (s) => {
  const [last, first] = String(s).split(',');
  if (!first) return String(s).trim();
  return /^(jr|sr|ii|iii|iv|v)\.?$/i.test(first.trim()) ? `${last.trim()} ${first.trim()}` : `${first.trim()} ${last.trim()}`;
};

/** The official box's team stats as the school's stat crew kept them, by the table's column labels ("WSU", "ARI"):
 * { labels: [a, b], sacks: [[n, yds], [n, yds]] } (round 13: ESPN's team row, its credits and its play-by-play each
 * miscount college sacks in some games; the official box is the count). Null when the row is not on the page. */
export function teamStatsFromBoxPage(html) {
  const h = String(html || ''); const i = h.indexOf('Sacks: Total - Yds');
  if (i < 0) return null;
  const tableAt = h.lastIndexOf('<table', i);
  const heads = [...h.slice(tableAt, tableAt + 4000).matchAll(/<th[^>]*>(.*?)<\/th>/gs)].map((m) => text(m[1]).trim()).filter((x) => x && x !== '-');
  const row = text(h.slice(i, h.indexOf('</tr>', i))).match(/Sacks: Total - Yds\.?\s*(\d+)\s*-\s*(-?\d+)\s+(\d+)\s*-\s*(-?\d+)/);
  if (!row || heads.length < 2) return null;
  return { labels: [decode(heads[0]), decode(heads[1])], sacks: [[Number(row[1]), Number(row[2])], [Number(row[3]), Number(row[4])]] };
}

/** One official box page's starters: { date: 'YYYY-MM-DD', teams: [{ label, starters: [{ name, jersey, position, unit }] }] }, or null. */
export function startersFromBoxPage(html) {
  const title = String(html).match(/<title>([^<]*)<\/title>/)?.[1] || '';
  const [, m, d, y] = decode(title).match(/ on (\d{1,2})\/(\d{1,2})\/(\d{4})/) || [];
  const start = String(html).search(/>\s*Starters\s*<\/h2>/);
  if (!m) return null;
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (start < 0) return olderLayout(html, date);
  const end = String(html).indexOf('Player Participation', start);
  const section = String(html).slice(start, end > start ? end : start + 200_000);
  // Each table: the team's logo (its alt names the school), the unit's heading, then rows of number, player and position.
  const heads = [...section.matchAll(/>\s*(Offense|Defense)\s*</g)];
  const byTeam = new Map();
  heads.forEach((h, i) => {
    const before = section.slice(Math.max(0, h.index - 600), h.index);
    const label = [...before.matchAll(/alt="([^"]+)"/g)].pop()?.[1];
    if (!label) return;
    const table = section.slice(h.index, heads[i + 1]?.index ?? section.length);
    const starters = [...table.matchAll(/<tr class="s-table-body__row[^"]*"[^>]*>(.*?)<\/tr>/gs)].map((row) => [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => text(c[1])))
      .filter((cells) => cells.length >= 3 && cells[1]).map(([jersey, name, position]) => ({ name: displayName(name), jersey: jersey || null, position: position || null, unit: h[1].toLowerCase() }));
    const team = decode(label);
    byTeam.set(team, [...(byTeam.get(team) || []), ...starters]);
  });
  const teams = [...byTeam].map(([label, starters]) => ({ label, starters }));
  return teams.length === 2 && teams.every((t) => t.starters.length >= 20) ? { date, teams } : null;
}

// The older page: one table per team under "Starters", captioned with the team's abbreviation ("GSU"), offense and
// defense together, so the unit comes from the position.
const OFFENSE = /^(QB|RB|TB|HB|FB|WR|SB|TE|OL|OT|OG|LT|LG|RT|RG|C|T|G|IOL|SL|X|Y|Z|H|SE|FL|AP)$/i;
function olderLayout(html, date) {
  const start = String(html).indexOf('<section id="starters"');
  if (start < 0) return null;
  const section = String(html).slice(start, start + 150_000);
  const teams = [...section.matchAll(/<table[^>]*>\s*<caption>([^<]+)<\/caption>(.*?)<\/table>/gs)].slice(0, 2).map(([, label, table]) => ({
    label: decode(label.trim()),
    starters: [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map((row) => [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => text(c[1])))
      .filter((cells) => cells.length >= 3 && cells[1]).map(([jersey, name, position]) => ({ name: displayName(name), jersey: jersey || null, position: position || null,
        unit: OFFENSE.test(position || '') ? 'offense' : 'defense' })),
  }));
  return teams.length === 2 && teams.every((t) => t.starters.length >= 20) ? { date, teams } : null;
}

// Every official box on one school's site this season: [{ date, teams }]. A box is kept a month once the game is three
// days old (a stat correction lands within a day or two), the schedule six hours. One read per school per run: a
// game-by-game read asks for the same school's games side by side, and each box page is about 2 MB.
const inFlight = new Map();
function siteBoxes(college, season, fetchImpl) {
  const k = `${college}:${season}`;
  if (fetchImpl !== fetch) return readSite(college, season, fetchImpl);
  if (!inFlight.has(k)) {
    inFlight.set(k, readSite(college, season, fetchImpl));
    setTimeout(() => inFlight.delete(k), HOUR).unref?.();
  }
  return inFlight.get(k);
}
async function readSite(college, season, fetchImpl) {
  const domain = SITES[college];
  if (!domain) return [];
  const links = await cachedResearch(`cfb_official_box_links_v2:${domain}:${season}`, async () => {
    // The season stats page links every game's box; some schedule pages link none.
    const pages = await Promise.all(['stats', 'schedule'].map((p) => get(`https://${domain}/sports/football/${p}/${season}`, fetchImpl)));
    if (!pages.some(Boolean)) return { unavailable: true };
    const pattern = new RegExp(`/sports/football/stats/${season}/[^"]*/boxscore/\\d+|/boxscore\\.aspx\\?id=\\d+`, 'g');
    return { links: [...new Set(pages.flatMap((page) => String(page || '').match(pattern) || []))] };
  }, { ttlMs: 6 * HOUR }).catch(() => null);
  const boxes = await Promise.all((links?.links || []).map((path) => cachedResearch(`cfb_official_box_v2:${domain}${path}`, async () => {
    const page = await get(`https://${domain}${path}`, fetchImpl);
    const box = page ? startersFromBoxPage(page) : null;
    return box ? { ...box, stats: teamStatsFromBoxPage(page), settled: Date.now() - Date.parse(`${box.date}T12:00:00Z`) > 3 * 24 * HOUR } : { unavailable: true };
  }, { ttlMs: 30 * 24 * HOUR, valid: (v) => !v?.unavailable && v?.settled }).catch(() => null)));
  return boxes.filter(Boolean);
}

const sameDay = (iso, date) => {
  const et = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return Math.abs(Date.parse(`${et}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) <= 24 * HOUR;
};
// How closely a box's team label names a school: the same name, one inside the other ("Miami (Ohio)", "Miami (OH)"), else not.
// The older page names a team by abbreviation, the feed's ("GSU") or the school's initials ("KSU" for Kennesaw State).
const initials = (college) => String(college || '').split(/[\s-]+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the)$/i.test(w)).map((w) => w[0]).join('');
const likeness = (label, school) => {
  const a = schoolKey(label), b = schoolKey(school.college);
  if (a === b || (school.abbr && a === schoolKey(school.abbr))) return 3;
  if (a && b && (a.startsWith(b) || b.startsWith(a))) return 2;
  const i = schoolKey(initials(school.college));
  return i.length >= 2 && (a === i || a === `${i}u`) ? 1 : 0;
};

/**
 * Each game's starters for one team: Map game id -> [{ name, key, jersey, position, unit }], only games an official box
 * was found for. `team` is { college, abbr }; `games` are [{ gameId, date, opponent: { college, abbr } }].
 */
export async function teamStarters(team, games, season, { fetchImpl = fetch } = {}) {
  const out = new Map();
  if (!games?.length) return out;
  const boxesOf = (school) => siteBoxes(school, season, fetchImpl);
  for (const g of games) {
    for (const school of [team.college, g.opponent?.college]) {
      if (!SITES[school]) continue;
      for (const box of (await boxesOf(school)).filter((b) => sameDay(g.date, b.date))) {
        // This team's table: the one that names it better, else the one that names the opponent less.
        const [a, b] = box.teams;
        const [ma, mb, oa, ob] = [likeness(a.label, team), likeness(b.label, team), likeness(a.label, g.opponent || {}), likeness(b.label, g.opponent || {})];
        const mine = ma > mb && ob >= oa ? a : mb > ma && oa >= ob ? b : ma === mb && oa !== ob ? (oa > ob ? b : a) : null;
        if (!mine || Math.max(ma, mb, oa, ob) === 0) continue;
        out.set(String(g.gameId), mine.starters.map((s) => ({ ...s, key: nameKey(s.name) })));
        break;
      }
      if (out.has(String(g.gameId))) break;
    }
  }
  return out;
}

/** Each game's sacks made by `team` and the opponent, from the official box: Map game id -> { made: [n, yds], taken: [n,
 * yds] }, only games a box with the row was found for (same games argument as teamStarters). */
export async function officialSacks(team, games, season, { fetchImpl = fetch } = {}) {
  const out = new Map();
  for (const g of games || []) {
    for (const school of [team.college, g.opponent?.college]) {
      if (!SITES[school]) continue;
      for (const box of (await siteBoxes(school, season, fetchImpl)).filter((b) => b.stats && sameDay(g.date, b.date))) {
        const [a, b] = box.stats.labels;
        const [ma, mb, oa, ob] = [likeness(a, team), likeness(b, team), likeness(a, g.opponent || {}), likeness(b, g.opponent || {})];
        const k = ma > mb && ob >= oa ? 0 : mb > ma && oa >= ob ? 1 : ma === mb && oa !== ob ? (oa > ob ? 1 : 0) : null;
        if (k == null || Math.max(ma, mb, oa, ob) === 0) continue;
        out.set(String(g.gameId), { made: box.stats.sacks[k], taken: box.stats.sacks[1 - k] });
        break;
      }
      if (out.has(String(g.gameId))) break;
    }
  }
  return out;
}

const words = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, '').split(/[\s-]+/).filter((w) => w && !/^(jr|sr|ii|iii|iv|v)$/.test(w));
// Position groups, from a lineup's code or a report's word ("Wide receiver").
const GROUPS = [['QB', /^(?:qb|quarterback)/i], ['RB', /^(?:rb|fb|tb|running ?back|fullback|tailback)/i], ['WR', /^(?:wr|wide ?receiver|receiver)/i],
  ['TE', /^(?:te|tight ?end)/i], ['OL', /^(?:ol|ot|og|oc|c|g|t|iol|lt|rt|lg|rg|offensive ?line|tackle|guard|center)$|^offensive/i],
  ['DL', /^(?:dl|de|dt|nt|edge|defensive ?(?:line|end|tackle)|nose)/i], ['LB', /^(?:lb|ilb|olb|mlb|linebacker)/i],
  ['DB', /^(?:db|cb|s|fs|ss|nb|nickel|cornerback|safety|defensive ?back)/i], ['K', /^(?:pk|k|p|ls|kicker|punter|long ?snapper)/i]];
const groupOf = (p) => GROUPS.find(([, re]) => re.test(String(p || '').trim()))?.[0] || null;
/** Whether a game's starters include this player: the same name; else the one starter with his last name and first
 * initial, when the first names are one short for the other (Sam, Samuel) or the positions agree (Oct 29 2026 hunt:
 * Oregon's Dante Moore, QB, out three straight game days, read "started 7 of 7" on Dakorien Moore's starts at receiver). */
export function startedIn(starters, name, position = null) {
  if (!starters) return null;
  const key = nameKey(name), w = words(name);
  if (starters.some((s) => s.key === key)) return true;
  const near = starters.filter((s) => { const v = words(s.name); return v.length && w.length && v[v.length - 1] === w[w.length - 1] && v[0][0] === w[0][0]; });
  if (near.length !== 1) return false;
  const v = words(near[0].name);
  const short = v[0].startsWith(w[0]) || w[0].startsWith(v[0]);
  const same = position && near[0].position && groupOf(position) && groupOf(position) === groupOf(near[0].position);
  return Boolean(short || same);
}

/**
 * The starters among one side's box-score players ([{ name, unit }], unit 'offense' or 'defense' by what the box counts
 * for him): a Set of the names that started, and the starters left unmatched. By startedIn, then, for a starter still
 * unmatched, the one player left on the same side of the ball with his last name when no other starter has it ("Ezekiel
 * Durham-Campbell" in the official box is ESPN's "Zeke Durham-Campbell"; a defensive end "Taylor Brown" is never the
 * starting guard "Kevin Brown").
 */
export function startersAmong(starters, players) {
  const hit = new Set(), used = new Set();
  for (const p of players) { const x = (starters || []).find((st) => !used.has(st) && startedIn([st], p.name)); if (x) { hit.add(p.name); used.add(x); } }
  const last = (n) => words(n).at(-1);
  for (const st of (starters || []).filter((x) => !used.has(x))) {
    const same = players.filter((p) => !hit.has(p.name) && last(p.name) === last(st.name) && p.unit === st.unit);
    if (same.length === 1 && starters.filter((x) => last(x.name) === last(st.name)).length === 1) { hit.add(same[0].name); used.add(st); }
  }
  return { started: hit, unmatched: (starters || []).filter((x) => !used.has(x)) };
}
