#!/usr/bin/env node
/**
 * THE MARQUEE GAME (founder GO, Sep 25 2026): the MLB game of the day the way
 * ESPN or the public would think of it, "nothing to do with what Gary picks".
 * Each morning one editor's read of the facts (both clubs' records and race
 * position, national TV, the probable starters and their season lines) names
 * one game, and the choice is locked for the day in `marquee_games`. The Darts
 * row's MARQUEE card opens the Primetime page for it. A day that already has
 * its game exits at once. Never touches picks, darts or Winners.
 *
 *   node scripts/run-marquee.js            # today (ET)
 *   node scripts/run-marquee.js --dry-run  # read and choose, store nothing
 */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { supabaseAdmin as db } from '../src/supabaseClient.js';
import { cascadeRead } from '../src/services/agentic/orchestrator/modelCascade.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';
export const MARQUEE_MODEL = process.env.GARY_MARQUEE_MODEL || 'claude-sonnet-5';
export const MARQUEE_SYSTEM = `You are a national baseball editor choosing today's marquee MLB game: the one game fans and the national media would call the best game on the schedule. Weigh what makes a game big to the public: two good teams, a playoff race or clinching stakes, a rivalry, a national TV window, an ace or a star on the mound. Use only the facts listed; do not invent records, standings or storylines. Answer with JSON only, no other text: {"game": <the game's number from the list>, "reason": "<one sentence>"}`;

const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const etClock = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const ordinal = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v === 1 ? '1st' : v === 2 ? '2nd' : v === 3 ? '3rd' : `${v}th`;
};

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`statsapi ${res.status} for ${url}`);
  return res.json();
}

/** "91-67, 1st in NL Central, clinched the division" per club id. */
async function standingsByTeam(season) {
  const json = await getJson(`${STATSAPI}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team,division`);
  const out = new Map();
  for (const rec of json?.records || []) {
    const division = rec?.division?.nameShort || rec?.division?.name || 'its division';
    for (const t of rec?.teamRecords || []) {
      const bits = [`${t.wins}-${t.losses}`];
      const place = ordinal(t.divisionRank);
      if (place) bits.push(`${place} in ${division}`);
      // eliminationNumber is the division race only; out of the playoffs means
      // out of the wild card too.
      if (['y', 'z'].includes(t.clinchIndicator)) bits.push('clinched the division');
      else if (t.clinched) bits.push('clinched a playoff spot');
      else if (t.eliminationNumber === 'E' && t.wildCardEliminationNumber === 'E') bits.push('eliminated');
      else if (Number(t.divisionRank) === 1) bits.push('leads the division');
      else if (ordinal(t.wildCardRank) && Number(t.wildCardRank) <= 3) bits.push(`holds the ${ordinal(t.wildCardRank)} wild card`);
      else if (t.wildCardGamesBack && t.wildCardGamesBack !== '-') bits.push(`${t.wildCardGamesBack} games out of a wild card`);
      out.set(t.team?.id, bits.join(', '));
    }
  }
  return out;
}

/** "Clay Holmes (6-8, 3.25 ERA)" per probable starter id. */
async function startersById(ids, season) {
  const out = new Map();
  if (!ids.length) return out;
  const json = await getJson(`${STATSAPI}/people?personIds=${ids.join(',')}&hydrate=stats(group=[pitching],type=[season],season=${season})`);
  for (const p of json?.people || []) {
    const s = (p.stats || []).find((x) => x?.splits?.length)?.splits?.[0]?.stat;
    out.set(p.id, s ? `${p.fullName} (${s.wins}-${s.losses}, ${s.era} ERA)` : p.fullName);
  }
  return out;
}

/** Today's games, each tied to its daily_slate row (game id), in start order. */
async function todaysGames(date) {
  const season = Number(date.slice(0, 4));
  const { data: slate, error } = await db.from('daily_slate')
    .select('bdl_game_id,away_team,home_team,commence_time').eq('date', date).eq('league', 'MLB');
  if (error) throw new Error(`daily_slate: ${error.message}`);
  if (!slate?.length) return [];
  const sched = await getJson(`${STATSAPI}/schedule?sportId=1&date=${date}&hydrate=team,broadcasts(all),probablePitcher`);
  const games = sched?.dates?.[0]?.games || [];
  const [records, starters] = await Promise.all([
    standingsByTeam(season),
    startersById([...new Set(games.flatMap((g) => ['away', 'home'].map((s) => g?.teams?.[s]?.probablePitcher?.id)).filter(Boolean))], season),
  ]);
  const has = (full, nick) => String(full || '').toLowerCase().includes(String(nick || '').trim().toLowerCase());
  const out = [];
  for (const g of games) {
    const away = g?.teams?.away?.team, home = g?.teams?.home?.team;
    if (!away || !home || !g.gameDate) continue;
    // The slate row for this game: same clubs, the nearest listed start (a
    // doubleheader has two rows).
    const rows = slate.filter((r) => r.bdl_game_id && has(away.name, r.away_team) && has(home.name, r.home_team));
    const row = rows.sort((a, b) => Math.abs(Date.parse(a.commence_time) - Date.parse(g.gameDate))
      - Math.abs(Date.parse(b.commence_time) - Date.parse(g.gameDate)))[0];
    if (!row) continue;
    const tbd = g?.status?.startTimeTBD === true;
    const national = (g.broadcasts || []).filter((b) => b?.isNational && b?.type === 'TV').map((b) => b.name);
    const pp = (s) => starters.get(g?.teams?.[s]?.probablePitcher?.id) || 'starter not announced';
    out.push({
      gameId: String(row.bdl_game_id),
      start: tbd ? null : g.gameDate,
      line: [
        `${away.name} (${records.get(away.id) || 'record unavailable'}) at ${home.name} (${records.get(home.id) || 'record unavailable'})`,
        tbd ? 'after Game 1' : `${etClock(g.gameDate)} ET`,
        g.doubleHeader && g.doubleHeader !== 'N' ? `Game ${g.gameNumber} of a doubleheader` : null,
        national.length ? `national TV: ${national.join(', ')}` : null,
        `starters: ${pp('away')} vs ${pp('home')}`,
      ].filter(Boolean).join(' · '),
    });
  }
  return out;
}

export async function chooseMarquee({ date = todayET(), dryRun = false, read = cascadeRead, now = Date.now() } = {}) {
  const { data: existing, error: readErr } = await db.from('marquee_games')
    .select('game_id,reason').eq('game_date', date).eq('league', 'MLB').maybeSingle();
  if (readErr) throw new Error(`marquee_games: ${readErr.message}`);
  if (existing && !dryRun) return { status: 'locked', ...existing };
  // A game already under way is not today's feature.
  const games = (await todaysGames(date)).filter((g) => !g.start || Date.parse(g.start) > now);
  if (!games.length) return { status: 'no_games' };
  const list = games.map((g, i) => `${i + 1}. ${g.line}`).join('\n');
  const answer = await read(`TODAY'S MLB GAMES (${date})\n${list}`, {
    model: MARQUEE_MODEL, systemPrompt: MARQUEE_SYSTEM, effort: 'low', tier: 'light',
    timeoutMs: 180000, breakerKey: 'codex-marquee',
  });
  if (!answer?.success) throw new Error(`editor unavailable: ${answer?.error || 'no answer'}`);
  let parsed = null;
  try { parsed = JSON.parse(String(answer.data).match(/\{[\s\S]*\}/)?.[0] || ''); } catch { /* reported below */ }
  const pick = games[Number(parsed?.game) - 1];
  if (!pick) throw new Error(`editor's answer names no listed game: ${String(answer.data).slice(0, 200)}`);
  const reason = String(parsed.reason || '').trim().slice(0, 400) || null;
  if (!dryRun) {
    const { error } = await db.from('marquee_games').insert({ game_date: date, league: 'MLB', game_id: pick.gameId, reason, model: answer.model || MARQUEE_MODEL });
    if (error && error.code !== '23505') throw new Error(`marquee_games insert: ${error.message}`);
  }
  return { status: dryRun ? 'dry_run' : 'chosen', game_id: pick.gameId, line: pick.line, reason, model: answer.model };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  chooseMarquee({ dryRun: process.argv.includes('--dry-run') })
    .then((r) => { console.log(`[Marquee] ${new Date().toISOString()} ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { console.error(`[Marquee] ${new Date().toISOString()} ${e.message}`); process.exit(1); });
}
