/** Probable starters, their recent outings and postseason series lines (split from tomorrowService.js, Oct 13 2026). */
import { getMlbSchedule, getPitcherLastStarts } from '../../providers/mlbStatsApiService.js';
import { disambiguatePitcherHits } from '../../sports/mlb/pitcherIdentity.js';
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { SEASON, ACE_ERA, playerNameWithoutSuffix, playerNameKey, lastNameKey, abbrevName, lastNameOf, abbrFor, statsForName } from './basics.js';

/* ──────────────────────── 2. PROBABLE STARTERS (MLB only) ───────────────── */

export async function buildStarters(etDateStr, teamIndex, eraByName) {
  const starters = [];
  // Per MLB matchup (keyed "awayAbbr|homeAbbr"): ace label + both-aces flag
  // for the big-games ACE hook, built from the SAME schedule read.
  // Doubleheader-safe (Jul 22 2026): the value is an ARRAY of per-GAME
  // entries, each time-stamped — consumers pick the entry nearest their own
  // row's start time, so game 2's arms never wear game 1's card.
  const acesByGame = new Map();      // "AWY|HOM" -> [{ t, label, both }]
  // Same array shape: BOTH probable starters' last names per GAME =>
  // { t, away, home }. "Undecided" when a side has no posted probable
  // (never blank, never fabricated).
  const pitchersByGame = new Map();  // "AWY|HOM" -> [{ t, away, home }]

  // MLB — every named probable pitcher, both sides, all games.
  try {
    const sched = await getMlbSchedule(etDateStr);
    for (const g of sched || []) {
      const awayName = g?.teams?.away?.team?.name;
      const homeName = g?.teams?.home?.team?.name;
      // Game-level matchup label (abbreviations), built once per game so every
      // starter in it knows which game it's pitching tomorrow (e.g. "HOU @ DET").
      const awayAbbrG = abbrFor(awayName, teamIndex);
      const homeAbbrG = abbrFor(homeName, teamIndex);
      const gameLabel = awayAbbrG && homeAbbrG ? `${awayAbbrG} @ ${homeAbbrG}` : null;
      const gameAces = []; // { lastName, era }
      // Both probable starters' last names, "Undecided" when a side has no
      // posted probable (captured BEFORE the no-name continue below).
      const gamePitchers = { away: 'Undecided', home: 'Undecided' };
      for (const side of ['away', 'home']) {
        const t = g?.teams?.[side];
        const name = t?.probablePitcher?.fullName;
        if (name) gamePitchers[side] = lastNameOf(name);
        if (!name) continue;
        const abbr = abbrFor(t?.team?.name, teamIndex) || '';
        const oppAbbr = side === 'away' ? homeAbbrG : awayAbbrG;
        const home = side === 'home';
        const stats = statsForName(name, eraByName);
        const era = stats?.era ?? null;
        const detail = era != null ? `${abbr} ${era.toFixed(2)}` : abbr;
        starters.push({
          league: 'MLB',
          name: abbrevName(name),
          full_name: name,              // un-abbreviated (scout-extras id resolution)
          person_id: t?.probablePitcher?.id ?? null, // exact MLB id; avoids fragile name joins
          team: abbr,
          abbr,                         // explicit alias (iOS gold team-name source)
          era,                          // number | null
          game: gameLabel,              // "HOU @ DET" | null
          // Game identity (Jul 22 2026, doubleheader-safe): which GAME this
          // arm starts. Readers select starters BY GAME, never by team alone
          // — a doubleheader puts two same-team arms on one date, and picking
          // by abbr is a coin flip between them (the Max Fried mixup).
          game_time: g?.gameDate ?? null,     // ISO first pitch
          game_number: g?.gameNumber ?? null, // 1 | 2 within the day
          game_pk: g?.gamePk ?? null,         // MLB statsapi game id
          opponent: oppAbbr || null,    // opposing team abbr | null
          home,                         // pitching at home?
          detail,                       // legacy "HOU 4.03" string (kept for back-compat)
        });
        if (era != null && era <= ACE_ERA) {
          const last = lastNameOf(name);
          gameAces.push({ lastName: last, era });
        }
      }
      // Both-pitchers map for the big-games card — keyed by abbreviations so
      // the slate (nicknames) and schedule (full names) resolve to the same
      // matchup; entries are per-GAME (time-stamped array) so a doubleheader
      // holds both games. Stored for EVERY game (unlike aces, which gate on ERA).
      const gameT = Date.parse(g?.gameDate) || null;
      if (awayName && homeName) {
        const aAbbr = abbrFor(awayName, teamIndex);
        const hAbbr = abbrFor(homeName, teamIndex);
        const key = `${aAbbr}|${hAbbr}`;
        const list = pitchersByGame.get(key) || [];
        list.push({ t: gameT, away: gamePitchers.away, home: gamePitchers.home });
        pitchersByGame.set(key, list);
      }
      if (gameAces.length && awayName && homeName) {
        gameAces.sort((a, b) => a.era - b.era);
        const aAbbr = abbrFor(awayName, teamIndex);
        const hAbbr = abbrFor(homeName, teamIndex);
        const key = `${aAbbr}|${hAbbr}`;
        const list = acesByGame.get(key) || [];
        list.push({ t: gameT, label: gameAces.map((a) => a.lastName).join(' vs '), both: gameAces.length >= 2 });
        acesByGame.set(key, list);
      }
    }
  } catch (e) {
    console.warn(`[TomorrowBoard] MLB starters fetch failed: ${e.message}`);
  }

  return { starters, acesByGame, pitchersByGame };
}

/* ────────────────── 2c. SCOUT EXTRAS (last outing · vs opp · series) ─────────────────
 * The Picks-page scouting report's bettor lanes (founder, Jul 7): what did each
 * probable do LAST time out, how has he fared against TONIGHT's opponent this
 * season, and the season series between the clubs with the venue split + the
 * last three meetings. All grounded from BDL box scores + the season game
 * index; every field is omitted (never guessed) when its source is short.
 */

const MONTHS_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function scoutShortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${MONTHS_ABBR[mo - 1]} ${Number(m[3])}`;
}
/** BDL ip notation ("5.2" = 5 innings 2 outs) -> total outs. */
function scoutIpOuts(v) {
  const s = String(v ?? '');
  const m = /^(\d+)(?:\.(\d))?$/.exec(s);
  if (!m) return 0;
  return Number(m[1]) * 3 + Number(m[2] || 0);
}
function scoutOutsToIp(outs) { return `${Math.trunc(outs / 3)}.${outs % 3}`; }
/** Whole days from one ISO date to another (date parts only). */
function scoutDayDiff(fromIso, toIso) {
  const m1 = /^(\d{4}-\d{2}-\d{2})/.exec(String(fromIso || ''));
  const m2 = /^(\d{4}-\d{2}-\d{2})/.exec(String(toIso || ''));
  if (!m1 || !m2) return null;
  const a = new Date(`${m1[1]}T00:00:00Z`).getTime();
  const b = new Date(`${m2[1]}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// Short ballpark names for the meetings rows ("at Busch"). Curated,
// unambiguous parks only — anything absent falls back to the home team's
// abbreviation ("at TB"), never a guessed name.
const PARK_SHORT = {
  MIL: 'AmFam', STL: 'Busch', NYY: 'Yankee', NYM: 'Citi', BOS: 'Fenway',
  CHC: 'Wrigley', LAD: 'Dodger', SF: 'Oracle', SD: 'Petco', ATL: 'Truist',
  PIT: 'PNC', BAL: 'Camden', DET: 'Comerica', KC: 'Kauffman', SEA: 'T-Mobile',
  MIN: 'Target', COL: 'Coors', CIN: 'GABP', TEX: 'Globe Life', TOR: 'Rogers',
  CLE: 'Progressive', MIA: 'loanDepot', LAA: 'Angel', AZ: 'Chase', ARI: 'Chase',
  HOU: 'Daikin', CWS: 'Rate', CHW: 'Rate',
};
function parkShort(homeAbbr) {
  return PARK_SHORT[String(homeAbbr || '').toUpperCase()] || homeAbbr || '?';
}

/**
 * BDL team maps — the season game index and per-player game rows carry BDL
 * team ids (a DIFFERENT id space from teamIndex's MLB-Stats-API ids), so the
 * scout lanes join through BDL's own teams read.
 */
async function bdlTeamMaps() {
  const teams = await bdl.getTeams('baseball_mlb');
  const list = Array.isArray(teams) ? teams : (teams?.data || []);
  const idByAbbr = new Map();
  const abbrById = new Map();
  for (const t of list) {
    const ab = t?.abbreviation || t?.abbr;
    if (t?.id == null || !ab) continue;
    idByAbbr.set(String(ab).toUpperCase(), t.id);
    abbrById.set(t.id, String(ab).toUpperCase());
  }
  return { idByAbbr, abbrById };
}

/** Resolve a probable's BDL player id by full name (+ team when it can). */
async function resolvePitcherBdlId(fullName, teamId) {
  const last = lastNameOf(fullName);
  if (!last) return null;
  const searches = [...new Set([last, playerNameWithoutSuffix(fullName)].filter(Boolean))];
  const found = await Promise.all(searches.map(async (search) => {
    const res = await bdl.getPlayersGeneric('baseball_mlb', { search, per_page: 100 });
    return Array.isArray(res) ? res : (res?.data || []);
  }));
  const players = [...new Map(found.flat().filter((p) => p?.id != null).map((p) => [p.id, p])).values()];
  if (!players.length) return null;
  const want = playerNameKey(fullName);
  const byName = players.filter((p) => {
    const full = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    return playerNameKey(full) === want;
  });
  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1 && teamId != null) {
    const onTeam = byName.find((p) => (p.team?.id ?? p.team_id) === teamId);
    if (onTeam) return onTeam.id;
  }
  // Same exact full name on DIFFERENT teams and no team confirmation — the
  // two-Will-Smiths class. Position is the remaining honest discriminator
  // (we are resolving a starter); a surviving tie returns null, never a guess.
  if (byName.length > 1) return disambiguatePitcherHits(byName);
  // No exact full-name hit — same last name + the right team is still safe.
  if (teamId != null) {
    const teamHits = players.filter((p) =>
      lastNameKey(p.last_name || '') === lastNameKey(last) && (p.team?.id ?? p.team_id) === teamId);
    if (teamHits.length === 1) return teamHits[0].id;
  }
  // Trades and provider roster lag can make the team id stale. A unique
  // suffix-aware surname hit is still safer than dropping the whole game log.
  const lastHits = players.filter((p) => lastNameKey(p.last_name || '') === lastNameKey(last));
  if (lastHits.length === 1) return lastHits[0].id;
  return null;
}

/** Apply official MLB Stats API start rows to a starter in the board shape. */
function attachOfficialStartRows(st, starts, etDateStr, teamIndex) {
  if (!Array.isArray(starts) || !starts.length) return false;
  const last = starts[starts.length - 1];
  const outs = scoutIpOuts(last.ip);
  st.last_outing = {
    ip: scoutOutsToIp(outs),
    er: Number(last.er) || 0,
    k: Number(last.k) || 0,
    opp: abbrFor(last.opponent, teamIndex) || last.opponent || null,
    at: last.isHome == null ? null : (last.isHome ? 'vs' : 'at'),
    date: scoutShortDate(last.date),
  };
  const restDiff = scoutDayDiff(last.date, etDateStr);
  if (restDiff != null && restDiff >= 1) st.rest = { days: restDiff - 1 };

  const l3rows = starts.slice(-3);
  if (l3rows.length >= 2) {
    let l3o = 0; let l3er = 0; let l3k = 0;
    for (const r of l3rows) {
      l3o += scoutIpOuts(r.ip);
      l3er += Number(r.er) || 0;
      l3k += Number(r.k) || 0;
    }
    st.l3 = { gs: l3rows.length, ip: scoutOutsToIp(l3o), er: l3er, k: l3k };
  }

  const qsWin = starts.slice(-5)
    .map((r) => scoutIpOuts(r.ip) >= 18 && (Number(r.er) || 0) <= 3);
  let qsStreak = 0;
  for (let i = qsWin.length - 1; i >= 0; i--) {
    if (qsWin[i]) qsStreak += 1; else break;
  }
  st.qs_form = {
    streak: qsStreak,
    qs: qsWin.filter(Boolean).length,
    window: qsWin.length,
  };

  const vs = starts.filter((r) => abbrFor(r.opponent, teamIndex) === st.opponent);
  if (vs.length) {
    let vOuts = 0; let vEr = 0;
    for (const r of vs) { vOuts += scoutIpOuts(r.ip); vEr += Number(r.er) || 0; }
    st.vs_opp = {
      gs: vs.length,
      ip: scoutOutsToIp(vOuts),
      er: vEr,
      era: vOuts > 0 ? Number(((vEr * 27) / vOuts).toFixed(2)) : null,
    };
  }
  return true;
}

/**
 * Attach { last_outing, vs_opp } to each MLB starter row IN PLACE.
 * last_outing = his most recent regular-season START (never relief);
 * vs_opp = this season's starts against tonight's opponent, aggregated.
 */
export async function enrichStartersWithOutings(starters, etDateStr, teamIndex) {
  let idByAbbr = new Map();
  let abbrById = new Map();
  try {
    ({ idByAbbr, abbrById } = await bdlTeamMaps());
  } catch (e) {
    // Official MLB ids/logs below do not need BDL. A BDL teams outage must not
    // prevent those primary enrichments from filling the starter cards.
    console.warn(`[TomorrowBoard] BDL team map unavailable for outing fallback: ${e.message}`);
  }
  const mlb = starters.filter((st) => st.league === 'MLB' && (st.full_name || st.name));
  const CHUNK = 4;
  for (let i = 0; i < mlb.length; i += CHUNK) {
    await Promise.all(mlb.slice(i, i + CHUNK).map(async (st) => {
      try {
        // The schedule already supplies MLB's exact person id. Its official
        // game log is the primary source, so punctuation, suffixes, trades and
        // third-party roster lag cannot leave one side of the matchup empty.
        if (st.person_id != null) {
          try {
            const official = await getPitcherLastStarts(st.person_id, SEASON, 50);
            if (attachOfficialStartRows(st, official, etDateStr, teamIndex)) return;
            // POSITIVE evidence from MLB's own log for HIS exact person id:
            // zero starts this season. Only this stamp lets the debut pass
            // flag him — a resolver/lookup failure below never can (a missing
            // player is not a debuting player; finding-5 guard, Aug 18).
            if (Array.isArray(official) && official.length === 0) st.mlb_log_confirmed_empty = true;
            console.warn(`[TomorrowBoard] official start log empty for ${st.full_name || st.name}; trying BDL`);
          } catch (e) {
            console.warn(`[TomorrowBoard] official start log failed for ${st.full_name || st.name}: ${e.message}; trying BDL`);
          }
        }
        const teamId = idByAbbr.get(String(st.team || '').toUpperCase()) ?? null;
        const pid = await resolvePitcherBdlId(st.full_name || st.name, teamId);
        if (!pid) {
          console.warn(`[TomorrowBoard] no stats id for ${st.full_name || st.name}`);
          return;
        }
        const rows = await bdl.getMlbPlayerGameRowsChrono(pid, SEASON);
        const startRows = (rows || []).filter((r) => Number(r.games_started) > 0);
        if (!startRows.length) {
          console.warn(`[TomorrowBoard] no completed starts for ${st.full_name || st.name}`);
          return;
        }
        const last = startRows[startRows.length - 1];
        const outs = scoutIpOuts(last.ip);
        let oppAbbr = null;
        let atHome = null;
        if (teamId != null && last._game) {
          atHome = last._game.homeId === teamId;
          const oppId = atHome ? last._game.awayId : last._game.homeId;
          oppAbbr = abbrById.get(oppId) ?? null;
        }
        st.last_outing = {
          ip: scoutOutsToIp(outs),
          er: Number(last.er) || 0,
          k: Number(last.p_k) || 0,
          opp: oppAbbr,
          at: atHome == null ? null : (atHome ? 'vs' : 'at'),
          date: scoutShortDate(last._game?.date),
        };
        // REST — days between his last start and THIS game day, minus one
        // (pitched Jul 2, starts Jul 7 => "4 days' rest", the standard usage).
        const restDiff = scoutDayDiff(last._game?.date, etDateStr);
        if (restDiff != null && restDiff >= 1) st.rest = { days: restDiff - 1 };
        // LAST 3 (or 2) starts, aggregated — omitted with fewer than 2 starts
        // (a single start would just echo LAST OUTING).
        const l3rows = startRows.slice(-3);
        if (l3rows.length >= 2) {
          let l3o = 0; let l3er = 0; let l3k = 0;
          for (const r of l3rows) {
            l3o += scoutIpOuts(r.ip);
            l3er += Number(r.er) || 0;
            l3k += Number(r.p_k) || 0;
          }
          st.l3 = { gs: l3rows.length, ip: scoutOutsToIp(l3o), er: l3er, k: l3k };
        }
        // Quality-start form over his last (up to) 5 starts — the name-row
        // tag ("3 STRAIGHT QS" / "1 QS IN LAST 4"). Standard QS: 6+ IP, <=3 ER.
        const qsWin = startRows.slice(-5)
          .map((r) => scoutIpOuts(r.ip) >= 18 && (Number(r.er) || 0) <= 3);
        let qsStreak = 0;
        for (let qi = qsWin.length - 1; qi >= 0; qi--) {
          if (qsWin[qi]) qsStreak += 1; else break;
        }
        st.qs_form = {
          streak: qsStreak,
          qs: qsWin.filter(Boolean).length,
          window: qsWin.length,
        };
        const oppTonightId = idByAbbr.get(String(st.opponent || '').toUpperCase());
        if (oppTonightId != null) {
          const vs = startRows.filter((r) => r._game
            && (r._game.homeId === oppTonightId || r._game.awayId === oppTonightId));
          if (vs.length) {
            let vOuts = 0; let vEr = 0;
            for (const r of vs) { vOuts += scoutIpOuts(r.ip); vEr += Number(r.er) || 0; }
            st.vs_opp = {
              gs: vs.length,
              ip: scoutOutsToIp(vOuts),
              er: vEr,
              era: vOuts > 0 ? Number(((vEr * 27) / vOuts).toFixed(2)) : null,
            };
          }
        }
      } catch (e) {
        console.warn(`[TomorrowBoard] outing enrich failed for ${st.name}: ${e.message}`);
      }
    }));
  }
}

/**
 * A postseason game's series state from MLB's schedule ("0-0 · NLDS GAME 1",
 * "DODGERS LEAD 1-0 · NLDS GAME 2"), keyed by home club name + first pitch.
 * Founder, Oct 3 2026: the card's "Series 2-1" was the regular-season
 * head-to-head on an NLDS Game 1, and in October "series" means the playoff.
 */
async function postseasonSeriesLines(rows) {
  const out = new Map();
  const days = [...new Set(rows.map((r) => new Date(r.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })))];
  for (const day of days) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}&hydrate=seriesStatus`, { signal: AbortSignal.timeout(15000) });
      const j = await res.json();
      for (const g of j?.dates?.[0]?.games || []) {
        const st = g.seriesStatus;
        if (!st || g.gameType === 'R' || g.gameType === 'S' || g.gameType === 'E') continue;
        const short = String(st.shortDescription || `${st.abbreviation || ''} Game ${st.gameNumber || ''}`).toUpperCase().trim();
        const nick = (t) => {
          const full = String(t?.teamName || t?.clubName || t?.name || '').trim();
          const two = full.match(/(Red Sox|White Sox|Blue Jays)$/);
          return (two ? two[1] : full.replace(/^.* /, '')).toUpperCase();
        };
        const state = st.isTied
          ? (Number(st.wins) === 0 ? `${st.wins}-${st.losses}` : `TIED ${st.wins}-${st.losses}`)
          : `${nick(st.winningTeam)} ${st.isOver ? 'WON' : 'LEAD'} ${st.wins}-${st.losses}`;
        out.set(`${g.teams?.home?.team?.name}|${Date.parse(g.gameDate)}`, `${state} · ${short}`);
      }
    } catch { /* the regular-season line stands */ }
  }
  return out;
}

/**
 * Attach `series` to each MLB board row IN PLACE: this season's finished
 * meetings between the two clubs — record (from tonight's AWAY side's
 * perspective), the leader's venue split, and the last three meetings. A
 * postseason game's split_line is the playoff series instead (Oct 3 2026).
 */
export async function attachSeriesToBoard(board) {
  const mlbRows = board.filter((r) => r.league === 'MLB' && r.away_abbr && r.home_abbr);
  if (!mlbRows.length) return;
  const { idByAbbr, abbrById } = await bdlTeamMaps();
  const index = await bdl.getMlbSeasonGameIndex(SEASON);
  const playoff = await postseasonSeriesLines(mlbRows);
  const playoffLine = (r) => {
    for (const [key, line] of playoff) {
      const [home, at] = key.split('|');
      if (Math.abs(Number(at) - Date.parse(r.commence_time)) < 20 * 60 * 1000 && home.endsWith(String(r.home_team || '').replace(/^.* /, ''))) return line;
    }
    return null;
  };
  for (const r of mlbRows) {
    const aId = idByAbbr.get(String(r.away_abbr).toUpperCase());
    const hId = idByAbbr.get(String(r.home_abbr).toUpperCase());
    if (aId == null || hId == null) continue;
    const games = [];
    for (const g of index.values()) {
      if (g.status !== 'STATUS_FINAL' || g.seasonType === 'spring_training' || g.postseason) continue;
      const pair = (g.homeId === aId && g.awayId === hId) || (g.homeId === hId && g.awayId === aId);
      if (!pair) continue;
      if (g.homeRuns == null || g.awayRuns == null || g.homeRuns === g.awayRuns) continue;
      games.push(g);
    }
    if (!games.length) continue;
    games.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let awayW = 0; let homeW = 0;
    const perGame = games.map((g) => {
      const awayRuns = g.homeId === aId ? g.homeRuns : g.awayRuns; // tonight's away side
      const homeRuns = g.homeId === aId ? g.awayRuns : g.homeRuns;
      const awayWon = awayRuns > homeRuns;
      if (awayWon) awayW += 1; else homeW += 1;
      return { g, awayRuns, homeRuns, awayWon };
    });
    const leaderIsAway = awayW >= homeW;
    const parks = new Map(); // park (home team's abbr) -> leader's {w, l} there
    for (const pg of perGame) {
      const parkAbbr = abbrById.get(pg.g.homeId) || '?';
      const leaderWon = leaderIsAway ? pg.awayWon : !pg.awayWon;
      const cur = parks.get(parkAbbr) || { w: 0, l: 0 };
      if (leaderWon) cur.w += 1; else cur.l += 1;
      parks.set(parkAbbr, cur);
    }
    const split_line = [...parks.entries()]
      .map(([abbr, rec]) => `${rec.w}-${rec.l} AT ${parkShort(abbr).toUpperCase()}`)
      .join(' · ');
    const meetings = perGame.slice(-3).reverse().map((pg) => ({
      d: scoutShortDate(pg.g.date),
      line: `${r.away_abbr} ${pg.awayRuns} · ${r.home_abbr} ${pg.homeRuns}`,
      venue: `at ${parkShort(abbrById.get(pg.g.homeId))}`,
      won: pg.awayWon ? 'away' : 'home',
    }));
    r.series = {
      away_w: awayW,
      home_w: homeW,
      leader: leaderIsAway ? 'away' : 'home',
      split_line: playoffLine(r) || split_line,
      meetings,
    };
  }
}
