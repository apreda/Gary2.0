/**
 * THE BULLPEN, ONE BLOCK PER ARM — MLB postseason (founder GO, Oct 7 2026).
 *
 * The founder: Gary has to know who each reliever is, how he has pitched
 * recently and what he is over the season, left versus right, and each arm's
 * playoff work game by game, "because if he sees a guy's playoff ERA is 10, he
 * might need to know that the guy came in for one inning and gave up one run".
 *
 * Later the same day ("how do we thin that out so it still has all the context
 * and info and data Gary needs but doesnt overpower every decision ... no need
 * for duplicates"): the section ran 58-84K characters on every playoff desk,
 * the same recent outings printed up to seven ways per arm and every arm
 * twice. Each team now reads its pen at a glance, its rotation, then one block
 * per reliever:
 *   Rest: when he last pitched, how much, days off, the last 7 days.
 *   This postseason: his totals.
 *   Outings, newest first: the last three batter by batter, then any earlier
 *     postseason game on one line.
 *   Regular season: his standard line and his line against each hand.
 *   Earlier vs tonight's opponent: tracked meetings not already above.
 * Out: the five-outing list, the day-4-to-14 pitch counts, the 1/2/3/7/14/30-day
 * windows, the 7- and 30-day relief lines, the usage breakdown, the repeated
 * opponent batting order, every roster move but the last week's pitching moves,
 * and the boilerplate paragraphs. Facts only; a failed read prints what it has.
 */
import { getCachedOrFetch } from '../../../ballDontLieService.js';
import { postseasonLog } from './mlbStarterPostseason.js';
import { renderGlance, roleWords, etClock } from '../../../bullpen/service.js';
import { shiftDay, ipOf } from '../../../bullpen/evidence.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';

async function seasonSplits(personId, season, fetchImpl) {
  return getCachedOrFetch(`mlb_pitcher_hand_splits_${personId}_${season}`, async () => {
    const resp = await fetchImpl(`${STATSAPI}/people/${personId}/stats?stats=statSplits&group=pitching&season=${season}&gameType=R&sitCodes=vl,vr`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`statsapi splits ${resp.status}`);
    const json = await resp.json();
    return json?.stats?.[0]?.splits || [];
  }, 360);
}

/** His standard line for one season type (R regular season, P postseason), as a box score's season page shows it.
 * Founder, Oct 7 2026: "just the basic stats, like ERA ... whatever the normal pitcher stats are". */
async function standardLine(personId, season, gameType, fetchImpl) {
  return getCachedOrFetch(`mlb_pitcher_standard_${personId}_${season}_${gameType}`, async () => {
    const resp = await fetchImpl(`${STATSAPI}/people/${personId}/stats?stats=season&group=pitching&season=${season}&gameType=${gameType}`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`statsapi pitcher season ${resp.status}`);
    const json = await resp.json();
    return json?.stats?.[0]?.splits?.[0]?.stat || null;
  }, gameType === 'P' ? 10 : 360);
}

const standardText = (s, { record = true } = {}) => [
  `${s.gamesPlayed ?? 0} G${Number(s.gamesStarted) ? `, ${s.gamesStarted} GS` : ''}`,
  record ? `${s.wins ?? 0}-${s.losses ?? 0}` : null,
  record && (Number(s.saves) || Number(s.holds)) ? `${s.saves ?? 0} SV, ${s.holds ?? 0} HLD` : null,
  `${s.inningsPitched ?? '—'} IP, ${s.hits ?? 0} H, ${s.earnedRuns ?? 0} ER, ${s.baseOnBalls ?? 0} BB, ${s.strikeOuts ?? 0} K, ${s.homeRuns ?? 0} HR`,
  `${s.era ?? '—'} ERA, ${s.whip ?? '—'} WHIP`,
].filter(Boolean).join(', ');

const md = (date) => String(date || '').slice(5).replace('-', '/');
const day = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const rate = (v) => (v == null || v === '' ? '—' : String(v).replace(/^0(?=\.)/, ''));
const fmt = (v) => (v == null ? '?' : v);
const EVENT_WORDS = (event) => String(event || '?').replace(/_/g, ' ');

function handLine(splits) {
  const side = (code) => {
    const s = (splits || []).find((x) => x?.split?.code === code)?.stat;
    if (!s) return null;
    const pa = s.battersFaced ?? s.plateAppearances;
    return `${rate(s.avg)}/${rate(s.obp)}/${rate(s.slg)}${pa != null ? ` (${pa} batters)` : ''}`;
  };
  const l = side('vl');
  const r = side('vr');
  return l || r ? `vs left-handed batters ${l || '—'} · vs right-handed ${r || '—'}` : null;
}

function restLine(p, date) {
  const w = p.workload || {};
  if (!w.lastDate) return '  Rest: no recent work on record.';
  const count = w.byDay?.[w.lastDate];
  const last7 = w.windows?.[7] || w.windows?.['7'];
  return `  Rest: last pitched ${day(w.lastDate)} (${count == null ? 'pitch count unknown' : `${count} pitches`}), ${fmt(w.fullDaysOff)} full day${w.fullDaysOff === 1 ? '' : 's'} off`
    + `${w.pitchedToday ? ', already pitched today' : ''}`
    + `${last7 ? `; last 7 days: ${last7.games} game${last7.games === 1 ? '' : 's'}, ${last7.pitches == null ? 'pitch count unknown' : `${last7.pitches} pitches`}` : ''}.`;
}

function outingLines(p, postGames) {
  const lastThree = (p.recent || []).slice(-3).reverse();
  const shown = new Set(lastThree.map((r) => r.date));
  const rows = lastThree.map((r) => {
    const tag = r.gameType && r.gameType !== 'R' ? ', postseason' : r.level && r.level !== 'MLB' ? `, ${r.level}` : '';
    const line = `${ipOf(r.outs)} IP, ${r.pitches ?? '—'} p, ${r.er ?? '—'} ER, ${r.bb ?? '—'} BB, ${r.k ?? '—'} K`;
    const faced = (r.faced || []).map((b) => `${b.name} (${b.hand || '?'}, ${EVENT_WORDS(b.event)})`).join(', ');
    return `    ${md(r.date)} vs ${r.opponent || '?'}${tag}: ${line}${faced ? ` — ${faced}` : ' — batters not tracked'}`;
  });
  // Earlier postseason games, one line each, newest first; the ones above are not repeated.
  for (const g of [...(postGames || [])].reverse()) {
    if (shown.has(g.date)) continue;
    const s = g.stat || {};
    const role = Number(s.gamesStarted) > 0 ? 'start' : 'relief';
    rows.push(`    ${md(g.date)} ${g.isHome ? 'vs' : 'at'} ${g.opponent?.name || 'opponent'}, postseason (${role}): ${s.inningsPitched ?? '—'} IP, ${s.numberOfPitches ?? '—'} p, ${s.earnedRuns ?? '—'} ER, ${s.baseOnBalls ?? '—'} BB, ${s.strikeOuts ?? '—'} K`);
  }
  return rows.length ? ['  Outings, newest first (the last three batter by batter):', ...rows] : ['  Outings: none on record.'];
}

function opponentLine(p, opponentName) {
  const shown = new Set((p.recent || []).slice(-3).map((r) => r.date));
  const earlier = (p.opponentExposure || []).filter((r) => !shown.has(r.date) && r.batters?.length);
  if (!earlier.length) return null;
  return `  Earlier vs ${opponentName || 'tonight\'s opponent'}: ${earlier.map((r) => `${md(r.date)}: ${r.batters.map((b) => `${b.name} (${b.hand || '?'}, ${EVENT_WORDS(b.event)})`).join(', ')}`).join(' | ')}`;
}

async function armBlock(p, team, opponentName, { season, beforeDate, fetchImpl }) {
  const [postGames, splits, regular, postTotals] = await Promise.all([
    postseasonLog(p.id, season, fetchImpl).then((games) => games.filter((g) => !beforeDate || g.date < beforeDate)).catch(() => null),
    seasonSplits(p.id, season, fetchImpl).catch(() => null),
    standardLine(p.id, season, 'R', fetchImpl).catch(() => null),
    standardLine(p.id, season, 'P', fetchImpl).catch(() => null),
  ]);
  const hands = splits ? handLine(splits) : null;
  return [
    `${p.name} (${p.hand || '?'}HP; ${roleWords(p.role)})`,
    restLine(p, team.date),
    postGames == null ? '  This postseason: unavailable'
      : postTotals && Number(postTotals.gamesPlayed) ? `  This postseason: ${standardText(postTotals, { record: false })}`
      : postGames.length ? '  This postseason: totals unavailable; games below' : '  This postseason: no appearances before tonight.',
    ...outingLines(p, postGames),
    `  Regular season: ${regular ? standardText(regular) : 'unavailable'}${hands ? `; ${hands}` : ''}`,
    opponentLine(p, opponentName),
  ].filter(Boolean).join('\n');
}

async function teamBlock(team, opponentName, options) {
  const arms = team.pitchers.filter((p) => !['today_starter', 'rotation_or_role_change_unconfirmed'].includes(p.role));
  const rotation = team.pitchers.filter((p) => !arms.includes(p));
  const rotationText = rotation.map((p) => {
    if (p.role === 'today_starter') return `${p.name} (today's starter)`;
    const last = p.lastStart ? `last start ${day(p.lastStart.date)}: ${ipOf(p.lastStart.outs)} IP, ${fmt(p.lastStart.pitches)} pitches` : 'last start unknown';
    return `${p.name} (${last}; ${fmt(p.workload?.fullDaysOff)} full days off)`;
  }).join('; ') || 'none identified';
  // The game after tonight's: whether a manager has to save arms for tomorrow.
  const next = (team.upcoming || []).find((g) => String(g.gamePk) !== String(team.gamePk));
  // Moves that change who is in this pen: on or off the active roster, the injured list.
  const weekAgo = shiftDay(team.date, -7);
  const moves = (team.transactions || []).filter((t) => t.date >= weekAgo && /\b(RHP|LHP)\b/.test(t.description || '')
    && /\b(activated|placed|recalled|optioned|selected|designated|reinstated)\b/i.test(t.description || ''));
  const blocks = await Promise.all(arms.map((p) => armBlock(p, team, opponentName, options)));
  return [
    `${team.teamName} bullpen`,
    // The availability note prints once, at the top of the section.
    ...renderGlance(team, arms).filter((line) => !line.startsWith('No team publishes daily availability.')),
    `Rotation: ${rotationText}.`,
    next ? `Next game: ${etClock(next.firstPitch)} vs ${next.opponent}, starter ${next.starter || 'unannounced'}.` : null,
    moves.length ? `Pitching moves, last 7 days: ${moves.map((t) => `${t.date}: ${t.description}`).join('; ')}` : null,
    team.gaps?.length ? `Gaps: ${team.gaps.join('; ')}` : null,
    '',
    `${team.teamName} relievers (${arms.length}):`,
    ...blocks.flatMap((b) => ['', b]),
  ].filter((line) => line !== null).join('\n');
}

/**
 * The postseason desk's whole bullpen section.
 * @param {object} snapshot  the bullpen snapshot (bullpen/snapshot.js): { home, away, cutoff } with `pitchers`
 * @param {object} input
 * @param {number} input.season @param {string} input.beforeDate  tonight's ET date, YYYY-MM-DD
 * @returns {Promise<string>} the section, or '' when the snapshot has no arms
 */
export async function mlbPlayoffPen(snapshot, { season, beforeDate, fetchImpl = fetch } = {}) {
  const away = snapshot?.away, home = snapshot?.home;
  const teams = [[away, home], [home, away]].filter(([t]) => t?.pitchers?.length);
  if (!teams.length || !season) return '';
  const options = { season, beforeDate, fetchImpl };
  const blocks = await Promise.all(teams.map(([team, opp]) => teamBlock(team, opp?.teamName, options)));
  return [
    '═══ BULLPEN ═══',
    `Observed through ${etClock(snapshot.cutoff)}. No team publishes daily availability; warm-ups, soreness and restrictions are known only when reported (THE PENS, AS WRITTEN, below).`,
    ...blocks,
  ].join('\n\n');
}

