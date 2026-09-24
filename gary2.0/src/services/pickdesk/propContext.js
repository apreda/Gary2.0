// TONIGHT'S CONTEXT FOR THE PROP MODEL (founder GO, Sep 23 2026).
//
// The prop model priced each player from his own season: his rates, tonight's
// batting slot, and (for pitchers) the opposing lineup. It did not know who he
// faces, where, or who calls the zone. This module turns four facts about
// tonight into per-player multipliers on those rates:
//
//   RUN ENVIRONMENT — the market's implied runs for his team tonight (game
//     total split by the moneyline) over his team's season runs per game.
//     That ratio carries the opposing starter, the park and the weather.
//     Hits scale by its square root, runs and RBI by the ratio itself.
//     Hitters only: a pitcher's own quality is inside the opponent's total.
//   PLATOON — his season line against tonight's starter's hand over his
//     line against both hands, shrunk toward even by a 250-PA prior, for the
//     share of his trips that face the starter.
//   SKILL — Savant expected stats: expected average over actual for hits,
//     expected power over actual for extra-base hits; for pitchers, expected
//     ERA and expected average against. Half weight, capped.
//   PLATE UMPIRE — his strikeout and walk rates over the league's.
//
// Every factor falls back to 1 when its data is missing; the product of all
// factors on one rate is capped at 0.75–1.30. The model never learns anything
// Gary is told — this changes the menu's numbers, not the desk.

import { getBatterXStats, getJunePitcherXStats } from '../baseballSavantService.js';
import { plateUmpireFactors } from '../mlbUmpireTendencies.js';

const BASE = 'https://statsapi.mlb.com/api/v1';
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const PLATOON_PRIOR_PA = 250;
const STARTER_SHARE = 0.6;
const PYTHAG = 1.83;
const MIN_XSTATS_PA = 100;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`MLB Stats API HTTP ${res.status}`);
  return res.json();
}

const devig = (a, b) => {
  const p = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
  const pa = p(Number(a)), pb = p(Number(b));
  return pa / (pa + pb);
};

/** Implied runs for each side from the total and the moneyline (Pythagorean split). */
export function impliedRuns({ total, moneylineHome, moneylineAway }) {
  const t = Number(total);
  const pHome = devig(moneylineHome, moneylineAway);
  if (!Number.isFinite(t) || t <= 0 || pHome == null) return null;
  const ratio = Math.pow(pHome / (1 - pHome), 1 / PYTHAG);
  return { home: t * ratio / (1 + ratio), away: t / (1 + ratio) };
}

const perPa = (stat, key) => {
  const pa = Number(stat?.plateAppearances) || 0;
  return pa ? (Number(stat?.[key]) || 0) / pa : null;
};
const combine = (a, b) => {
  const out = {};
  for (const key of ['plateAppearances', 'hits', 'doubles', 'triples', 'homeRuns', 'strikeOuts', 'baseOnBalls']) out[key] = (Number(a?.[key]) || 0) + (Number(b?.[key]) || 0);
  return out;
};

/** Split-over-overall per-PA ratio, shrunk toward 1 by the platoon prior. */
function platoonRatio(split, overall, keys) {
  const count = s => keys.reduce((a, k) => a + (Number(s?.[k]) || 0), 0);
  const nS = Number(split?.plateAppearances) || 0, nO = Number(overall?.plateAppearances) || 0;
  if (!nS || !nO) return 1;
  const rO = count(overall) / nO;
  if (!rO) return 1;
  const shrunk = (count(split) + PLATOON_PRIOR_PA * rO) / (nS + PLATOON_PRIOR_PA);
  return shrunk / rO;
}

function mergeMult(parts) {
  const out = {};
  for (const part of parts) for (const [k, v] of Object.entries(part || {})) if (Number.isFinite(v)) out[k] = (out[k] ?? 1) * v;
  for (const k of Object.keys(out)) out[k] = clamp(out[k], 0.75, 1.3);
  return out;
}

/**
 * Build tonight's multipliers. `lineups` = the desk's confirmed lineups
 * ({ home: { batters, pitcher }, away }), `meta` = the desk's board meta
 * (total, moneylines), `gamePk` = the MLB Stats API game. Never throws: a
 * failed source leaves its factor at 1 and is named in `summary.missing`.
 */
export async function buildPropContext({ gamePk, lineups, meta, season }) {
  const summary = { missing: [] };
  const byName = new Map();
  let box = null;
  try { box = gamePk ? await getJson(`/game/${gamePk}/boxscore`) : null; } catch { summary.missing.push('boxscore'); }
  const ids = { home: new Map(), away: new Map() };
  for (const side of ['home', 'away']) {
    for (const p of Object.values(box?.teams?.[side]?.players || {})) if (p?.person?.id) ids[side].set(fold(p.person.fullName), p.person.id);
  }
  const idFor = (side, name) => ids[side].get(fold(name)) ?? null;

  // Run environment.
  const implied = meta ? impliedRuns(meta) : null;
  const rpg = {};
  try {
    const teams = await getJson(`/teams/stats?season=${season}&group=hitting&stats=season&sportIds=1`);
    const rows = teams?.stats?.[0]?.splits || [];
    for (const side of ['home', 'away']) {
      const teamId = box?.teams?.[side]?.team?.id;
      const row = rows.find(r => r.team?.id === teamId);
      const games = Number(row?.stat?.gamesPlayed) || 0;
      if (games) rpg[side] = (Number(row.stat.runs) || 0) / games;
    }
  } catch { summary.missing.push('team runs'); }
  const env = {};
  for (const side of ['home', 'away']) env[side] = implied && rpg[side] ? clamp(implied[side] / rpg[side], 0.8, 1.25) : 1;
  summary.env = env;
  if (!implied) summary.missing.push('implied runs');

  // Platoon splits and handedness, one call for all eighteen hitters and both starters.
  const people = new Map();
  const wanted = [];
  for (const side of ['home', 'away']) {
    for (const b of lineups?.[side]?.batters || []) { const id = idFor(side, b.name); if (id) wanted.push(id); }
    const sp = lineups?.[side]?.pitcher; const id = sp ? idFor(side, sp.name) : null; if (id) wanted.push(id);
  }
  if (wanted.length) {
    try {
      const q = new URLSearchParams({ personIds: wanted.join(','), hydrate: `stats(group=[hitting],type=[statSplits],sitCodes=[vl,vr],season=${season})` });
      const res = await getJson(`/people?${q}`);
      for (const p of res.people || []) people.set(p.id, p);
    } catch { summary.missing.push('platoon splits'); }
  }

  let batterX = [], pitcherX = [];
  try { [batterX, pitcherX] = await Promise.all([getBatterXStats(season), getJunePitcherXStats(season)]); } catch { summary.missing.push('expected stats'); }
  const xFor = (rows, id) => (id == null ? null : rows.find(r => String(r.player_id) === String(id)) || null);

  const ump = gamePk ? await plateUmpireFactors(gamePk, season) : null;
  summary.ump = ump ? { name: ump.name, games: ump.games, k: +ump.k.toFixed(3), bb: +ump.bb.toFixed(3),
    bf: ump.bf, kPer100: ump.kPer100, bbPer100: ump.bbPer100, leagueKPer100: ump.leagueKPer100, leagueBbPer100: ump.leagueBbPer100 } : null;
  if (!ump) summary.missing.push('plate umpire');
  const umpMult = ump ? { k: ump.k, bb: ump.bb } : {};

  let platoonCovered = 0, skillCovered = 0;
  for (const side of ['home', 'away']) {
    const opp = side === 'home' ? 'away' : 'home';
    const oppStarter = lineups?.[opp]?.pitcher;
    const oppHand = people.get(idFor(opp, oppStarter?.name))?.pitchHand?.code
      || String(oppStarter?.batsThrows || '').split('/')[1] || null;

    for (const b of lineups?.[side]?.batters || []) {
      const id = idFor(side, b.name);
      const e = env[side];
      const envMult = { hits: Math.sqrt(e), singles: Math.sqrt(e), doubles: Math.sqrt(e), triples: Math.sqrt(e), hr: Math.sqrt(e), runs: e, rbi: e };

      let platMult = {};
      const splits = people.get(id)?.stats?.[0]?.splits || [];
      const vl = splits.find(s => s.split?.code === 'vl')?.stat, vr = splits.find(s => s.split?.code === 'vr')?.stat;
      const split = oppHand === 'L' ? vl : oppHand === 'R' ? vr : null;
      if (split && vl && vr) {
        const overall = combine(vl, vr);
        const part = keys => 1 + STARTER_SHARE * (platoonRatio(split, overall, keys) - 1);
        const hit = part(['hits']);
        platMult = { hits: hit, singles: hit, doubles: part(['doubles', 'triples']), triples: part(['doubles', 'triples']), hr: part(['homeRuns']), k: part(['strikeOuts']), bb: part(['baseOnBalls']) };
        platoonCovered++;
      }

      let skillMult = {};
      const x = xFor(batterX, id);
      if (x && Number(x.pa) >= MIN_XSTATS_PA && Number(x.ba) > 0) {
        const hit = clamp(0.5 + 0.5 * Number(x.est_ba) / Number(x.ba), 0.9, 1.1);
        const iso = Number(x.slg) - Number(x.ba), xIso = Number(x.est_slg) - Number(x.est_ba);
        const pow = iso > 0 && xIso > 0 ? clamp(0.5 + 0.5 * xIso / iso, 0.85, 1.15) : 1;
        skillMult = { hits: hit, singles: hit, doubles: pow, triples: pow, hr: pow };
        skillCovered++;
      }

      byName.set(fold(b.name), {
        pitcher: false,
        mult: mergeMult([envMult, platMult, skillMult, umpMult]),
        parts: { env: +e.toFixed(3), platoon: platMult.hits ? +platMult.hits.toFixed(3) : 1, xba: skillMult.hits ? +skillMult.hits.toFixed(3) : 1, vs: oppHand },
      });
    }

    const sp = lineups?.[side]?.pitcher;
    if (sp?.name) {
      const x = xFor(pitcherX, idFor(side, sp.name));
      let skillMult = {};
      if (x && Number(x.pa) >= MIN_XSTATS_PA) {
        const h = Number(x.ba) > 0 ? clamp(0.5 + 0.5 * Number(x.est_ba) / Number(x.ba), 0.9, 1.1) : 1;
        const er = Number(x.era) > 0 && Number(x.xera) > 0 ? clamp(0.5 + 0.5 * Number(x.xera) / Number(x.era), 0.85, 1.15) : 1;
        skillMult = { h, er };
        skillCovered++;
      }
      byName.set(fold(sp.name), {
        pitcher: true,
        mult: mergeMult([skillMult, umpMult]),
        parts: { xera: skillMult.er ? +skillMult.er.toFixed(3) : 1, ump_k: ump ? +ump.k.toFixed(3) : 1, ump_bb: ump ? +ump.bb.toFixed(3) : 1 },
      });
    }
  }
  summary.platoonCovered = platoonCovered;
  summary.skillCovered = skillCovered;

  return {
    summary,
    /** Multipliers for a board player, or null (no adjustment). */
    adjustFor(playerKey, isPitcher) {
      const entry = byName.get(fold(playerKey));
      return entry && entry.pitcher === isPitcher ? entry : null;
    },
  };
}
