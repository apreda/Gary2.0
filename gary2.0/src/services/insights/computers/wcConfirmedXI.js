// gary2.0/src/services/insights/computers/wcConfirmedXI.js
//
// LANE: wcConfirmedXI  (category token: situational — the iOS situational/edge lane)
//
// "The team sheet tells you what the manager won't. The moment the confirmed XI lands
//  (~2h before kickoff), the SHAPE of it reveals intent the market hasn't fully priced.
//  A side that names FIVE at the back is setting up to contain, not to win — a quiet
//  under + underdog-handicap signal a casual fan never reads off a list of names. The
//  inverse — three forwards — is a go-forward XI that leans the over. And a qualifying
//  top scorer left OUT of the XI is a goal source the price still assumes is on the
//  pitch. This lane does the team-sheet read for the user and connects it to the bet."
//
// The 3rd-connection idea: not "top scorer plays -> bet goals" (everyone sees that),
// but "the back-five they just named means they're playing for a 0-0 -> under + their
// handicap" — an outcome driver you only know if you actually read the lineup.
//
// DATA: confirmed XI = BDL FIFA getMatchLineups (each starter row carries `formation`,
//   `position` (G/D/M/F), `is_starter`, `player:{id,name}`). Squad goals = API-Football
//   getSquadStats (name-keyed). The top-scorer read is name-matched CONSERVATIVELY
//   (full-name then last-name, accent-stripped); any ambiguity -> drop it, never a
//   false "benched" claim. Lineups post ~2h pre-kickoff, so this lane fills on the
//   match-day passes; before that it returns []. Defensive throughout — any gap drops
//   the row, never throws.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import * as apiFootball from '../../apiFootballService.js';
import { makeRow, TONES } from '../shared.js';

const wc = fifaWorldCupService;

const safe = async (fn, dflt) => { try { return await fn(); } catch { return dflt; } };
const norm = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const lastName = (s) => norm(s).split(' ').pop();

// "5-4-1" / "3-4-2-1" -> { defenders, forwards }. First number = defenders, last = forwards.
function parseFormation(f) {
  const parts = String(f || '').split('-').map((n) => parseInt(n, 10)).filter(Number.isFinite);
  if (parts.length < 2) return null;
  return { defenders: parts[0], forwards: parts[parts.length - 1] };
}

export async function computeWcConfirmedXI(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  const rows = [];
  for (const match of games) {
    try {
      const r = await rowForMatch(match);
      if (r) rows.push(r);
    } catch (e) {
      console.error('[wcConfirmedXI] match error:', e?.message || e);
    }
  }
  console.log(`[wcConfirmedXI] examined ${games.length}, emitted ${rows.length}`);
  return rows;
}

// Read one team's XI shape from the lineup rows.
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
  };
}

async function rowForMatch(match) {
  const matchId = match?.id;
  const home = match?.home_team, away = match?.away_team;
  if (matchId == null || !home?.id || !away?.id) return null;

  const lineups = await safe(() => wc.getMatchLineups(matchId), []);
  if (!lineups || lineups.length === 0) return null; // not posted yet → fail closed

  const h = readSide(lineups, home.id, home.name);
  const a = readSide(lineups, away.id, away.name);
  if (!h || !a) return null;

  const label = `${away.name} @ ${home.name}`;

  // ── 1) SHAPE — the headline read. Containment (back-5) is the stronger, less
  // obvious signal; prefer it, then a clearly attacking XI. ──────────────────────
  const containment = [h, a].find((s) => s.defenders >= 5);
  if (containment) {
    const opp = containment === h ? a : h;
    const lone = containment.forwards <= 1;
    return makeRow({
      category: 'situational',
      headline: `${containment.teamName} set up to contain`,
      value: containment.formation || `${containment.defenders} at the back`,
      detail: `Confirmed XI: ${containment.teamName} named ${containment.defenders} at the back${lone ? ' with a lone striker' : ''} vs ${opp.teamName} — a sheet built to absorb pressure and frustrate, not to chase the game. Lineups like this point to a low-event match: leans UNDER on total goals, and ${containment.teamName} on the handicap / draw-no-bet carries value the reputation-priced line underrates.`,
      game: label,
      game_id: matchId,
      tone: TONES.EDGE,
      relevance_score: 72,
    });
  }
  const attacking = [h, a].find((s) => s.forwards >= 3 && s.defenders <= 3);
  if (attacking) {
    const opp = attacking === h ? a : h;
    return makeRow({
      category: 'situational',
      headline: `${attacking.teamName} picked to attack`,
      value: attacking.formation || `${attacking.forwards} up top`,
      detail: `Confirmed XI: ${attacking.teamName} loaded the sheet with ${attacking.forwards} forwards vs ${opp.teamName} — a go-forward selection that signals they intend to push the game open. Leans OVER on total goals and toward ${attacking.teamName}'s team total / anytime-scorer markets.`,
      game: label,
      game_id: matchId,
      tone: TONES.EDGE,
      relevance_score: 65,
    });
  }

  // ── 2) TOP SCORER OUT — a goal source the price still assumes is starting. Only
  // fires when the XI shape is unremarkable, and only with a confident name match. ─
  for (const side of [h, a]) {
    const benched = await benchedTopScorer(side);
    if (benched) {
      const opp = side === h ? a : h;
      return makeRow({
        category: 'situational',
        headline: `${side.teamName}'s top scorer benched`,
        value: `${benched.name} out`,
        detail: `Confirmed XI: ${side.teamName} left ${benched.name} (${benched.goals} goals in qualifying — their leading scorer) out of the starting XI. Their primary goal source isn't on the pitch from the whistle: fade ${side.teamName}'s team total and the over, while ${opp.teamName}'s clean-sheet / defensive markets gain.`,
        game: label,
        game_id: matchId,
        tone: TONES.CAUTION,
        relevance_score: 68,
      });
    }
  }

  return null;
}

// Returns { name, goals } if the side's clear qualifying top scorer (>= 4 goals) is
// NOT in the confirmed XI; else null. Conservative: needs squad data, a clear leader,
// and NO name match (full-name OR last-name) in the XI before claiming "benched".
async function benchedTopScorer(side) {
  const squad = await safe(() => apiFootball.getSquadStats(side.teamName), {});
  const players = Object.values(squad || {}).filter((p) => Number.isFinite(Number(p?.goals)));
  if (players.length < 5) return null; // squad data too thin to trust
  players.sort((x, y) => Number(y.goals) - Number(x.goals));
  const top = players[0];
  if (!top || Number(top.goals) < 4) return null; // no clear goal leader → no signal
  const xiNorm = side.names.map(norm);
  const xiLast = side.names.map(lastName);
  const topNorm = norm(top.name), topLast = lastName(top.name);
  const inXI = xiNorm.some((n) => n === topNorm || n.includes(topLast) || topNorm.includes(n))
    || (topLast.length > 3 && xiLast.includes(topLast));
  if (inXI) return null; // they're starting — no signal
  return { name: top.name, goals: Number(top.goals) };
}
