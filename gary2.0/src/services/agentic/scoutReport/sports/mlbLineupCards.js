/**
 * TONIGHT'S NINE, HITTER BY HITTER — MLB (founder GO, Oct 4 2026).
 *
 * The June desk printed the lineup as eighteen names and which side each bats
 * from. Hitter numbers reached Gary only through the research assistant, whose
 * tools picked "the top hitters by season OPS": on Oct 4 seven of the Dodgers'
 * nine starters had no left/right splits while two bench bats did. The
 * founder: "a player's season stats aren't that helpful for Gary trying to
 * pick one game", and what Gary must have every game belongs on the desk,
 * where it is always there, not in whatever the assistant happens to fetch.
 *
 * Two things live here:
 *  - `tonightLineup`: the confirmed batting order and bench from the official
 *    boxscore, so the hitter tools read tonight's nine instead of a season
 *    ranking (`pickTonightHitters`).
 *  - `mlbLineupCards`: for each of tonight's nine, his last 7 days, last 15
 *    games and this postseason, his season against each hand, where he is
 *    batting tonight beside where he usually bats, and his career against
 *    tonight's opposing starter. Facts only. A feed that does not answer
 *    leaves its line out.
 */
import { getCachedOrFetch } from '../../../ballDontLieService.js';
import { loadMlbPlayerSplits, loadVsPitcher, vsPitcherLine, platoonLine, slotLine } from '../../../mlbGameFrames.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';
const DAY_MS = 86400000;

export const foldName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

async function getJson(path, fetchImpl = fetch) {
  const resp = await fetchImpl(`${STATSAPI}${path}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`statsapi ${resp.status} ${path}`);
  return resp.json();
}

/**
 * The confirmed batting order and bench for a game, or null before lineups post.
 * @returns {Promise<null | {home: Side, away: Side}>} Side = { team, order: [{id, name}], bench: [{id, name}] }
 */
export async function tonightLineup(gamePk, fetchImpl = fetch) {
  if (!gamePk) return null;
  const box = await getCachedOrFetch(`mlb_tonight_lineup_${gamePk}`, () => getJson(`/game/${gamePk}/boxscore`, fetchImpl), 5).catch(() => null);
  if (!box?.teams) return null;
  const side = (key) => {
    const t = box.teams[key];
    const person = (id) => ({ id, name: t?.players?.[`ID${id}`]?.person?.fullName || null });
    return { team: t?.team?.name || '', order: (t?.battingOrder || []).map(person).filter((p) => p.name), bench: (t?.bench || []).map(person).filter((p) => p.name) };
  };
  const out = { home: side('home'), away: side('away') };
  return out.home.order.length >= 9 && out.away.order.length >= 9 ? out : null;
}

/** The lineup side for a club name ("Braves" or "Atlanta Braves"), or null. */
export function lineupSideFor(lineup, teamName) {
  if (!lineup || !teamName) return null;
  const want = foldName(teamName);
  const hit = [lineup.home, lineup.away].filter((s) => { const have = foldName(s.team); return have && (have === want || have.endsWith(` ${want}`) || want.endsWith(` ${have}`) || have.includes(want) || want.includes(have)); });
  return hit.length === 1 ? hit[0] : null;
}

/**
 * The hitters a tool should read: tonight's nine in batting order, then the
 * bench. Before lineups post (or when a name does not match), the old order:
 * the club's best `fallback` hitters by season OPS with at least 20 at-bats.
 * `rows` are BDL team season stat rows.
 */
export function pickTonightHitters(rows, side, { fallback = 6, bench = 4 } = {}) {
  const hitters = (rows || []).filter((s) => s.batting_ops > 0 || s.batting_avg > 0);
  const byOps = () => hitters.filter((s) => (s.batting_ab || 0) >= 20).sort((a, b) => (b.batting_ops || 0) - (a.batting_ops || 0));
  if (!side?.order?.length) return byOps().slice(0, fallback);
  const byName = new Map(hitters.map((s) => [foldName(s.player?.full_name || `${s.player?.first_name || ''} ${s.player?.last_name || ''}`), s]));
  const nine = side.order.map((p) => byName.get(foldName(p.name))).filter(Boolean);
  if (nine.length < 6) return byOps().slice(0, fallback);      // the names did not line up; do not hand back a partial order
  const benchRows = side.bench.map((p) => byName.get(foldName(p.name))).filter((s) => s && !nine.includes(s)).slice(0, bench);
  return [...nine, ...benchRows];
}

const n = (v) => Number(v) || 0;

/** One hitter's games this season, regular season then postseason, oldest first. */
async function hitterGames(id, season, fetchImpl) {
  return getCachedOrFetch(`mlb_hitter_gamelog_${id}_${season}`, async () => {
    const [regular, post] = await Promise.all(['R', 'P'].map((gameType) =>
      getJson(`/people/${id}/stats?stats=gameLog&group=hitting&season=${season}&gameType=${gameType}`, fetchImpl)
        .then((j) => (j?.stats?.[0]?.splits || []).map((s) => ({ date: s.date, postseason: gameType === 'P', ...s.stat }))).catch(() => [])));
    return [...regular, ...post].filter((g) => g.date && n(g.plateAppearances) > 0).sort((a, b) => a.date.localeCompare(b.date));
  }, 20);
}

function totals(games) {
  const sum = (k) => games.reduce((a, g) => a + n(g[k]), 0);
  const bits = [`${games.length} game${games.length === 1 ? '' : 's'}`, `${sum('hits')} for ${sum('atBats')}`, `${sum('homeRuns')} HR`];
  if (sum('doubles')) bits.push(`${sum('doubles')} 2B`);
  bits.push(`${sum('baseOnBalls')} BB`, `${sum('strikeOuts')} K`);
  return bits.join(', ');
}

/** "last 7 days: 4 games, 5 for 16, 1 HR, 2 BB, 4 K · last 15 games: … · this postseason: …". */
export function recentWindows(games, dateEt) {
  const before = (games || []).filter((g) => g.date < dateEt);
  if (!before.length) return null;
  const weekStart = new Date(Date.parse(`${dateEt}T12:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
  const week = before.filter((g) => g.date >= weekStart);
  const post = before.filter((g) => g.postseason);
  return [
    week.length ? `last 7 days: ${totals(week)}` : 'last 7 days: no games',
    `last 15 games: ${totals(before.slice(-15))}`,
    ...(post.length ? [`this postseason: ${totals(post)}`] : []),
  ].join(' · ');
}

/**
 * @param {object} input
 * @param {number} input.gamePk
 * @param {string} input.dateEt  tonight's ET date; form runs through the day before
 * @param {{name: string, starter?: string}} input.home @param {{name: string, starter?: string}} input.away
 *   the desk's club labels and each club's starting pitcher tonight
 * @returns {Promise<string>} '' before lineups post or when nothing could be read
 */
export async function mlbLineupCards({ gamePk, season, dateEt, home, away, fetchImpl = fetch } = {}) {
  const lineup = await tonightLineup(gamePk, fetchImpl);
  if (!lineup) return '';
  const splits = await loadMlbPlayerSplits([gamePk], season).catch(() => null);
  const sides = [
    { label: away?.name, side: lineup.away, facing: home?.starter },
    { label: home?.name, side: lineup.home, facing: away?.starter },
  ];
  const pairs = [];
  for (const s of sides) {
    s.starterId = s.facing && splits ? splits.idOf(gamePk, s.facing) : null;
    if (s.starterId) for (const b of s.side.order) pairs.push({ batterId: b.id, pitcherId: s.starterId });
  }
  const vs = await loadVsPitcher(pairs).catch(() => new Map());
  const blocks = [];
  for (const s of sides) {
    const cards = await Promise.all(s.side.order.map(async (b, i) => {
      const games = await hitterGames(b.id, season, fetchImpl).catch(() => []);
      const split = splits?.hitter(gamePk, b.name) || null;
      const key = `${b.id}|${s.starterId}`;
      const career = s.starterId && vs.has(key)
        ? (vsPitcherLine(vs.get(key), s.facing) || `no career plate appearances against ${String(s.facing).split(' ').slice(-1)[0]}`)
        : null;
      const facts = [recentWindows(games, dateEt), platoonLine(split), career].filter(Boolean);
      return [`  ${i + 1}. ${b.name} — ${slotLine(i + 1, split) || `batting ${i + 1} tonight`}`, ...facts.map((f) => `     ${f}`)].join('\n');
    }));
    blocks.push(`${s.label || s.side.team}, hitter by hitter${s.facing ? ` (facing ${s.facing})` : ''}:\n${cards.join('\n')}`);
  }
  return [`Each of tonight's nine: his form through yesterday, his season against each hand, his usual spot in the order, and his career against tonight's opposing starter.`,
    ...blocks].join('\n\n');
}
