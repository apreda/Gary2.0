// gary2.0/src/services/insights/computers/closerWatch.js
//
// LANE: closerWatch  (category token: closer_watch) — MLB only.
// "Closer Watch" — who actually gets the ninth for tonight's teams. The saves
// column every season-long manager checks daily: locked roles to roster,
// committees to handcuff, and the setup man one blown save from the job.
//
// GROUNDED — season save/hold totals straight from BDL team season stats
// (pitching_sv / pitching_hld). No role speculation: a committee is a FACT of
// the numbers (top two arms within 2 saves), never a beat-writer rumor.
//
// Sources:
//  • ctx.games (today's BDL slate): the teams in action tonight.
//  • bdl.getMlbPlayerSeasonStats({season, teamId}): pitching_sv, pitching_hld.
// Defensive: a team with no saves yet, or a failed fetch, is skipped; returns [].

import axios from 'axios';
import { makeRow, TONES, clampScore, shiftDateStr } from '../shared.js';
import { generateSolText } from '../solText.js';

// Same env resolution as streaking.js — daily_slate odds are the "is tonight
// a live save spot" context (founder, Jul 30: relevance to the real world,
// never a cherry-picked season total).
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY || '';

const COMMITTEE_GAP = 2;   // leader within this of runner-up = shared ninth
const MAX_TEAMS = 4;       // founder, Jul 30: 3-4 actionable calls, not a league table

export async function computeCloserWatch(ctx) {
  const { games, season, bdl, helpers } = ctx;
  if (!Array.isArray(games) || !games.length) return [];

  const teams = new Map(); // teamId -> { abbr, name, gameId, gameLabel }
  for (const g of games) {
    for (const side of ['home_team', 'visitor_team']) {
      const t = g?.[side];
      if (t?.id != null && !teams.has(t.id)) {
        teams.set(t.id, {
          abbr: t.abbreviation || '', name: t.full_name || t.name || '',
          gameId: g?.id, label: helpers.gameLabel(g),
        });
      }
    }
  }

  const rows = [];
  for (const [teamId, t] of teams) {
    try {
      const stats = await bdl.getMlbPlayerSeasonStats({ season, teamId });
      const arms = (Array.isArray(stats) ? stats : [])
        .map((r) => ({
          id: r?.player?.id,
          name: [r?.player?.first_name, r?.player?.last_name].filter(Boolean).join(' '),
          sv: Number(r?.pitching_sv) || 0,
          hld: Number(r?.pitching_hld) || 0,
        }))
        .filter((a) => a.id != null && a.name && a.sv > 0)
        .sort((a, b) => b.sv - a.sv);
      if (!arms.length) continue;

      const leader = arms[0];
      const runner = arms[1] || null;
      const committee = !!runner && (leader.sv - runner.sv) <= COMMITTEE_GAP;

      let score = 55;
      if (committee) score += 12;                 // actionable drama — handcuff spot
      else if (leader.sv >= 20) score += 5;       // bankable locked role
      score = clampScore(score);

      const detail = committee
        ? `Shared ninth in ${t.abbr || t.name}: ${leader.name} ${leader.sv} saves, ${runner.name} ${runner.sv}. The role is live.`
        : `${leader.name} owns the ninth for the ${clubDisplay(t.name)} — ${leader.sv} saves this season` +
          (runner ? ` (next closest: ${runner.name} with ${runner.sv})` : '') + '.';

      rows.push(makeRow({
        category: 'closerWatch',
        headline: committee ? `${leader.name} / ${runner.name}` : leader.name,
        detail,
        game: t.label,
        value: `${leader.sv} SV`,
        tone: committee ? TONES.WARN : TONES.NEUTRAL,
        relevance_score: score,
        player_id: leader.id,
        team_id: teamId,
        game_id: t.gameId,
        meta: {
          kind: 'closer_watch', committee,
          team: t.abbr || t.name,
          team_full: t.name,
          leader: { name: leader.name, sv: leader.sv, hld: leader.hld },
          ...(runner ? { runner: { name: runner.name, sv: runner.sv, hld: runner.hld } } : {}),
        },
      }));
    } catch (err) {
      console.error(`[closerWatch] team ${teamId} error:`, err?.message || err);
    }
  }

  // WHY-NOW rescore (founder, Jul 30): a save note is only actionable when
  // tonight is a live save spot. Favored team + rested arm = the call; an arm
  // that worked both of the last two days is likely down. All computed.
  rows.sort((a, b) => b.relevance_score - a.relevance_score);
  const shortlist = rows.slice(0, 8);
  const slateOdds = await fetchTonightMoneylines(ctx.date);
  const finalsByTeamId = await recentFinalIdsByTeam(bdl, ctx.date);
  for (const r of shortlist) {
    const m = r.meta;
    let score = 40;
    const mlHit = moneylineFor(slateOdds, m.team_full);
    if (mlHit && Number.isFinite(mlHit.ml)) {
      m.tonight_ml = mlHit.ml;
      m.opp = mlHit.opp;
      if (mlHit.ml < 0) score += 18;               // favored — live save chance
    }
    const use = await leaderUsage(bdl, finalsByTeamId.get(r.team_id), r.player_id, ctx.date);
    if (use) {
      m.usage = use;
      if (use.b2b) score -= 14;                    // worked both days — likely down
      else if (!use.threwYesterday) score += 10;   // rested
    }
    if (m.committee) score += 8;
    if ((m.leader?.sv || 0) >= 20) score += 4;
    r.relevance_score = clampScore(score);
  }
  shortlist.sort((a, b) => b.relevance_score - a.relevance_score);
  const out = shortlist.slice(0, MAX_TEAMS);
  console.log(`[closerWatch] teams=${out.length}/${teams.size} (${out.filter((r) => r.meta.committee).length} committees)`);
  await writeReads(out);
  return out;
}

/** Tonight's MLB moneylines from the daily_slate morning snapshot. */
async function fetchTonightMoneylines(dateStr) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !dateStr) return [];
  try {
    const resp = await axios.get(`${SUPABASE_URL}/rest/v1/daily_slate`, {
      params: { date: `eq.${dateStr}`, league: 'eq.MLB', select: 'home_team,away_team,ml_home,ml_away' },
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      timeout: 12000,
    });
    return Array.isArray(resp?.data) ? resp.data : [];
  } catch (err) {
    console.error('[closerWatch] slate odds read failed:', err?.message || err);
    return [];
  }
}

/** daily_slate stores club nicknames — match them as the tail of the full name. */
function moneylineFor(slateRows, fullTeamName) {
  const name = String(fullTeamName || '').toLowerCase();
  if (!name) return null;
  for (const g of slateRows) {
    const home = String(g?.home_team || '').toLowerCase();
    const away = String(g?.away_team || '').toLowerCase();
    if (home && name.endsWith(home)) return { ml: Number(g.ml_home), opp: g.away_team };
    if (away && name.endsWith(away)) return { ml: Number(g.ml_away), opp: g.home_team };
  }
  return null;
}

/** BDL final game ids per team over the last 5 ET dates, newest first. */
async function recentFinalIdsByTeam(bdl, dateStr) {
  const byTeam = new Map();
  for (let back = 1; back <= 5; back++) {
    const d = shiftDateStr(dateStr, -back);
    if (!d) break;
    let games = [];
    try { games = (await bdl.getMlbGamesForETDate(d)) || []; } catch { continue; }
    for (const g of games) {
      if (!String(g?.status || '').toUpperCase().includes('FINAL')) continue;
      for (const t of [g?.home_team, g?.visitor_team || g?.away_team]) {
        if (t?.id == null) continue;
        if (!byTeam.has(t.id)) byTeam.set(t.id, []);
        byTeam.get(t.id).push({ id: g.id, date: d });
      }
    }
  }
  for (const list of byTeam.values()) list.sort((a, b) => b.date.localeCompare(a.date));
  return byTeam;
}

/** The leader's outings across his team's last 3 finals — rested or rode hard. */
async function leaderUsage(bdl, finals, leaderId, dateStr) {
  const last3 = (finals || []).slice(0, 3);
  if (!last3.length || leaderId == null) return null;
  let boxRows = [];
  try {
    boxRows = (await bdl.getMlbGameStats({ gameIds: last3.map((g) => g.id) })) || [];
  } catch { return null; }
  const dateById = new Map(last3.map((g) => [g.id, g.date]));
  const outings = boxRows
    .filter((r) => (r?.player?.id === leaderId) && parseFloat(r?.ip) > 0)
    .map((r) => dateById.get(r.game_id))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const y1 = shiftDateStr(dateStr, -1);
  const y2 = shiftDateStr(dateStr, -2);
  return {
    outings: outings.length,
    threwYesterday: outings.includes(y1),
    b2b: outings.includes(y1) && outings.includes(y2),
    last_out: outings[0] || null,
  };
}

/** "Chicago White Sox" -> "White Sox"; general club display, mascot-safe. */
function clubDisplay(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return fullName || '';
  const last = parts[parts.length - 1];
  if (last === 'Sox' || last === 'Jays') return parts.slice(-2).join(' ');
  return last;
}

/** Fenced flash pass — the saves-chaser read per team (facts only). */
async function writeReads(rows) {
  if (!rows.length) return;
  const facts = rows.map((r, i) => {
    const m = r.meta || {};
    const base = `${i}. TEAM ${m.team} — leader ${m.leader.name}: ${m.leader.sv} saves` +
      (m.leader.hld ? `, ${m.leader.hld} holds` : '');
    const run = m.runner ? `; next: ${m.runner.name} ${m.runner.sv} saves` +
      (m.runner.hld ? `, ${m.runner.hld} holds` : '') : '';
    const committee = m.committee ? `YES (within ${COMMITTEE_GAP} saves)` : 'no';
    const spot = Number.isFinite(m.tonight_ml)
      ? ` Tonight: ${m.tonight_ml < 0 ? 'FAVORED' : 'underdog'} (${m.tonight_ml > 0 ? '+' : ''}${m.tonight_ml})${m.opp ? ` vs ${m.opp}` : ''}.`
      : '';
    const use = m.usage
      ? ` Recent usage: ${m.usage.outings} outing(s) in the team's last 3 games${m.usage.b2b ? ', worked BOTH of the last two days (likely down tonight)' : m.usage.threwYesterday ? ', threw yesterday' : ', fully rested'}.`
      : '';
    return `${base}${run}. Committee: ${committee}.${spot}${use} Plays tonight: ${r.game}.`;
  }).join('\n');

  const prompt = `You are Gary — the bettor whose season-long fantasy column publishes in this app. You write as yourself, never as an AI, and your training data is old: the facts below are current and they are ALL you may use — never introduce a pitcher, number, injury, or role change that isn't listed.

For each team below: the ninth-inning situation as you read it — whether tonight is a live save spot given the odds and the arm's recent workload — and the call for a season-long manager chasing saves this week.

Return STRICT JSON only: {"reads":[{"i":0,"read":"...","verdict":"..."}]}

TEAMS:
${facts}`;

  try {
    const resp = await generateSolText(prompt, { maxTokens: 9000 });
    const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
    for (const item of parsed?.reads || []) {
      const r = rows[item?.i];
      if (!r || !item?.read) continue;
      const verdict = (item.verdict || '').trim();
      r.detail = `${item.read.trim()}${verdict ? ` ${verdict}` : ''}`;
      r.meta = { ...(r.meta || {}), read: item.read.trim(), ...(verdict ? { verdict } : {}) };
    }
    console.log(`[closerWatch] reads attached: ${(parsed?.reads || []).length}/${rows.length}`);
  } catch (err) {
    console.error('[closerWatch] analyst pass failed (computed details kept):', err?.message || err);
  }
}

export default { computeCloserWatch };
