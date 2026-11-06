/**
 * EACH PLAYER'S PRACTICES BY THEIR REAL DAY (Nov 6 2026 data fix). The league's file holds one undated word per player, so
 * its days were guessed from when the file was published: on Nov 1 every Sunday club's Friday word read "Sat, Oct 31",
 * Seattle's Saturday word read "Sun, Nov 1", and a day no one read the file was lost (D'Marco Jackson's Friday DNP).
 * BDL's player designations carry each practice with its date. A player it has no practices for keeps the file's latest
 * word, which says it is undated.
 */
import { fetchNflPracticeDesignations } from '../../content/insights/nflPracticeProvider.js';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { cachedResearch } from '../../gary/sharedResearchCache.js';

const TTL_MS = 30 * 60_000;
const WORD = { did_not_participate: 'DNP', limited: 'Limited', full: 'Full' };
const SUFFIX = /\b(?:jr|sr|ii|iii|iv|v)\b\.?/g;
const letters = (name) => String(name || '').toLowerCase().replace(SUFFIX, '').replace(/[^a-z]/g, '');
const lastOf = (name) => letters(String(name || '').toLowerCase().replace(SUFFIX, '').trim().split(/\s+/).slice(1).join(' '));
const dayWord = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

async function designations(team, season, week, seasonType) {
  const row = await ballDontLieService.getTeamByNameGeneric('americanfootball_nfl', team);
  if (!row?.id) return [];
  return cachedResearch(`nfl_practice_days_v1:${season}:${seasonType}:${week}:${row.id}`, () => fetchNflPracticeDesignations({ season, week, seasonTypes: [seasonType], teamIds: [row.id] }),
    { ttlMs: TTL_MS, valid: (rows) => Array.isArray(rows) && rows.length > 0 });
}

/**
 * Map(report name -> [{ day: 'Wed, Oct 28', practice: 'Limited' }], oldest first) for one club's week. `names`: the names on
 * the league's report. Matched by full name, else by a last name only one player on each side has ("Kiko" and "Francisco"
 * Mauigoa). A failed fetch is an empty map: the file's undated word stands, and says so.
 */
export async function practiceDaysByName(team, season, week, names, { seasonType = 2 } = {}) {
  const rows = await designations(team, season, week, seasonType).catch((e) => { console.warn(`[NFL data] practice days for ${team}: ${e.message}`); return []; });
  const full = (r) => `${r.player?.first_name || ''} ${r.player?.last_name || ''}`;
  const withDays = rows.filter((r) => r.practice_reports?.length);
  const byFull = new Map(withDays.map((r) => [letters(full(r)), r]));
  const count = (list) => { const m = new Map(); for (const x of list) m.set(lastOf(x), (m.get(lastOf(x)) || 0) + 1); return m; };
  const theirs = count(rows.map(full)), ours = count(names);
  const out = new Map();
  for (const name of names) {
    const r = byFull.get(letters(name)) || (ours.get(lastOf(name)) === 1 && theirs.get(lastOf(name)) === 1 ? withDays.find((x) => lastOf(full(x)) === lastOf(name)) : null);
    if (!r) continue;
    const days = r.practice_reports.filter((p) => WORD[p.status] && p.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((p) => ({ day: dayWord(p.date), practice: WORD[p.status] }));
    if (days.length) out.set(name, days);
  }
  return out;
}
