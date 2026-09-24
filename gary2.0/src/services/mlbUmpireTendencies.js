// THE PLATE UMPIRE (founder GO, Sep 23 2026): strikeout and walk rates move
// with the home-plate umpire's zone. A season ledger of every final game's
// plate umpire and both teams' strikeouts, walks and batters faced, built from
// the MLB Stats API (free, no key) and cached on disk; each call fetches only
// the games finished since the last one. The factor is the umpire's rate over
// the league rate, shrunk toward 1 by a 1,500-batter prior (about 20 games).

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const BASE = 'https://statsapi.mlb.com/api/v1';
const CACHE_DIR = fileURLToPath(new URL('../../.cache/umpires/', import.meta.url));
const PRIOR_BF = 1500;
const CAP = 0.1;
const CONCURRENCY = 8;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`MLB Stats API HTTP ${res.status} for ${path}`);
  return res.json();
}

async function readLedger(season) {
  try { return JSON.parse(await readFile(`${CACHE_DIR}${season}.json`, 'utf8')); }
  catch { return { season, games: {} }; }
}

async function writeLedger(ledger) {
  await mkdir(CACHE_DIR, { recursive: true });
  const target = `${CACHE_DIR}${ledger.season}.json`;
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(ledger));
  await rename(temp, target);
}

/** One final game's plate umpire and pitching totals, or null when incomplete. */
async function gameLine(gamePk) {
  const box = await getJson(`/game/${gamePk}/boxscore`);
  const plate = (box.officials || []).find(o => o.officialType === 'Home Plate')?.official;
  const totals = ['home', 'away'].map(side => box.teams?.[side]?.teamStats?.pitching || {});
  const k = totals.reduce((a, t) => a + (Number(t.strikeOuts) || 0), 0);
  const bb = totals.reduce((a, t) => a + (Number(t.baseOnBalls) || 0), 0);
  const bf = totals.reduce((a, t) => a + (Number(t.battersFaced) || 0), 0);
  if (!plate?.id || !bf) return null;
  return { ump: plate.id, name: plate.fullName, k, bb, bf };
}

/** Bring the season ledger up to date with every final regular-season game through yesterday. */
export async function refreshUmpireLedger(season, { through = new Date() } = {}) {
  const ledger = await readLedger(season);
  const end = new Date(through.getTime() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const nextDay = ymd => new Date(Date.parse(`${ymd}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const start = ledger.through ? nextDay(ledger.through) : `${season}-03-01`;
  if (start > end) return ledger; // already current through yesterday: no read, no write
  const sched = await getJson(`/schedule?sportId=1&gameType=R&startDate=${start}&endDate=${end}`);
  const finals = (sched.dates || []).flatMap(d => d.games || [])
    .filter(g => g.status?.abstractGameState === 'Final' && !ledger.games[g.gamePk]);
  for (let i = 0; i < finals.length; i += CONCURRENCY) {
    const batch = finals.slice(i, i + CONCURRENCY);
    const lines = await Promise.all(batch.map(g => gameLine(g.gamePk).catch(() => null)));
    batch.forEach((g, j) => { if (lines[j]) ledger.games[g.gamePk] = lines[j]; });
  }
  ledger.through = end;
  await writeLedger(ledger);
  return ledger;
}

const shrunkFactor = (count, bf, leagueRate) => {
  if (!leagueRate) return 1;
  const rate = (count + PRIOR_BF * leagueRate) / (bf + PRIOR_BF);
  return Math.min(1 + CAP, Math.max(1 - CAP, rate / leagueRate));
};

/**
 * Tonight's plate umpire and his strikeout / walk factors, or null when the
 * assignment is not posted or the ledger cannot be read. Never throws.
 */
export async function plateUmpireFactors(gamePk, season) {
  try {
    const box = await getJson(`/game/${gamePk}/boxscore`);
    const plate = (box.officials || []).find(o => o.officialType === 'Home Plate')?.official;
    if (!plate?.id) return null;
    const ledger = await refreshUmpireLedger(season);
    const all = Object.values(ledger.games);
    const league = all.reduce((a, g) => ({ k: a.k + g.k, bb: a.bb + g.bb, bf: a.bf + g.bf }), { k: 0, bb: 0, bf: 0 });
    if (!league.bf) return null;
    const his = all.filter(g => g.ump === plate.id)
      .reduce((a, g) => ({ k: a.k + g.k, bb: a.bb + g.bb, bf: a.bf + g.bf, games: a.games + 1 }), { k: 0, bb: 0, bf: 0, games: 0 });
    return {
      name: plate.fullName,
      games: his.games,
      k: shrunkFactor(his.k, his.bf, league.k / league.bf),
      bb: shrunkFactor(his.bb, his.bf, league.bb / league.bf),
    };
  } catch {
    return null;
  }
}
