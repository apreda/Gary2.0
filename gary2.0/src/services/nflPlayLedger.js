/**
 * The season play ledger — every NFL snap, aggregated once (Aug 25 2026).
 *
 * WHY THIS EXISTS. Every football number Gary held was a season average with
 * the situation stripped out. "Points per game" cannot answer whether a team
 * converts on the goal line, whether it survives third-and-long, or whether
 * its quarterback is under siege — and those are the questions a bettor
 * actually asks. Two lanes (GOAL_LINE, EARLY_DOWN_SUCCESS) were declining
 * outright, and the two EPA lanes were named EPA while returning yards.
 *
 * WHAT CHANGED. nflverse publishes a complete season of play-by-play as one
 * file: 372 columns, ~48,700 plays, and it downloads in about three seconds.
 * It carries real EPA, real per-play success, win probability, goal_to_go,
 * seconds remaining in the half, qb_hit, and pass rate over expected. Every
 * split below comes out of it. Nothing here is charted by a vendor and
 * nothing here costs money.
 *
 * THE COST DISCIPLINE. The raw file is ~93MB and must never be touched at
 * pick time. It is streamed once, reduced to a compact per-team aggregate of
 * a few hundred kilobytes, and written to disk. Tokens read the aggregate.
 * A refresh is a weekly job, not a per-game call, and the raw plays are never
 * held in memory beyond the chunk being parsed.
 *
 * SAMPLE HONESTY. Every split reports the play count it was built from. A
 * rate over eleven snaps is not a tendency, and the consumer is given the
 * denominator to say so. Weeks 1-3 of a season genuinely cannot support most
 * of these splits; see nflSeasonPhase.js for how that is handled rather than
 * hidden.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const RELEASE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const DISK_CACHE_DIR = join(process.env.TMPDIR || '/tmp', 'gary-play-ledger-cache');
// Plays only change when games are played. A week is the natural grain; the
// in-season refresh job re-runs after the slate completes.
const DISK_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** Only these columns are kept. The other ~340 are discarded while streaming. */
const WANTED = [
  'game_id', 'week', 'season_type', 'posteam', 'defteam', 'play_type',
  'down', 'ydstogo', 'yardline_100', 'goal_to_go', 'half_seconds_remaining',
  'qtr', 'score_differential', 'epa', 'wpa', 'success', 'wp',
  'qb_dropback', 'qb_hit', 'sack', 'pass_oe', 'penalty',
  'passer_player_name', 'rusher_player_name', 'receiver_player_name',
  'yards_gained', 'touchdown', 'interception', 'fumble_lost',
  'third_down_converted', 'fourth_down_converted', 'shotgun', 'no_huddle'
];

const num = (v) => {
  if (v === '' || v === 'NA' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const flag = (v) => v === '1' || v === 'TRUE' || v === 'true';

/** Split one CSV line, honouring quoted fields. */
function splitLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

/** True when a line ends mid-quote, meaning the record continues on the next. */
function unbalanced(line) {
  let n = 0;
  for (let i = 0; i < line.length; i += 1) if (line[i] === '"') n += 1;
  return n % 2 === 1;
}

/**
 * THE SITUATIONAL SPLITS.
 *
 * Defined as data so a split is added by naming it, and so the contract test
 * can assert every one of them is actually produced. Each predicate reads a
 * normalised play, never a raw CSV row.
 */
export const SPLITS = [
  { key: 'goal_to_go', label: 'Goal-to-go', test: (p) => p.goalToGo },
  { key: 'short_yardage', label: 'Short yardage (2 or fewer to go)', test: (p) => p.ydstogo != null && p.ydstogo <= 2 },
  { key: 'inside_ten', label: 'Inside the opponent 10', test: (p) => p.yardline100 != null && p.yardline100 <= 10 },
  { key: 'red_zone', label: 'Red zone (inside the 20)', test: (p) => p.yardline100 != null && p.yardline100 <= 20 },
  { key: 'two_minute', label: 'Two-minute (last 2:00 of a half)', test: (p) => p.halfSecs != null && p.halfSecs <= 120 },
  { key: 'early_down', label: 'Early down (first and second)', test: (p) => p.down === 1 || p.down === 2 },
  { key: 'third_and_long', label: 'Third and long (7 or more)', test: (p) => p.down === 3 && p.ydstogo != null && p.ydstogo >= 7 },
  { key: 'third_and_short', label: 'Third and short (3 or fewer)', test: (p) => p.down === 3 && p.ydstogo != null && p.ydstogo <= 3 },
  { key: 'trailing', label: 'Trailing by more than a score', test: (p) => p.scoreDiff != null && p.scoreDiff < -8 },
  { key: 'leading', label: 'Leading by more than a score', test: (p) => p.scoreDiff != null && p.scoreDiff > 8 },
  // Win probability rather than a score rule: a 17-point lead in the first
  // quarter and the same lead with two minutes left are not the same game.
  { key: 'competitive', label: 'While the game was still a contest', test: (p) => p.wp != null && p.wp > 0.05 && p.wp < 0.95 }
];

function emptyAccumulator() {
  const bucket = () => ({ plays: 0, epa: 0, epaPlays: 0, success: 0, successPlays: 0, yards: 0, explosive: 0 });
  const splits = {};
  for (const s of SPLITS) splits[s.key] = bucket();
  return {
    all: bucket(),
    splits,
    dropbacks: 0, qbHits: 0, sacks: 0,
    passOe: 0, passOePlays: 0,
    shotgun: 0, noHuddle: 0, scrimmage: 0,
    turnovers: 0, penalties: 0
  };
}

function addPlay(acc, p) {
  const bump = (b) => {
    b.plays += 1;
    if (p.epa != null) { b.epa += p.epa; b.epaPlays += 1; }
    if (p.success != null) { b.success += p.success; b.successPlays += 1; }
    if (p.yards != null) {
      b.yards += p.yards;
      // The standard explosive-play definition, and a rate rather than the
      // single longest play the old EXPLOSIVE_PLAYS token reported.
      if (p.playType === 'pass' ? p.yards >= 20 : p.yards >= 10) b.explosive += 1;
    }
  };
  bump(acc.all);
  for (const s of SPLITS) if (s.test(p)) bump(acc.splits[s.key]);

  acc.scrimmage += 1;
  if (p.dropback) {
    acc.dropbacks += 1;
    if (p.qbHit) acc.qbHits += 1;
    if (p.sack) acc.sacks += 1;
  }
  if (p.passOe != null) { acc.passOe += p.passOe; acc.passOePlays += 1; }
  if (p.shotgun) acc.shotgun += 1;
  if (p.noHuddle) acc.noHuddle += 1;
  if (p.interception || p.fumbleLost) acc.turnovers += 1;
  if (p.penalty) acc.penalties += 1;
}

const rate = (n, d) => (d > 0 ? Number((n / d).toFixed(4)) : null);
const per = (n, d, dp = 3) => (d > 0 ? Number((n / d).toFixed(dp)) : null);

function finishBucket(b) {
  if (b.plays === 0) return null;
  return {
    plays: b.plays,
    epa_per_play: per(b.epa, b.epaPlays),
    success_rate: rate(b.success, b.successPlays),
    yards_per_play: per(b.yards, b.plays, 2),
    explosive_rate: rate(b.explosive, b.plays)
  };
}

function finishSide(acc) {
  const splits = {};
  for (const s of SPLITS) {
    const done = finishBucket(acc.splits[s.key]);
    // A split with no plays is reported as null with its label, never omitted
    // — an absent key reads as "no tendency" instead of "no snaps".
    splits[s.key] = done ? { label: s.label, ...done } : { label: s.label, plays: 0, note: 'No snaps in this situation' };
  }
  return {
    overall: finishBucket(acc.all),
    splits,
    dropbacks: acc.dropbacks,
    qb_hit_rate: rate(acc.qbHits, acc.dropbacks),
    sack_rate: rate(acc.sacks, acc.dropbacks),
    qb_hits: acc.qbHits,
    sacks: acc.sacks,
    pass_rate_over_expected: acc.passOePlays > 0 ? Number((acc.passOe / acc.passOePlays).toFixed(2)) : null,
    shotgun_rate: rate(acc.shotgun, acc.scrimmage),
    no_huddle_rate: rate(acc.noHuddle, acc.scrimmage),
    turnovers: acc.turnovers,
    penalties: acc.penalties
  };
}

/**
 * Stream the season file and reduce it. The raw text never lands in one
 * string and the plays are never collected into an array.
 */
async function streamAndAggregate(season, { fetchImpl = globalThis.fetch } = {}) {
  const url = `${RELEASE_BASE}/pbp/play_by_play_${season}.csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    // A failed fetch is NOT an empty season.
    return { unavailable: true, reason: `Could not reach nflverse for play_by_play_${season}.csv: ${error.message}` };
  }
  if (response.status === 404) {
    clearTimeout(timer);
    return {
      unavailable: true,
      reason: `nflverse has not published play_by_play_${season}.csv yet — that file appears once the ${season} season's first games are played.`
    };
  }
  if (!response.ok) {
    clearTimeout(timer);
    return { unavailable: true, reason: `nflverse returned HTTP ${response.status} for play_by_play_${season}.csv.` };
  }

  const teams = new Map();
  const games = new Map();
  const gameTeamLines = new Map();
  let header = null;
  let idx = null;
  let malformed = 0;
  let rows = 0;

  const sideFor = (code) => {
    if (!teams.has(code)) teams.set(code, { offense: emptyAccumulator(), defense: emptyAccumulator() });
    return teams.get(code);
  };

  const handleRow = (cells) => {
    if (cells.length !== header.length) { malformed += 1; return; }
    rows += 1;
    const g = (name) => cells[idx[name]];

    const playType = g('play_type');
    const posteam = g('posteam');
    const defteam = g('defteam');
    if (!posteam || !defteam) return;

    const gameId = g('game_id');
    if (!games.has(gameId)) {
      games.set(gameId, {
        game_id: gameId,
        week: num(g('week')),
        season_type: g('season_type'),
        qbs: new Map()
      });
    }
    const game = games.get(gameId);
    const passer = g('passer_player_name');
    if (passer) {
      const key = `${posteam}|${passer}`;
      game.qbs.set(key, (game.qbs.get(key) || 0) + 1);
    }

    // PER-GAME lines, not only the season aggregate. An NFL season is
    // seventeen games; a five-game average is nearly a third of it and hides
    // exactly the week-to-week movement a bettor is reading. The founder's
    // point Aug 25: for football you look at the last game, the one before
    // it, and the one before that AS GAMES, with the trend beside them —
    // never instead of them.
    if (!gameTeamLines.has(gameId)) gameTeamLines.set(gameId, new Map());
    const perGame = gameTeamLines.get(gameId);
    for (const [code, role] of [[posteam, 'offense'], [defteam, 'defense']]) {
      if (!perGame.has(code)) perGame.set(code, { offense: { epa: 0, n: 0, succ: 0, sn: 0 }, defense: { epa: 0, n: 0, succ: 0, sn: 0 } });
      const slot = perGame.get(code)[role];
      const e = num(g('epa'));
      const sc = num(g('success'));
      if ((g('play_type') === 'run' || g('play_type') === 'pass')) {
        if (e !== null) { slot.epa += e; slot.n += 1; }
        if (sc !== null) { slot.succ += sc; slot.sn += 1; }
      }
    }

    // Only snaps from scrimmage carry situational meaning. Kicks, punts and
    // clock stoppages are excluded by inclusion here rather than by an
    // exclusion list, because play_type is a small closed vocabulary.
    if (playType !== 'run' && playType !== 'pass') return;

    const play = {
      playType,
      down: num(g('down')),
      ydstogo: num(g('ydstogo')),
      yardline100: num(g('yardline_100')),
      goalToGo: flag(g('goal_to_go')),
      halfSecs: num(g('half_seconds_remaining')),
      scoreDiff: num(g('score_differential')),
      epa: num(g('epa')),
      success: num(g('success')),
      wp: num(g('wp')),
      yards: num(g('yards_gained')),
      dropback: flag(g('qb_dropback')),
      qbHit: flag(g('qb_hit')),
      sack: flag(g('sack')),
      passOe: num(g('pass_oe')),
      shotgun: flag(g('shotgun')),
      noHuddle: flag(g('no_huddle')),
      interception: flag(g('interception')),
      fumbleLost: flag(g('fumble_lost')),
      penalty: flag(g('penalty'))
    };

    addPlay(sideFor(posteam).offense, play);
    addPlay(sideFor(defteam).defense, play);
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let pending = null;

  const consumeLine = (line) => {
    if (pending !== null) { line = `${pending}\n${line}`; pending = null; }
    if (unbalanced(line)) { pending = line; return; }
    const cells = splitLine(line);
    if (!header) {
      header = cells;
      idx = {};
      for (const w of WANTED) {
        const at = header.indexOf(w);
        if (at === -1) throw new Error(`nflverse play file is missing the column "${w}"`);
        idx[w] = at;
      }
      return;
    }
    handleRow(cells);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line.length) consumeLine(line);
      }
    }
    if (buf.trim().length) consumeLine(buf.replace(/\r$/, ''));
  } catch (error) {
    return { unavailable: true, reason: `Failed while reading play_by_play_${season}.csv: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }

  if (rows === 0) {
    return { unavailable: true, reason: `play_by_play_${season}.csv parsed to zero rows.` };
  }

  // Which quarterback actually started each game, so a season average can say
  // whether it blends more than one.
  const gameList = [...games.values()].map((g) => {
    const byTeam = new Map();
    for (const [key, n] of g.qbs) {
      const [team, name] = key.split('|');
      const cur = byTeam.get(team);
      if (!cur || n > cur.plays) byTeam.set(team, { name, plays: n });
    }
    const total = new Map();
    for (const [key, n] of g.qbs) {
      const team = key.split('|')[0];
      total.set(team, (total.get(team) || 0) + n);
    }
    const starters = {};
    for (const [team, top] of byTeam) {
      starters[team] = { name: top.name, share: Number((top.plays / (total.get(team) || 1)).toFixed(3)) };
    }
    const lines = {};
    const perGame = gameTeamLines.get(g.game_id);
    if (perGame) {
      for (const [code, slot] of perGame) {
        lines[code] = {
          offense_epa_per_play: slot.offense.n ? Number((slot.offense.epa / slot.offense.n).toFixed(3)) : null,
          offense_success_rate: slot.offense.sn ? Number((slot.offense.succ / slot.offense.sn).toFixed(4)) : null,
          offense_plays: slot.offense.n,
          defense_epa_per_play_allowed: slot.defense.n ? Number((slot.defense.epa / slot.defense.n).toFixed(3)) : null,
          defense_success_rate_allowed: slot.defense.sn ? Number((slot.defense.succ / slot.defense.sn).toFixed(4)) : null,
          defense_plays: slot.defense.n
        };
      }
    }
    return { game_id: g.game_id, week: g.week, season_type: g.season_type, starters, lines };
  }).sort((a, b) => (a.week || 0) - (b.week || 0));

  const out = { season, generated_at: new Date().toISOString(), plays_parsed: rows, malformed_rows: malformed, teams: {}, games: gameList };
  for (const [code, side] of teams) {
    out.teams[code] = { offense: finishSide(side.offense), defense: finishSide(side.defense) };
  }
  return out;
}

function cacheFile(season) {
  return join(DISK_CACHE_DIR, `pbp_ledger_${season}.json`);
}

/**
 * The season ledger, from disk when fresh and from nflverse otherwise.
 *
 * @param {number} season
 * @param {{force?:boolean, fetchImpl?:Function}} opts
 * @returns {Promise<Object>} the aggregate, or { unavailable, reason }
 */
export async function getPlayLedger(season, opts = {}) {
  const file = cacheFile(season);
  if (!opts.force) {
    try {
      if (existsSync(file) && Date.now() - statSync(file).mtimeMs < DISK_CACHE_TTL_MS) {
        return JSON.parse(readFileSync(file, 'utf8'));
      }
    } catch { /* a corrupt cache is a reason to refetch, not to fail */ }
  }

  const built = await streamAndAggregate(season, opts);
  if (built.unavailable) {
    // Serve a stale ledger rather than nothing: last week's splits are far
    // better evidence than a blank, and the staleness is stated.
    try {
      if (existsSync(file)) {
        const stale = JSON.parse(readFileSync(file, 'utf8'));
        const ageHours = Math.round((Date.now() - statSync(file).mtimeMs) / 3_600_000);
        return { ...stale, stale: true, stale_reason: `${built.reason} Serving the ledger built ${ageHours}h ago.` };
      }
    } catch { /* fall through to the honest failure */ }
    return built;
  }

  try {
    if (!existsSync(DISK_CACHE_DIR)) mkdirSync(DISK_CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(built));
  } catch { /* an unwritable cache must not fail the read */ }
  return built;
}

/** One team's ledger entry, or null. Never throws on a missing team. */
export function teamLedger(ledger, code) {
  if (!ledger || ledger.unavailable || !code) return null;
  return ledger.teams?.[code] || null;
}

/** Which quarterbacks started for a team, in week order. */
export function starterTimeline(ledger, code) {
  if (!ledger || ledger.unavailable || !code) return null;
  const rows = (ledger.games || [])
    .filter((g) => g.starters?.[code])
    .map((g) => ({ week: g.week, season_type: g.season_type, qb: g.starters[code].name, share: g.starters[code].share }));
  return rows.length ? rows : null;
}

export const _internals = { splitLine, unbalanced, streamAndAggregate, emptyAccumulator, addPlay, finishSide };
