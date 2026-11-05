/** The big games, board rows and the marquee keys (split from tomorrowService.js, Oct 13 2026). */
import { findParkData } from '../../gary/agentic/tools/statRouters/mlbFetchers.js';
import { isBigGame } from '../../winners/winnersRules.js';
import { PRIMETIME_HOUR_ET, nameKey, gameTimeBucket, rowMatchupKey, repeatedMatchupKeys, rowGameIdentity, etHour, abbrFor, isRivalry } from './basics.js';
import { fetchNationalNbaGames } from '../../winners/nbaNationalGames.js';

/* ───────────────────────────── 4. BIG GAMES ─────────────────────────────── */

/**
 * Select up to five games with an actual marquee reason. College uses
 * ranked matchups; NFL uses its existing national-window rule. MLB uses
 * standings, rivalry and probable starters. The NBA's headliner (rivalry,
 * national draws, the late window) always makes it, plus a rivalry. Start time breaks ties among
 * qualified games; it never makes an ordinary matchup a big game.
 */
export function buildBigGames(board, { mlb, nbaNational = null }) {
  const repeatedMatchups = repeatedMatchupKeys(board);
  // The NBA's big games are the ones on national TV (founder, Nov 4 2026: "this should of been the 76ers Piston that
  // was the big game on tv tonight along with spurs mavs later"; the draws list had put Bucks @ Celtics on Home). The
  // nickname list below is only for a night ESPN's scoreboard can't be read or carries no national game.
  const national = nbaNational instanceof Set && nbaNational.size ? nbaNational : null;
  const scored = board.map((row) => {
    let weight = 0;
    let reason = null;       // single highest-weight factor -> internal ranking trace
    let bestReasonW = -1;
    let standing = null;     // plain-text divisional standing -> what iOS renders
    const ctxParts = [];
    // BOTH probable starters' last names for MLB cards => { away, home }.
    // null for non-MLB. "Undecided" per side when a probable is unposted.
    let pitchers = null;
    let rivalry = false;
    let chainOnly = false;

    const setReason = (label, w) => {
      if (w > bestReasonW) { bestReasonW = w; reason = label; }
    };

    if (row.league === 'MLB' && mlb) {
      const awayAbbr = abbrFor(row.away_team, mlb.teamIndex);
      const homeAbbr = abbrFor(row.home_team, mlb.teamIndex);
      const awayId = mlb.idByName.get(nameKey(row.away_team));
      const homeId = mlb.idByName.get(nameKey(row.home_team));
      const aSt = awayId != null ? mlb.standings.get(awayId) : null;
      const hSt = homeId != null ? mlb.standings.get(homeId) : null;
      const aTeam = awayId != null ? mlb.teamIndex.byId.get(awayId) : null;
      const hTeam = homeId != null ? mlb.teamIndex.byId.get(homeId) : null;

      // STANDINGS — division leaders and meetings between top-two teams.
      const bothTop2 = aSt?.divisionRank && hSt?.divisionRank && aSt.divisionRank <= 2 && hSt.divisionRank <= 2;
      const sameDivision = aTeam?.divisionId != null && aTeam.divisionId === hTeam?.divisionId;
      if (aSt?.divisionRank === 1 || hSt?.divisionRank === 1) {
        setReason('FIRST PLACE', 30);
        weight += 30;
      }
      if (bothTop2 && sameDivision) {
        setReason('DIVISION', 28);
        weight += 26;
        const small = (aSt?.gamesBack != null && aSt.gamesBack <= 3) || (hSt?.gamesBack != null && hSt.gamesBack <= 3);
        if (small) { setReason('PENNANT RACE', 32); weight += 10; }
      }

      // DISPLAYED CONTEXT — the ACTUAL current divisional standing, plain text.
      // (Replaces the old reason-chip / division tag as what iOS shows.)
      standing = bigGameStanding({
        aSt, hSt, aTeam, hTeam, awayTeam: row.away_team, homeTeam: row.home_team,
      });

      // RIVALRY — curated divisional pairs.
      if (isRivalry(awayAbbr, homeAbbr)) { setReason('RIVALRY', 27); weight += 24; }

      // Doubleheader-safe map reads: entries are per-GAME (time-stamped) —
      // take the entry nearest this row's own start time, so game 2's card
      // never wears game 1's arms.
      const rowT = Date.parse(row.commence_time) || null;
      const rowBucket = gameTimeBucket(row.commence_time);
      const repeatedMatchup = repeatedMatchups.has(rowMatchupKey(row));
      const nearestEntry = (list) => {
        if (!Array.isArray(list) || list.length === 0) return null;
        // A single posted probable in game 2 is still the wrong probable for
        // game 1. Repeated matchups must resolve to this exact game's bucket;
        // an absent match stays honestly undecided.
        if (repeatedMatchup) {
          if (rowBucket == null) return null;
          return list.find((entry) => gameTimeBucket(entry?.t) === rowBucket) || null;
        }
        if (rowT == null || list.length === 1) return list[0];
        return list.slice().sort((a, b) =>
          Math.abs((a.t ?? rowT) - rowT) - Math.abs((b.t ?? rowT) - rowT))[0];
      };

      // ACE — a probable with a season ERA at/below the ace threshold (ranking only).
      const aces = nearestEntry(mlb.acesByGame.get(`${awayAbbr}|${homeAbbr}`));
      if (aces?.label) {
        setReason('ACE', 22);
        weight += aces.both ? 16 : 9;
        ctxParts.push(aces.label);
      }

      // BOTH probable starters (last names) for the card. "Undecided" per side
      // when no probable is posted; falls back to "Undecided"/"Undecided" if
      // the game didn't resolve in the schedule read at all.
      const gp = nearestEntry(mlb.pitchersByGame?.get(`${awayAbbr}|${homeAbbr}`));
      pitchers = {
        away: gp?.away || 'Undecided',
        home: gp?.home || 'Undecided',
      };
    }

    if (row.league === 'NCAAF') {
      const rank = (value) => {
        const n = Number(value);
        return Number.isInteger(n) && n >= 1 && n <= 25 ? n : null;
      };
      const awayRank = rank(row.away_ranking);
      const homeRank = rank(row.home_ranking);
      if (awayRank && homeRank) {
        weight += 80 - awayRank - homeRank;
        setReason('RANKED MATCHUP', weight);
      }
    } else if (row.league === 'NFL' && isBigGame({ league: 'NFL', game: row })) {
      weight += 40;
      setReason('NATIONAL WINDOW', 40);
    } else if (row.league === 'NFL') {
      // Every NFL window gets its game (founder, Nov 2 2026: "a 1 o'clock game, a 4:25 game, and then the night
      // game"): an afternoon game is a candidate for its window's slot on Home, and makes the list only if it wins it.
      const draw = nflDraw(row);
      weight += draw;
      setReason('NFL WINDOW', draw);
      chainOnly = true;
    } else if (row.league === 'NBA' && national) {
      if (national.has(rowGameIdentity(row))) { weight += 30; setReason('NATIONAL TV', 30); }
    } else if (row.league === 'NBA') {
      const draw = nbaDraw(row);
      weight += draw.weight;
      rivalry = draw.rivalry;
      setReason(draw.rivalry ? 'RIVALRY' : 'HEADLINER', draw.weight);
    }

    // PRIMETIME — national window weight boost (never a chip alone).
    const h = etHour(row.commence_time);
    if (h != null && h >= PRIMETIME_HOUR_ET) weight += 8;

    return { row, weight, reason, rivalry, chainOnly, standing, pitchers, ctx: ctxParts.filter(Boolean).join(' · ') || null };
  }).filter((game) => game.reason != null);

  const byWeight = (a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    // tie-break by earliest start (the marquee opener leads)
    return new Date(a.row.commence_time || 0) - new Date(b.row.commence_time || 0);
  };
  // The NBA plays most nights (founder, Oct 30 2026: "there has to be a game tonight? at least a big nba
  // game"): its headliner always makes it, a second game only when it's a rivalry, never the whole slate.
  const nba = scored.filter((s) => s.row.league === 'NBA').sort(byWeight);
  const nbaKept = new Set(national ? nba : nba.filter((s, i) => i === 0 || (i === 1 && s.rivalry)));

  // THE HERO CHAIN (founder, Nov 2 2026): Home counts down to one game, shows it live, and after the final counts
  // down to the next, so the day's hero games never overlap. Football first in the regular season ("any Monday
  // night football game, Thursday night football game, Sunday night football ... is going to trump NBA regular
  // season"; NBA playoffs are different), then the bigger game; a game that overlaps one already in the chain stays
  // a big game in the ribbon but never takes the hero.
  const chain = heroChain(scored);
  const ranked = scored.filter((s) => chain.has(s) || (!s.chainOnly && (s.row.league !== 'NBA' || nbaKept.has(s)))).sort(byWeight);

  // BIG GAMES SIZE + MIX — up to 5 (founder is fine with 4–5, not a hard 3), and
  // always mix in at least one MLB game so other leagues don't crowd the
  // domestic games out entirely. The chain leads, in start order (rank 1 = the first countdown of the day).
  const MAX_BIG = 5;
  const chained = ranked.filter((s) => chain.has(s)).sort((a, b) => startMs(a) - startMs(b));
  const picked = [...chained, ...ranked.filter((s) => !chain.has(s))].slice(0, Math.max(MAX_BIG, chained.length));
  if (!picked.some((s) => s.row.league === 'MLB')) {
    const bestMlb = ranked.find((s) => s.row.league === 'MLB');
    if (bestMlb && !chain.has(picked[picked.length - 1])) picked[picked.length - 1] = bestMlb;   // swap weakest slot for the top MLB
  }

  return picked.map((s, i) => {
    const item = {
      rank: i + 1,
      // Home's hero takes only chain games (older snapshots without the field: every big game).
      hero: chain.has(s),
      league: s.row.league,
      matchup: `${s.row.away_team} @ ${s.row.home_team}`,
      // DISPLAYED divisional context — plain text, e.g. "Brewers 1st · Cubs 2nd, NL
      // Central". null when standings don't resolve (iOS hides it). Replaces the old
      // reason chip as the rendered context.
      standing: s.standing,
      context: s.ctx,
      commence_time: s.row.commence_time || null,
      bdl_game_id: s.row.bdl_game_id ?? null,
    };
    // MLB only: BOTH probable starters' last names. "Undecided" per side when a
    // probable is unposted (left off entirely for other leagues).
    if (s.pitchers) {
      item.awayPitcher = s.pitchers.away;
      item.homePitcher = s.pitchers.home;
      item.pitchers = { away: s.pitchers.away, home: s.pitchers.home };
    }
    return item;
  });
}

/** The board's NBA games on national TV (ESPN's scoreboard), as row identities; null when it can't be read. */
export async function nationalNbaKeys(etDateStr, rows) {
  const nba = (rows || []).filter((row) => row?.league === 'NBA');
  if (!nba.length) return null;
  try {
    return new Set((await fetchNationalNbaGames(etDateStr, nba, { max: 6 })).map(({ row }) => rowGameIdentity(row)));
  } catch (e) {
    console.warn(`[TomorrowBoard] NBA national TV games unavailable (draws list instead): ${e.message}`);
    return null;
  }
}

// How long a game holds the hero before the next one can start (founder, Nov 2 2026: the 1:00, the 4:15/4:25 and
// the night game don't overlap; an NBA 7:00 and a 10:30 West Coast game don't).
const HERO_MINUTES = { NFL: 180, NCAAF: 210, NBA: 150, MLB: 180, NHL: 150 };
const startMs = (s) => Date.parse(s.row.commence_time || '') || 0;

/** Football and every playoff game first, then MLB, then the NBA's regular season. */
function heroTier(row) {
  const lg = String(row.league || '').toUpperCase();
  const post = row.postseason === true || String(row.season_type || '').toLowerCase() === 'postseason';
  if (lg === 'NFL' || lg === 'NCAAF' || post) return 3;
  if (lg === 'NBA') {
    // The NBA's play-in and playoffs run mid-April to late June; the board rows carry no season type.
    const md = (row.commence_time || '').slice(5, 10);
    return md >= '04-14' && md <= '06-30' ? 3 : 1;
  }
  return lg === 'MLB' ? 2 : 1;
}

/** The day's hero games: highest tier, then weight, each kept only if it overlaps none already kept. */
export function heroChain(scored) {
  const kept = [];
  const order = scored.filter((s) => startMs(s) && s.row.kickoff_status !== 'date_only')
    .sort((a, b) => heroTier(b.row) - heroTier(a.row) || b.weight - a.weight || startMs(a) - startMs(b));
  for (const s of order) {
    const a = startMs(s), e = a + (HERO_MINUTES[s.row.league] || 180) * 60000;
    if (kept.every((k) => e <= startMs(k) || a >= startMs(k) + (HERO_MINUTES[k.row.league] || 180) * 60000)) kept.push(s);
  }
  return new Set(kept);
}

// The NFL's national draws, by nickname: an afternoon window's game is the one with them in it, then the closer line.
const NFL_DRAWS = new Set(['Cowboys', 'Eagles', 'Chiefs', 'Packers', 'Steelers', '49ers', 'Bills', 'Ravens', 'Lions']);
function nflDraw(row) {
  const draws = [nick(row.away_team), nick(row.home_team)].filter((t) => NFL_DRAWS.has(t)).length;
  const spread = Math.abs(Number(row.spread));
  return 30 + 4 * draws + (Number.isFinite(spread) && spread <= 3.5 ? 2 : 0);
}

// The NBA's national draws and its rivalries, by nickname.
const NBA_DRAWS = new Set(['Lakers', 'Warriors', 'Celtics', 'Knicks']);
const NBA_RIVALRIES = [
  ['Lakers', 'Celtics'], ['Lakers', 'Warriors'], ['Lakers', 'Clippers'], ['Lakers', 'Nuggets'],
  ['Knicks', 'Celtics'], ['Knicks', '76ers'], ['Knicks', 'Nets'], ['Knicks', 'Heat'],
  ['Celtics', '76ers'], ['Celtics', 'Heat'], ['Bulls', 'Pistons'], ['Warriors', 'Cavaliers'],
];

/** An NBA game's pull: a rivalry, the national draws in it, and the late national window. */
function nbaDraw(row) {
  const a = nick(row.away_team), h = nick(row.home_team);
  const rivalry = NBA_RIVALRIES.some(([x, y]) => (x === a && y === h) || (x === h && y === a));
  const draws = [a, h].filter((t) => NBA_DRAWS.has(t)).length;
  const late = (etHour(row.commence_time) ?? 0) >= 22;
  return { rivalry, weight: 10 + (rivalry ? 10 : 0) + 6 * draws + (late ? 3 : 0) };
}

/** "American League East" -> "AL East"; "National League Central" -> "NL Central". */
function shortDivision(name) {
  if (!name) return null;
  return String(name)
    .replace(/^American League\s+/i, 'AL ')
    .replace(/^National League\s+/i, 'NL ');
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 5 -> "5th". */
function ordinal(n) {
  if (!Number.isFinite(n)) return null;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Plain-text divisional standing for a big game, e.g. "Brewers 1st · Cubs 2nd, NL
 * Central" when both lead the same division, else the more newsworthy single team's
 * place ("1st, NL Central"). GROUNDED from standings + team index; null when
 * neither side's rank/division resolves (a standings gap).
 */
function bigGameStanding({ aSt, hSt, aTeam, hTeam, awayTeam, homeTeam }) {
  const aRank = aSt?.divisionRank;
  const hRank = hSt?.divisionRank;
  const sameDivision = aTeam?.divisionId != null && aTeam.divisionId === hTeam?.divisionId;
  const divName = shortDivision(hTeam?.divisionName) || shortDivision(aTeam?.divisionName);

  // Both placed in the SAME division -> show both with one shared division tag.
  if (sameDivision && Number.isFinite(aRank) && Number.isFinite(hRank) && divName) {
    return `${nick(awayTeam)} ${ordinal(aRank)} · ${nick(homeTeam)} ${ordinal(hRank)}, ${divName}`;
  }
  // Different divisions (interleague / cross-division) -> name each side's place.
  const parts = [];
  if (Number.isFinite(aRank) && (shortDivision(aTeam?.divisionName))) {
    parts.push(`${nick(awayTeam)} ${ordinal(aRank)} ${shortDivision(aTeam.divisionName)}`);
  }
  if (Number.isFinite(hRank) && (shortDivision(hTeam?.divisionName))) {
    parts.push(`${nick(homeTeam)} ${ordinal(hRank)} ${shortDivision(hTeam.divisionName)}`);
  }
  if (parts.length) return parts.join(' · ');
  return null;
}

/**
 * Short, unambiguous team nickname ("Milwaukee Brewers" -> "Brewers"). Keeps the
 * two-word nicknames whole so "Boston Red Sox" -> "Red Sox" (not a bare "Sox" that
 * collides with the White Sox) and "Toronto Blue Jays" -> "Blue Jays".
 */
export function nick(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length >= 2) {
    const last2 = `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
    if (/^(red sox|white sox|blue jays)$/i.test(last2)) return last2;
  }
  return parts[parts.length - 1] || fullName || '';
}

/* ──────────────────────── presentation: board rows ──────────────────────── */

/**
 * Map an internal slate row to the persisted board[] row shape (mirrors
 * DailySlateRow + precomputed abbreviations + is_marquee). All line fields stay
 * nullable => Swift renders "—".
 */
export function toBoardRow(row, marqueeKeys, teamIndex) {
  const awayAbbr = row.league === 'MLB' ? abbrFor(row.away_team, teamIndex) : null;
  const homeAbbr = row.league === 'MLB' ? abbrFor(row.home_team, teamIndex) : null;
  return {
    league: row.league ?? null,
    away_team: row.away_team ?? null,
    home_team: row.home_team ?? null,
    away_abbr: awayAbbr,
    home_abbr: homeAbbr,
    commence_time: row.commence_time ?? null,
    scheduled_date: row.scheduled_date ?? null,
    kickoff_status: row.kickoff_status ?? null,
    // Preserve the exact provider state from this slate row. This is carried
    // by provider game identity, never borrowed from another matchup row (in
    // particular, the other game of a doubleheader).
    game_status: row.game_status ?? null,
    status_detail: row.status_detail ?? null,
    // Game identity (Jul 22 2026, doubleheader-safe) — pairs with the
    // starters' game_time so readers join board row ↔ arms BY GAME.
    bdl_game_id: row.bdl_game_id ?? null,
    away_ranking: row.away_ranking ?? null,
    home_ranking: row.home_ranking ?? null,
    venue: row.venue ?? null,
    spread: row.spread ?? null,
    ml_home: row.ml_home ?? null,
    ml_away: row.ml_away ?? null,
    total: row.total ?? null,
    ml_book: row.line_vendor ?? null,
    is_marquee: marqueeKeys.has(rowGameIdentity(row)),
    // PARK FACTOR (founder pick, Aug 14 2026 — replaces the weather-led row on
    // THE BIG NUMBERS; the wind/total fold into its sentence). Percentage, not
    // the raw factor, per his call: 1.03 ships as +3.
    park: (() => {
      if (row.league !== 'MLB') return null;
      const pd = findParkData(row.venue, row.home_team);
      if (!pd || !Number.isFinite(Number(pd.factor))) return null;
      return { name: pd.park, pct: Math.round((Number(pd.factor) - 1) * 100), type: pd.type ?? null };
    })(),
  };
}

/** Exact identities of the selected marquee games (doubleheader-safe). */
export function marqueeGameKeys(bigGames) {
  return new Set((bigGames || []).map((game) => {
    const [awayTeam, homeTeam] = String(game?.matchup || '').split(' @ ');
    return rowGameIdentity({
      league: game?.league,
      away_team: awayTeam,
      home_team: homeTeam,
      bdl_game_id: game?.bdl_game_id,
      commence_time: game?.commence_time,
    });
  }));
}
