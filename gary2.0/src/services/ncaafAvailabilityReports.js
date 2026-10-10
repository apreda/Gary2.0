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
import { cachedResearch } from './sharedResearchCache.js';

const PUBLIC_REPORTS_URL = 'https://app.hdintelligence.com/api/get-publish-public';
export const REPORT_CONFERENCES = Object.freeze({
  SEC: { key: 'SEC', page: 'https://www.secsports.com/fbreports' },
  ACC: { key: 'ACC', page: 'https://theacc.com' },
  American: { key: 'American', page: 'https://theamerican.org' },
  MAC: { key: 'MAC', page: 'https://getsomemaction.com' },
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
const ALIASES = new Map([['army west point', 'army']]);

/** The report's team is this BDL team: the same school, never a prefix (North Carolina is not NC State). */
export function sameSchool(reportTeam, team) {
  const a = schoolKey(reportTeam);
  const reported = ALIASES.get(a) || a;
  const school = schoolKey(typeof team === 'string' ? team : team?.college || team?.name);
  return Boolean(reported) && reported === school;
}

/** "RB #0 KJ Edwards" -> { position: 'RB', number: '0', name: 'KJ Edwards' }. */
export function parseReportRow(text) {
  const m = String(text || '').trim().match(/^([A-Z/]{1,5})\s+#?(\d{1,3})\s+(.+)$/);
  return m ? { position: m[1], number: m[2], name: m[3].trim() } : { position: null, number: null, name: String(text || '').trim() };
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
      // "Report Pending" carries no players yet; it is not a report.
      if (home && away && home !== away && (home.rows.length || away.rows.length)) found.push({ report, home, away });
    }
  }
  if (!found.length) return { found: false, errors };
  const { report, home, away } = found.sort((a, b) => order(b.report).localeCompare(order(a.report)))[0];
  const listed = side => side.rows.filter(row => !NOT_LISTED.has(row.status.toLowerCase()));
  return {
    found: true,
    conference: report.conference,
    page: REPORT_CONFERENCES[report.conference]?.page || null,
    reportType: report.reportType,
    published: [report.publishDate, report.postedTime].filter(Boolean).join(' '),
    timeZone: report.timeZone,
    gameDate: report.gameDate,
    home: { team: home.team, listed: listed(home), players: home.rows.length },
    away: { team: away.team, listed: listed(away), players: away.rows.length },
  };
}
