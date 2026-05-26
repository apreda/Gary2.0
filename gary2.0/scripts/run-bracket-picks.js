#!/usr/bin/env node
/**
 * Gary's Bracket Pick Generator
 * Fills out Gary's March Madness bracket by analyzing each game.
 *
 * Usage:
 *   node scripts/run-bracket-picks.js                  # Generate picks for all available games
 *   node scripts/run-bracket-picks.js --round 1        # Only R64 games
 *   node scripts/run-bracket-picks.js --limit 3        # Limit to N games (for testing)
 *   node scripts/run-bracket-picks.js --test           # Store to test table
 *   node scripts/run-bracket-picks.js --dry-run        # Print picks without storing
 */

import '../src/loadEnv.js';
// Use specified API key for bracket
process.env.GEMINI_API_KEY = 'REDACTED_PRE_HISTORY_REWRITE';
import { createClient } from '@supabase/supabase-js';
import { ballDontLieService } from '../src/services/ballDontLieService.js';
import { ncaabSeason } from '../src/utils/dateUtils.js';
import { getBracketAwarenessContext, getBracketSpreadContext } from '../src/services/agentic/orchestrator/bracketAwareness.js';
import { parseBracketResponse } from '../src/services/agentic/orchestrator/bracketParser.js';
import { oddsService } from '../src/services/oddsService.js';
import { createGeminiSession, sendToSession } from '../src/services/agentic/orchestrator/sessionManager.js';
import { getTeamRatings } from '../src/services/ncaabMetricsService.js';

const args = process.argv.slice(2);
const roundFilter = args.includes('--round') ? parseInt(args[args.indexOf('--round') + 1]) : null;
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const dryRun = args.includes('--dry-run');
const testMode = args.includes('--test');
const tableName = testMode ? 'test_bracket_picks' : 'bracket_picks';

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║          🐻 GARY'S BRACKET PICK GENERATOR 🐻                     ║
║                                                                  ║
║        March Madness | Who Advances?                             ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

const season = ncaabSeason();
console.log(`Season: ${season} | Round filter: ${roundFilter || 'all'} | Limit: ${limit || 'none'} | Dry run: ${dryRun}`);

// 1. Fetch bracket from BDL
const rawBracket = await ballDontLieService.getNcaabBracket(season);
if (!rawBracket || rawBracket.length === 0) {
  console.log('No bracket data from BDL — try again after Selection Sunday.');
  process.exit(0);
}
console.log(`Got ${rawBracket.length} bracket entries from BDL`);

// 2. Filter to games we want to pick
let games = rawBracket.filter(g => {
  // Must have both teams
  if (!g.home_team?.name && !g.home_team?.full_name) return false;
  if (!g.away_team?.name && !g.away_team?.full_name) return false;
  // Round filter
  if (roundFilter !== null && g.round !== roundFilter) return false;
  return true;
});

if (limit) games = games.slice(0, limit);

// Bracket completeness check
const roundCounts = {};
for (const g of games) {
  const r = g.round || 0;
  roundCounts[r] = (roundCounts[r] || 0) + 1;
}
console.log(`Processing ${games.length} games`);
console.log(`Rounds available: ${Object.entries(roundCounts).map(([r, c]) => `R${r}:${c}`).join(', ')}`);
if (!roundFilter) {
  const expectedR64 = 32;
  const r64Count = roundCounts[1] || 0;
  if (r64Count < expectedR64) {
    console.warn(`⚠️  Only ${r64Count}/${expectedR64} Round of 64 games available from BDL. Bracket may be incomplete.`);
    console.warn(`   This is normal before the full bracket is announced. Later rounds populate as teams advance.`);
  }
}
console.log('');

// 3. Check existing picks to avoid re-generating
const supabaseUrl = process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let existingPicks = [];
try {
  const { default: axios } = await import('axios');
  const resp = await axios.get(`${supabaseUrl}/rest/v1/${tableName}?tournament=eq.march_madness_${season + 1}&select=*`, {
    headers: { 'apikey': adminKey, 'Authorization': `Bearer ${adminKey}` }
  });
  existingPicks = resp.data || [];
  console.log(`Found ${existingPicks.length} existing bracket picks`);
} catch (e) {
  console.log(`Could not check existing picks: ${e.message}`);
}

// 4. Try to get odds for spread context
let oddsMap = {};
try {
  const ncaabGames = await oddsService.getUpcomingGames('basketball_ncaab');
  for (const g of (ncaabGames || [])) {
    const key = `${(g.away_team || '').toLowerCase()}_${(g.home_team || '').toLowerCase()}`;
    oddsMap[key] = g;
  }
  console.log(`Loaded odds for ${Object.keys(oddsMap).length} NCAAB games`);
} catch (e) {
  console.log(`Could not load odds: ${e.message}`);
}

// 5. Load Gary's existing daily spread picks for consistency context
let dailySpreadPicks = {};  // { "Team A_Team B": "Team A -3.5", ... }
try {
  const { default: axios } = await import('axios');
  const today = new Date().toISOString().split('T')[0];
  const resp = await axios.get(`${supabaseUrl}/rest/v1/daily_picks?date=eq.${today}&select=picks`, {
    headers: { 'apikey': adminKey, 'Authorization': `Bearer ${adminKey}` }
  });
  const rows = resp.data || [];
  for (const row of rows) {
    const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : (Array.isArray(row.picks) ? row.picks : []);
    for (const p of picks) {
      if (p.sport === 'basketball_ncaab' && p.pick && p.homeTeam && p.awayTeam) {
        dailySpreadPicks[`${p.awayTeam}_${p.homeTeam}`] = p.pick;
        dailySpreadPicks[`${p.homeTeam}_${p.awayTeam}`] = p.pick;
      }
    }
  }
  const count = Object.keys(dailySpreadPicks).length / 2;
  if (count > 0) console.log(`Loaded ${count} NCAAB daily spread picks for bracket consistency`);
} catch (e) {
  console.log(`Could not load daily spread picks: ${e.message}`);
}

// 6. Generate picks
const bracketAwareness = getBracketAwarenessContext();

// Region from BDL bracket_location (authoritative source)
function regionFromBracketLocation(loc) {
  if (loc >= 1 && loc <= 8) return 'East';
  if (loc >= 9 && loc <= 16) return 'South';
  if (loc >= 17 && loc <= 24) return 'West';
  if (loc >= 25 && loc <= 32) return 'Midwest';
  return null;
}

// Fallback team-to-region mapping (only used if bracket_location unavailable)
const TEAM_REGION_MAP = {
  // East
  'duke': 'East', 'siena': 'East', 'ohio state': 'East', 'tcu': 'East',
  'st. john': 'East', 'northern iowa': 'East', 'kansas': 'East', 'california baptist': 'East',
  'louisville': 'East', 'south florida': 'East', 'michigan state': 'East', 'north dakota state': 'East',
  'ucla': 'East', 'ucf': 'East', 'uconn': 'East', 'furman': 'East',
  // South
  'florida': 'South', 'prairie view': 'South', 'lehigh': 'South', 'clemson': 'South',
  'iowa': 'South', 'vanderbilt': 'South', 'mcneese': 'South', 'nebraska': 'South',
  'troy': 'South', 'north carolina': 'South', 'vcu': 'South', 'illinois': 'South',
  'pennsylvania': 'South', 'penn': 'South', 'saint mary': 'South', 'texas a&m': 'South',
  'houston': 'South', 'idaho': 'South',
  // West
  'arizona': 'West', 'long island': 'West', 'villanova': 'West', 'utah state': 'West',
  'wisconsin': 'West', 'high point': 'West', 'arkansas': 'West', 'hawai': 'West', 'hawaii': 'West',
  'byu': 'West', 'brigham young': 'West', 'gonzaga': 'West', 'kennesaw': 'West',
  'miami hurricane': 'West', 'missouri': 'West', 'purdue': 'West', 'queens': 'West',
  'nc state': 'West', 'texas longhorn': 'West',
  // Midwest
  'michigan wolverine': 'Midwest', 'umbc': 'Midwest', 'howard': 'Midwest',
  'georgia': 'Midwest', 'saint louis': 'Midwest', 'texas tech': 'Midwest', 'akron': 'Midwest',
  'alabama': 'Midwest', 'hofstra': 'Midwest', 'tennessee': 'Midwest', 'smu': 'Midwest',
  'miami (oh)': 'Midwest', 'miami redhawk': 'Midwest',
  'virginia': 'Midwest', 'wright state': 'Midwest', 'kentucky': 'Midwest', 'santa clara': 'Midwest',
  'iowa state': 'Midwest', 'tennessee state': 'Midwest',
};

function lookupRegion(teamName) {
  const lower = (teamName || '').toLowerCase();
  for (const [key, region] of Object.entries(TEAM_REGION_MAP)) {
    if (lower.includes(key)) return region;
  }
  return 'TBD';
}

const allPicks = [];

// Track original seeds for all teams (R64 seeds persist through bracket)
// Also track which teams Gary picked to advance from previous rounds (consistency check)
const originalSeeds = {};  // { "Duke Blue Devils": 1, "Siena Saints": 16, ... }
const advancedTeams = {};  // { "Duke Blue Devils": [1, 2], ... } — rounds they advanced through

// Pre-populate original seeds from R64 games
for (const g of games) {
  const t1 = g.away_team?.full_name || g.away_team?.name;
  const t2 = g.home_team?.full_name || g.home_team?.name;
  const s1 = parseInt(g.away_team?.seed) || 0;
  const s2 = parseInt(g.home_team?.seed) || 0;
  if (t1 && s1 > 0) originalSeeds[t1] = s1;
  if (t2 && s2 > 0) originalSeeds[t2] = s2;
}
// Also populate from existing picks in DB
for (const ep of existingPicks) {
  if (ep.seed1 > 0) originalSeeds[ep.team1] = ep.seed1;
  if (ep.seed2 > 0) originalSeeds[ep.team2] = ep.seed2;
  if (ep.picked_to_advance) {
    if (!advancedTeams[ep.picked_to_advance]) advancedTeams[ep.picked_to_advance] = [];
    advancedTeams[ep.picked_to_advance].push(ep.round);
  }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1: Build team profiles for ALL tournament teams
// Pre-load Barttorvik + BDL data so later rounds don't re-fetch
// ═══════════════════════════════════════════════════════════════
const teamProfiles = {}; // { "Duke Blue Devils": { bart, roster, recentGames, teamStats, seed, region, conference } }

console.log('\n--- PHASE 1: Loading team profiles ---');
const allTeamNames = new Set();
for (const g of games) {
  const t1 = g.away_team?.full_name || g.away_team?.name;
  const t2 = g.home_team?.full_name || g.home_team?.name;
  if (t1 && t1 !== 'TBD') allTeamNames.add(t1);
  if (t2 && t2 !== 'TBD') allTeamNames.add(t2);
}
console.log(`Loading profiles for ${allTeamNames.size} tournament teams...`);

// Use proper BDL team matching (not substring hack)
for (const teamName of allTeamNames) {
  try {
    const bart = await getTeamRatings(teamName);
    const bdlTeam = await ballDontLieService.getTeamByNameGeneric('basketball_ncaab', teamName);

    let recentGames = [];
    let teamStats = null;
    if (bdlTeam) {
      const gamesData = await ballDontLieService.getGames('basketball_ncaab', { team_ids: [bdlTeam.id], seasons: [season], per_page: 20 });
      recentGames = (gamesData || [])
        .filter(g => ['Final', 'final', 'Completed', 'post'].includes(g.status?.trim()))
        .sort((a, b) => new Date(b.date || b.datetime || 0) - new Date(a.date || a.datetime || 0))
        .slice(0, 5);
      teamStats = await ballDontLieService.getTeamSeasonStats('basketball_ncaab', { teamId: bdlTeam.id, season });
    }
    // Roster is fetched per-matchup in pickBracketGame() where both teams are known
    teamProfiles[teamName] = { bart, recentGames, teamStats, roster: [], bdlTeam };
  } catch (e) {
    console.log(`  [Profile] Error for ${teamName}: ${e.message}`);
    teamProfiles[teamName] = { bart: null, recentGames: [], teamStats: null, roster: [], bdlTeam: null };
  }
}
console.log(`Loaded ${Object.keys(teamProfiles).length} team profiles`);

// Phase 2: Mini scouting reports are now generated per-matchup inside pickBracketGame
// (includes bilateral upset/favorite cases specific to each game)
console.log('\nPhase 2: Scouting reports will be generated per matchup during picking.');

// ═══════════════════════════════════════════════════════════════
// PHASE 3: Pick round by round — R64 → R32 → S16 → E8 → FF → CHAMP
// After each round, construct next round from Gary's winners
// ═══════════════════════════════════════════════════════════════
console.log('\n--- PHASE 3: Picking bracket round by round ---');

// Organize R64 games by region + position
const r64Games = games.filter(g => (g.round || 0) === 1).map(g => {
  const t1 = g.away_team?.full_name || g.away_team?.name || 'TBD';
  const t2 = g.home_team?.full_name || g.home_team?.name || 'TBD';
  const s1 = parseInt(g.away_team?.seed) || originalSeeds[t1] || 0;
  const s2 = parseInt(g.home_team?.seed) || originalSeeds[t2] || 0;
  const region = regionFromBracketLocation(g.bracket_location) || g.region || lookupRegion(t1) || lookupRegion(t2) || 'TBD';
  return { team1: t1, team2: t2, seed1: s1, seed2: s2, region, round: 1, game: g, bracketLocation: g.bracket_location };
});
const firstFourGames = games.filter(g => (g.round || 0) === 0).map(g => {
  const t1 = g.away_team?.full_name || g.away_team?.name || 'TBD';
  const t2 = g.home_team?.full_name || g.home_team?.name || 'TBD';
  const s1 = parseInt(g.away_team?.seed) || originalSeeds[t1] || 0;
  const s2 = parseInt(g.home_team?.seed) || originalSeeds[t2] || 0;
  return { team1: t1, team2: t2, seed1: s1, seed2: s2, region: g.region || lookupRegion(t1) || lookupRegion(t2) || 'TBD', round: 0, game: g };
});

// Standard bracket pairing order for R64 → R32 (seeds: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15)
// R32 pairs: winner of game 0 vs winner of game 1, game 2 vs game 3, etc.
const BRACKET_PAIRS = [[0,1],[2,3],[4,5],[6,7]]; // R32 pairings within each quarter
const SWEET16_PAIRS = [[0,1],[2,3]]; // S16 from R32 halves
const ELITE8_PAIRS = [[0,1]]; // E8 from S16

// Helper: pick a single bracket game
async function pickBracketGame(team1, team2, seed1, seed2, region, roundNum, gameNumber, regionContext = '', momentumContext = '') {
  // Check if already picked — return existing result instead of null
  const existingPick = existingPicks.find(p =>
    p.round === roundNum &&
    ((p.team1 === team1 && p.team2 === team2) || (p.team1 === team2 && p.team2 === team1))
  );
  if (existingPick) {
    console.log(`  SKIP: ${team1} vs ${team2} (already picked: ${existingPick.picked_to_advance})`);
    const winner = existingPick.picked_to_advance;
    if (winner) {
      if (!advancedTeams[winner]) advancedTeams[winner] = [];
      advancedTeams[winner].push(roundNum);
    }
    return { winner, winnerSeed: existingPick.picked_seed || 0, region, pick: existingPick };
  }

  const roundName = roundNum === 0 ? 'First Four' : roundNum === 1 ? 'Round of 64' : roundNum === 2 ? 'Round of 32' : roundNum === 3 ? 'Sweet 16' : roundNum === 4 ? 'Elite 8' : roundNum === 5 ? 'Final Four' : 'Championship';
  const p1 = teamProfiles[team1] || {};
  const p2 = teamProfiles[team2] || {};

  // Fetch roster data per-matchup (requires both team names)
  try {
    const rosterData = await ballDontLieService.getNcaabRosterDepth(team2, team1, season);
    if (rosterData.home?.length > 0) p2.roster = rosterData.home;
    if (rosterData.away?.length > 0) p1.roster = rosterData.away;
    if (p1.roster?.length || p2.roster?.length) {
      console.log(`  [Roster] ${team1}: ${p1.roster?.length || 0} players, ${team2}: ${p2.roster?.length || 0} players`);
    }
  } catch (e) {
    // Silent — roster stays empty, formatRoster handles it
  }

  // Build scouting data from cached profiles
  const formatBart = (b, name) => {
    if (!b) return `${name}: Barttorvik data unavailable`;
    return `${name} (${b.conferenceName || 'N/A'}): T-Rank #${b.rank || 'N/A'} | AdjOE: ${b.adjOE || 'N/A'} (#${b.adjOE_rank || '?'}) | AdjDE: ${b.adjDE || 'N/A'} (#${b.adjDE_rank || '?'}) | AdjEM: ${((b.adjOE || 0) - (b.adjDE || 0)).toFixed(1)} | Tempo: ${b.tempo || 'N/A'} | Barthag: ${b.barthag || 'N/A'} | WAB: ${b.wab || 'N/A'} | Record: ${b.projW || '?'}-${b.projL || '?'}`;
  };
  const formatRoster = (players, name) => {
    if (!players || !players.length) return `${name}: Roster data unavailable`;
    return players.slice(0, 7).map(p => {
      const ppg = p.ppg || p.pts || '?';
      const rpg = p.rpg || p.reb || '?';
      const apg = p.apg || p.ast || '?';
      const fgPct = p.fg_pct || p.fgPct || '?';
      const threePct = p.three_pct || p.fg3Pct || '?';
      const minPg = p.min ? (typeof p.min === 'string' ? p.min : parseFloat(p.min).toFixed(1)) : null;
      const pos = p.position || '';
      let line = `${p.name}${pos ? ' (' + pos + ')' : ''}: ${ppg} PPG, ${rpg} RPG, ${apg} APG, ${fgPct} FG%, ${threePct} 3P%`;
      if (minPg) line += `, ${minPg} MPG`;
      return line;
    }).join('\n');
  };
  const formatRecent = (games, teamName) => {
    if (!games || games.length === 0) return 'No recent game data';
    return games.map(g => {
      const isHome = (g.home_team?.name || g.home_team?.full_name || '').toLowerCase().includes(teamName.split(' ').pop().toLowerCase());
      const ts = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0);
      const os = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0);
      const opp = isHome ? (g.away_team?.name || '?') : (g.home_team?.name || '?');
      return `${ts > os ? 'W' : 'L'} ${ts}-${os} vs ${opp}`;
    }).join(' | ');
  };
  const formatFourFactors = (stats, name) => {
    if (!stats) return '';
    const s = Array.isArray(stats) ? stats[0] : stats;
    if (!s) return '';
    const fga = s.fga || 1;
    const efg = fga > 0 ? (((s.fgm || 0) + 0.5 * (s.fg3m || 0)) / fga * 100).toFixed(1) : 'N/A';
    const tovPct = fga > 0 ? ((s.tov || 0) / (fga + 0.44 * (s.fta || 0) + (s.tov || 0)) * 100).toFixed(1) : 'N/A';
    const ftRate = fga > 0 && s.fta ? ((s.fta / fga) * 100).toFixed(1) : 'N/A';
    const ftPct = s.ft_pct ? (s.ft_pct * 100).toFixed(1) : (s.ftm && s.fta ? ((s.ftm / s.fta) * 100).toFixed(1) : 'N/A');
    return `${name}: eFG% ${efg} | TOV% ${tovPct} | FT Rate ${ftRate}% | FT% ${ftPct}`;
  };

  // Generate matchup-specific scouting report via Flash (bilateral cases)
  let matchupReport = '';
  try {
    const scoutSession = createGeminiSession({
      modelName: 'gemini-3.1-flash-lite-preview',
      systemPrompt: 'You are a college basketball analyst preparing a scouting report. Report facts and matchup analysis only. Do not make a pick or recommendation. CRITICAL: Only reference players, coaches, stats, and facts that appear in the data provided. Do not use your training data for any player names, records, or facts — if it is not in the data, do not mention it.',
      thinkingLevel: 'high'
    });
    const higherSeed = Math.min(seed1, seed2);
    const lowerSeed = Math.max(seed1, seed2);
    const favorite = seed1 < seed2 ? team1 : team2;
    const underdog = seed1 < seed2 ? team2 : team1;
    const favBart = seed1 < seed2 ? p1.bart : p2.bart;
    const udBart = seed1 < seed2 ? p2.bart : p1.bart;
    const favRoster = seed1 < seed2 ? p1.roster : p2.roster;
    const udRoster = seed1 < seed2 ? p2.roster : p1.roster;

    const isLateRound = roundNum >= 4; // E8, FF, Championship
    const scoutPrompt = `Analyze this ${roundName} matchup: ${seed1} ${team1} vs ${seed2} ${team2} (${region} Region).

DATA:
${formatBart(p1.bart, team1)}
${formatBart(p2.bart, team2)}
${team1} key players: ${(p1.roster||[]).slice(0,3).map(p => `${p.name} (${p.ppg||'?'} PPG)`).join(', ') || 'N/A'}
${team2} key players: ${(p2.roster||[]).slice(0,3).map(p => `${p.name} (${p.ppg||'?'} PPG)`).join(', ') || 'N/A'}
${team1} L5: ${formatRecent(p1.recentGames, team1)}
${team2} L5: ${formatRecent(p2.recentGames, team2)}

Write one section only:

WHY ${underdog} (${lowerSeed} SEED) CAN WIN THIS GAME:
${isLateRound
  ? `Two paragraphs. First: the specific matchup advantages ${underdog} has — tempo, style of play, defensive scheme, shooting profile — that could neutralize ${favorite}'s strengths in this specific game. Second: the players on ${underdog} who can take over a game at this level — name them, cite their stats, and explain why their skillset translates to the ${roundName}. ${underdog} has won 3-4 straight tournament games to reach this point — they have proven they belong here.`
  : `One paragraph on the specific matchup factors and stylistic advantages that give ${underdog} a path to winning. Include at least 1-2 sentences about specific players on ${underdog} who have the individual talent to compete in this matchup — name them, cite their stats, and explain what they do well.`}`;

    const scoutResp = await sendToSession(scoutSession, scoutPrompt);
    matchupReport = (scoutResp.content || '').trim();
  } catch (e) {
    matchupReport = '';
  }

  // Build tournament-relevant metrics section (side by side, numbers only)
  const formatTournamentMetrics = (stats1, stats2, name1, name2) => {
    const computeMetrics = (stats) => {
      if (!stats) return { tovPct: 'N/A', ftPct: 'N/A', oppFtRate: 'N/A', threeAttemptRate: 'N/A' };
      const s = Array.isArray(stats) ? stats[0] : stats;
      if (!s) return { tovPct: 'N/A', ftPct: 'N/A', oppFtRate: 'N/A', threeAttemptRate: 'N/A' };
      const fga = s.fga || 1;
      const tovPct = s.tov ? ((s.tov / (fga + 0.44 * (s.fta || 0) + (s.tov || 0))) * 100).toFixed(1) : 'N/A';
      const ftPct = s.ft_pct ? (s.ft_pct * 100).toFixed(1) : (s.ftm && s.fta ? ((s.ftm / s.fta) * 100).toFixed(1) : 'N/A');
      const oppFtRate = 'N/A'; // opponent FT rate requires opponent data not in team stats
      const fg3a = s.fg3a || 0;
      const threeAttemptRate = fga > 0 ? ((fg3a / fga) * 100).toFixed(1) : 'N/A';
      return { tovPct, ftPct, oppFtRate, threeAttemptRate };
    };
    const m1 = computeMetrics(stats1);
    const m2 = computeMetrics(stats2);
    const lines = [];
    lines.push(`| Metric                | ${name1.padEnd(20)} | ${name2.padEnd(20)} |`);
    lines.push(`|-----------------------|${'-'.repeat(22)}|${'-'.repeat(22)}|`);
    lines.push(`| Turnover Rate         | ${(m1.tovPct + '%').padEnd(20)} | ${(m2.tovPct + '%').padEnd(20)} |`);
    lines.push(`| FT%                   | ${(m1.ftPct + '%').padEnd(20)} | ${(m2.ftPct + '%').padEnd(20)} |`);
    lines.push(`| 3PT Attempt Rate      | ${(m1.threeAttemptRate + '%').padEnd(20)} | ${(m2.threeAttemptRate + '%').padEnd(20)} |`);
    return lines.join('\n');
  };

  const scoutReport = `### KEY PLAYERS (Top 5 by PPG)
${team1}:
${formatRoster(p1.roster, team1)}

${team2}:
${formatRoster(p2.roster, team2)}

### RECENT FORM (Last 5)
${team1}: ${formatRecent(p1.recentGames, team1)}
${team2}: ${formatRecent(p2.recentGames, team2)}

### MATCHUP SCOUTING REPORT
${matchupReport || 'Scouting report unavailable.'}

### ADVANCED METRICS
${formatBart(p1.bart, team1)}
${formatBart(p2.bart, team2)}

### FOUR FACTORS
${formatFourFactors(p1.teamStats, team1)}
${formatFourFactors(p2.teamStats, team2)}

### TOURNAMENT-RELEVANT METRICS
${formatTournamentMetrics(p1.teamStats, p2.teamStats, team1, team2)}`;

  if (p1.bart || p2.bart) console.log(`  [Metrics] ${team1} #${p1.bart?.rank || '?'} vs ${team2} #${p2.bart?.rank || '?'}`);

  // Build consistency context
  let consistencyContext = '';
  if (roundNum >= 2) {
    const t1Rounds = advancedTeams[team1] || [];
    const t2Rounds = advancedTeams[team2] || [];
    if (t1Rounds.length > 0) consistencyContext += `You picked ${team1} to advance through rounds: ${t1Rounds.join(', ')}.\n`;
    if (t2Rounds.length > 0) consistencyContext += `You picked ${team2} to advance through rounds: ${t2Rounds.join(', ')}.\n`;
  }

  // Look up daily spread pick and spread for ATS consistency
  const garySpreadPick = dailySpreadPicks[`${team1}_${team2}`] || dailySpreadPicks[`${team2}_${team1}`] || null;
  const oddsKey1 = `${team1.toLowerCase()}_${team2.toLowerCase()}`;
  const oddsKey2 = `${team2.toLowerCase()}_${team1.toLowerCase()}`;
  const gameOdds = oddsMap[oddsKey1] || oddsMap[oddsKey2] || null;
  const spread = gameOdds?.spread ?? null;
  let spreadContext = (spread && garySpreadPick) ? getBracketSpreadContext(spread, team2, team1, garySpreadPick) : '';
  // If we have an ATS pick but no spread data, still enforce consistency for tight matchups
  if (garySpreadPick && !spread) {
    spreadContext = `\nYOUR ATS PICK: ${garySpreadPick}. Your bracket pick should be consistent with your ATS pick.`;
  }

  const prompt = `You are Gary — filling out your March Madness bracket.

${bracketAwareness}

## THIS GAME

**${seed1} ${team1} vs ${seed2} ${team2}**
Region: ${region} | Round: ${roundName}
${spreadContext}
${consistencyContext ? '\n## YOUR BRACKET PATH\n' + consistencyContext : ''}
${regionContext ? '\n## REGION CONTEXT\n' + regionContext : ''}
${momentumContext ? '\n## BRACKET STATUS\n' + momentumContext : ''}

## SCOUTING DATA

${scoutReport}

## THE GAME

Picture this game happening. Think about how it actually plays out on the court — not just who looks better on paper, but what happens when these two specific teams meet in this specific tournament game. Think about what could happen, not just what should happen.
${roundNum >= 4 ? `\nTOURNAMENT CONTEXT: The last time all four 1-seeds reached the Final Four was 2008. It almost never happens. By the ${roundName}, the lower seed has already won 3-4 straight tournament games to get here — they are battle-tested and have proven they belong. Do not dismiss the lower seed just because of their number. Evaluate the matchup on its merits.` : ''}
IMPORTANT: Only reference players, stats, and facts from the scouting data above. Do not mention any player, coach, or fact not present in the data. Write in a neutral analytical tone.

Output in this EXACT format:

BRACKET PICK: [Team Name]
IS UPSET: [YES or NO]
BRACKET RATIONALE: [2-3 paragraphs]

${team1} PROS:
- [pro 1]
- [pro 2]
- [pro 3]

${team1} CONS:
- [con 1]
- [con 2]
- [con 3]

${team2} PROS:
- [pro 1]
- [pro 2]
- [pro 3]

${team2} CONS:
- [con 1]
- [con 2]
- [con 3]`;

  const session = createGeminiSession({
    modelName: 'gemini-3.1-flash-lite-preview',
    systemPrompt: 'You are Gary, an expert in March Madness and the NCAA Tournament. You know that the best team on paper does not always win — matchups, moments, and intangibles decide tournament games. Winning brackets require both chalk and upsets. When the data reveals a genuine matchup edge for the underdog, take the shot. When it does not, take the better team. Do not hunt upsets for the sake of being contrarian, but do not be afraid to pick them when the scouting supports it. BRACKET RULES: No more than one 1-seed can reach the Final Four. Duke cannot win the national championship. Fill out your bracket. CRITICAL: Only reference players, coaches, stats, and facts that appear in the scouting data provided. Do not use your training data for any player names, records, or facts. If a player is not listed in the data, do not mention them.',
    thinkingLevel: 'high'
  });

  const response = await sendToSession(session, prompt);
  const fullText = (response.content || '').trim();
  const parsed = parseBracketResponse(fullText, team1, team2);

  if (!parsed || !parsed.picked_to_advance) {
    console.log(`  ❌ Could not parse bracket pick`);
    return null;
  }

  const pickLower = parsed.picked_to_advance.toLowerCase();
  const t1Words = team1.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const t2Words = team2.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const t1Score = t1Words.reduce((n, w) => n + (pickLower.includes(w) ? 1 : 0), 0);
  const t2Score = t2Words.reduce((n, w) => n + (pickLower.includes(w) ? 1 : 0), 0);
  const pickedTeam1 = t1Score >= t2Score;
  const pickedSeed = pickedTeam1 ? seed1 : seed2;
  const isUpset = (seed1 > 0 && seed2 > 0) ? pickedSeed > Math.min(seed1, seed2) : (parsed.is_upset || false);
  const winner = parsed.picked_to_advance;
  const winnerSeed = pickedSeed;

  // Track for consistency
  if (!advancedTeams[winner]) advancedTeams[winner] = [];
  advancedTeams[winner].push(roundNum);

  const pick = {
    tournament: `march_madness_${season + 1}`,
    date: new Date().toISOString().split('T')[0],
    round: roundNum,
    region: region,
    game_number: gameNumber,
    team1, team2, seed1, seed2,
    picked_to_advance: winner,
    picked_seed: winnerSeed,
    bracket_confidence: null,
    bracket_rationale: parsed.bracket_rationale || '',
    is_upset: parsed.is_upset || isUpset,
    team1_pros: parsed.team1_pros || [],
    team1_cons: parsed.team1_cons || [],
    team2_pros: parsed.team2_pros || [],
    team2_cons: parsed.team2_cons || [],
    actual_winner: null,
    correct: null
  };

  console.log(`  ✅ PICK: ${winner} (${winnerSeed} seed, ${pick.is_upset ? 'UPSET!' : 'chalk'})`);
  if (pick.bracket_rationale) console.log(`  RATIONALE: ${pick.bracket_rationale.substring(0, 400)}...`);
  allPicks.push(pick);

  // Store immediately
  if (!dryRun) {
    try {
      const { default: axios } = await import('axios');
      await axios({ method: 'POST', url: `${supabaseUrl}/rest/v1/${tableName}`, data: pick,
        headers: { 'apikey': adminKey, 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }
      });
      console.log(`  📤 Stored to ${tableName}`);
    } catch (e) { console.error(`  ❌ Storage error: ${e.message}`); }
  }

  return { winner, winnerSeed, region, pick };
}

// ═══════════════════════════════════════════════════════════════
// Between-round review: builds a bracket status summary for Gary
// Shows picks so far, upset count, and region picture.
// Awareness only — no instructions about what to do.
// ═══════════════════════════════════════════════════════════════
function buildBetweenRoundReview(completedRoundNum) {
  const roundNames = { 0: 'First Four', 1: 'Round of 64', 2: 'Round of 32', 3: 'Sweet 16', 4: 'Elite 8', 5: 'Final Four' };
  const completedRoundName = roundNames[completedRoundNum] || `Round ${completedRoundNum}`;

  // Gather picks from the completed round
  const roundPicks = allPicks.filter(p => p.round === completedRoundNum);
  if (roundPicks.length === 0) return '';

  const lines = [];
  lines.push(`BRACKET STATUS AFTER ${completedRoundName.toUpperCase()}`);
  lines.push('━'.repeat(60));

  // Organize by region
  const byRegion = {};
  for (const p of roundPicks) {
    const r = p.region || 'TBD';
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(p);
  }

  lines.push('');
  lines.push(`Teams you picked to advance from ${completedRoundName}:`);
  for (const [region, picks] of Object.entries(byRegion)) {
    const advancers = picks.map(p => `${p.picked_seed} ${p.picked_to_advance}${p.is_upset ? ' [UPSET]' : ''}`).join(', ');
    lines.push(`  ${region}: ${advancers}`);
  }

  // Total upsets across entire bracket so far
  const totalUpsets = allPicks.filter(p => p.is_upset).length;
  lines.push('');
  lines.push(`Total upsets picked so far: ${totalUpsets}`);
  lines.push(`Every tournament has upsets — winning brackets typically include a healthy range of them.`);

  // Region picture: who is left in each region (most recent advancers per region)
  lines.push('');
  lines.push('Region picture (teams remaining):');

  // Who advanced from the most recent round per region
  const latestRoundByRegion = {};
  for (const p of allPicks) {
    const r = p.region || 'TBD';
    if (!latestRoundByRegion[r]) latestRoundByRegion[r] = 0;
    if (p.round > latestRoundByRegion[r]) latestRoundByRegion[r] = p.round;
  }
  for (const [region, latestRound] of Object.entries(latestRoundByRegion)) {
    const remaining = allPicks
      .filter(p => p.region === region && p.round === latestRound)
      .map(p => `${p.picked_seed} ${p.picked_to_advance}`);
    if (remaining.length > 0) {
      lines.push(`  ${region}: ${remaining.join(', ')}`);
    }
  }

  lines.push('━'.repeat(60));
  return lines.join('\n');
}

// --- FIRST FOUR (actual results — games already played) ---
console.log(`\n${'═'.repeat(60)}`);
console.log(`FIRST FOUR — ACTUAL RESULTS (games already played)`);
console.log(`${'═'.repeat(60)}`);
const firstFourActualResults = {
  'Texas Longhorns': { seed: 11, opponent: 'NC State Wolfpack' },
  'Miami (OH) RedHawks': { seed: 11, opponent: 'SMU Mustangs' },
  'Howard Bison': { seed: 16, opponent: 'UMBC Retrievers' },
  'Prairie View A&M Panthers': { seed: 16, opponent: 'Lehigh Mountain Hawks' },
};
const firstFourWinners = {};
for (const [winner, info] of Object.entries(firstFourActualResults)) {
  console.log(`  ✅ ${info.seed} ${winner} beat ${info.opponent} (ACTUAL RESULT)`);
  firstFourWinners[`${winner}_${info.opponent}`] = { winner, winnerSeed: info.seed, region: 'TBD' };
  firstFourWinners[`${info.opponent}_${winner}`] = { winner, winnerSeed: info.seed, region: 'TBD' };
  // Track for consistency
  if (!advancedTeams[winner]) advancedTeams[winner] = [];
  advancedTeams[winner].push(0);
}

// --- ROUND OF 64 ---
// Inject First Four winners into TBD R64 slots
const ffWinnersList = [
  ...Object.values(firstFourWinners),
  ...existingPicks.filter(p => p.round === 0 && p.picked_to_advance).map(p => ({
    winner: p.picked_to_advance, winnerSeed: p.picked_seed || 0, region: p.region || 'TBD'
  }))
];
for (const g of r64Games) {
  if (g.team1 === 'TBD' || g.team2 === 'TBD') {
    // Match First Four winners to TBD slots by seed + opponent
    // TBD slots have one known team (e.g., Florida 1-seed) and one TBD (the First Four winner)
    const knownTeam = g.team1 !== 'TBD' ? g.team1 : g.team2;
    const knownSeed = g.team1 !== 'TBD' ? g.seed1 : g.seed2;

    for (const ffw of ffWinnersList) {
      // Match by seed compatibility: 16-seed FF winner → 1-seed opponent, 11-seed FF winner → 6-seed opponent
      const ffSeed = ffw.winnerSeed;
      const expectedOpponentSeed = ffSeed >= 16 ? 1 : (ffSeed >= 11 ? 6 : 0);

      if (knownSeed === expectedOpponentSeed || knownSeed === 0) {
        // Also check region via lookup table if available
        const ffRegion = lookupRegion(ffw.winner);
        const knownRegion = lookupRegion(knownTeam);
        if (ffRegion === knownRegion || ffRegion === 'TBD' || knownRegion === 'TBD') {
          if (g.team1 === 'TBD') { g.team1 = ffw.winner; g.seed1 = ffSeed; }
          else if (g.team2 === 'TBD') { g.team2 = ffw.winner; g.seed2 = ffSeed; }
          break;
        }
      }
    }
    if (g.team1 !== 'TBD' && g.team2 !== 'TBD') {
      console.log(`  [First Four] Filled TBD slot: ${g.seed1} ${g.team1} vs ${g.seed2} ${g.team2}`);
    }
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`ROUND OF 64 (${r64Games.length} games)`);
console.log(`${'═'.repeat(60)}`);
const r64Results = []; // ordered results for constructing R32
for (let i = 0; i < r64Games.length; i++) {
  const g = r64Games[i];
  if (g.team1 === 'TBD' || g.team2 === 'TBD') { console.log(`  SKIP: TBD game (First Four not resolved)`); r64Results.push(null); continue; }
  console.log(`\n[R64 ${i+1}/${r64Games.length}] ${g.seed1} ${g.team1} vs ${g.seed2} ${g.team2} (${g.region})`);
  const gameNum = ({ 1:0, 8:1, 5:2, 4:3, 6:4, 3:5, 7:6, 2:7 }[Math.min(g.seed1, g.seed2)] ?? i);
  const result = await pickBracketGame(g.team1, g.team2, g.seed1, g.seed2, g.region, 1, gameNum);
  r64Results.push(result);
}

// --- Between-round review: R64 complete ---
const r64Review = buildBetweenRoundReview(1);
if (r64Review) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('BRACKET STATUS AFTER ROUND OF 64');
  console.log(`${'═'.repeat(60)}`);
  console.log(r64Review);
}

// --- ROUND OF 32 (constructed from R64 winners) ---
// Group R64 results by region, then pair them
const regionResults = {};
for (const r of r64Results) {
  if (!r) continue;
  if (!regionResults[r.region]) regionResults[r.region] = [];
  regionResults[r.region].push(r);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`ROUND OF 32 (constructed from R64 winners)`);
console.log(`${'═'.repeat(60)}`);
const r32Results = [];
for (const [region, winners] of Object.entries(regionResults)) {
  console.log(`\n  --- ${region} Region ---`);
  for (let p = 0; p < winners.length - 1; p += 2) {
    const w1 = winners[p];
    const w2 = winners[p + 1];
    if (!w1?.winner || !w2?.winner) { r32Results.push(null); continue; }
    console.log(`\n[R32] ${w1.winnerSeed} ${w1.winner} vs ${w2.winnerSeed} ${w2.winner} (${region})`);
    const regionCtx = `${region} Region — these teams both won their R64 games. The winner advances to the Sweet 16.`;
    const momentum1 = `${w1.winner} advanced from R64.`;
    const momentum2 = `${w2.winner} advanced from R64.`;
    const bracketStatus = r64Review ? `\n\n${r64Review}` : '';
    const result = await pickBracketGame(w1.winner, w2.winner, w1.winnerSeed, w2.winnerSeed, region, 2, Math.floor(p / 2), regionCtx, `${momentum1}\n${momentum2}${bracketStatus}`);
    r32Results.push(result);
  }
}

// --- Between-round review: R32 complete ---
const r32Review = buildBetweenRoundReview(2);
if (r32Review) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('BRACKET STATUS AFTER ROUND OF 32');
  console.log(`${'═'.repeat(60)}`);
  console.log(r32Review);
}

// --- SWEET 16 (constructed from R32 winners) ---
const r32ByRegion = {};
for (const r of r32Results) {
  if (!r) continue;
  if (!r32ByRegion[r.region]) r32ByRegion[r.region] = [];
  r32ByRegion[r.region].push(r);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`SWEET 16 (constructed from R32 winners)`);
console.log(`${'═'.repeat(60)}`);
const s16Results = [];
const s16BracketStatus = r32Review ? `\n\n${r32Review}` : '';
for (const [region, winners] of Object.entries(r32ByRegion)) {
  console.log(`\n  --- ${region} Region ---`);
  for (let p = 0; p < winners.length - 1; p += 2) {
    const w1 = winners[p];
    const w2 = winners[p + 1];
    if (!w1?.winner || !w2?.winner) { s16Results.push(null); continue; }
    console.log(`\n[S16] ${w1.winnerSeed} ${w1.winner} vs ${w2.winnerSeed} ${w2.winner} (${region})`);
    const regionCtx = `${region} Region Sweet 16 — winner advances to the Elite 8. Consider which team has the profile for a deep tournament run.`;
    const momentum = `${w1.winner} has won 2 straight tournament games.\n${w2.winner} has won 2 straight tournament games.${s16BracketStatus}`;
    const result = await pickBracketGame(w1.winner, w2.winner, w1.winnerSeed, w2.winnerSeed, region, 3, p / 2, regionCtx, momentum);
    s16Results.push(result);
  }
}

// --- Between-round review: S16 complete ---
const s16Review = buildBetweenRoundReview(3);
if (s16Review) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('BRACKET STATUS AFTER SWEET 16');
  console.log(`${'═'.repeat(60)}`);
  console.log(s16Review);
}

// --- ELITE 8 (constructed from S16 winners) ---
const s16ByRegion = {};
for (const r of s16Results) {
  if (!r) continue;
  if (!s16ByRegion[r.region]) s16ByRegion[r.region] = [];
  s16ByRegion[r.region].push(r);
}
console.log(`\nS16 results by region: ${Object.entries(s16ByRegion).map(([r, w]) => `${r}: ${w.length}`).join(', ') || 'NONE'}`);

console.log(`\n${'═'.repeat(60)}`);
console.log(`ELITE 8 (constructed from S16 winners)`);
console.log(`${'═'.repeat(60)}`);
const e8Results = [];
const e8BracketStatus = s16Review ? `\n\n${s16Review}` : '';
for (const [region, winners] of Object.entries(s16ByRegion)) {
  if (winners.length < 2) { console.log(`  Skipping ${region} — only ${winners.length} S16 winner(s)`); continue; }
  const w1 = winners[0];
  const w2 = winners[1];
  console.log(`\n[E8] ${w1.winnerSeed} ${w1.winner} vs ${w2.winnerSeed} ${w2.winner} (${region})`);
  const regionCtx = `${region} Region Elite 8 — the winner goes to the Final Four. This is the last game in this region. Who comes out of the ${region}?`;
  const momentum = `${w1.winner} has won 3 straight tournament games to reach this point.\n${w2.winner} has won 3 straight tournament games to reach this point.${e8BracketStatus}`;
  const result = await pickBracketGame(w1.winner, w2.winner, w1.winnerSeed, w2.winnerSeed, region, 4, 0, regionCtx, momentum);
  e8Results.push(result);
}

// --- Between-round review: E8 complete ---
const e8Review = buildBetweenRoundReview(4);
if (e8Review) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('BRACKET STATUS AFTER ELITE 8');
  console.log(`${'═'.repeat(60)}`);
  console.log(e8Review);
}

// --- FINAL FOUR ---
console.log(`\n${'═'.repeat(60)}`);
console.log(`FINAL FOUR`);
console.log(`${'═'.repeat(60)}`);
const ffResults = [];
const ffBracketStatus = e8Review ? `\n\n${e8Review}` : '';
if (e8Results.length >= 2) {
  // Standard FF pairing: region winners face each other (East vs West, South vs Midwest typically)
  const ffPairs = e8Results.length >= 4 ? [[0, 1], [2, 3]] : [[0, 1]];
  for (let p = 0; p < ffPairs.length; p++) {
    const [i1, i2] = ffPairs[p];
    const w1 = e8Results[i1];
    const w2 = e8Results[i2];
    if (!w1?.winner || !w2?.winner) continue;
    console.log(`\n[FF] ${w1.winnerSeed} ${w1.winner} (${w1.region}) vs ${w2.winnerSeed} ${w2.winner} (${w2.region})`);
    const regionCtx = `Final Four — ${w1.region} champion vs ${w2.region} champion. The winner plays for the National Championship.`;
    const momentum = `${w1.winner} won the ${w1.region} Region — 4 straight tournament wins.\n${w2.winner} won the ${w2.region} Region — 4 straight tournament wins.${ffBracketStatus}`;
    const result = await pickBracketGame(w1.winner, w2.winner, w1.winnerSeed, w2.winnerSeed, 'Final Four', 5, p, regionCtx, momentum);
    ffResults.push(result);
  }
}

// --- Between-round review: FF complete ---
const ffReview = buildBetweenRoundReview(5);
if (ffReview) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('BRACKET STATUS AFTER FINAL FOUR');
  console.log(`${'═'.repeat(60)}`);
  console.log(ffReview);
}

// --- CHAMPIONSHIP ---
if (ffResults.length >= 2) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`NATIONAL CHAMPIONSHIP`);
  console.log(`${'═'.repeat(60)}`);
  const w1 = ffResults[0];
  const w2 = ffResults[1];
  console.log(`\n[CHAMPIONSHIP] ${w1.winnerSeed} ${w1.winner} vs ${w2.winnerSeed} ${w2.winner}`);
  const dukeInGame = w1.winner.includes('Duke') || w2.winner.includes('Duke');
  const regionCtx = `National Championship Game. This is the last game of the tournament. Who wins it all?${dukeInGame ? ' Duke has not won a national championship since 2015 — consider whether their opponent has the matchup profile to deny them.' : ''}`;
  const champBracketStatus = ffReview ? `\n\n${ffReview}` : '';
  const momentum = `${w1.winner} has won 5 straight tournament games to reach the title game.\n${w2.winner} has won 5 straight tournament games to reach the title game.${champBracketStatus}`;
  await pickBracketGame(w1.winner, w2.winner, w1.winnerSeed, w2.winnerSeed, 'Championship', 6, 0, regionCtx, momentum);
}

// Summary with chalk/upset balance check
console.log(`\n${'═'.repeat(60)}`);
console.log(`BRACKET SUMMARY: ${allPicks.length} picks generated`);
const upsets = allPicks.filter(p => p.is_upset);
const chalkPicks = allPicks.filter(p => !p.is_upset);
console.log(`CHALK: ${chalkPicks.length} | UPSETS: ${upsets.length}`);
if (upsets.length > 0) {
  console.log(`\nUPSETS (${upsets.length}):`);
  for (const u of upsets) {
    console.log(`  🔥 ${u.picked_to_advance} (${u.picked_seed} seed) over ${u.picked_to_advance === u.team1 ? u.team2 : u.team1}`);
  }
}
// Bracket summary stats (for our logging only — not shown to Gary)
if (allPicks.length >= 20) {
  const upsetPct = (upsets.length / allPicks.length * 100).toFixed(0);
  console.log(`\nBracket profile: ${upsets.length} upsets in ${allPicks.length} games (${upsetPct}%)`);
}
console.log(`${'═'.repeat(60)}\n`);

process.exit(0);
