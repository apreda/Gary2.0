// THE GAME FRAMES (founder, Sep 24 2026): every value on a player's sheet
// carries its date, the opponent and the arm he faced, newest first, so "what
// did he do yesterday, against whom, against what arm" is answered on the
// line itself. A count without the games is what Adam calls selective.
//
// One MLB Stats API schedule call covers the window (every game with both
// starters and the linescore), one people call per hundred starters adds
// their throwing hands. After a final, the schedule's listed starter is the
// pitcher who started (50 of 50 checked, Sep 24 2026). Facts only: no rate,
// no projection, nothing that says what a line means.

import { isMlbStart } from './mlbGameRows.js';

const BASE = 'https://statsapi.mlb.com/api/v1';
const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const lastName = (full) => String(full || '').trim().split(/\s+/).filter((p) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(p)).pop() || String(full || '');

/** Club nickname: "Toronto Blue Jays" → "Blue Jays". */
export function clubNick(full) {
  const parts = String(full || '').trim().split(/\s+/);
  const tail2 = parts.slice(-2).join(' ');
  return ['Red Sox', 'White Sox', 'Blue Jays'].includes(tail2) ? tail2 : parts[parts.length - 1] || String(full || '');
}

/** "Sep 23" in Eastern time. */
export function shortDate(iso) {
  const bare = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bare) return `${MONTHS[Number(bare[2]) - 1]} ${Number(bare[3])}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const [y, m, day] = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-').map(Number);
  return y ? `${MONTHS[m - 1]} ${day}` : '';
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`MLB Stats API HTTP ${res.status}`);
  return res.json();
}

const memo = new Map();

/**
 * Every final MLB game from `days` before `endDate` (YYYY-MM-DD) through it,
 * with both clubs, both starters (name, hand) and each club's first-inning runs.
 * Memoized per process. Throws when the schedule does not answer.
 */
export async function loadMlbGameFrames(endDate, { days = 50 } = {}) {
  const key = `${endDate}|${days}`;
  if (!memo.has(key)) memo.set(key, (async () => {
    const start = new Date(Date.parse(`${endDate}T12:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
    const data = await getJson(`/schedule?sportId=1&startDate=${start}&endDate=${endDate}&gameType=R,F,D,L,W&hydrate=probablePitcher,linescore`);
    const games = [];
    for (const d of data?.dates || []) {
      for (const g of d.games || []) {
        if (g?.status?.abstractGameState !== 'Final') continue;
        const side = (s) => ({
          name: g.teams?.[s]?.team?.name || null,
          starter: g.teams?.[s]?.probablePitcher ? { id: g.teams[s].probablePitcher.id, name: g.teams[s].probablePitcher.fullName, hand: null } : null,
          firstInningRuns: g.linescore?.innings?.[0]?.[s]?.runs ?? null,
          runs: g.teams?.[s]?.score ?? null,
        });
        games.push({ gamePk: g.gamePk, start: g.gameDate, startMs: Date.parse(g.gameDate), home: side('home'), away: side('away') });
      }
    }
    const ids = [...new Set(games.flatMap((g) => [g.home.starter?.id, g.away.starter?.id]).filter(Boolean))];
    const hands = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      try {
        const res = await getJson(`/people?personIds=${ids.slice(i, i + 100).join(',')}`);
        for (const p of res?.people || []) hands.set(p.id, p.pitchHand?.code || null);
      } catch { /* a hand we could not read prints without it */ }
    }
    for (const g of games) for (const s of [g.home, g.away]) if (s.starter) s.starter.hand = hands.get(s.starter.id) || null;
    games.sort((a, b) => a.startMs - b.startMs);
    return games;
  })());
  return memo.get(key);
}

/** The frame of one past game for a club: the game whose start is closest to `iso` on that club's schedule. */
export function frameFor(games, teamName, iso) {
  const t = Date.parse(iso);
  const mine = fold(teamName), nick = fold(clubNick(teamName));
  const same = (name) => { const f = fold(name); return f === mine || (nick && fold(clubNick(name)) === nick); };
  let best = null;
  for (const g of games || []) {
    const home = same(g.home.name), away = same(g.away.name);
    if (!home && !away) continue;
    const gap = Math.abs(g.startMs - t);
    if (gap > 18 * 3600 * 1000) continue;
    if (!best || gap < best.gap) best = { gap, g, home };
  }
  if (!best) return null;
  const { g, home } = best;
  const mineSide = home ? g.home : g.away, theirs = home ? g.away : g.home;
  return { gamePk: g.gamePk, start: g.start, home, opp: theirs.name, oppNick: clubNick(theirs.name), oppStarter: theirs.starter, ownStarter: mineSide.starter,
    firstInningFor: mineSide.firstInningRuns, firstInningAgainst: theirs.firstInningRuns };
}

/** "Sep 23 at Reds" / "Sep 23 vs Reds". */
export function gameLabel(frame, iso) {
  const date = shortDate(frame?.start || iso);
  if (!frame) return date;
  return `${date} ${frame.home ? 'vs' : 'at'} ${frame.oppNick}`;
}

/** "Abbott, LHP" — the arm a hitter faced to start that game. */
export function armLabel(starter) {
  if (!starter?.name) return null;
  return `${lastName(starter.name)}${starter.hand === 'L' ? ', LHP' : starter.hand === 'R' ? ', RHP' : ''}`;
}

const n = (v) => Number(v) || 0;

/** A hitter's box line: "2 for 4, HR, 2B, BB, 2 K". */
export function battingLine(r) {
  const bits = [`${n(r.hits)} for ${n(r.at_bats)}`];
  const add = (count, label) => { if (count === 1) bits.push(label); else if (count > 1) bits.push(`${count} ${label}`); };
  add(n(r.hr), 'HR'); add(n(r.triples), '3B'); add(n(r.doubles), '2B'); add(n(r.bb), 'BB'); add(n(r.k), 'K');
  if (n(r.rbi)) bits.push(`${n(r.rbi)} RBI`);
  return bits.join(', ');
}

/** A starter's box line: "6.1 IP, 1 ER, 3 H, 2 BB, 8 K, 1 HR, 96 pitches". */
export function pitchingLine(r) {
  const bits = [`${r.ip ?? '?'} IP`, `${n(r.er)} ER`, `${n(r.p_hits)} H`, `${n(r.p_bb)} BB`, `${n(r.p_k)} K`];
  if (n(r.p_hr)) bits.push(`${n(r.p_hr)} HR`);
  if (r.pitch_count != null) bits.push(`${r.pitch_count} pitches`);
  return bits.join(', ');
}

/** The club a BDL row was played for. */
export const rowTeam = (r) => r?.team?.display_name || r?.team_name || null;

const SLOTS = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'];
const ORD = (k) => `${k}${['st', 'nd', 'rd'][k - 1] || 'th'}`;

/**
 * Tonight's players by the MLB Stats API: each game's roster (boxscore) gives
 * the MLBAM ids, one people call per sixty players gives each hitter's season
 * split against lefties and righties and the batting slot he has hit from
 * most, and each pitcher's season line in the first inning. Returns a lookup
 * by game and name; a source that does not answer leaves its facts out.
 */
export async function loadMlbPlayerSplits(gamePks, season) {
  const idsByGame = new Map();
  await Promise.all([...new Set(gamePks.filter(Boolean))].map(async (pk) => {
    try {
      const box = await getJson(`/game/${pk}/boxscore`);
      const byName = new Map();
      for (const side of ['home', 'away']) for (const p of Object.values(box?.teams?.[side]?.players || {})) if (p?.person?.id) byName.set(fold(p.person.fullName), p.person.id);
      idsByGame.set(String(pk), byName);
    } catch { /* that game's players print without their splits */ }
  }));
  const ids = [...new Set([...idsByGame.values()].flatMap((m) => [...m.values()]))];
  const hitting = new Map(), firstInning = new Map();
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60).join(',');
    try {
      const q = `hydrate=stats(group=[hitting],type=[statSplits],sitCodes=[vl,vr,${SLOTS.join(',')}],season=${season})`;
      const res = await getJson(`/people?personIds=${chunk}&${q}`);
      for (const p of res?.people || []) {
        const splits = p.stats?.[0]?.splits || [];
        const get = (code) => splits.find((s) => s.split?.code === code)?.stat || null;
        const slots = SLOTS.map((code, k) => ({ slot: k + 1, pa: Number(get(code)?.plateAppearances) || 0 })).filter((s) => s.pa > 0).sort((a, b) => b.pa - a.pa);
        hitting.set(p.id, { vl: get('vl'), vr: get('vr'), usualSlot: slots[0]?.slot ?? null, slots });
      }
    } catch { /* splits left out */ }
    try {
      const res = await getJson(`/people?personIds=${chunk}&hydrate=stats(group=[pitching],type=[statSplits],sitCodes=[i01],season=${season})`);
      for (const p of res?.people || []) {
        const s = p.stats?.[0]?.splits?.find((x) => x.split?.code === 'i01')?.stat;
        if (s && Number(s.gamesPlayed) > 0) firstInning.set(p.id, s);
      }
    } catch { /* first-inning lines left out */ }
  }
  const idOf = (gamePk, name) => idsByGame.get(String(gamePk))?.get(fold(name)) ?? null;
  return {
    idOf,
    hitter: (gamePk, name) => hitting.get(idOf(gamePk, name)) || null,
    firstInning: (gamePk, name) => firstInning.get(idOf(gamePk, name)) || null,
  };
}

/**
 * Batter against tonight's arm, career (MLB Stats API vsPlayer, the one
 * matchup fact BDL does not carry). `pairs` = [{ batterId, pitcherId }] by
 * MLBAM id; returns Map "batter|pitcher" → the total line. Eight in flight.
 */
export async function loadVsPitcher(pairs) {
  const out = new Map();
  const todo = [...new Map(pairs.filter((p) => p?.batterId && p?.pitcherId).map((p) => [`${p.batterId}|${p.pitcherId}`, p])).values()];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const p = todo[i++];
      try {
        const res = await getJson(`/people/${p.batterId}/stats?stats=vsPlayer&opposingPlayerId=${p.pitcherId}&group=hitting`);
        const total = (res?.stats || []).find((s) => s?.type?.displayName === 'vsPlayerTotal')?.splits?.[0]?.stat;
        // An answered pair with no meetings is stored as null, so a sheet can
        // tell "never faced him" from a read that did not answer.
        out.set(`${p.batterId}|${p.pitcherId}`, total && Number(total.plateAppearances) > 0 ? total : null);
      } catch { /* that pair prints without the matchup line */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, todo.length) }, worker));
  return out;
}

/** "against Skenes, career: 2 for 8, 0 HR, 1 BB, 2 K (9 PA)". */
export function vsPitcherLine(stat, pitcherName) {
  if (!stat) return null;
  return `against ${lastName(pitcherName)}, career: ${Number(stat.hits) || 0} for ${Number(stat.atBats) || 0}, ${Number(stat.homeRuns) || 0} HR, ${Number(stat.doubles) || 0} 2B, ${Number(stat.baseOnBalls) || 0} BB, ${Number(stat.strikeOuts) || 0} K (${stat.plateAppearances} PA)`;
}

/**
 * "contact quality this season (Statcast expected stats, from how hard and at
 * what angle he hit the ball): .249 xBA, .474 xSLG beside his actual .278,
 * .486, over 410 PA" — a description of the season's contact, never a forecast.
 */
export function expectedStatsLine(x) {
  if (!x || !(Number(x.pa) > 0) || x.est_ba == null) return null;
  const f = (v) => (v == null || v === '' ? '?' : Number(v).toFixed(3).replace(/^0/, ''));
  return `contact quality this season (Statcast expected stats, from how hard and at what angle he hit the ball): ${f(x.est_ba)} xBA, ${f(x.est_slg)} xSLG beside his actual ${f(x.ba)}, ${f(x.slg)}, over ${x.pa} PA`;
}

/** "contact this season (Statcast): 34 barrels and 112 balls hit 95+ mph in 585 batted balls, 86.4 mph average exit velocity". */
export function contactQualityLine(row) {
  if (!row || !(Number(row.attempts) > 0)) return null;
  return `contact this season (Statcast): ${Number(row.barrels) || 0} barrels and ${Number(row.ev95plus) || 0} balls hit 95+ mph in ${row.attempts} batted balls, ${row.avg_hit_speed} mph average exit velocity`;
}

const opsText = (v) => (v == null || v === '' ? null : String(v).replace(/^0(?=\.)/, ''));

/** "vs righties .880 OPS, 12 HR in 400 PA · vs lefties .790 OPS, 3 HR in 140 PA". */
export function platoonLine(split) {
  if (!split) return null;
  const one = (s, label) => (s && Number(s.plateAppearances) ? `vs ${label} ${opsText(s.ops)} OPS, ${Number(s.homeRuns) || 0} HR in ${s.plateAppearances} PA` : null);
  const parts = [one(split.vr, 'righties'), one(split.vl, 'lefties')].filter(Boolean);
  return parts.length ? `this season ${parts.join(' · ')}` : null;
}

/** "batting 7th tonight; most of his season from 3rd (310 PA), then 4th (120)". */
export function slotLine(tonight, split) {
  if (!split?.slots?.length && tonight == null) return null;
  const usual = (split?.slots || []).slice(0, 2).map((s, i) => (i ? `then ${ORD(s.slot)} (${s.pa})` : `${ORD(s.slot)} (${s.pa} PA)`)).join(', ');
  if (tonight == null) return usual ? `most of his season from ${usual}` : null;
  return `batting ${ORD(Number(tonight))} tonight${usual ? `; most of his season from ${usual}` : ''}`;
}

// ── A player's games as a shape (Adam, Sep 24 2026: "last 15" as one number
// makes Gary ride a streak until the count changes; the line lags a breakout).

const playedAsHitter = (r) => Number(r?.plate_appearances ?? 0) > 0 || Number(r?.at_bats ?? 0) > 0;
const startedGame = isMlbStart;
const dateKey = (r) => String(r?._game?.date || '').slice(0, 10);

/** One line per game, newest first: "Sep 23 at Reds (Abbott, LHP): 2 for 4, HR". `extra(row)` appends market values. */
export function hitterGameLog(rows, games, { limit = 10, extra = null } = {}) {
  const played = (rows || []).filter(playedAsHitter).slice(-limit).reverse();
  return played.map((r) => {
    const f = frameFor(games, rowTeam(r), r._game?.date);
    const arm = armLabel(f?.oppStarter);
    const more = extra ? extra(r) : null;
    return `${gameLabel(f, r._game?.date)}${arm ? ` (${arm})` : ''}: ${battingLine(r)}${more ? ` · ${more}` : ''}`;
  });
}

function battingTotals(list) {
  const sum = (k) => list.reduce((a, r) => a + n(r[k]), 0);
  const bits = [`${list.length} game${list.length === 1 ? '' : 's'}`, `${sum('hits')} for ${sum('at_bats')}`, `${sum('hr')} HR`, `${sum('doubles')} 2B`, ...(sum('triples') ? [`${sum('triples')} 3B`] : []), `${sum('bb')} BB`, `${sum('k')} K`];
  return bits.join(', ');
}

/** "last 7 days: 6 games, 8 for 25, 2 HR ... · last 15 games: ... · season: ..." — the windows side by side, unlabeled. */
export function hitterWindows(rows, { asOf = null } = {}) {
  const played = (rows || []).filter(playedAsHitter);
  if (!played.length) return null;
  const end = asOf || dateKey(played[played.length - 1]);
  const weekStart = new Date(Date.parse(`${end}T12:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
  const week = played.filter((r) => dateKey(r) >= weekStart && dateKey(r) <= end);
  const parts = [];
  if (week.length) parts.push(`last 7 days: ${battingTotals(week)}`);
  parts.push(`last 15 games: ${battingTotals(played.slice(-15))}`);
  parts.push(`season: ${battingTotals(played)}`);
  return parts.join(' · ');
}

/** One line per start, newest first: "Sep 18 vs Nationals: 3.0 IP, 6 ER, 7 H, 2 BB, 1 K, 78 pitches". */
export function pitcherStartLog(rows, games, { limit = 8, extra = null } = {}) {
  const starts = (rows || []).filter(startedGame).slice(-limit).reverse();
  return starts.map((r) => {
    const f = frameFor(games, rowTeam(r), r._game?.date);
    const more = extra ? extra(r) : null;
    return `${gameLabel(f, r._game?.date)}: ${pitchingLine(r)}${more ? ` · ${more}` : ''}`;
  });
}

/** "season: 28 starts, 612 batters faced, 147 K, 41 BB, 19 HR allowed" — his counts, the reader divides. */
export function pitcherSeasonLine(rows) {
  const starts = (rows || []).filter(startedGame);
  if (!starts.length) return null;
  const sum = (k) => starts.reduce((a, r) => a + n(r[k]), 0);
  return `season: ${starts.length} starts, ${sum('batters_faced')} batters faced, ${sum('p_k')} K, ${sum('p_bb')} BB, ${sum('p_hits')} H, ${sum('p_hr')} HR allowed`;
}

/** "first inning this season: 13 runs in 30 first innings, 23 hits, 11 walks". */
export function firstInningSeasonLine(stat) {
  if (!stat) return null;
  return `first inning this season: ${Number(stat.runs) || 0} runs in ${stat.gamesPlayed} first innings, ${Number(stat.hits) || 0} hits, ${Number(stat.baseOnBalls) || 0} walks, ${Number(stat.strikeOuts) || 0} strikeouts`;
}

/** A starter's last starts' first innings, newest first, from the frames: "runs he allowed in the 1st, last 8 starts: 0 0 2 0 1 0 0 3". */
export function firstInningStartsLine(games, pitcherName, { limit = 8, before = null } = {}) {
  const f = fold(pitcherName);
  const starts = (games || []).filter((g) => (!before || g.startMs < before)
    && (fold(g.home.starter?.name) === f || fold(g.away.starter?.name) === f));
  const recent = starts.slice(-limit).reverse().map((g) => (fold(g.home.starter?.name) === f ? g.away.firstInningRuns : g.home.firstInningRuns)).filter((v) => v != null);
  return recent.length ? `runs allowed in the 1st, last ${recent.length} starts, newest first: ${recent.join(' ')}` : null;
}

/** "last 10 games, newest first: W 5-3, L 1-4, ... (6-4)" — the club's results from the frames. */
export function clubFormLine(games, teamName, { limit = 10, before = null } = {}) {
  const mine = fold(teamName), nick = fold(clubNick(teamName));
  const same = (name) => fold(name) === mine || fold(clubNick(name)) === nick;
  const list = (games || []).filter((g) => (!before || g.startMs < before) && (same(g.home.name) || same(g.away.name)) && g.home.runs != null && g.away.runs != null);
  const recent = list.slice(-limit).reverse().map((g) => {
    const us = same(g.home.name) ? g.home.runs : g.away.runs, them = same(g.home.name) ? g.away.runs : g.home.runs;
    return { w: us > them, text: `${us > them ? 'W' : 'L'} ${us}-${them}` };
  });
  if (!recent.length) return null;
  const w = recent.filter((r) => r.w).length;
  return `last ${recent.length} games, newest first: ${recent.map((r) => r.text).join(', ')} (${w}-${recent.length - w})`;
}

/** A club's last games' first innings, newest first: "runs in the 1st, last 10 games, newest first: 0 1 0 0 2 ...". */
export function clubFirstInningsLine(games, teamName, { limit = 10, before = null } = {}) {
  const mine = fold(teamName), nick = fold(clubNick(teamName));
  const same = (name) => fold(name) === mine || fold(clubNick(name)) === nick;
  const list = (games || []).filter((g) => (!before || g.startMs < before) && (same(g.home.name) || same(g.away.name)));
  const recent = list.slice(-limit).reverse().map((g) => (same(g.home.name) ? g.home.firstInningRuns : g.away.firstInningRuns)).filter((v) => v != null);
  return recent.length ? `runs in the 1st, last ${recent.length} games, newest first: ${recent.join(' ')}` : null;
}
