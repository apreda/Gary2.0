/**
 * THE PEN, ARM BY ARM: THIS POSTSEASON, THE SEASON BY HAND, THE LAST THREE —
 * MLB postseason (founder GO, Oct 7 2026).
 *
 * The founder: Gary has to know who each reliever is, how he has pitched
 * recently and what he is over the season, and left versus right not as a
 * 14-day total but outing by outing; and each arm's playoff work game by game,
 * "because if he sees a guy's playoff ERA is 10, he might need to know that the
 * guy came in for one inning and gave up one run". For every relief arm in the
 * bullpen snapshot: each postseason appearance (MLB Stats API, as the starters'
 * lines print), his regular-season line against left- and right-handed
 * batters, and his last three outings with every batter he faced, the batter's
 * hand and what happened. Facts only; a failed read prints what it has.
 */
import { getCachedOrFetch } from '../../../ballDontLieService.js';
import { mlbStarterPostseasonLines } from './mlbStarterPostseason.js';

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
 * Founder, Oct 7 2026: "just the basic stats, like ERA ... whatever the normal pitcher stats are", for the
 * regular season and the postseason; the pen block's own "season" line counts relief outings only. */
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
const rate = (v) => (v == null || v === '' ? '—' : String(v).replace(/^0(?=\.)/, ''));
const ip = (outs) => (Number.isFinite(Number(outs)) ? `${Math.floor(outs / 3)}.${outs % 3}` : '—');
const EVENT_WORDS = (event) => String(event || '?').replace(/_/g, ' ');

function splitLine(splits) {
  const side = (code) => {
    const s = splits.find((x) => x?.split?.code === code)?.stat;
    if (!s) return null;
    const pa = s.battersFaced ?? s.plateAppearances;
    return `${rate(s.avg)}/${rate(s.obp)}/${rate(s.slg)}${pa != null ? ` (${pa} batters)` : ''}`;
  };
  const l = side('vl');
  const r = side('vr');
  return l || r ? `  Regular season vs left-handed batters: ${l || '—'} · vs right-handed batters: ${r || '—'}` : '  Regular season by hand: unavailable';
}

function lastThree(recent) {
  const rows = (recent || []).slice(-3).reverse();
  if (!rows.length) return '  Last three outings: none on record.';
  return ['  Last three outings, newest first, batter by batter:', ...rows.map((r) => {
    const tag = r.gameType && r.gameType !== 'R' ? ', postseason' : '';
    const line = `${ip(r.outs)} IP, ${r.pitches ?? '—'} p, ${r.er ?? '—'} ER, ${r.bb ?? '—'} BB, ${r.k ?? '—'} K`;
    const faced = (r.faced || []).map((b) => `${b.name} (${b.hand || '?'}, ${EVENT_WORDS(b.event)})`).join(', ');
    return `    ${md(r.date)} vs ${r.opponent || '?'}${tag}: ${line}${faced ? ` — ${faced}` : ' — batters not tracked'}`;
  })].join('\n');
}

/**
 * @param {object} snapshot  the bullpen snapshot (bullpen/snapshot.js): { home, away } teams with `pitchers`
 * @param {object} input
 * @param {number} input.season @param {string} input.beforeDate  tonight's ET date, YYYY-MM-DD
 * @returns {Promise<string>} the section, or '' when the snapshot has no arms
 */
export async function mlbPenPlayoffLines(snapshot, { season, beforeDate, fetchImpl = fetch } = {}) {
  const teams = [snapshot?.away, snapshot?.home].filter((t) => t?.pitchers?.length);
  if (!teams.length || !season) return '';
  const blocks = await Promise.all(teams.map(async (team) => {
    const arms = team.pitchers.filter((p) => !['today_starter', 'rotation_or_role_change_unconfirmed'].includes(p.role));
    const lines = await Promise.all(arms.map(async (p) => {
      const [post, splits, regular, postTotals] = await Promise.all([
        mlbStarterPostseasonLines({ personId: p.id, season, beforeDate, fetchImpl }).catch(() => null),
        seasonSplits(p.id, season, fetchImpl).catch(() => null),
        standardLine(p.id, season, 'R', fetchImpl).catch(() => null),
        standardLine(p.id, season, 'P', fetchImpl).catch(() => null),
      ]);
      return [
        `${p.name}${p.hand ? ` (${p.hand}HP)` : ''}`,
        regular ? `  Regular season: ${standardText(regular)}` : '  Regular season: unavailable',
        postTotals && Number(postTotals.gamesPlayed) ? `  This postseason, in total: ${standardText(postTotals, { record: false })}` : null,
        post || '  This postseason: unavailable',
        splits ? splitLine(splits) : '  Regular season by hand: unavailable',
        lastThree(p.recent),
      ].filter(Boolean).join('\n');
    }));
    return [`${team.teamName} relievers: this postseason, the regular season by hand, the last three outings`, ...lines].join('\n\n');
  }));
  return blocks.join('\n\n');
}
