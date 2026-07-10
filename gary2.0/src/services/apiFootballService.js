/**
 * API-Football (api-sports.io) service — recent-international form, injuries, and
 * player club stats for the World Cup. BDL FIFA only has World-Cup-edition match
 * data, which is empty on opening matchday; API-Football fills that gap with
 * CURRENT cross-competition data (qualifiers, friendlies, Nations League) so
 * Gary's WC picks rest on real, verifiable numbers instead of web grounding.
 *
 * Standalone by design — does NOT touch ballDontLieService / fifaWorldCupService.
 * Auth: x-apisports-key header, key from API_FOOTBALL_KEY. Base v3.football.api-sports.io.
 */

const BASE = 'https://v3.football.api-sports.io';
const API_KEY =
  (typeof process !== 'undefined' && process?.env?.API_FOOTBALL_KEY) ||
  (typeof process !== 'undefined' && process?.env?.VITE_API_FOOTBALL_KEY) || '';

// TTLs by volatility.
const TTL_STATIC = 24 * 60 * 60 * 1000; // team-id resolution
const TTL_FORM = 6 * 60 * 60 * 1000;    // recent fixtures / form
const TTL_INJURY = 2 * 60 * 60 * 1000;  // injuries
const DEFAULT_SEASON_AF = 2026;         // API-Football season for the current international cycle
// Only COMPLETED matches count toward recent form — a live or scheduled fixture
// (including the very match being predicted) must never pollute the averages.
const FINISHED = new Set(['FT', 'AET', 'PEN']);

const cache = new Map();
const getCached = (k) => { const e = cache.get(k); return e && Date.now() - e.ts < e.ttl ? e.data : null; };
// Entry-aware read: distinguishes a live cached value (whose .data may legitimately
// be null — a negative cache) from a miss. Returns { data } when live, else null.
const getCachedEntry = (k) => { const e = cache.get(k); return e && Date.now() - e.ts < e.ttl ? { data: e.data } : null; };
const setCache = (k, data, ttl) => cache.set(k, { data, ts: Date.now(), ttl });
const TTL_NEG = 30 * 60 * 1000; // negative cache (unresolved name) — short, so it retries later
export const clearApiFootballCache = () => cache.clear();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasApiFootballKey() { return !!API_KEY; }

/**
 * Low-level GET. Returns the `response` array (API-Football wraps payloads in
 * { response, errors, results }). Retries transient network blips; throws on a
 * real HTTP error or an API-level `errors` payload. Returns [] on no key (so the
 * scout report degrades gracefully rather than crashing).
 */
async function afFetch(path, params = {}) {
  if (!API_KEY) return [];
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
    } catch (e) {
      // Network/transport error — retryable.
      lastErr = e;
      if (i < 2) { await sleep(500 * (i + 1)); continue; }
      throw e;
    }
    if (!res.ok) {
      // 429 is a PER-MINUTE rate-limit (a ~30-call parallel scout burst can trip it) — retry
      // with a longer backoff so a WC team's form/xG isn't zeroed on the storing run. Other
      // 4xx (incl. 499 plan-limit) stay deterministic; 5xx is transient.
      const err = new Error(`API-Football ${res.status}: ${path}`);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw err;
      lastErr = err;
      if (i < 2) { await sleep((res.status === 429 ? 1500 : 500) * (i + 1)); continue; }
      throw err;
    }
    const json = await res.json();
    // API-Football returns errors as {} (object) when none, or a populated
    // object/array when present. A populated payload is a deterministic API
    // error — EXCEPT the per-minute rate limit, which arrives as HTTP 200 with
    // errors.rateLimit (never a real 429). The scout report fires ~9 calls in
    // one burst, so the last ones over the cap used to zero availability data
    // on the storing run (bit the Morocco@France QF, Jul 9 2026). Retry those
    // with a backoff long enough for the minute window to roll.
    const errs = json?.errors;
    const hasErr = Array.isArray(errs) ? errs.length > 0 : (errs && typeof errs === 'object' && Object.keys(errs).length > 0);
    if (hasErr) {
      const isRateLimit = !Array.isArray(errs) && typeof errs?.rateLimit === 'string';
      if (isRateLimit && i < 2) {
        lastErr = new Error(`API-Football rate limit: ${errs.rateLimit}`);
        const backoff = Number(process.env.AF_RATELIMIT_BACKOFF_MS) || 15000;
        console.warn(`[API-Football] Per-minute rate limit on ${path} — retrying in ${(backoff * (i + 1)) / 1000}s`);
        await sleep(backoff * (i + 1));
        continue;
      }
      throw new Error(`API-Football error: ${JSON.stringify(errs)}`);
    }
    return Array.isArray(json?.response) ? json.response : [];
  }
  throw lastErr;
}

// A few country names break API-Football's alphanumeric-only `search` param (it 400s
// on `&` / apostrophes) or read differently than our internal label. Map the problem
// cases to the API's spelling; everything else falls through to the sanitizer below.
const TEAM_NAME_ALIASES = {
  'bosnia & herzegovina': 'Bosnia',
  'bosnia and herzegovina': 'Bosnia',
  "côte d'ivoire": 'Ivory Coast',
  "cote d'ivoire": 'Ivory Coast',
  'cabo verde': 'Cape Verde',
  'cape verde islands': 'Cape Verde',
  'dr congo': 'Congo DR',
  'democratic republic of congo': 'Congo DR',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  'usa': 'USA',
  'united states': 'USA',
};
// Drop women's ("... W") and youth (U17/U20/U23) squads — `national: true` is true for
// all of them, so picking pool[0] blindly grabbed e.g. "Cape Verde W" for "Cabo Verde".
const isYouthOrWomenTeam = (n) => /\bU\d{1,2}\b/i.test(n || '') || /\bW$/.test(n || '');

/** Resolve a national team name (e.g. "France", "Senegal") to its senior API-Football team id. */
export async function resolveNationalTeamId(name) {
  if (!name) return null;
  const key = `natid_${name.toLowerCase()}`;
  const entry = getCachedEntry(key);
  if (entry) return entry.data; // honors a cached null (negative cache) — no re-fetch storm
  let id = null;
  try {
    const aliased = TEAM_NAME_ALIASES[name.toLowerCase()] || name;
    // Transliterate accents FIRST (ü→u, ç→c, ô→o) via NFD decomposition + combining-mark
    // strip — otherwise the alphanumeric sanitizer below turns "Türkiye"→"T rkiye" and
    // "Curaçao"→"Cura ao", which API-Football's search returns 0 rows for (silently
    // un-grounding those WC teams). THEN strip the remaining non-alphanumerics (& /
    // apostrophes) the search param rejects.
    const query = aliased
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const rows = await afFetch('/teams', { search: query });
    const senior = rows.filter((r) => r.team?.national === true && !isYouthOrWomenTeam(r.team?.name));
    const pool = senior.length ? senior : rows.filter((r) => !isYouthOrWomenTeam(r.team?.name));
    // Prefer an exact (case-insensitive) name match against alias or original, else first senior.
    const exact = pool.find((r) => {
      const tn = (r.team?.name || '').toLowerCase();
      return tn === aliased.toLowerCase() || tn === name.toLowerCase();
    });
    id = (exact || pool[0])?.team?.id ?? null;
    if (id == null) console.warn(`[API-Football] resolveNationalTeamId: no senior team for "${name}" (query="${query}")`);
  } catch (e) {
    console.warn(`[API-Football] resolveNationalTeamId(${name}) failed: ${e.message}`);
  }
  // Cache the result, including null — short TTL on misses so transient failures self-heal.
  setCache(key, id, id == null ? TTL_NEG : TTL_STATIC);
  return id;
}

/**
 * Recent form for a national team across ALL competitions (qualifiers, friendlies,
 * Nations League). Returns structured fixtures + last-5 / last-10 aggregates:
 *   { fixtures: [{date, league, opponent, gf, ga, result, home}],
 *     l5:  { played, w, d, l, gfPerMatch, gaPerMatch, form },
 *     l10: { ... } }
 * Empty shape if no data / no key.
 */
export async function getRecentForm(teamIdOrName, lastN = 10) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  const empty = { teamId: teamId ?? null, fixtures: [], l5: null, l10: null };
  if (!teamId) return empty;
  const key = `form_${teamId}_${lastN}`;
  const cached = getCached(key);
  if (cached) return cached;

  let rows;
  try {
    // Fetch a few extra so we still get lastN after dropping any in-progress or
    // upcoming fixture (incl. the match being predicted).
    rows = await afFetch('/fixtures', { team: teamId, last: lastN + 3 });
  } catch (e) {
    console.warn(`[API-Football] getRecentForm(${teamId}) failed: ${e.message}`);
    return empty;
  }

  const fixtures = [];
  for (const f of rows) {
    if (!FINISHED.has(f.fixture?.status?.short)) continue; // completed matches only
    if (fixtures.length >= lastN) break;
    const isHome = f.teams?.home?.id === teamId;
    const gf = isHome ? f.goals?.home : f.goals?.away;
    const ga = isHome ? f.goals?.away : f.goals?.home;
    if (gf == null || ga == null) continue; // skip unplayed/void
    fixtures.push({
      date: f.fixture?.date?.slice(0, 10) || null,
      league: f.league?.name || null,
      opponent: (isHome ? f.teams?.away?.name : f.teams?.home?.name) || null,
      home: isHome,
      gf, ga,
      result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    });
  }

  const agg = (n) => {
    const slice = fixtures.slice(0, n);
    if (!slice.length) return null;
    const sum = (sel) => slice.reduce((a, x) => a + sel(x), 0);
    const w = slice.filter((x) => x.result === 'W').length;
    const d = slice.filter((x) => x.result === 'D').length;
    const l = slice.filter((x) => x.result === 'L').length;
    return {
      played: slice.length,
      w, d, l,
      gfPerMatch: +(sum((x) => x.gf) / slice.length).toFixed(2),
      gaPerMatch: +(sum((x) => x.ga) / slice.length).toFixed(2),
      form: slice.map((x) => x.result).join(''), // most-recent first
    };
  };

  const out = { teamId, fixtures, l5: agg(5), l10: agg(10) };
  setCache(key, out, TTL_FORM);
  return out;
}

/** Current injuries for a national team's squad. Returns [{player, reason, type}]. */
export async function getInjuries(teamIdOrName, season = DEFAULT_SEASON_AF) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  if (!teamId) return [];
  const key = `inj_${teamId}_${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  let out = [];
  try {
    const rows = await afFetch('/injuries', { team: teamId, season });
    out = rows.map((r) => ({
      player: r.player?.name || null,
      reason: r.player?.reason || null,
      type: r.player?.type || null,
    })).filter((x) => x.player);
  } catch (e) {
    console.warn(`[API-Football] getInjuries(${teamId}) failed: ${e.message}`);
  }
  setCache(key, out, TTL_INJURY);
  return out;
}

/**
 * Availability timing (Jul 7 2026 — NBA-semantics port, founder-approved).
 * Cross-references the injury feed with REAL starting lineups from the team's
 * recent fixtures: FRESH = started the most recent match and is flagged now
 * (the market may still be settling the news); PRICED IN = already missing
 * from the XI in the last match(es) — every book set tonight's line knowing.
 * Returns [{ player, reason, type, tag, missedOfLastN, playedLast }].
 */
export async function getAvailabilityTiming(teamIdOrName, lastN = 3) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  if (!teamId) return [];
  const key = `avail_${teamId}_${lastN}`;
  const cached = getCached(key);
  if (cached) return cached;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  let out = [];
  try {
    const [injuries, fixtures] = await Promise.all([
      getInjuries(teamId),
      afFetch('/fixtures', { team: teamId, last: lastN + 2 }),
    ]);
    if (!injuries.length) { setCache(key, [], TTL_INJURY); return []; }
    const done = fixtures.filter(f => FINISHED.has(f.fixture?.status?.short)).slice(0, lastN);
    const starterSets = [];
    for (const f of done) {
      let rows = [];
      try { rows = await afFetch('/fixtures/lineups', { fixture: f.fixture?.id }); } catch { continue; }
      const mine = rows.find(r => r.team?.id === teamId);
      starterSets.push(new Set((mine?.startXI || []).map(x => norm(x.player?.name)).filter(Boolean)));
    }
    if (!starterSets.length) { setCache(key, [], TTL_INJURY); return []; }
    out = injuries.map((inj) => {
      const n = norm(inj.player);
      const playedLast = starterSets[0].has(n);
      const missedOfLastN = starterSets.filter(s => !s.has(n)).length;
      return {
        ...inj,
        playedLast,
        missedOfLastN: playedLast ? 0 : missedOfLastN,
        tag: playedLast ? 'FRESH' : 'PRICED IN',
      };
    });
  } catch (e) {
    console.warn(`[API-Football] getAvailabilityTiming(${teamId}) failed: ${e.message}`);
  }
  setCache(key, out, TTL_INJURY);
  return out;
}

/**
 * Aggregate per-match team performance stats (xG, possession, shots, SoT, corners,
 * pass accuracy) over a team's recent fixtures via /fixtures/statistics. Fills the
 * tape/report rows BDL can't provide until the 2026 tournament is underway. {} when
 * unavailable. One stats call per recent fixture (capped by lastN) — cached.
 */
export async function getRecentTeamStats(teamIdOrName, lastN = 6) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  if (!teamId) return {};
  const key = `tstats_${teamId}_${lastN}`;
  const cached = getCached(key);
  if (cached) return cached;
  let fixtures = [];
  try { fixtures = await afFetch('/fixtures', { team: teamId, last: lastN + 3 }); } catch { return {}; }
  const sampled = fixtures.filter(f => FINISHED.has(f.fixture?.status?.short)).slice(0, lastN);
  const ids = sampled.map(f => f.fixture?.id).filter(Boolean);
  if (!ids.length) return {};
  const num = (s) => { const v = parseFloat(String(s ?? '').replace('%', '')); return Number.isFinite(v) ? v : null; };
  const acc = { xg: [], xga: [], poss: [], shots: [], sot: [], corners: [], passAcc: [] };
  for (const fid of ids) {
    let rows;
    // Fetch BOTH teams (no team filter) so the opponent's xG gives this team's xGA.
    try { rows = await afFetch('/fixtures/statistics', { fixture: fid }); } catch { continue; }
    const mine = (rows.find(r => r.team?.id === teamId)?.statistics) || [];
    const opp = (rows.find(r => r.team?.id !== teamId)?.statistics) || [];
    const pick = (stats, ...types) => { for (const t of types) { const r = stats.find(s => s.type === t); if (r && num(r.value) != null) return num(r.value); } return null; };
    const push = (arr, v) => { if (v != null) arr.push(v); };
    push(acc.xg, pick(mine, 'expected_goals', 'Expected Goals'));
    push(acc.xga, pick(opp, 'expected_goals', 'Expected Goals')); // opponent xG = this team's xGA
    push(acc.poss, pick(mine, 'Ball Possession'));
    push(acc.shots, pick(mine, 'Total Shots'));
    push(acc.sot, pick(mine, 'Shots on Goal'));
    push(acc.corners, pick(mine, 'Corner Kicks'));
    push(acc.passAcc, pick(mine, 'Passes %'));
  }
  const avg = (arr) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : undefined;
  // An average carries the opposition it was earned against — return the sampled
  // fixtures (result + opponent) so the tape never renders a naked aggregate.
  const sampleOpponents = sampled.map((f) => {
    const isHome = f.teams?.home?.id === teamId;
    const opp = isHome ? f.teams?.away?.name : f.teams?.home?.name;
    if (!opp) return null;
    const gf = isHome ? f.goals?.home : f.goals?.away;
    const ga = isHome ? f.goals?.away : f.goals?.home;
    if (gf == null || ga == null) return `v ${opp}`;
    const letter = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    const et = f.fixture?.status?.short !== 'FT' ? ' aet' : '';
    return `${letter} ${gf}-${ga}${et} v ${opp}`;
  }).filter(Boolean);
  const out = {
    xg: avg(acc.xg), xga: avg(acc.xga), possession_pct: avg(acc.poss), shots: avg(acc.shots),
    shots_on_target: avg(acc.sot), corners: avg(acc.corners), pass_accuracy: avg(acc.passAcc),
    sampleMatches: ids.length,
    sampleOpponents,
  };
  setCache(key, out, TTL_FORM);
  return out;
}

/** Head-to-head record between two national teams (recent meetings). */
export async function getH2H(team1, team2, lastN = 6) {
  const id1 = typeof team1 === 'number' ? team1 : await resolveNationalTeamId(team1);
  const id2 = typeof team2 === 'number' ? team2 : await resolveNationalTeamId(team2);
  if (!id1 || !id2) return { meetings: [], summary: null };
  const key = `h2h_${id1}_${id2}_${lastN}`;
  const cached = getCached(key);
  if (cached) return cached;
  let rows = [];
  try { rows = await afFetch('/fixtures/headtohead', { h2h: `${id1}-${id2}`, last: lastN }); }
  catch { return { meetings: [], summary: null }; }
  // Completed matches only — an upcoming or abandoned fixture has no settled result.
  const meetings = rows.filter(f => FINISHED.has(f.fixture?.status?.short) && f.goals?.home != null).map(f => ({
    date: f.fixture?.date?.slice(0, 10), league: f.league?.name,
    home: f.teams?.home?.name, away: f.teams?.away?.name, score: `${f.goals.home}-${f.goals.away}`,
  }));
  const out = { meetings, summary: meetings.length ? `${meetings.length} recent meetings` : null };
  setCache(key, out, TTL_FORM);
  return out;
}

/**
 * National-team squad season stats (recent international goals/assists/apps/shots)
 * keyed by lowercased player name. Used as player-prop grounding. Across a full
 * cycle (qualifiers + friendlies + Nations League) a national team rotates 30-40+
 * players, so 2 pages (40 players) silently truncated busy squads — page up to 6,
 * stopping early on a short/empty page.
 */
export async function getSquadStats(teamIdOrName, season = DEFAULT_SEASON_AF) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  if (!teamId) return {};
  const key = `squad_${teamId}_${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  const out = {};
  for (let page = 1; page <= 6; page++) {
    let rows;
    try { rows = await afFetch('/players', { team: teamId, season, page }); } catch { break; }
    if (!rows.length) break;
    for (const r of rows) {
      const name = r.player?.name;
      if (!name) continue;
      const s = (r.statistics || [])[0] || {};
      // Coerce a numeric API-Football stat or null. The /players object reports a
      // not-recorded field as null (NEVER 0), so a missing rating/keeper stat stays
      // null and the card omits it — no fabricated 0 (e.g. an outfielder's saves).
      const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
      out[name.toLowerCase()] = {
        name,
        goals: s.goals?.total ?? 0,
        assists: s.goals?.assists ?? 0,
        appearances: s.games?.appearences ?? 0,
        shots: s.shots?.total ?? null,
        shots_on: s.shots?.on ?? null,
        position: r.player?.position || s.games?.position || null,
        // ── NEW EXTRACTION (same /players response, previously discarded) ──
        // Keeper: saves made + goals conceded over the cycle.
        saves: n(s.goals?.saves),
        conceded: n(s.goals?.conceded),
        // Midfield creativity + distribution.
        keyPasses: n(s.passes?.key),
        passAccuracy: n(s.passes?.accuracy),     // % (API reports 0-100)
        // Duels (NOT split aerial-only by API-Football — label honestly).
        duelsTotal: n(s.duels?.total),
        duelsWon: n(s.duels?.won),
        // Defensive volume.
        tackles: n(s.tackles?.total),
        interceptions: n(s.tackles?.interceptions),
        blocks: n(s.tackles?.blocks),
        // Carrying / 1v1 (attackers + wingers) — completed dribbles + attempts.
        dribblesSuccess: n(s.dribbles?.success),
        dribblesAttempts: n(s.dribbles?.attempts),
        // Fouls drawn = gets fouled (dangerous carrier / target man); committed = risk.
        foulsDrawn: n(s.fouls?.drawn),
        foulsCommitted: n(s.fouls?.committed),
        // Discipline.
        yellow: n(s.cards?.yellow),
        red: n(s.cards?.red),
        // Penalties (kept for completeness; not surfaced on the base card yet).
        penScored: n(s.penalty?.scored),
        penMissed: n(s.penalty?.missed),
        penSaved: n(s.penalty?.saved),
        // Workload + form.
        minutes: n(s.games?.minutes),
        rating: n(s.games?.rating),
      };
    }
    if (rows.length < 20) break; // API-Football pages /players 20/page; a short page is the last
  }
  setCache(key, out, TTL_FORM);
  return out;
}

export default { hasApiFootballKey, resolveNationalTeamId, getRecentForm, getRecentTeamStats, getH2H, getInjuries, getSquadStats, getAvailabilityTiming, clearApiFootballCache };
