// gary2.0/src/services/insights/computers/wcConfirmedXI.js
//
// LANE: wcConfirmedXI  (category token: situational — the iOS situational/edge lane)
//
// "The team sheet tells you what the manager won't. The moment the confirmed XI lands
//  (~2h before kickoff), the SHAPE of it reveals intent the market hasn't fully priced,
//  and CHANGES from the last match reveal who's being rested or has a fitness doubt.
//  These are 3rd-connection signals — not 'top scorer plays -> goals' (everyone sees
//  that) but 'they named five at the back -> they're playing for a 0-0 -> under + their
//  handicap', or 'four changes + a new keeper -> understrength, managing the group ->
//  fade them' — outcome drivers you only know if you actually read (and diff) the sheet."
//
// SIGNALS (all derived from the lineup feed itself — no noisy cap counts):
//   1. SHAPE        — back-5/lone striker = contain -> under + their handicap; 3+ fwd =
//                     attack -> over. From the starter `formation`. Fires from match 1.
//   2. ROTATION     — >=4 changes vs the team's PREVIOUS WC match XI = understrength /
//                     managing the tournament -> value on the opponent. (match-day 2+)
//   3. KEEPER CHANGE— a different goalkeeper than last match = rotation or a fitness
//                     doubt -> over + opp set-piece/SoT. (match-day 2+)
//   4. TOP SCORER OUT — a clear qualifying goal leader (>=4 g) left out of the XI ->
//                     fade their team total. Conservative: name-matched; thin data just
//                     means it doesn't fire (no false claim).
//
// WHY XI-DIFF, NOT CAPS: API-Football 2026-cycle appearances are too thin to identify
// a first-choice keeper/regular (verified: it mis-tagged Portugal's #1 GK). Comparing
// the actual confirmed XI to the team's previous-match XI is the reliable read.
//
// Lineups post ~2h pre-kickoff, so the lane fills on the match-day passes; before that
// -> []. Openers have no prior XI, so only SHAPE can fire. Defensive throughout — any
// gap drops that signal, never throws, never a false claim.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import * as apiFootball from '../../apiFootballService.js';
import { makeRow, TONES } from '../shared.js';

const wc = fifaWorldCupService;
const DEFAULT_SEASON = 2026;

const safe = async (fn, dflt) => { try { return await fn(); } catch { return dflt; } };
const norm = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const lastName = (s) => norm(s).split(' ').pop();

// Conservative membership: a player counts as IN the XI on a full-name match or a
// distinctive (>3-char) last-name match. Errs toward "present" so it never makes a
// false "missing/benched" claim.
function inXI(name, xiNames) {
  const nn = norm(name), nl = lastName(name);
  return xiNames.some((x) => {
    const xn = norm(x);
    if (xn === nn) return true;
    return nl.length > 3 && (lastName(x) === nl || xn.includes(nl) || nn.includes(lastName(x)));
  });
}

// "5-4-1" / "3-4-2-1" -> { defenders, forwards }.
function parseFormation(f) {
  const parts = String(f || '').split('-').map((n) => parseInt(n, 10)).filter(Number.isFinite);
  if (parts.length < 2) return null;
  return { defenders: parts[0], forwards: parts[parts.length - 1] };
}

function readSide(lineups, teamId, teamName) {
  const starters = lineups.filter((l) => l.team_id === teamId && l.is_starter);
  if (starters.length < 11) return null; // partial sheet — not a confirmed XI yet
  const formation = starters.find((s) => s.formation)?.formation || null;
  const byPos = (p) => starters.filter((s) => s.position === p).length;
  const parsed = parseFormation(formation);
  return {
    teamId, teamName, starters, formation,
    defenders: parsed?.defenders ?? byPos('D'),
    forwards: parsed?.forwards ?? byPos('F'),
    names: starters.map((s) => s.player?.name).filter(Boolean),
    keeper: starters.find((s) => s.position === 'G')?.player?.name || null,
  };
}

export async function computeWcConfirmedXI(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  const season = Number(ctx?.season) || DEFAULT_SEASON;
  const rows = [];
  for (const match of games) {
    try {
      const r = await rowsForMatch(match, season);
      rows.push(...r);
    } catch (e) {
      console.error('[wcConfirmedXI] match error:', e?.message || e);
    }
  }
  console.log(`[wcConfirmedXI] examined ${games.length}, emitted ${rows.length}`);
  return rows;
}

async function rowsForMatch(match, season) {
  const matchId = match?.id;
  const home = match?.home_team, away = match?.away_team;
  if (matchId == null || !home?.id || !away?.id) return [];

  const lineups = await safe(() => wc.getMatchLineups(matchId), []);
  if (!lineups || lineups.length === 0) return []; // not posted yet → fail closed

  const h = readSide(lineups, home.id, home.name);
  const a = readSide(lineups, away.id, away.name);
  if (!h || !a) return [];
  const label = `${away.name} @ ${home.name}`;

  // Gather the best candidate signal for each side, then emit the notable ones
  // (up to 2 per match — one per team — so a "DR Congo contain + Portugal keeper
  // change" game surfaces both, while a flat game emits nothing).
  const cands = [];
  for (const [side, opp] of [[h, a], [a, h]]) {
    const c = await bestSignal(side, opp, matchId, season);
    if (c) cands.push(c);
  }
  cands.sort((x, y) => y.score - x.score);

  // Structured team sheets for the iOS "Confirmed XI" card (formation + the 11).
  const sheet = (side, teamName) => ({
    team: teamName,
    formation: side.formation,
    xi: side.starters
      .map((s) => ({ n: s.player?.name, p: s.position, num: s.shirt_number ?? null }))
      .filter((p) => p.n),
  });
  const meta = { kind: 'confirmedXI', home: sheet(h, home.name), away: sheet(a, away.name) };

  return cands.slice(0, 2).map((c) => makeRow({
    category: 'situational',
    headline: c.headline, value: c.value, detail: c.detail,
    game: label, game_id: matchId, tone: c.tone, relevance_score: c.score,
    meta,
  }));
}

async function bestSignal(side, opp, matchId, season) {
  const candidates = [];

  // 1) SHAPE (lineup-only — fires from match 1)
  if (side.defenders >= 5) {
    const lone = side.forwards <= 1;
    candidates.push({
      score: 72,
      headline: `${side.teamName} set up to contain`,
      value: side.formation || `${side.defenders} at the back`,
      detail: `Confirmed XI: ${side.teamName} named ${side.defenders} at the back${lone ? ' with a lone striker' : ''} vs ${opp.teamName} — a sheet built to absorb pressure and frustrate, not to chase the game. Lineups like this point to a low-event match: leans UNDER on total goals, and ${side.teamName} on the handicap / draw-no-bet carries value the reputation-priced line underrates.`,
      tone: TONES.EDGE,
    });
  } else if (side.forwards >= 3 && side.defenders <= 3) {
    candidates.push({
      score: 65,
      headline: `${side.teamName} picked to attack`,
      value: side.formation || `${side.forwards} up top`,
      detail: `Confirmed XI: ${side.teamName} loaded the sheet with ${side.forwards} forwards vs ${opp.teamName} — a go-forward selection that signals they intend to push the game open. Leans OVER on total goals and toward ${side.teamName}'s team total / anytime-scorer markets.`,
      tone: TONES.EDGE,
    });
  }

  // 2 + 3) CHANGES vs the previous match XI (rotation, keeper change) — match-day 2+
  const prev = await previousXI(side.teamId, matchId, season);
  if (prev) {
    const dropped = prev.names.filter((n) => !inXI(n, side.names));
    if (dropped.length >= 4) {
      candidates.push({
        score: 70,
        headline: `${side.teamName} rotated ${dropped.length}`,
        value: `${dropped.length} changes`,
        detail: `Confirmed XI: ${side.teamName} made ${dropped.length} changes from their last match (${dropped.slice(0, 3).join(', ')}${dropped.length > 3 ? '…' : ''} out). A heavily-rotated side — resting legs or managing the group — is playing below full strength: value on ${opp.teamName} (side + over their total) the market is slow to adjust for.`,
        tone: TONES.CAUTION,
      });
    }
    if (prev.keeper && side.keeper && !inXI(prev.keeper, [side.keeper])) {
      candidates.push({
        score: 67,
        headline: `${side.teamName} changed keepers`,
        value: `${side.keeper} in goal`,
        detail: `Confirmed XI: ${side.teamName} start ${side.keeper} in goal — a different keeper than their last match (${prev.keeper}). A switch between the sticks signals rotation or a fitness doubt; shot-stopping and set-piece command are the variables. Leans OVER and toward ${opp.teamName}'s shots-on-target.`,
        tone: TONES.CAUTION,
      });
    }
  }

  // 4) TOP SCORER OUT (conservative — thin data just won't fire)
  const benched = await benchedTopScorer(side);
  if (benched) {
    candidates.push({
      score: 69,
      headline: `${side.teamName}'s top scorer benched`,
      value: `${benched.name} out`,
      detail: `Confirmed XI: ${side.teamName} left ${benched.name} (${benched.goals} goals this cycle — their leading scorer) out of the XI. Their primary goal source isn't starting: fade ${side.teamName}'s team total and the over, while ${opp.teamName}'s clean-sheet / defensive markets gain.`,
      tone: TONES.CAUTION,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0];
}

// The team's most recent COMPLETED WC match before `matchId`, with its starting XI +
// keeper. null for openers (no prior match).
async function previousXI(teamId, matchId, season) {
  const matches = await safe(() => wc.getMatches({ teamIds: [teamId], seasons: [season] }), []);
  const prior = (matches || [])
    .filter((m) => m?.status === 'completed' && m?.id !== matchId && m?.datetime)
    .sort((x, y) => new Date(y.datetime) - new Date(x.datetime))[0];
  if (!prior) return null;
  const lu = await safe(() => wc.getMatchLineups(prior.id), []);
  const starters = (lu || []).filter((l) => l.team_id === teamId && l.is_starter);
  if (starters.length < 11) return null;
  return {
    names: starters.map((s) => s.player?.name).filter(Boolean),
    keeper: starters.find((s) => s.position === 'G')?.player?.name || null,
  };
}

// { name, goals } if the side's clear cycle goal leader (>= 4 goals) is NOT in the XI.
async function benchedTopScorer(side) {
  const squad = await safe(() => apiFootball.getSquadStats(side.teamName), {});
  const players = Object.values(squad || {}).filter((p) => Number.isFinite(Number(p?.goals)));
  if (players.length < 5) return null;
  players.sort((x, y) => Number(y.goals) - Number(x.goals));
  const top = players[0];
  if (!top || Number(top.goals) < 4) return null; // no clear goal leader → no signal
  if (inXI(top.name, side.names)) return null;
  return { name: top.name, goals: Number(top.goals) };
}
