/**
 * Shared Utility Functions for Scout Report Builders
 *
 * Extracted from the monolithic scoutReportBuilder.js.
 * Contains pure utility helpers used across multiple per-sport modules.
 */

import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../../utils/dateUtils.js';

/**
 * Get current season year for a given sport key.
 * Dispatches to the centralized season functions in dateUtils.js.
 * Accepts both short keys (NBA, NFL) and BDL keys (basketball_nba, etc.).
 */
export function seasonForSport(sport) {
  const s = (sport || '').toUpperCase();
  if (s === 'NBA' || s === 'BASKETBALL_NBA') return nbaSeason();
  if (s === 'NFL' || s === 'AMERICANFOOTBALL_NFL') return nflSeason();
  if (s === 'NHL' || s === 'ICEHOCKEY_NHL') return nhlSeason();
  if (s === 'NCAAB' || s === 'BASKETBALL_NCAAB') return ncaabSeason();
  if (s === 'NCAAF' || s === 'AMERICANFOOTBALL_NCAAF') return nflSeason(); // NCAAF uses same timing as NFL
  // Fallback: Oct+ = current year, else previous year
  return nbaSeason();
}

/**
 * Robust player name matching — handles hyphenated names, API inconsistencies
 * e.g., "Shai Alexander" (RapidAPI) vs "Shai Gilgeous-Alexander" (BDL)
 */
export function playerNamesMatch(name1, name2) {
  const a = (name1 || '').toLowerCase().trim();
  const b = (name2 || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;

  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  if (aParts.length < 2 || bParts.length < 2) return false;

  const aFirst = aParts[0];
  const bFirst = bParts[0];
  const aLast = aParts.slice(1).join(' ');
  const bLast = bParts.slice(1).join(' ');

  // First names must match (or one is an initial/abbreviation/prefix of the other)
  // Handles: "N." → "Nicolas", "Nic" → "Nicolas", "Nicolas" → "Nicolas"
  const aClean = aFirst.replace('.', '');
  const bClean = bFirst.replace('.', '');
  const firstNameMatch = (aFirst === bFirst) ||
    (aClean.length === 1 && bFirst.startsWith(aClean)) ||
    (bClean.length === 1 && aFirst.startsWith(bClean)) ||
    (aClean.length >= 2 && bFirst.startsWith(aClean)) ||
    (bClean.length >= 2 && aFirst.startsWith(bClean));
  if (!firstNameMatch) return false;

  // Last names: exact match
  if (aLast === bLast) return true;

  // Last names: one contains the other (handles "alexander" in "gilgeous-alexander")
  if (aLast.includes(bLast) || bLast.includes(aLast)) return true;

  // Split hyphenated parts and check any part matches
  const aLastParts = aLast.split('-');
  const bLastParts = bLast.split('-');
  return aLastParts.some(ap => bLastParts.some(bp => ap === bp && ap.length > 2));
}

// Shared injury lookup — checks if a player name matches any entry in the injuredPlayers Map
export function getInjuryStatusFromMap(playerName, injuredPlayers) {
  const nameLower = playerName.toLowerCase();
  for (const [injName, injData] of injuredPlayers) {
    if (playerNamesMatch(nameLower, injName)) {
      return injData;
    }
  }
  return null;
}

// Shared OUT check — returns true only for definitively OUT players (not questionable/GTD)
export function isPlayerOutFromMap(playerName, injuredPlayers) {
  const injury = getInjuryStatusFromMap(playerName, injuredPlayers);
  if (!injury) return false;
  const status = injury.status?.toUpperCase() || '';
  return status.includes('OUT') || status.includes('INJURED') || status.includes('IR');
}

// Shared standings team lookup — searches standings array where team data is at s.team.*
// Combines word-boundary matching (NBA), college matching (NCAAB), and last-word fallback
export function findTeamInStandings(standings, teamName) {
  if (!standings || !teamName) return null;
  const nameLower = teamName.toLowerCase();
  const lastWord = nameLower.split(' ').pop();
  const lastWordRegex = new RegExp(`\\b${lastWord}\\b`, 'i');

  // Priority 1: Exact full name match
  let match = standings.find(s => (s.team?.full_name || '').toLowerCase() === nameLower);
  if (match) return match;

  // Priority 2: Full name contains search or vice versa
  match = standings.find(s => {
    const bdlName = (s.team?.name || '').toLowerCase();
    const bdlFullName = (s.team?.full_name || '').toLowerCase();
    return nameLower.includes(bdlName) || bdlFullName.includes(nameLower);
  });
  if (match) return match;

  // Priority 3: Word-boundary match on last word (prevents "Nets" matching "Hornets")
  match = standings.find(s => {
    const bdlName = (s.team?.name || '').toLowerCase();
    const bdlFullName = (s.team?.full_name || '').toLowerCase();
    return lastWordRegex.test(bdlName) || lastWordRegex.test(bdlFullName);
  });
  if (match) return match;

  // Priority 4: College name match (NCAAB)
  match = standings.find(s => {
    const bdlCollege = (s.team?.college || '').toLowerCase();
    return bdlCollege && (bdlCollege.includes(nameLower) || nameLower.includes(bdlCollege));
  });
  if (match) return match;

  return null;
}

export function normalizeSport(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'nba': 'NBA',
    'nfl': 'NFL',
    'ncaab': 'NCAAB',
    'ncaaf': 'NCAAF',
    'nhl': 'NHL'
  };
  return mapping[sport?.toLowerCase()] || sport?.toUpperCase() || 'UNKNOWN';
}

/**
 * Format game time
 */
export function formatGameTime(timeString) {
  try {
    const date = new Date(timeString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return timeString;
  }
}

export function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf',
    'NHL': 'icehockey_nhl',
    'basketball_nba': 'basketball_nba',
    'americanfootball_nfl': 'americanfootball_nfl',
    'basketball_ncaab': 'basketball_ncaab',
    'americanfootball_ncaaf': 'americanfootball_ncaaf',
    'icehockey_nhl': 'icehockey_nhl'
  };
  return mapping[sport] || null;
}

/**
 * Find team by name in teams array
 * Prioritizes exact matches to avoid USC Trojans vs Troy Trojans confusion
 */
export function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;

  // Team name aliases - The Odds API uses different names than BDL
  const TEAM_ALIASES = {
    'los angeles clippers': 'la clippers',  // BDL uses "LA Clippers"
    'la clippers': 'la clippers',
    'vegas golden knights': 'vegas',
    'montreal canadiens': 'montréal canadiens',
    'montréal canadiens': 'montréal canadiens',
    'utah hockey club': 'utah',
    'utah mammoth': 'utah',
    // Add more as needed
  };

  let normalized = teamName.toLowerCase().trim();

  // Apply alias if exists
  if (TEAM_ALIASES[normalized]) {
    normalized = TEAM_ALIASES[normalized];
  }

  // 1. Exact full_name match (highest priority)
  let match = teams.find(t => t.full_name?.toLowerCase() === normalized);
  if (match) return match;

  // 2. Exact college + mascot match (e.g., "Troy" college + "Trojans" mascot)
  const parts = normalized.split(/\s+/);
  if (parts.length >= 2) {
    match = teams.find(t => {
      const college = t.college?.toLowerCase() || '';
      const mascot = t.name?.toLowerCase() || '';
      // Both college and mascot must match parts of the search
      return parts.some(p => college.includes(p)) && parts.some(p => mascot.includes(p));
    });
    if (match) return match;
  }

  // 3. full_name contains entire search term
  match = teams.find(t => t.full_name?.toLowerCase().includes(normalized));
  if (match) return match;

  // 4. Search term contains entire full_name
  match = teams.find(t => normalized.includes(t.full_name?.toLowerCase()));
  if (match) return match;

  // 5. Abbreviation match
  match = teams.find(t => t.abbreviation?.toLowerCase() === normalized);
  if (match) return match;

  // 6. Mascot-only match (last resort for cases like "Clippers" matching "LA Clippers")
  const lastWord = parts[parts.length - 1];
  match = teams.find(t => t.name?.toLowerCase() === lastWord);
  if (match) return match;

  return null;
}

/**
 * Format streak
 */
export function formatStreak(standing) {
  if (!standing) return 'N/A';
  if (standing.win_streak && standing.win_streak > 0) {
    return `W${standing.win_streak}`;
  }
  if (standing.loss_streak && standing.loss_streak > 0) {
    return `L${standing.loss_streak}`;
  }
  return standing.streak || 'N/A';
}

export function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
