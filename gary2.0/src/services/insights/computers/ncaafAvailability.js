// THE AVAILABILITY container, for college — the week's reported injuries,
// suspensions and opt-outs per slate game (NCAAF Picks page parity, founder
// Sep 3-4 2026).
//
// Source contract: BDL publishes no college injury feed (ncaaf/v1/player_injuries
// is a 404), so the report comes from one grounded web search per game —
// and NOTHING the model says reaches the page unless the name is on a side's
// BDL active roster. The roster decides the side and the position; the
// model only reports the status, the note and where it read it. A name the
// roster does not know is dropped and counted, never printed. A status word
// outside the report vocabulary is dropped the same way. A failed search or
// an unparseable answer is no report, never an empty one.
//
// NCAAF-owned: this file never reads an NFL feed (league isolation law).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { searchGrounded } from '../ncaafSearch.js';
import { nameKey, playerName } from '../ncaafNames.js';
import { gamesWithRowsToday, runWithinBudget } from '../ncaafLaneLedger.js';

const MAX_PER_GAME = 4;
const SEARCH_TIMEOUT_MS = Math.max(30_000, Number(process.env.GARY_NCAAF_AVAILABILITY_TIMEOUT_MS) || 120_000);
/** Rosters do not change inside a day; share them across the day's passes. */
const ROSTER_TTL_MINUTES = 360;

// The report vocabulary — the phrase the headline prints, its weight, and
// whether it ends the player's night. Anything else is not a status.
const STATUS = Object.freeze({
  'out for season': { phrase: 'out for the season', weight: 44, ending: true },
  'out for the season': { phrase: 'out for the season', weight: 44, ending: true },
  'season-ending': { phrase: 'out for the season', weight: 44, ending: true },
  out: { phrase: 'out', weight: 40, ending: true },
  suspended: { phrase: 'suspended', weight: 38, ending: true },
  'opted out': { phrase: 'opted out', weight: 38, ending: true },
  'opt out': { phrase: 'opted out', weight: 38, ending: true },
  doubtful: { phrase: 'doubtful', weight: 30, ending: true },
  questionable: { phrase: 'questionable', weight: 18, ending: false },
  'game-time decision': { phrase: 'a game-time decision', weight: 18, ending: false },
  probable: { phrase: 'probable', weight: 8, ending: false },
  limited: { phrase: 'limited', weight: 10, ending: false },
});
const POSITION_WEIGHT = Object.freeze({
  QB: 24, RB: 14, WR: 14, TE: 10, OL: 8, OT: 8, OG: 8, C: 8,
  DL: 8, DE: 8, DT: 6, EDGE: 8, LB: 6, CB: 8, S: 6, DB: 6, PK: 4, K: 4, P: 2,
});
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function teamAbbr(team) {
  return team?.abbreviation || team?.college || team?.name || 'TEAM';
}

function teamFullName(team) {
  return team?.full_name || [team?.college, team?.name].filter(Boolean).join(' ') || teamAbbr(team);
}

function statusEntry(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (STATUS[s]) return { key: s, ...STATUS[s] };
  if (/season/.test(s) && /out|done|end/.test(s)) return { key: 'out for season', ...STATUS['out for season'] };
  if (/opt/.test(s)) return { key: 'opted out', ...STATUS['opted out'] };
  return null;
}

function reportedDay(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** The first JSON array in the answer — fenced, bare, or the whole text. */
export function parseReport(text) {
  if (!text || typeof text !== 'string') return null;
  const candidates = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fence.exec(text)) !== null) if (m[1]) candidates.push(m[1].trim());
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text.trim());
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      if (parsed && Array.isArray(parsed.report)) return parsed.report;
    } catch { /* next candidate */ }
  }
  return null;
}

function buildPrompt({ game, awayTeam, homeTeam, date }) {
  const away = teamFullName(awayTeam);
  const home = teamFullName(homeTeam);
  return `College football availability report for ${away} at ${home}, game date ${date}.

Search the news from this week for BOTH programs and list every player currently reported as out, doubtful, questionable, suspended, opted out, or out for the season for this game. Use only reports you can actually find; if a program has nothing reported, list nothing for it. Do not guess, do not infer from a depth chart, do not list last season's injuries unless a report this week says the player is still out.

Return STRICT JSON only — an array, no prose before or after:
[{"player":"First Last","team":"${away}" or "${home}","position":"QB","status":"out|doubtful|questionable|suspended|opted out|out for season|probable","note":"one sentence: the injury and what was reported","source":"outlet or reporter","reported":"YYYY-MM-DD"}]`;
}

async function loadRosters(bdl, awayTeam, homeTeam) {
  const away = await bdl.getNcaafTeamPlayers(awayTeam.id, ROSTER_TTL_MINUTES);
  const home = await bdl.getNcaafTeamPlayers(homeTeam.id, ROSTER_TTL_MINUTES);
  const index = new Map();
  for (const [team, roster] of [[awayTeam, away], [homeTeam, home]]) {
    for (const p of roster || []) {
      const key = nameKey(playerName(p));
      if (!key || p?.id == null) continue;
      if (!index.has(key)) index.set(key, { player: p, team });
    }
  }
  return index;
}

async function reportForGame({ game, date, helpers, bdl }) {
  const awayTeam = game?.away_team ?? game?.visitor_team;
  const homeTeam = game?.home_team;
  if (game?.id == null || !awayTeam?.id || !homeTeam?.id) return [];

  let roster;
  try {
    roster = await loadRosters(bdl, awayTeam, homeTeam);
  } catch (err) {
    console.warn(`[ncaafAvailability] rosters failed for game ${game.id}: ${err?.message || err} — skipped, the model is never trusted alone`);
    return [];
  }
  if (roster.size === 0) return [];

  const answer = await searchGrounded(buildPrompt({ game, awayTeam, homeTeam, date }), { timeoutMs: SEARCH_TIMEOUT_MS, maxTokens: 3000 });
  if (!answer?.success || !answer.data) {
    console.warn(`[ncaafAvailability] search failed for game ${game.id}: ${answer?.error || 'no answer'}`);
    return [];
  }
  const items = parseReport(answer.data);
  if (!items) {
    console.warn(`[ncaafAvailability] game ${game.id}: no JSON report in the answer`);
    return [];
  }

  let dropped = 0;
  const seen = new Set();
  const scored = [];
  for (const item of items) {
    const hit = roster.get(nameKey(item?.player));
    const status = statusEntry(item?.status);
    if (!hit || !status || seen.has(hit.player.id)) { dropped += 1; continue; }
    seen.add(hit.player.id);
    const pos = String(hit.player.position_abbreviation || hit.player.position || '').toUpperCase();
    const weight = status.weight + (POSITION_WEIGHT[pos] ?? 4);
    scored.push({ hit, status, pos, item, weight });
  }
  scored.sort((a, b) => b.weight - a.weight);
  if (dropped) console.log(`[ncaafAvailability] game ${game.id}: dropped ${dropped} item(s) the rosters or the status vocabulary did not know`);

  return scored.slice(0, MAX_PER_GAME).map(({ hit, status, pos, item, weight }) => {
    const name = playerName(hit.player);
    const abbr = teamAbbr(hit.team);
    const note = String(item?.note || '').trim();
    const source = String(item?.source || '').trim();
    const day = reportedDay(item?.reported);
    const attribution = source ? ` Per ${source}${day ? `, ${day}` : ''}.` : (day ? ` Reported ${day}.` : '');
    return makeRow({
      category: 'injury',
      headline: `${name}${pos ? ` (${pos})` : ''} is ${status.phrase} for ${abbr}`,
      detail: note
        ? `${note}${attribution}`
        : `${abbr} has ${name} reported ${status.phrase} this week.${attribution}`,
      game: helpers.gameLabel(game),
      value: status.key.toUpperCase(),
      tone: status.ending ? TONES.CAUTION : TONES.NEUTRAL,
      relevance_score: Math.min(90, 40 + weight),
      player_id: hit.player.id,
      team_id: hit.team.id,
      game_id: game.id,
      meta: {
        source: 'search_grounded_roster_verified',
        status: status.key,
        position: pos || null,
        reported: item?.reported || null,
        outlet: source || null,
        through: date,
      },
    });
  });
}

/**
 * One row per roster-verified report on the slate, capped per game with the
 * most consequential first.
 */
export async function computeNcaafAvailability(ctx) {
  const { games, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'ncaaf') return [];
  if (!bdl || !(games || []).length) return [];

  const done = await gamesWithRowsToday({ date, category: 'injury' });
  const rows = await runWithinBudget({
    games, done, label: 'ncaafAvailability',
    work: (game) => reportForGame({ game, date, helpers, bdl }),
  });

  await attachLaneReads('ncaafAvailability', rows, detailFact, {
    ask: 'what this report actually changes about the game — who absorbs the work if he sits, what the status word means this close to kickoff, and which side of the ball feels it',
  });

  console.log(`[ncaafAvailability] NCAAF ${date}: ${rows.length} roster-verified report row(s)`);
  return rows;
}

export default { computeNcaafAvailability };
