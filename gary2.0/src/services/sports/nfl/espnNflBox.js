/**
 * THE OFFICIAL NFL BOX, PLAYER BY PLAYER (Oct 27 2026 data loop). nflverse's weekly player stats are worked out from the
 * play-by-play, and the league's stat crews count some things differently: across the first 107 games, 6,509 player
 * lines matched ESPN's official box on every passing, rushing, receiving and kicking number, but not on 38 tackle
 * totals, 10 passes defended, 10 QB hits and 8 target counts (Brock Bowers 13 targets, officially 14). Each weekly row
 * takes the official count where the two differ. A game ESPN has no final box for keeps nflverse's lines, as they are.
 */
import { cachedResearch } from '../../gary/sharedResearchCache.js';

const ESPN_CODE = { LA: 'LAR', WAS: 'WSH' };
const espn = (code) => ESPN_CODE[code] || code;
const fromEspn = (ab) => Object.entries(ESPN_CODE).find(([, v]) => v === ab)?.[0] || ab;
const get = (url) => fetch(url, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const DAY = 86_400_000;
export const nameKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const lastKey = (s) => nameKey(String(s || '').split(' ').filter((w) => !/^(jr|sr|ii|iii|iv|v)\.?$/i.test(w)).pop());
const pair = (v) => String(v ?? '').split(/[/-]/).map((x) => (x === '' ? null : Number(x)));

// ESPN's events for one regular-season week, keyed by both teams ("CAR PHI"), so a neutral-site game is found whichever
// side ESPN calls home.
const weeks = new Map();
function weekEvents(season, week) {
  const k = `${season}:${week}`;
  if (!weeks.has(k)) weeks.set(k, get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`)
    .then((j) => new Map((j?.events || []).map((e) => [(e.competitions?.[0]?.competitors || []).map((c) => c.team.abbreviation).sort().join(' '), e.id]))));
  return weeks.get(k);
}

// One game's official player lines: { [nflverse team code]: [{ name, key, last, ...stat categories }] }, or null. A box
// is kept a day while the week's stat corrections can still land, then a month.
async function officialLines(g) {
  const id = (await weekEvents(g.season, Number(g.week))).get([espn(g.home_team), espn(g.away_team)].sort().join(' '));
  if (!id) return null;
  const recent = Date.now() - Date.parse(`${g.gameday}T12:00:00Z`) < 10 * DAY;
  return cachedResearch(`espn_nfl_box_v1:${id}`, async () => {
    const s = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`);
    const done = /final/i.test(String(s?.header?.competitions?.[0]?.status?.type?.name || ''));
    if (!done || !(s?.boxscore?.players || []).length) return { unavailable: true };
    const out = {};
    for (const t of s.boxscore.players) {
      const byKey = new Map();
      for (const cat of t.statistics || []) for (const a of cat.athletes || []) {
        const k = nameKey(a.athlete?.displayName);
        const row = byKey.get(k) || { name: a.athlete?.displayName, key: k, last: lastKey(a.athlete?.displayName) };
        row[cat.name] = Object.fromEntries((cat.keys || []).map((key, i) => [key, a.stats?.[i]]));
        byKey.set(k, row);
      }
      out[fromEspn(t.team?.abbreviation)] = [...byKey.values()];
    }
    return out;
  }, { ttlMs: recent ? DAY : 30 * DAY }).then((v) => (v?.unavailable ? null : v)).catch(() => null);
}

// The weekly row's fields from the official line, category by category; a category the official box doesn't list for
// the player leaves the row's own numbers.
function officialFields(o) {
  const f = {};
  const num = (v) => (v == null || v === '' || v === '--' ? null : Number(v));
  if (o.passing) {
    const [c, a] = pair(o.passing['completions/passingAttempts']); const [sk, sy] = pair(o.passing['sacks-sackYardsLost']);
    Object.assign(f, { completions: c, attempts: a, passing_yards: num(o.passing.passingYards), passing_tds: num(o.passing.passingTouchdowns),
      passing_interceptions: num(o.passing.interceptions), sacks_suffered: sk, sack_yards_lost: sy == null ? null : -Math.abs(sy) });
  }
  if (o.rushing) Object.assign(f, { carries: num(o.rushing.rushingAttempts), rushing_yards: num(o.rushing.rushingYards), rushing_tds: num(o.rushing.rushingTouchdowns) });
  if (o.receiving) Object.assign(f, { receptions: num(o.receiving.receptions), receiving_yards: num(o.receiving.receivingYards), receiving_tds: num(o.receiving.receivingTouchdowns), targets: num(o.receiving.receivingTargets) });
  if (o.defensive) {
    const total = num(o.defensive.totalTackles), solo = num(o.defensive.soloTackles);
    Object.assign(f, { def_tackles_solo: solo, def_tackle_assists: total != null && solo != null ? total - solo : null, def_tackles_with_assist: total != null && solo != null ? 0 : null,
      def_sacks: num(o.defensive.sacks), def_tackles_for_loss: num(o.defensive.tacklesForLoss), def_pass_defended: num(o.defensive.passesDefended), def_qb_hits: num(o.defensive.QBHits) });
  }
  if (o.interceptions) f.def_interceptions = num(o.interceptions.interceptions);
  if (o.kicking) {
    const [fm, fa] = pair(o.kicking['fieldGoalsMade/fieldGoalAttempts']); const [xm, xa] = pair(o.kicking['extraPointsMade/extraPointAttempts']);
    Object.assign(f, { fg_made: fm, fg_att: fa, pat_made: xm, pat_att: xa });
  }
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && !Number.isNaN(v)));
}

/** The weekly player rows with each finished game's official counts in place: { rows, corrected, gamesChecked }. Rows
 * are copied, never changed in place; `corrected` lists "game player (field ours to official)". */
export async function withOfficialBox(rows, schedule, season, { limit = 8 } = {}) {
  if (!rows?.length) return { rows, corrected: [], gamesChecked: 0 };
  const games = (schedule || []).filter((g) => g.season === String(season) && g.game_type === 'REG' && g.home_score !== '' && g.home_score != null && g.away_score !== '');
  const official = new Map();
  for (let i = 0; i < games.length; i += limit) {
    const part = games.slice(i, i + limit);
    const got = await Promise.all(part.map((g) => officialLines(g)));
    part.forEach((g, j) => { if (got[j]) official.set(g.game_id, got[j]); });
  }
  // Each official line goes to one weekly row: the row with the same name, else the one row on that side left unmatched
  // with the same last name and first initial ("Daxton Hill" is ESPN's "Dax Hill"). Last name alone gave an inactive
  // "Nathaniel Watson" Deshaun Watson's line, and B.J. Hill Dax Hill's tackles.
  const initial = (name) => nameKey(name).charAt(0);
  const matchOf = new Map();
  for (const [gameId, sides] of official) for (const [team, lines] of Object.entries(sides)) {
    const mine = rows.filter((r) => r.game_id === gameId && r.team === team);
    const taken = new Set();
    for (const o of lines) { const r = mine.find((x) => nameKey(x.player_display_name) === o.key && !taken.has(x)); if (r) { matchOf.set(r, o); taken.add(r); } }
    const matchedLines = new Set(matchOf.values());
    for (const o of lines.filter((x) => !matchedLines.has(x))) {
      const cands = mine.filter((x) => !taken.has(x) && lastKey(x.player_display_name) === o.last && initial(x.player_display_name) === initial(o.name));
      if (cands.length === 1) { matchOf.set(cands[0], o); taken.add(cands[0]); }
    }
  }
  const corrected = [];
  const out = rows.map((r) => {
    const o = matchOf.get(r);
    if (!o) return r;
    const f = officialFields(o);
    const changed = Object.keys(f).filter((key) => (Number(r[key]) || 0) !== f[key]);
    if (!changed.length) return r;
    corrected.push(`${r.game_id} ${r.player_display_name} (${changed.map((key) => `${key} ${Number(r[key]) || 0} to ${f[key]}`).join(', ')})`);
    return { ...r, ...Object.fromEntries(changed.map((key) => [key, f[key]])) };
  });
  return { rows: out, corrected, gamesChecked: official.size };
}
