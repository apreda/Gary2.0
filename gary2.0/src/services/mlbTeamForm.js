/**
 * TEAM FORM (founder, Sep 30 2026): each club over its last 3, 5, 10, 15 and
 * 30 completed games — record, runs, the offense's slash line and plate
 * discipline, the staff split into rotation and bullpen, the schedule every
 * window came against, and results by the opposing starter's hand.
 *
 * One source: each game's StatsAPI box score, joined by gamePk, so postseason
 * games count and a doubleheader is two games. Exhibitions never count. A box
 * that fails keeps its game in the record and runs (the schedule has the
 * score) and is named as missing from every rate it would have fed.
 */
import { getMlbRecentGames, getGameBoxScore, getMlbPeopleHands, getMlbTeams } from './mlbStatsApiService.js';
import { mlbGameSide } from './mlbIdentity.js';

export const TEAM_FORM_WINDOWS = [3, 5, 10, 15, 30];
const COUNTED_GAME_TYPES = new Set(['R', 'F', 'D', 'L', 'W']);
const num = value => Number(value) || 0;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const starterOf = side => (side?.pitchers || [])
  .find(id => num(side.players?.[`ID${id}`]?.stats?.pitching?.gamesStarted) === 1);

function readGame(game, box, teamId, teamNames) {
  const side = mlbGameSide(game, teamId);
  const other = side === 'home' ? 'away' : 'home';
  const mine = game.teams[side];
  const theirs = game.teams[other];
  const runsFor = num(mine.score);
  const runsAgainst = num(theirs.score);
  const line = {
    gamePk: game.gamePk,
    date: game.officialDate || String(game.gameDate || '').slice(0, 10),
    home: side === 'home',
    opponent: teamNames.get(theirs.team?.id) || theirs.team?.name || 'Opponent',
    win: typeof mine.isWinner === 'boolean' ? mine.isWinner : runsFor > runsAgainst,
    runsFor, runsAgainst,
    label: game.gameType !== 'R' && game.seriesDescription
      ? `${game.seriesDescription}${game.seriesGameNumber ? ` Game ${game.seriesGameNumber}` : ''}` : null,
    // The opponent's record through that game. A postseason game's record is the series, so it is left out.
    oppRecord: game.gameType === 'R' && theirs.leagueRecord?.wins != null ? `${theirs.leagueRecord.wins}-${theirs.leagueRecord.losses}` : null,
    box: null,
  };
  const ours = box?.teams?.[side];
  const bat = ours?.teamStats?.batting;
  const pit = ours?.teamStats?.pitching;
  if (!bat || !pit) return line;
  const spId = starterOf(ours);
  const sp = spId != null ? ours.players[`ID${spId}`].stats.pitching : null;
  const oppSpId = starterOf(box.teams?.[other]) ?? null;
  const nameOf = (teamBox, id) => (id != null ? teamBox?.players?.[`ID${id}`]?.person?.fullName || null : null);
  line.box = {
    pa: num(bat.plateAppearances), ab: num(bat.atBats), h: num(bat.hits), bb: num(bat.baseOnBalls),
    hbp: num(bat.hitByPitch), sf: num(bat.sacFlies), tb: num(bat.totalBases), so: num(bat.strikeOuts),
    hr: num(bat.homeRuns),
    outs: num(pit.outs), er: num(pit.earnedRuns), ha: num(pit.hits), bba: num(pit.baseOnBalls),
    soa: num(pit.strikeOuts), hra: num(pit.homeRuns), bf: num(pit.battersFaced),
    sp: sp ? { outs: num(sp.outs), er: num(sp.earnedRuns) } : null,
    oppStarterId: oppSpId,
    spName: nameOf(ours, spId), oppSpName: nameOf(box.teams?.[other], oppSpId),
  };
  return line;
}

/** Newest game last. Throws only when the club's schedule itself is unavailable. */
export async function loadMlbTeamForm(teamId, { asOf = new Date() } = {}) {
  const maxWindow = Math.max(...TEAM_FORM_WINDOWS);
  const [games, teams] = await Promise.all([
    getMlbRecentGames(teamId, maxWindow + 10, { asOf }),
    getMlbTeams().catch(() => []),
  ]);
  const teamNames = new Map((teams || []).map(t => [t.id, t.teamName || t.clubName || t.name]));
  const counted = games.filter(game => COUNTED_GAME_TYPES.has(game.gameType)).slice(-maxWindow);
  const boxes = await mapLimit(counted, 6, game => getGameBoxScore(game.gamePk).catch(() => null));
  const lines = counted.map((game, i) => readGame(game, boxes[i], teamId, teamNames));
  const hands = await getMlbPeopleHands(lines.map(l => l.box?.oppStarterId).filter(Boolean));
  for (const l of lines) if (l.box) l.box.oppStarterHand = hands.get(l.box.oppStarterId)?.throw || null;
  return lines;
}

const rate = (n, d) => (d > 0 ? n / d : null);
const avgFmt = v => (v == null ? '—' : v.toFixed(3).replace(/^0/, ''));
const fixed = (v, digits) => (v == null ? '—' : v.toFixed(digits));
const pct = (n, d) => (d > 0 ? `${(100 * n / d).toFixed(1)}%` : '—');
const ipFmt = outs => `${Math.floor(outs / 3)}.${Math.round(outs) % 3}`;
const shortDate = iso => { const [, m, d] = String(iso).split('-'); return `${Number(m)}/${Number(d)}`; };

function summarize(games) {
  const n = games.length;
  const wins = games.filter(g => g.win).length;
  const boxed = games.filter(g => g.box);
  const sum = key => boxed.reduce((s, g) => s + g.box[key], 0);
  const withSp = boxed.filter(g => g.box.sp);
  const spOuts = withSp.reduce((s, g) => s + g.box.sp.outs, 0);
  const spEr = withSp.reduce((s, g) => s + g.box.sp.er, 0);
  const penOuts = withSp.reduce((s, g) => s + g.box.outs - g.box.sp.outs, 0);
  const penEr = withSp.reduce((s, g) => s + g.box.er - g.box.sp.er, 0);
  const ab = sum('ab'), h = sum('h'), bb = sum('bb'), hbp = sum('hbp'), sf = sum('sf');
  const obp = rate(h + bb + hbp, ab + bb + hbp + sf);
  const slg = rate(sum('tb'), ab);
  const outs = sum('outs');
  return {
    n, wins, losses: n - wins, boxed: boxed.length,
    homeGames: games.filter(g => g.home).length,
    first: games[0]?.date, last: games[n - 1]?.date,
    rpg: n ? games.reduce((s, g) => s + g.runsFor, 0) / n : null,
    rapg: n ? games.reduce((s, g) => s + g.runsAgainst, 0) / n : null,
    avg: rate(h, ab), obp, slg, ops: obp != null && slg != null ? obp + slg : null,
    hrpg: boxed.length ? sum('hr') / boxed.length : null,
    kPct: pct(sum('so'), sum('pa')), bbPct: pct(bb, sum('pa')),
    era: outs ? 27 * sum('er') / outs : null, whip: outs ? 3 * (sum('ha') + sum('bba')) / outs : null,
    kPctA: pct(sum('soa'), sum('bf')), bbPctA: pct(sum('bba'), sum('bf')),
    hr9: outs ? 27 * sum('hra') / outs : null,
    spEra: spOuts ? 27 * spEr / spOuts : null, spIp: withSp.length ? spOuts / withSp.length : null,
    penEra: penOuts ? 27 * penEr / penOuts : null, penIp: withSp.length ? penOuts / withSp.length : null,
  };
}

/** Desk text for one club. `lines` is loadMlbTeamForm's output (newest last). */
export function formatMlbTeamForm(teamName, lines) {
  if (!lines?.length) return `${teamName}: no completed games in the last 45 days.`;
  const newestFirst = [...lines].reverse();
  const out = [];
  const postseason = newestFirst.filter(g => g.label).map(g => `${shortDate(g.date)} ${g.label}`);
  out.push(`${teamName} — through ${shortDate(newestFirst[0].date)}${postseason.length ? ` (postseason games included: ${postseason.join(', ')})` : ''}`);
  out.push('  Games   Dates         W-L    Home/Road | R/G  RA/G | AVG/OBP/SLG     HR/G  K%     BB%   | Staff ERA  WHIP  K%     BB%    HR/9 | Rotation ERA, IP/start | Bullpen ERA, IP/game');
  for (const [i, w] of TEAM_FORM_WINDOWS.entries()) {
    if (i > 0 && lines.length <= TEAM_FORM_WINDOWS[i - 1]) break;
    const s = summarize(lines.slice(-w));
    const label = `L${w}${s.n < w ? ` (${s.n} played)` : ''}`;
    const missing = s.boxed < s.n ? `  [box scores missing for ${s.n - s.boxed} of ${s.n} games; rates use the rest]` : '';
    out.push(`  ${label.padEnd(7)} ${`${shortDate(s.first)}–${shortDate(s.last)}`.padEnd(13)} ${`${s.wins}-${s.losses}`.padEnd(6)} ${`${s.homeGames}H/${s.n - s.homeGames}R`.padEnd(9)} | ${fixed(s.rpg, 1).padEnd(4)} ${fixed(s.rapg, 1).padEnd(4)} | ${`${avgFmt(s.avg)}/${avgFmt(s.obp)}/${avgFmt(s.slg)}`.padEnd(15)} ${fixed(s.hrpg, 2).padEnd(5)} ${s.kPct.padEnd(6)} ${s.bbPct.padEnd(5)} | ${fixed(s.era, 2).padEnd(9)} ${fixed(s.whip, 2).padEnd(5)} ${s.kPctA.padEnd(6)} ${s.bbPctA.padEnd(6)} ${fixed(s.hr9, 2).padEnd(4)} | ${fixed(s.spEra, 2)}, ${s.spIp == null ? '—' : ipFmt(s.spIp)} | ${fixed(s.penEra, 2)}, ${s.penIp == null ? '—' : ipFmt(s.penIp)}${missing}`);
  }
  // Every game once, newest first, grouped by the window it first enters.
  const bands = [];
  let start = 0;
  for (const w of TEAM_FORM_WINDOWS) {
    if (start >= newestFirst.length) break;
    const games = newestFirst.slice(start, w);
    if (games.length) {
      bands.push(`  ${start === 0 ? `L1–${start + games.length}` : `L${start + 1}–${start + games.length}`}:`);
      for (const g of games) {
        const starters = g.box?.spName || g.box?.oppSpName ? ` · starters: ${g.box.spName || 'not recorded'} vs ${g.box.oppSpName || 'not recorded'}` : '';
        bands.push(`    ${shortDate(g.date)} · ${g.label ? `${g.label} · ` : ''}${g.home ? 'vs' : '@'} ${g.opponent}${g.oppRecord ? ` (${g.oppRecord})` : ''} · ${g.win ? 'W' : 'L'} ${g.runsFor}-${g.runsAgainst}${starters}`);
      }
    }
    start = w;
  }
  out.push("  Games, newest first (a record beside an opponent is that club's record through that game):");
  out.push(...bands);
  const byHand = hand => lines.filter(g => g.box?.oppStarterHand === hand);
  const handLine = (hand, word) => {
    const games = byHand(hand);
    if (!games.length) return `vs ${word}-handed starters: none`;
    const s = summarize(games);
    return `vs ${word}-handed starters: ${s.n} G, ${s.wins}-${s.losses}, ${fixed(s.rpg, 1)} R/G, ${avgFmt(s.ops)} OPS`;
  };
  const unknownHand = lines.filter(g => !g.box?.oppStarterHand).length;
  out.push(`  Last ${lines.length} by the opposing starter's hand — ${handLine('R', 'right')} | ${handLine('L', 'left')}${unknownHand ? ` | hand unavailable for ${unknownHand} game(s)` : ''}`);
  return out.join('\n');
}
