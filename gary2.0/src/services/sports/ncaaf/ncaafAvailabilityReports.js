/**
 * THE OFFICIAL COLLEGE AVAILABILITY REPORTS (founder, Oct 10 2026: "Gary is
 * picking without his data"). The SEC, ACC, American and MAC publish their
 * mandatory player availability reports through one public report service
 * (HD Intelligence), the same data their websites embed. Each report lists
 * every player of both teams with a status (Available, Probable, Questionable,
 * Doubtful, Out, Out - (1st Half)). This reads the latest report for a game
 * so Gary's availability comes from the conference, not from a web search.
 *
 * Read-only, unauthenticated, a few requests per conference per run, cached.
 * A failure here is a missing report, never a guessed one.
 */
import { cachedResearch } from '../../gary/sharedResearchCache.js';

const PUBLIC_REPORTS_URL = 'https://app.hdintelligence.com/api/get-publish-public';
// The Big Ten and Big 12 publish through the same service under the codes B10 and B12 (Oct 24 2026: the Big Ten's
// reports page embeds app.hdintelligence.com/?conf=B10; their games had been read from a web search instead).
export const REPORT_CONFERENCES = Object.freeze({
  SEC: { key: 'SEC', label: 'SEC', page: 'https://www.secsports.com/fbreports' },
  ACC: { key: 'ACC', label: 'ACC', page: 'https://theacc.com' },
  American: { key: 'American', label: 'American', page: 'https://theamerican.org' },
  MAC: { key: 'MAC', label: 'MAC', page: 'https://getsomemaction.com' },
  B10: { key: 'B10', label: 'Big Ten', page: 'https://bigten.org/sports/2026/9/10/FB_Availability_Reports.aspx' },
  B12: { key: 'B12', label: 'Big 12', page: 'https://big12sports.com' },
});
const USER_AGENT = 'GaryAI-availability-reader/1.0 (+https://betwithgary.ai)';
const CACHE_MS = 15 * 60_000;
// Available, and Exempt (players outside the report's scope), are not absences.
const NOT_LISTED = new Set(['available', 'exempt', 'nonexempt']);
// Report order within a game day: the later update supersedes the earlier one.
const REPORT_ORDER = ['initial', 'update 1', 'update 2', 'update 3', 'game day', 'gameday', 'final'];

const ABBREVIATIONS = [
  [/\bst\b\.?/g, 'state'], [/\bmich\b\.?/g, 'michigan'], [/\bill\b\.?/g, 'illinois'], [/\bfla\b\.?/g, 'florida'],
  [/\bga\b\.?/g, 'georgia'], [/\bky\b\.?/g, 'kentucky'], [/\bmiss\b\.?/g, 'mississippi'], [/\btenn\b\.?/g, 'tennessee'],
  [/\bla\b\.?/g, 'louisiana'], [/\bso\b\.?/g, 'southern'], [/\bn\.?c\.?\b/g, 'north carolina'],
];

/** "Florida St." / "Florida State Seminoles" / "Central Mich." -> comparable school words. */
export function schoolKey(name) {
  let s = String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '');
  for (const [pattern, word] of ABBREVIATIONS) s = s.replace(pattern, word);
  return s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Report names that differ from BDL's school name beyond abbreviations.
// The ACC report writes 'Miami (FL)'; the Big Ten's writes 'Southern California' for USC.
const ALIASES = new Map([['army west point', 'army'], ['miami fl', 'miami'], ['southern california', 'usc']]);

/** The report's team is this BDL team: the same school, never a prefix (North Carolina is not NC State). */
export function sameSchool(reportTeam, team) {
  const a = schoolKey(reportTeam);
  const reported = ALIASES.get(a) || a;
  const school = schoolKey(typeof team === 'string' ? team : team?.college || team?.name);
  return Boolean(reported) && reported === school;
}

/** "RB #0 KJ Edwards" -> { position: 'RB', number: '0', name: 'KJ Edwards' }. */
// A row with no jersey number ("S CJ Christian") keeps its position apart too (round 8: the name read "S CJ Christian",
// matched no history, and he read both "new this week" and "not on this week's report").
const POSITIONS = /^(QB|RB|FB|WR|TE|OL|OT|OG|C|G|T|DL|DT|DE|NT|EDGE|LB|ILB|OLB|DB|CB|S|FS|SS|K|PK|P|LS|ATH|KR|PR|IOL|OLB\/DE|DE\/OLB)$/;
export function parseReportRow(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^([A-Z/]{1,5})\s+#?(\d{1,3})\s+(.+)$/);
  if (m) return { position: m[1], number: m[2], name: m[3].trim() };
  const p = raw.match(/^([A-Z/]{1,7})\s+(\S.+)$/);
  if (p && POSITIONS.test(p[1])) return { position: p[1], number: null, name: p[2].trim() };
  return { position: null, number: null, name: raw };
}

function stripImages(value) {
  if (Array.isArray(value)) return value.map(stripImages);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, v]) => !(typeof v === 'string' && v.startsWith('data:')))
      .map(([k, v]) => [k, stripImages(v)]));
  }
  return value;
}

async function fetchConference(conference, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(PUBLIC_REPORTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ conference, sport: 'Football' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Availability reports unavailable (${response.status})`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Availability reports returned no report list');
  return Object.entries(data).filter(([, r]) => r && typeof r === 'object' && Array.isArray(r.games)).map(([id, r]) => {
    const report = stripImages(r);
    return {
      id, conference,
      reportType: report.ReportType || null,
      gameDate: report.footer?.date || null,
      gameTime: report.footer?.time || null,
      location: report.footer?.location || null,
      publishDate: report.publishDate || null,
      postedTime: report.postedTime || null,
      timeZone: report.conferenceTimeZone || null,
      teams: report.games.map(g => ({
        team: g.teamName || g.teamDisplayName,
        rows: (g.rows || []).map(row => ({ ...parseReportRow(row.name), status: String(row.status || '').trim() })),
      })),
    };
  });
}

/** Every published report for one conference, cached for fifteen minutes. */
export async function conferenceReports(conference, options = {}) {
  if (options.fetchImpl) return fetchConference(conference, options);
  const result = await cachedResearch(`ncaaf-availability-reports-v1:${conference}`, async () => {
    try { return { reports: await fetchConference(conference) }; } catch (error) { return { unavailable: true, reason: error.message }; }
  }, { ttlMs: value => (value?.unavailable ? 60_000 : CACHE_MS), valid: value => Boolean(value) });
  if (result?.unavailable) throw new Error(result.reason);
  return result?.reports || [];
}

const order = report => {
  const type = String(report.reportType || '').toLowerCase();
  const rank = REPORT_ORDER.findIndex(label => type.startsWith(label));
  return `${report.publishDate || ''} ${report.postedTime || ''} ${String(rank < 0 ? 0 : rank).padStart(2, '0')}`;
};

/**
 * The latest official report for this exact game, or null. Both teams must be
 * on it and its game date must be the slate date.
 */
export async function officialAvailabilityForGame({ homeTeam, awayTeam, date }, options = {}) {
  const conferences = options.conferences || Object.keys(REPORT_CONFERENCES);
  const found = [];
  const errors = [];
  for (const conference of conferences) {
    let reports;
    try { reports = await conferenceReports(conference, options); } catch (error) { errors.push(`${conference}: ${error.message}`); continue; }
    for (const report of reports) {
      if (date && report.gameDate && report.gameDate !== date) continue;
      const home = report.teams.find(t => sameSchool(t.team, homeTeam));
      const away = report.teams.find(t => sameSchool(t.team, awayTeam));
      if (home && away && home === away) continue;
      // "Report Pending" carries no players yet; it is not a report. A non-conference game's report covers only the
      // conference's own team (college review, Oct 13 2026: those were discarded), so one side is enough.
      if ((home && home.rows.length) || (away && away.rows.length)) found.push({ report, home: home?.rows.length ? home : null, away: away?.rows.length ? away : null });
    }
  }
  if (!found.length) return { found: false, errors };
  const newest = (side) => found.filter(f => f[side]).sort((a, b) => order(b.report).localeCompare(order(a.report)))[0] || null;
  const homeHit = newest('home'), awayHit = newest('away');
  const { report } = [homeHit, awayHit].filter(Boolean).sort((a, b) => order(b.report).localeCompare(order(a.report)))[0];
  const listed = side => side.rows.filter(row => !NOT_LISTED.has(row.status.toLowerCase()));
  // The players the report lists Exempt (Oct 29 2026 hunt, round 7): on this week's report, so never "not on this week's";
  // the report gives no reason, and the SEC lists fifteen or more a team, so the read names only those who matter.
  const exempt = side => side.rows.filter(row => row.status.toLowerCase() === 'exempt').map(row => row.name);
  const sideOf = (hit, side) => (hit ? { team: hit[side].team, listed: listed(hit[side]), exempt: exempt(hit[side]), players: hit[side].rows.length } : null);
  return {
    found: true,
    conference: REPORT_CONFERENCES[report.conference]?.label || report.conference,
    page: REPORT_CONFERENCES[report.conference]?.page || null,
    reportType: report.reportType,
    published: [report.publishDate, report.postedTime].filter(Boolean).join(' '),
    timeZone: report.timeZone,
    gameDate: report.gameDate,
    home: sideOf(homeHit, 'home'),
    away: sideOf(awayHit, 'away'),
  };
}

// THE REPORT HISTORY (Oct 24 2026, founder: an injury matters by whether it is new or old enough that the team's numbers
// already reflect it, on the line and in the secondary as much as anywhere). The same service keeps every report of the
// season with each player's Initial, Update and Game Day statuses (get-archive-public; the SEC, ACC, Big Ten and Big 12).
const ARCHIVE_URL = 'https://app.hdintelligence.com/api/get-archive-public';
const ARCHIVE_CONFERENCES = ['SEC', 'ACC', 'B10', 'B12'];

async function fetchArchive(conference, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(ARCHIVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ conference, sport: 'Football', source: conference }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Availability archive unavailable (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data?.data)) throw new Error('Availability archive returned no rows');
  return data.data.map((r) => ({ team: r.Team, player: r.Player, opponent: r.OpponentDisplay || r.Opponent, week: Number(r.WeekNum),
    date: r.Week ? new Date(r.Week).toISOString().slice(0, 10) : null, gameDay: String(r['Game Day'] || '').trim(),
    initial: String(r.Initial || '').trim() }));
}

/** One conference's archived report rows, cached for an hour. */
export async function conferenceArchive(conference, options = {}) {
  if (options.fetchImpl) return fetchArchive(conference, options);
  const result = await cachedResearch(`ncaaf-availability-archive-v1:${conference}`, async () => {
    try { return { rows: await fetchArchive(conference) }; } catch (error) { return { unavailable: true, reason: error.message }; }
  }, { ttlMs: (value) => (value?.unavailable ? 60_000 : 60 * 60_000), valid: (value) => Boolean(value) });
  if (result?.unavailable) throw new Error(result.reason);
  return result?.rows || [];
}

// A quoted nickname is left out of the key (Oct 29 2026 hunt, round 7: the report's 'Brenten "Inky" Jones').
const playerKey = (name) => String(name || '').replace(/\s*["“”][^"“”]*["“”]\s*/g, ' ').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

/**
 * A team's earlier reports this season, before `date`: { found, byPlayer: Map playerKey → [{ week, opponent, gameDay }]
 * newest first, weeks: the report weeks on file }. Reports cover conference games only. `found: false` when the
 * team's conference keeps no archive or none could be read.
 */
export async function teamReportHistory(team, { date } = {}, options = {}) {
  for (const conference of options.conferences || ARCHIVE_CONFERENCES) {
    let rows;
    try { rows = await conferenceArchive(conference, options); } catch { continue; }
    const mine = rows.filter((r) => sameSchool(r.team, team) && (!date || !r.date || r.date < date));
    if (!rows.some((r) => sameSchool(r.team, team))) continue;
    const byPlayer = new Map();
    for (const r of mine.sort((a, b) => b.week - a.week)) {
      const k = playerKey(r.player);
      if (!byPlayer.has(k)) byPlayer.set(k, []);
      byPlayer.get(k).push({ week: r.week, opponent: r.opponent, date: r.date, name: r.player, gameDay: r.gameDay || r.initial || 'listed' });
    }
    return { found: true, conference, byPlayer, weeks: [...new Set(mine.map((r) => r.week))].sort((a, b) => b - a) };
  }
  return { found: false };
}

/** "earlier reports: Wk 7 Out (vs Penn State), Wk 6 Out (at Minnesota)" or "first on a report this week", in words. */
export function historyLine(history, name, { short = false } = {}) {
  if (!history?.found) return null;
  const rows = history.byPlayer.get(playerKey(name)) || [];
  if (!rows.length) {
    if (!history.weeks.length) return null;
    return short ? 'new this week' : `first on a report this week (${history.weeks.length} earlier conference report week${history.weeks.length === 1 ? '' : 's'} on file)`;
  }
  return short ? `earlier: ${rows.map((r) => `Wk ${r.week} ${r.gameDay}`).join(', ')}`
    : `earlier game-day reports: ${rows.map((r) => `Wk ${r.week} ${r.gameDay}${r.opponent ? ` (${r.opponent})` : ''}`).join(', ')}`;
}

/**
 * Players out on an earlier game day this season who are not on this week's report (`reportedNames`): the ones coming
 * back, or already back. [{ name, outWeeks: [week], lastOutDate }], the most recent absence first.
 */
export function backFromReports(history, reportedNames = []) {
  if (!history?.found) return [];
  const listed = new Set(reportedNames.map(playerKey));
  const out = [];
  for (const [k, rows] of history.byPlayer) {
    if (listed.has(k)) continue;
    const outs = rows.filter((r) => /^out/i.test(r.gameDay));
    if (!outs.length) continue;
    out.push({ name: outs[0].name, outWeeks: outs.map((r) => r.week), lastOutDate: outs[0].date });
  }
  return out.sort((a, b) => String(b.lastOutDate).localeCompare(String(a.lastOutDate)));
}

/** The players a team listed Out on one game day (`date`, YYYY-MM-DD), from its report history; [] when none. */
/** Players a team's report listed as a game-time decision on `date` (round 16: three in four of them did not play, and the
 * game rows named only the outs). */
export function gameTimeOnGameDay(history, date) {
  if (!history?.found || !date) return [];
  return [...history.byPlayer.values()].map((rows) => rows.find((r) => r.date === date && /game.?time|^gtd/i.test(r.gameDay))).filter(Boolean).map((r) => r.name);
}

export function outOnGameDay(history, date) {
  if (!history?.found || !date) return [];
  const names = [];
  for (const rows of history.byPlayer.values()) {
    const hit = rows.find((r) => r.date === date && /^out/i.test(r.gameDay));
    if (hit) names.push(hit.name);
  }
  return names;
}
