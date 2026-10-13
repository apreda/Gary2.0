/**
 * NBA Injury Report Service
 * Reads the NBA's official injury report (nbaOfficialInjuryReport.js; posted every 15 minutes on game days).
 *
 * This replaces unreliable grounded search for NBA injury STATUS extraction.
 * Grounding is still used for lineups (starters).
 * BDL is still used for duration enrichment.
 */

import { normalizeTeamName } from './agentic/sharedUtils.js';
import { latestOfficialReport } from './nbaOfficialInjuryReport.js';

// Cache: one report covers every team, so cache per date
let cachedData = null;
let cachedDate = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // the official report posts every 15 minutes

/**
 * Every row of the newest official NBA injury report (nbaOfficialInjuryReport.js), in the shape this service has
 * always read: { team, player, status, reason }. Since Oct 13 2026 the league's own report replaces the lapsed
 * RapidAPI copy of it: free, posted every 15 minutes instead of three times a day. When the newest report covers
 * no game on the requested date, its rows are tagged stale so the desk says whose report it is.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 */
async function fetchAllInjuries(dateStr) {
  const now = Date.now();
  if (cachedData && cachedDate === dateStr && (now - cachedAt) < CACHE_TTL_MS) {
    console.log(`[NBA Injuries] Using cached official report (${cachedData.length} entries, ${Math.round((now - cachedAt) / 1000)}s old)`);
    return cachedData;
  }
  const report = await latestOfficialReport();
  const [y, m, d] = String(dateStr).split('-');
  const covers = report.rows.some((r) => r.gameDate === `${m}/${d}/${y}`);
  const reportDate = report.rows[0]?.gameDate ? report.rows[0].gameDate.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$1-$2') : null;
  const data = report.rows.map((r) => ({ team: r.team, player: r.player, status: r.status, reason: r.reason, matchup: r.matchup,
    gameDate: r.gameDate, ...(covers ? {} : { _isStaleData: true, _sourceDate: reportDate, _requestedDate: dateStr }) }));
  cachedData = data;
  cachedDate = dateStr;
  cachedAt = now;
  console.log(`[NBA Injuries] Official report ${report.url}: ${data.length} entries${covers ? '' : ` (no game on ${dateStr}; newest report is ${reportDate})`}`);
  return data;
}

/**
 * Check if an API team name matches a target team name
 * Handles variations like "Miami Heat" matching "Miami Heat"
 */
function teamsMatch(apiTeam, targetTeam) {
  const api = normalizeTeamName(apiTeam);
  const target = normalizeTeamName(targetTeam);
  if (!api || !target) return false;
  return api === target || api.includes(target) || target.includes(api);
}

/**
 * Filter injury entries to only actionable statuses
 * Excludes: Available (cleared to play), G-League assignments
 */
function isActionableInjury(entry) {
  const status = (entry.status || '').toLowerCase();
  const reason = (entry.reason || '').toLowerCase();

  // Skip players cleared to play
  if (status === 'available') return false;

  // Skip G-League assignments (not injuries)
  if (reason.includes('g league') || reason.includes('g-league')) return false;

  return true;
}

/**
 * Map API status to the pipeline's expected status format
 */
function mapStatus(apiStatus) {
  const s = (apiStatus || '').toLowerCase();
  if (s === 'out') return 'Out';
  if (s === 'doubtful') return 'Doubtful';
  if (s === 'questionable') return 'Questionable';
  if (s === 'probable') return 'Prob';
  if (s === 'available') return 'Available';
  return apiStatus || 'Unknown';
}

/**
 * Parse full player name into first_name / last_name
 */
function parsePlayerName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  };
}

/**
 * Get NBA injuries for specific teams, formatted for the scout report pipeline.
 * Returns the same structure as parseGroundingInjuries() so it plugs in seamlessly.
 *
 * @param {string} homeTeam - Home team full name (e.g., "Miami Heat")
 * @param {string} awayTeam - Away team full name (e.g., "Utah Jazz")
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{home: Array, away: Array, groundingRaw: string}|null>} Structured injuries or null on failure
 */
export async function fetchNbaInjuriesForGame(homeTeam, awayTeam, dateStr) {
  try {
    const allEntries = await fetchAllInjuries(dateStr);

    // Detect stale-data fallback (provider lag): every entry will be tagged
    // _isStaleData by fetchAllInjuries when it served yesterday's report.
    const isStale = Array.isArray(allEntries) && allEntries.length > 0 && allEntries.every(e => e?._isStaleData);
    const staleSourceDate = isStale ? allEntries[0]?._sourceDate : null;

    const homeInjuries = [];
    const awayInjuries = [];
    const homeRaw = [];
    const awayRaw = [];

    for (const entry of allEntries) {
      // Only process entries for our teams
      const isHome = teamsMatch(entry.team, homeTeam);
      const isAway = teamsMatch(entry.team, awayTeam);
      if (!isHome && !isAway) continue;

      // Skip non-actionable entries
      if (!isActionableInjury(entry)) continue;

      const { first_name, last_name } = parsePlayerName(entry.player);
      const status = mapStatus(entry.status);
      const reason = entry.reason || '';

      const injury = {
        player: {
          first_name,
          last_name,
          position: ''
        },
        status,
        duration: 'UNKNOWN', // BDL enrichment will fill this in
        durationContext: reason,
        isEdge: false,
        durationNote: '',
        reportDateStr: '',
        daysSinceReport: null,
        source: 'nba_injury_report_api'
      };

      const rawLine = `${entry.player} - ${status} (${reason})`;

      if (isHome) {
        homeInjuries.push(injury);
        homeRaw.push(rawLine);
      } else {
        awayInjuries.push(injury);
        awayRaw.push(rawLine);
      }
    }

    // Build groundingRaw-style text for downstream context.
    // When the provider lagged and we used yesterday's report, prepend a
    // visible banner so Gary's scout report flags the staleness.
    const staleBanner = isStale && staleSourceDate
      ? [
          `⚠️ INJURY DATA IS FROM ${staleSourceDate} (provider hadn't published today's report yet).`,
          `Treat status fields as provisional — verify game-day actives via inactives list or pregame news.`,
          ''
        ].join('\n')
      : '';

    const groundingRaw = staleBanner + [
      `=== ${awayTeam} ===`,
      `${awayTeam} INJURY REPORT:`,
      awayRaw.length > 0 ? awayRaw.join('\n') : 'No injuries reported',
      '',
      `=== ${homeTeam} ===`,
      `${homeTeam} INJURY REPORT:`,
      homeRaw.length > 0 ? homeRaw.join('\n') : 'No injuries reported'
    ].join('\n');

    // Log summary
    const homeOut = homeInjuries.filter(i => i.status === 'Out').length;
    const awayOut = awayInjuries.filter(i => i.status === 'Out').length;
    console.log(`[NBA Injuries API] ${homeTeam}: ${homeInjuries.length} injuries (${homeOut} OUT)`);
    console.log(`[NBA Injuries API] ${awayTeam}: ${awayInjuries.length} injuries (${awayOut} OUT)`);
    if (isStale) {
      console.warn(`[NBA Injuries API] ⚠️ Returning STALE data from ${staleSourceDate} — provider lag fallback active.`);
    }

    return {
      home: homeInjuries,
      away: awayInjuries,
      groundingRaw,
      isStale,
      sourceDate: staleSourceDate
    };
  } catch (error) {
    console.error(`[NBA Injuries API] Failed: ${error.message}`);
    return null;
  }
}

export { fetchAllInjuries };
export default { fetchNbaInjuriesForGame, fetchAllInjuries };
