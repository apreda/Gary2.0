// The NFL's official injury report (nfl.com/injuries) — the league's own
// practice-participation ledger, one table per team per game: Player,
// Position, Injuries, Practice Status (Full / Limited / Did Not Participate),
// Game Status (Out / Doubtful / Questionable). The page is server-rendered;
// each fetch is one day's snapshot, so the week's Wed/Thu/Fri grid is built
// by the computer from daily snapshots (footballPracticeReport.js).
//
// Nothing here is inferred: a cell the page does not carry is null.

import axios from 'axios';

const PAGE = 'https://www.nfl.com/injuries/';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function unescape(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}
function text(fragment) {
  return unescape(String(fragment || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** "Full Participation in Practice" → FP · "Limited …" → LP · "Did Not …" → DNP. */
export function practiceCode(label) {
  const value = String(label || '').toLowerCase();
  if (!value) return null;
  if (value.startsWith('full')) return 'FP';
  if (value.startsWith('limited')) return 'LP';
  if (value.startsWith('did not')) return 'DNP';
  return null;
}

/** Game-status words the report uses; anything else stays as written. */
function gameStatus(label) {
  const value = text(label);
  return value || null;
}

/**
 * Parse one page. Returns { title, week, season, units } where each unit is a
 * game: { teams: [{ abbr, name, rows }] } in the page's own order (opponent
 * first, i.e. away, then home). Rows: { player, position, injury, practiceText,
 * practice, gameStatus }.
 */
export function parseOfficialInjuryReport(html) {
  const source = String(html || '');
  const title = text((source.match(/<title>([^<]*)<\/title>/i) || [])[1]);
  const weekMatch = title.match(/Week (\d+) of the (\d{4}) Season/i);
  const units = source.split(/<section class="nfl-o-injury-report__unit"/).slice(1).map((unit) => {
    const abbrs = [...unit.matchAll(/nfl-c-matchup-strip__team-abbreviation[^>]*>\s*([A-Z]{2,4})/g)].map((m) => m[1]);
    const names = [...unit.matchAll(/nfl-c-matchup-strip__team-fullname[^>]*>\s*([^<]+)/g)].map((m) => text(m[1]));
    const tables = [...unit.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
    const teams = tables.slice(0, 2).map((table, index) => {
      const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
        .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])))
        .filter((cells) => cells.length >= 5 && cells[0])
        .map(([player, position, injury, practiceText, status]) => ({
          player,
          position: position || null,
          injury: injury || null,
          practiceText: practiceText || null,
          practice: practiceCode(practiceText),
          gameStatus: gameStatus(status),
        }));
      return { abbr: abbrs[index] || null, name: names[index] || null, rows };
    });
    return { teams };
  }).filter((unit) => unit.teams.length === 2);
  return {
    title,
    week: weekMatch ? Number(weekMatch[1]) : null,
    season: weekMatch ? Number(weekMatch[2]) : null,
    units,
  };
}

/**
 * Fetch and parse. Default = the league's current week page; pass
 * { season, week, seasonType } for an archived week (REG / POST).
 */
export async function fetchOfficialInjuryReport({ season, week, seasonType = 'REG', client = axios } = {}) {
  const url = season && week ? `${PAGE}league/${season}/${seasonType}${week}` : PAGE;
  const { data } = await client.get(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    timeout: 20_000,
    responseType: 'text',
  });
  return { url, ...parseOfficialInjuryReport(data) };
}

export default { fetchOfficialInjuryReport, parseOfficialInjuryReport, practiceCode };
