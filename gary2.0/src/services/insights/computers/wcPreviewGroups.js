// gary2.0/src/services/insights/computers/wcPreviewGroups.js
//
// LANE: wcPreviewGroups  (category token emitted: tournament)
// "Pre-tournament group board: one card per World Cup group laying out who is in
//  it, who the market frames as the group's strongest side, and when the group
//  gets going. Shown daily before the tournament opens (June 11, 2026) and on any
//  rest day while no matches are played."
//
// PREVIEW MODE: the orchestrator passes ctx = { date, season:2026, league:'wc',
// games: ALL 2026 fixtures (the full scheduled list), slateGameIds, preview:true,
// helpers }. Matches are RAW FIFA shape. We do NOT refetch fixtures — we read
// ctx.games — and we hit getGroupStandings()/getFutures() once each.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH (ctx.games[i]): { id, datetime (ISO UTC), status 'scheduled',
//       stage:{name}, group:{name 'Group A'..'Group L'},
//       home_team:{id,name,abbreviation,country_code}, away_team:{...} }.
//   * getGroupStandings() -> 48 rows: {
//       team:{id,name,abbreviation}, group:{name}, position (1..4), played, won,
//       drawn, lost, goals_for, goals_against, goal_difference, points }.
//       Pre-tournament every row is position-seeded with played=0.
//   * getFutures() -> rows incl. market_type 'outright' (market_name 'Winner') =
//       title odds (one per team per vendor) and market_type 'group_winner'
//       (market_name 'Group X') = group-winner odds. { subject:{id,name},
//       american_odds, decimal_odds, vendor }.
//
// ROW SHAPE: ONE row per group (A..L => up to 12 rows). game = the literal group
// label e.g. 'GROUP A'. game_id is OMITTED on these board rows (the orchestrator
// slate filter only applies when game_id is present), so they survive the slate
// filter and show on rest days / pre-tournament.
//
// Defensive contract: any missing piece -> degrade the copy (drop the missing
// clause) rather than skip; only skip a group entirely if we cannot name a single
// team in it. No data at all -> []. Emits a one-line summary for diagnosability.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, nameKey } from '../shared.js';

const wc = fifaWorldCupService;

// Relevance: groups whose first match is within 3 days of ctx.date rank higher.
const SCORE_IMMINENT = 60; // first match within 3 days
const SCORE_LATER = 52;
const IMMINENT_DAYS = 3;

export async function computeWcPreviewGroups(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcPreviewGroups] examined 0, emitted 0');
    return [];
  }

  // Slate-wide context, fetched once each, defensively.
  const [standings, futures] = await Promise.all([
    safe(() => wc.getGroupStandings(), []),
    safe(() => wc.getFutures(), []),
  ]);

  // NOTE on id spaces: the FUTURES endpoint's subject.id is a SEPARATE id space
  // from the matches/standings team.id (verified 2026-06-04: Argentina is
  // subject.id 2065 in futures but team.id 37 in matches/standings). Team NAMES
  // are stable across every endpoint, so we key the odds maps by name-key and
  // look them up by team name.
  const standByGroup = indexStandingsByGroup(standings);
  const titleOddsByName = indexTitleOdds(futures);
  const groupWinnerByName = indexGroupWinnerOdds(futures);

  // Bucket fixtures by group name and find each group's FIRST fixture.
  const fixturesByGroup = new Map();
  for (const match of games) {
    const g = match?.group?.name;
    if (!g) continue;
    if (!fixturesByGroup.has(g)) fixturesByGroup.set(g, []);
    fixturesByGroup.get(g).push(match);
  }

  // Stable A..L ordering by group letter.
  const groupNames = [...fixturesByGroup.keys()].sort(byGroupLetter);

  const refDate = parseDateStr(ctx?.date);
  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const groupName of groupNames) {
    stats.examined += 1;
    try {
      const row = buildGroupRow({
        groupName,
        fixtures: fixturesByGroup.get(groupName) || [],
        standRows: standByGroup.get(groupName) || [],
        titleOddsByName,
        groupWinnerByName,
        refDate,
      });
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcPreviewGroups] group error:', err?.message || err);
      // continue to next group
    }
  }

  stats.emitted = rows.length;
  console.log(`[wcPreviewGroups] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

function buildGroupRow({ groupName, fixtures, standRows, titleOddsByName, groupWinnerByName, refDate }) {
  // Collect the group's teams. Prefer standings (carries a seeded position), fall
  // back to the unique teams that appear across the group's fixtures.
  const teams = collectGroupTeams(standRows, fixtures);
  if (!teams.length) return null;

  // Order by group-winner odds-implied strength, then standings position, then
  // name — so the headline reads strongest-to-weakest deterministically.
  const ordered = [...teams].sort((a, b) => {
    const sa = strengthScore(a, titleOddsByName, groupWinnerByName);
    const sb = strengthScore(b, titleOddsByName, groupWinnerByName);
    if (sb !== sa) return sb - sa;
    const pa = a.position ?? 99;
    const pb = b.position ?? 99;
    if (pa !== pb) return pa - pb;
    return String(a.name).localeCompare(String(b.name));
  });

  const letter = groupLetter(groupName); // 'A'
  const names = ordered.map((t) => t.name).filter(Boolean);
  const headline = `${groupName}: ${names.join(', ')}`;

  const clauses = [];

  // (1) Group's favourite (title odds for contenders, else group-winner market).
  const fav = buildFavouriteClause(ordered, titleOddsByName, groupWinnerByName, groupName);
  if (fav.text) clauses.push(fav.text);

  // (2) The group's FIRST fixture: date + opponents.
  const openerClause = buildOpenerClause(fixtures);
  if (openerClause) clauses.push(openerClause);

  // (3) One plain fact: the shortest-priced group-winner quote — skipped when the
  // favourite clause already used the group-winner market (avoid a duplicate).
  if (!fav.usedGroupWinner) {
    const factClause = buildGroupWinnerFactClause(ordered, groupWinnerByName, groupName);
    if (factClause) clauses.push(factClause);
  }

  if (!clauses.length) {
    // Still emit a minimal, honest board row naming the group's teams.
    clauses.push(`${names.length} sides drawn together for the group stage.`);
  }

  const score = groupRelevance(fixtures, refDate);

  return makeRow({
    category: 'tournament',
    headline,
    detail: clauses.join(' '),
    game: `GROUP ${letter}`,
    value: letter,
    tone: TONES.NEUTRAL, // pre-tournament board — informational, not directional
    relevance_score: clampScore(score),
    // game_id intentionally OMITTED — board row, must survive the slate filter.
  });
}

// --- clause builders -------------------------------------------------------

/**
 * The group's favourite. For a genuine contender (top-12 by tournament-title
 * odds) we frame it as a title choice ('Argentina enter as the No. 1 title
 * choice'). When no team in the group ranks among the title contenders, we name
 * the group's strongest side by the group-winner market instead of implying a
 * misleading tournament-title price. `ordered` is strongest-first.
 */
function buildFavouriteClause(orderedTeams, titleOddsByName, groupWinnerByName, groupName) {
  // Real title contender? Use the title-rank framing the spec asks for.
  let bestTitle = null;
  for (const t of orderedTeams) {
    const o = titleOddsByName.get(nameKey(t.name));
    if (!o || o.rank == null) continue;
    if (!bestTitle || o.rank < bestTitle.rank) bestTitle = { name: t.name, rank: o.rank, odds: o.american_odds };
  }
  if (bestTitle && bestTitle.rank <= 12) {
    return {
      text: `${bestTitle.name} enter as the No. ${bestTitle.rank} title choice${bestTitle.odds != null ? ` at ${fmtOdds(bestTitle.odds)}` : ''}.`,
      usedGroupWinner: false,
    };
  }

  // No title contender in the group — name the group favourite by group-winner odds.
  let bestGroup = null;
  for (const t of orderedTeams) {
    const o = groupWinnerByName.get(nameKey(t.name));
    if (!o || o.american_odds == null) continue;
    if (!bestGroup || impliedProb(o.american_odds) > impliedProb(bestGroup.odds)) {
      bestGroup = { name: t.name, odds: o.american_odds };
    }
  }
  if (bestGroup) {
    return {
      text: `${bestGroup.name} are the market favourite to win ${groupName} at ${fmtOdds(bestGroup.odds)}.`,
      usedGroupWinner: true,
    };
  }
  return { text: '', usedGroupWinner: false };
}

/** "Opens June 13: Argentina vs Jordan." From the group's earliest fixture. */
function buildOpenerClause(fixtures) {
  const opener = earliestFixture(fixtures);
  if (!opener) return '';
  const home = opener.home_team?.name;
  const away = opener.away_team?.name;
  const when = prettyDate(opener.datetime);
  if (!home || !away) return '';
  if (when) return `Opens ${when}: ${home} vs ${away}.`;
  return `Opens with ${home} vs ${away}.`;
}

/** Plain fact: the shortest-priced group-winner quote in the group. */
function buildGroupWinnerFactClause(orderedTeams, groupWinnerByName, groupName) {
  let best = null;
  for (const t of orderedTeams) {
    const o = groupWinnerByName.get(nameKey(t.name));
    if (!o || o.american_odds == null) continue;
    if (!best || impliedProb(o.american_odds) > impliedProb(best.odds)) {
      best = { name: t.name, odds: o.american_odds };
    }
  }
  if (!best) return '';
  return `Shortest price to win ${groupName}: ${best.name} at ${fmtOdds(best.odds)}.`;
}

// --- team collection + strength --------------------------------------------

/** Group teams from standings (with seeded position) or, failing that, fixtures. */
function collectGroupTeams(standRows, fixtures) {
  const map = new Map();
  for (const s of standRows) {
    const team = s?.team;
    if (!team?.id) continue;
    map.set(String(team.id), { id: team.id, name: team.name, abbreviation: team.abbreviation, position: num(s.position) });
  }
  if (map.size === 0) {
    for (const m of fixtures) {
      for (const team of [m.home_team, m.away_team]) {
        if (!team?.id) continue;
        if (!map.has(String(team.id))) {
          map.set(String(team.id), { id: team.id, name: team.name, abbreviation: team.abbreviation, position: null });
        }
      }
    }
  }
  return [...map.values()];
}

/**
 * Strength score for ordering: higher = stronger. The GROUP-WINNER market is the
 * group-level strength signal and leads; title implied prob is a secondary
 * tie-breaker among genuine contenders. When a team has NO futures at all (real
 * in this data — e.g. the host Mexico carries no quotes), we fall back to its
 * seeded standings position so a top seed is not buried beneath a longshot that
 * merely happens to have a stray quote. The seed term is scaled to sit between
 * "has a group-winner price" and "has nothing", preserving the spec's
 * "position OR odds-implied strength" ordering.
 */
function strengthScore(team, titleOddsByName, groupWinnerByName) {
  const t = titleOddsByName.get(nameKey(team.name));
  const g = groupWinnerByName.get(nameKey(team.name));
  const groupP = g?.american_odds != null ? impliedProb(g.american_odds) : null;
  const titleP = t?.american_odds != null ? impliedProb(t.american_odds) : 0;
  // Seed-derived pseudo-probability (position 1 -> ~0.5 down to ~0.1) used only
  // when the market is silent on this team.
  const seedP = team.position != null ? Math.max(0.05, 0.55 - 0.12 * (team.position - 1)) : 0;
  const primary = groupP != null ? groupP : seedP;
  return primary * 100 + titleP;
}

// --- scoring ---------------------------------------------------------------

/** 60 if the group's first match is within 3 days of ctx.date, else 52. */
function groupRelevance(fixtures, refDate) {
  if (!refDate) return SCORE_LATER;
  const opener = earliestFixture(fixtures);
  const start = opener ? parseIso(opener.datetime) : null;
  if (!start) return SCORE_LATER;
  const days = (start.getTime() - refDate.getTime()) / (24 * 60 * 60 * 1000);
  return days <= IMMINENT_DAYS ? SCORE_IMMINENT : SCORE_LATER;
}

// --- indexing --------------------------------------------------------------

function indexStandingsByGroup(standings) {
  const map = new Map();
  for (const row of standings || []) {
    const g = row?.group?.name;
    if (!g) continue;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(row);
  }
  return map;
}

/**
 * Shortest-priced title future per team from 'outright'/'Winner', ranked 1=fav.
 * Keyed by NAME-KEY (futures subject.id is a different id space from matches).
 */
function indexTitleOdds(futures) {
  const byName = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== 'outright') continue;
    if (!/winner/i.test(f.market_name || '')) continue;
    const name = f.subject?.name;
    const odds = num(f.american_odds);
    if (!name || odds == null) continue;
    const k = nameKey(name);
    const cur = byName.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.american_odds)) {
      byName.set(k, { american_odds: odds, name });
    }
  }
  const ranked = [...byName.entries()].sort(
    (a, b) => impliedProb(b[1].american_odds) - impliedProb(a[1].american_odds),
  );
  ranked.forEach(([, v], i) => { v.rank = i + 1; });
  return byName;
}

/**
 * Shortest-priced group-winner future per team from 'group_winner'/'Group X'.
 * Keyed by NAME-KEY (see indexTitleOdds).
 */
function indexGroupWinnerOdds(futures) {
  const byName = new Map();
  for (const f of futures || []) {
    if (f?.market_type !== 'group_winner') continue;
    const name = f.subject?.name;
    const odds = num(f.american_odds);
    if (!name || odds == null) continue;
    const k = nameKey(name);
    const cur = byName.get(k);
    if (!cur || impliedProb(odds) > impliedProb(cur.american_odds)) {
      byName.set(k, { american_odds: odds, name });
    }
  }
  return byName;
}

// --- formatting + small utils ----------------------------------------------

/** Earliest-by-datetime fixture in a group (the group opener). */
function earliestFixture(fixtures) {
  let best = null;
  for (const m of fixtures || []) {
    if (!m?.datetime) continue;
    if (!best || String(m.datetime).localeCompare(String(best.datetime)) < 0) best = m;
  }
  return best;
}

/** 'Group A' -> 'A'. */
function groupLetter(groupName) {
  const mt = String(groupName || '').match(/group\s+([a-z])/i);
  return mt ? mt[1].toUpperCase() : String(groupName || '').trim().slice(-1).toUpperCase();
}

/** Sort two group names by letter (A..L). */
function byGroupLetter(a, b) {
  return groupLetter(a).localeCompare(groupLetter(b));
}

/** ISO UTC -> "June 13" (UTC calendar day). Empty string when unparseable. */
function prettyDate(iso) {
  const d = parseIso(iso);
  if (!d) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Parse an ISO datetime string to a Date, or null. */
function parseIso(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a YYYY-MM-DD ctx.date to a UTC midnight Date, or null. */
function parseDateStr(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const mt = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return parseIso(dateStr);
  const d = new Date(Date.UTC(Number(mt[1]), Number(mt[2]) - 1, Number(mt[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** American odds with explicit sign. */
function fmtOdds(o) {
  const v = Number(o);
  if (!Number.isFinite(v)) return String(o);
  return v > 0 ? `+${v}` : `${v}`;
}

/** Implied probability from American odds (no-vig-naive, for ranking only). */
function impliedProb(american) {
  const v = Number(american);
  if (!Number.isFinite(v)) return 0;
  return v > 0 ? 100 / (v + 100) : -v / (-v + 100);
}

/** Coerce a value to a finite number, or null. */
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Run an async producer, returning fallback on any throw. */
async function safe(fn, fallback) {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export default { computeWcPreviewGroups };
