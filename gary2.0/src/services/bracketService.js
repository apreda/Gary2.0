/**
 * bracketService.js — Syncs BDL NCAAB bracket data to Supabase
 * and enriches with Gary's picks + game results.
 *
 * Data flow:
 *   BDL bracket API → process into regions → store in ncaab_bracket table
 *   daily_picks + game_results → match to bracket matchups → enrich
 *
 * iOS reads the ncaab_bracket table and renders directly.
 */

import { supabase } from '../supabaseClient.js';
import { ballDontLieService } from './ballDontLieService.js';
import { ncaabSeason } from '../utils/dateUtils.js';

// BDL round numbers → our round numbers (1-indexed for iOS)
// BDL: 0=First Four, 1=R64, 2=R32, 3=S16, 4=E8, 5=FF, 6=Championship
const BDL_ROUND_MAP = {
  0: { round: 0, name: 'FIRST FOUR' },
  1: { round: 1, name: 'ROUND OF 64' },
  2: { round: 2, name: 'ROUND OF 32' },
  3: { round: 3, name: 'SWEET 16' },
  4: { round: 4, name: 'ELITE 8' },
  5: { round: 5, name: 'FINAL FOUR' },
  6: { round: 6, name: 'CHAMPIONSHIP' },
};

// Standard region names (NCAA uses these every year)
const REGION_NAMES = ['East', 'West', 'South', 'Midwest'];

/**
 * Normalize BDL game status to consistent values.
 * BDL uses "post" for completed, we normalize to "final".
 */
function normalizeStatus(bdlStatus, hasWinner) {
  if (!bdlStatus) return hasWinner ? 'final' : 'scheduled';
  const s = bdlStatus.toLowerCase();
  if (s === 'post' || s === 'closed' || s === 'complete') return 'final';
  if (s === 'in_progress' || s === 'inprogress' || s === 'live') return 'live';
  if (s === 'pre' || s === 'scheduled' || s === 'created') return 'scheduled';
  return s;
}

/**
 * Generate a short name from a team name.
 * e.g. "Duke Blue Devils" → "DUKE", "North Carolina Tar Heels" → "UNC"
 */
const KNOWN_SHORT_NAMES = {
  // Power conferences & blue bloods
  'north carolina': 'UNC', 'unc': 'UNC',
  'uconn': 'UCONN', 'connecticut': 'UCONN',
  'duke': 'DUKE', 'kansas': 'KU', 'kentucky': 'UK',
  'auburn': 'AUB', 'alabama': 'BAMA',
  'louisville': 'LOU', 'michigan': 'MICH',
  'missouri': 'MIZZ', 'florida': 'UF',
  'creighton': 'CREI', 'villanova': 'NOVA',
  'gonzaga': 'GONZ', 'marquette': 'MARQ',
  'purdue': 'PUR', 'clemson': 'CLEM',
  'illinois': 'ILL', 'wisconsin': 'WISC',
  'tennessee': 'TENN', 'arizona': 'ARIZ',
  'dayton': 'DAY', 'nebraska': 'NEB',
  'colorado': 'COL', 'baylor': 'BAY',
  'texas': 'TEX', 'oregon': 'ORE',
  'arkansas': 'ARK', 'houston': 'HOU',
  'indiana': 'IND', 'memphis': 'MEM',
  'xavier': 'XAV', 'cincinnati': 'CIN',
  'pittsburgh': 'PITT', 'syracuse': 'CUSE',
  'wake forest': 'WAKE', 'stanford': 'STAN',
  'iowa': 'IOWA', 'minnesota': 'MINN',
  'northwestern': 'NW', 'rutgers': 'RUT',
  'maryland': 'UMD', 'colorado state': 'CSU', 'colorado st': 'CSU',
  // State schools
  'michigan state': 'MSU', 'michigan st': 'MSU',
  'ohio state': 'OSU', 'ohio st': 'OSU',
  'florida state': 'FSU', 'florida st': 'FSU',
  'penn state': 'PSU', 'penn st': 'PSU',
  'iowa state': 'ISU', 'iowa st': 'ISU',
  'oklahoma state': 'OKST', 'oklahoma st': 'OKST',
  'mississippi state': 'MSST', 'mississippi st': 'MSST',
  'kansas state': 'KSU', 'kansas st': 'KSU',
  'san diego state': 'SDSU', 'san diego st': 'SDSU',
  'utah state': 'USU', 'utah st': 'USU',
  'boise state': 'BSU', 'boise st': 'BSU',
  'long beach state': 'LBSU', 'long beach st': 'LBSU',
  'norfolk state': 'NORF', 'norfolk st': 'NORF',
  'montana state': 'MTST', 'montana st': 'MTST',
  'alabama state': 'ALST',
  'mount st. mary\'s': 'MSM',
  // Acronym schools
  'texas a&m': 'TAMU', 'texas tech': 'TTU',
  'virginia tech': 'VT', 'georgia tech': 'GT',
  'brigham young': 'BYU', 'byu': 'BYU',
  'southern california': 'USC', 'usc': 'USC',
  'ucla': 'UCLA', 'lsu': 'LSU', 'smu': 'SMU', 'tcu': 'TCU',
  'uc san diego': 'UCSD', 'vcu': 'VCU',
  // Mid-majors & others
  'st. mary\'s': 'SMC', 'saint mary\'s': 'SMC',
  'st. john\'s': 'SJU', 'saint john\'s': 'SJU',
  'st. peter\'s': 'SPU', 'saint peter\'s': 'SPU',
  'grand canyon': 'GCU',
  'ole miss': 'OLEM', 'mississippi': 'OLEM',
  'south carolina': 'SC',
  'col. of charleston': 'COFC', 'college of charleston': 'COFC',
  'drake': 'DRAKE', 'yale': 'YALE',
  'omaha': 'OMAHA', 'american': 'AMR',
  'saint francis': 'SFU',
};

function getShortName(teamName) {
  if (!teamName) return 'TBD';
  const lower = teamName.toLowerCase().trim();

  // Check known abbreviations first
  for (const [key, val] of Object.entries(KNOWN_SHORT_NAMES)) {
    if (lower === key || lower.startsWith(key + ' ')) return val;
  }

  // Use the college/short name field if it's short enough
  if (teamName.length <= 5) return teamName.toUpperCase();

  // Take first word, cap at 4 chars
  const first = teamName.split(/\s+/)[0];
  return first.substring(0, 4).toUpperCase();
}

/**
 * Process raw BDL bracket entries into a structured format.
 * Groups R64 games into 4 regions (by position order).
 * FF and Championship go into a separate "finalFour" group.
 */
function processBracketData(bdlEntries) {
  if (!bdlEntries || bdlEntries.length === 0) return null;

  // Separate by round
  const byRound = {};
  for (const entry of bdlEntries) {
    const roundNum = typeof entry.round === 'number' ? entry.round : parseInt(entry.round);
    if (!byRound[roundNum]) byRound[roundNum] = [];
    byRound[roundNum].push(entry);
  }

  // Sort each round by position/date for consistent ordering
  for (const round of Object.values(byRound)) {
    round.sort((a, b) => {
      // Sort by date first, then by team seed if available
      const dateA = a.date || a.scheduled || '';
      const dateB = b.date || b.scheduled || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const seedA = parseInt(a.home_team?.seed) || 99;
      const seedB = parseInt(b.home_team?.seed) || 99;
      return seedA - seedB;
    });
  }

  // Assign regions based on R64 game positions (8 games per region)
  // If BDL provides a region field, use that instead
  const r64Games = byRound[1] || [];
  const regionAssignments = {}; // teamId → regionIndex

  for (let i = 0; i < r64Games.length; i++) {
    const regionIdx = Math.floor(i / 8);
    const game = r64Games[i];

    // Check if BDL provides region data
    if (game.region) {
      // Use BDL's region assignment
      const regionName = game.region;
      if (game.home_team?.id) regionAssignments[game.home_team.id] = regionName;
      if (game.away_team?.id) regionAssignments[game.away_team.id] = regionName;
    } else {
      // Fall back to position-based assignment
      const regionName = REGION_NAMES[regionIdx] || `Region ${regionIdx + 1}`;
      if (game.home_team?.id) regionAssignments[game.home_team.id] = regionName;
      if (game.away_team?.id) regionAssignments[game.away_team.id] = regionName;
    }
  }

  // Process all entries into matchups
  const matchups = bdlEntries.map((entry, idx) => {
    const roundNum = typeof entry.round === 'number' ? entry.round : parseInt(entry.round);
    const roundInfo = BDL_ROUND_MAP[roundNum] || { round: roundNum, name: `ROUND ${roundNum}` };

    const homeTeam = entry.home_team ? {
      bdl_id: entry.home_team.id,
      name: entry.home_team.full_name || entry.home_team.name || entry.home_team.college || 'TBD',
      seed: parseInt(entry.home_team.seed) || 0,
      short_name: getShortName(entry.home_team.college || entry.home_team.name || entry.home_team.full_name),
      score: entry.home_team_score ?? null,
    } : null;

    const awayTeam = entry.away_team ? {
      bdl_id: entry.away_team.id,
      name: entry.away_team.full_name || entry.away_team.name || entry.away_team.college || 'TBD',
      seed: parseInt(entry.away_team.seed) || 0,
      short_name: getShortName(entry.away_team.college || entry.away_team.name || entry.away_team.full_name),
      score: entry.away_team_score ?? null,
    } : null;

    // Determine winner from scores (if game is complete)
    let winner = null;
    if (homeTeam?.score != null && awayTeam?.score != null && homeTeam.score !== awayTeam.score) {
      winner = homeTeam.score > awayTeam.score ? 'home' : 'away';
    }

    // Determine region from team IDs
    let region = null;
    if (roundNum <= 4) {
      // Regional rounds — look up team region
      const homeRegion = homeTeam?.bdl_id ? regionAssignments[homeTeam.bdl_id] : null;
      const awayRegion = awayTeam?.bdl_id ? regionAssignments[awayTeam.bdl_id] : null;
      region = homeRegion || awayRegion || null;
    }
    // FF and Championship don't belong to a single region

    // Determine position within round for this region
    const roundGames = byRound[roundNum] || [];
    const position = roundGames.indexOf(entry);

    return {
      id: `${(region || 'ff').toLowerCase().replace(/\s/g, '')}-r${roundNum}-${position}`,
      bdl_game_id: entry.id || null,
      round: roundInfo.round,
      round_name: roundInfo.name,
      position: position >= 0 ? position : idx,
      region,
      top_team: awayTeam,   // Away team on top (higher seed typically)
      bottom_team: homeTeam, // Home team on bottom
      winner,
      location: entry.location || null,
      game_date: entry.date || entry.scheduled || null,
      game_status: normalizeStatus(entry.status, winner),
      gary_pick: null, // Enriched separately
    };
  });

  // Get unique region names from the data
  const regions = [...new Set(matchups.filter(m => m.region).map(m => m.region))];

  return {
    regions: regions.length > 0 ? regions : REGION_NAMES,
    matchups,
    total_games: matchups.length,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Match Gary's picks from daily_picks to bracket matchups.
 * Also matches game_results for W/L status.
 */
async function enrichWithPicksAndResults(bracketData) {
  if (!bracketData?.matchups?.length) return bracketData;

  try {
    // Fetch all NCAAB picks from the tournament window (mid-March to early April)
    const now = new Date();
    const year = now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear();
    const startDate = `${year}-03-10`;
    const endDate = `${year}-04-10`;

    // Fetch picks from daily_picks table
    const { data: pickRows, error: pickErr } = await supabase
      .from('daily_picks')
      .select('picks, date')
      .gte('date', startDate)
      .lte('date', endDate);

    if (pickErr) {
      console.warn('[Bracket] Error fetching picks:', pickErr.message);
    }

    // Flatten all NCAAB picks across all dates
    const allNcaabPicks = [];
    for (const row of (pickRows || [])) {
      const picks = Array.isArray(row.picks) ? row.picks
        : (typeof row.picks === 'string' ? JSON.parse(row.picks) : []);
      for (const pick of picks) {
        if (pick.league === 'NCAAB') {
          allNcaabPicks.push({ ...pick, pick_date: row.date });
        }
      }
    }

    // Fetch game results
    const { data: resultRows, error: resultErr } = await supabase
      .from('game_results')
      .select('*')
      .eq('league', 'NCAAB')
      .gte('game_date', startDate)
      .lte('game_date', endDate);

    if (resultErr) {
      console.warn('[Bracket] Error fetching results:', resultErr.message);
    }

    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

    // Match picks and results to bracket matchups
    for (const matchup of bracketData.matchups) {
      const topNorm = normalize(matchup.top_team?.name);
      const botNorm = normalize(matchup.bottom_team?.name);
      const topShort = normalize(matchup.top_team?.short_name);
      const botShort = normalize(matchup.bottom_team?.short_name);

      if (!topNorm && !botNorm) continue;

      // Find matching pick
      const matchedPick = allNcaabPicks.find(p => {
        const homeNorm = normalize(p.homeTeam);
        const awayNorm = normalize(p.awayTeam);
        const matchesTop = [topNorm, topShort].some(t => t && (
          homeNorm.includes(t) || awayNorm.includes(t) || t.includes(homeNorm) || t.includes(awayNorm)
        ));
        const matchesBot = [botNorm, botShort].some(b => b && (
          homeNorm.includes(b) || awayNorm.includes(b) || b.includes(homeNorm) || b.includes(awayNorm)
        ));
        return matchesTop && matchesBot;
      });

      if (matchedPick) {
        // Find matching result
        const matchedResult = (resultRows || []).find(r => {
          const rMatchup = normalize(r.matchup || '');
          return (rMatchup.includes(topNorm) || rMatchup.includes(botNorm)) &&
                 (rMatchup.includes(topNorm) && rMatchup.includes(botNorm));
        });

        matchup.gary_pick = {
          pick_text: matchedPick.pick || matchedPick.pick_text || null,
          type: matchedPick.type || null,
          confidence: matchedPick.confidence || null,
          odds: matchedPick.odds || null,
          rationale: matchedPick.rationale || null,
          result: matchedResult?.result || null, // W, L, P
          final_score: matchedResult?.final_score || null,
        };
      }
    }
  } catch (e) {
    console.warn('[Bracket] Error enriching with picks/results:', e.message);
  }

  return bracketData;
}

/**
 * Sync bracket from BDL to Supabase.
 * Fetches fresh data, processes into regions, enriches with picks/results, stores.
 */
export async function syncBracketToSupabase(season) {
  const s = season || ncaabSeason();
  console.log(`[Bracket] Syncing NCAAB bracket for season ${s}...`);

  // 1. Fetch from BDL
  const rawBracket = await ballDontLieService.getNcaabBracket(s);
  if (!rawBracket || rawBracket.length === 0) {
    console.log('[Bracket] No bracket data from BDL (not yet available)');
    return { success: false, reason: 'no_data' };
  }
  console.log(`[Bracket] Got ${rawBracket.length} bracket entries from BDL`);

  // 2. Process into structured format
  const processed = processBracketData(rawBracket);
  if (!processed) {
    console.log('[Bracket] Failed to process bracket data');
    return { success: false, reason: 'processing_failed' };
  }
  console.log(`[Bracket] Processed: ${processed.total_games} games, regions: [${processed.regions.join(', ')}]`);

  // 3. Enrich with Gary's picks and results
  const enriched = await enrichWithPicksAndResults(processed);
  const picksMatched = enriched.matchups.filter(m => m.gary_pick).length;
  console.log(`[Bracket] Enriched: ${picksMatched} games matched with Gary's picks`);

  // 4. Store in Supabase
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  try {
    const { default: axios } = await import('axios');
    await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/ncaab_bracket`,
      data: { season: s, data: enriched, updated_at: new Date().toISOString() },
      headers: {
        'apikey': adminKey,
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      params: { on_conflict: 'season' },
    });
    console.log(`[Bracket] Stored in Supabase (season ${s})`);
    return { success: true, games: enriched.total_games, picks_matched: picksMatched };
  } catch (e) {
    console.error('[Bracket] Supabase store failed:', e.message);
    return { success: false, reason: e.message };
  }
}

export const bracketService = {
  syncBracketToSupabase,
  processBracketData,
  enrichWithPicksAndResults,
};
