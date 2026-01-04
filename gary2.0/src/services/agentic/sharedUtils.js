export const EST_TIME_OPTIONS = {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};

export function normalizeTeamName(name = '') {
  return name
    .toLowerCase()
    .replace(/\blos angeles\b/g, 'la')
    .replace(/\bnew york\b/g, 'ny')
    .replace(/\bsan antonio\b/g, 'sa')
    .replace(/\bnew orleans\b/g, 'no')
    .replace(/\boklahoma city\b/g, 'okc')
    .replace(/\bgolden state\b/g, 'gs')
    .replace(/\blas vegas\b/g, 'vegas') // NHL/NFL alias
    .replace(/\butah hockey club\b/g, 'utah') // NHL alias
    .replace(/\butah mammoth\b/g, 'utah') // NHL alias
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mascotToken(name = '') {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}

export function resolveTeamByName(teamName = '', teams = []) {
  if (!teamName || !Array.isArray(teams)) return null;
  const targetCanonical = normalizeTeamName(teamName);
  const targetMascot = mascotToken(teamName);

  return (
    teams.find((team) => {
      const fullCanonical = normalizeTeamName(team.full_name || '');
      if (!fullCanonical) return false;
      if (fullCanonical === targetCanonical) return true;
      if (fullCanonical.includes(targetCanonical) || targetCanonical.includes(fullCanonical)) return true;
      const teamMascot = mascotToken(team.full_name);
      if (teamMascot && targetMascot && teamMascot === targetMascot) return true;
      return false;
    }) || null
  );
}

export function formatGameTimeEST(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return `${new Intl.DateTimeFormat('en-US', EST_TIME_OPTIONS).format(date)} EST`;
}

/**
 * Get YYYY-MM-DD date string for a date in America/New_York timezone
 * This prevents UTC rollover issues where a 7pm EST game on Dec 30 
 * shows up as Dec 31 in UTC.
 */
export function getEstDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function parseGameDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildMarketSnapshot(bookmakers = [], homeTeamName = 'Home', awayTeamName = 'Away') {
  const homeKey = normalizeTeamName(homeTeamName);
  const awayKey = normalizeTeamName(awayTeamName);
  const determineSide = (name = '') => {
    const norm = normalizeTeamName(name);
    if (norm && (norm === homeKey || norm.includes(homeKey) || homeKey.includes(norm))) {
      return 'home';
    }
    if (norm && (norm === awayKey || norm.includes(awayKey) || awayKey.includes(norm))) {
      return 'away';
    }
    return null;
  };

  const spreads = [];
  const moneylines = [];
  (bookmakers || []).forEach((bookmaker) => {
    const markets = Array.isArray(bookmaker?.markets) ? bookmaker.markets : [];
    markets.forEach((market) => {
      if (!market || !market.key || !Array.isArray(market.outcomes)) return;
      if (market.key === 'spreads') {
        market.outcomes.forEach((outcome) => {
          if (!outcome || typeof outcome.price !== 'number' || typeof outcome.point !== 'number') return;
          const side = determineSide(outcome.name);
          spreads.push({
            team: side || outcome.name,
            point: outcome.point,
            price: outcome.price,
            bookmaker: bookmaker.title || bookmaker.key
          });
        });
      }
      if (market.key === 'h2h') {
        market.outcomes.forEach((outcome) => {
          if (!outcome || typeof outcome.price !== 'number') return;
          const side = determineSide(outcome.name);
          moneylines.push({
            team: side || outcome.name,
            price: outcome.price,
            bookmaker: bookmaker.title || bookmaker.key
          });
        });
      }
    });
  });

  const pickBest = (list, predicate) => {
    const filtered = list.filter(predicate);
    if (!filtered.length) return null;
    return filtered.reduce((best, item) => {
      if (!best) return item;
      if (item.price > best.price) return item;
      return best;
    }, null);
  };

  const homeSpread = pickBest(spreads, (row) => row.team === 'home');
  const awaySpread = pickBest(spreads, (row) => row.team === 'away');
  const homeMl = pickBest(moneylines, (row) => row.team === 'home');
  const awayMl = pickBest(moneylines, (row) => row.team === 'away');

  return {
    spread: {
      home: homeSpread ? { ...homeSpread, teamName: homeTeamName } : null,
      away: awaySpread ? { ...awaySpread, teamName: awayTeamName } : null
    },
    moneyline: {
      home: homeMl ? { ...homeMl, teamName: homeTeamName } : null,
      away: awayMl ? { ...awayMl, teamName: awayTeamName } : null
    }
  };
}

export function calcRestInfo(games, teamId, targetDate) {
  if (!Array.isArray(games) || games.length === 0) {
    return { days_since_last_game: null, games_in_last_7: 0, back_to_back: false };
  }
  const sorted = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastPlayed = sorted.find((g) => {
    const date = parseGameDate(g?.date);
    return date && date < targetDate;
  }) || sorted[0];
  const lastDate = parseGameDate(lastPlayed?.date);
  const msInDay = 24 * 60 * 60 * 1000;
  const days = lastDate ? Math.round((targetDate - lastDate) / msInDay) : null;
  const gamesInLast7 = sorted.filter((game) => {
    const date = parseGameDate(game?.date);
    if (!date) return false;
    return (targetDate - date) <= 7 * msInDay;
  }).length;
  const isB2B = typeof days === 'number' ? days <= 1 : false;
  const opponent = (lastPlayed?.home_team?.id === teamId ? lastPlayed?.visitor_team : lastPlayed?.home_team)?.full_name || null;
  return {
    days_since_last_game: days,
    games_in_last_7: gamesInLast7,
    back_to_back: isB2B,
    last_game_date: lastDate ? lastDate.toISOString().slice(0, 10) : null,
    last_opponent: opponent
  };
}

export function calcRecentForm(games, teamId, limit = 5) {
  if (!Array.isArray(games) || games.length === 0) return { record: '0-0', avg_margin: 0 };
  const sorted = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));
  const slice = sorted.slice(0, limit);
  let wins = 0;
  let losses = 0;
  let totalMargin = 0;
  slice.forEach((game) => {
    const homeId = game?.home_team?.id;
    const awayId = game?.visitor_team?.id;
    const homeScore = game?.home_team_score || 0;
    const awayScore = game?.visitor_team_score || 0;
    const isHome = homeId === teamId;
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    if (teamScore > oppScore) wins += 1;
    else losses += 1;
    totalMargin += teamScore - oppScore;
  });
  return {
    record: `${wins}-${losses}`,
    avg_margin: slice.length ? totalMargin / slice.length : 0,
    sample_size: slice.length
  };
}

/**
 * Apply "buy the hook" to spread picks
 * If spread ends in .5, move it by 0.5 and adjust odds by -10
 * Example: -7.5 @ -110 becomes -7 @ -120
 * 
 * @param {number} spread - The spread number (e.g., -7.5 or +3.5)
 * @param {number} odds - The current odds (e.g., -110)
 * @returns {object} - { spread, odds, hooked: boolean }
 */
export function applyBuyTheHook(spread, odds) {
  // Only apply to .5 spreads
  if (typeof spread !== 'number' || typeof odds !== 'number') {
    return { spread, odds, hooked: false };
  }
  
  const isHalfPoint = Math.abs(spread) % 1 === 0.5;
  
  if (!isHalfPoint) {
    return { spread, odds, hooked: false };
  }
  
  // Move spread by 0.5 toward 0 (buying the hook)
  // -7.5 becomes -7 (better for favorite backer)
  // +3.5 becomes +3 (worse for underdog backer, but we're buying off the hook)
  const boughtSpread = spread > 0 
    ? spread - 0.5  // +3.5 -> +3
    : spread + 0.5; // -7.5 -> -7
  
  // Standard hook cost is approximately 10 cents (-110 becomes -120)
  const boughtOdds = odds - 10;
  
  return {
    spread: boughtSpread,
    odds: boughtOdds,
    hooked: true,
    originalSpread: spread,
    originalOdds: odds
  };
}

/**
 * Format a spread pick string with buy-the-hook applied
 * Example: "Cowboys -7.5 -110" becomes "Cowboys -7 -120 (bought hook)"
 * 
 * @param {string} teamName - Team name
 * @param {number} spread - Original spread
 * @param {number} odds - Original odds
 * @param {boolean} applyHook - Whether to apply buy-the-hook
 * @returns {string} - Formatted pick string
 */
export function formatSpreadPick(teamName, spread, odds, applyHook = true) {
  if (applyHook) {
    const hooked = applyBuyTheHook(spread, odds);
    if (hooked.hooked) {
      return {
        pick: `${teamName} ${hooked.spread > 0 ? '+' : ''}${hooked.spread} ${hooked.odds}`,
        spread: hooked.spread,
        odds: hooked.odds,
        hooked: true,
        note: `(bought hook from ${spread > 0 ? '+' : ''}${spread} @ ${odds})`
      };
    }
  }
  
  return {
    pick: `${teamName} ${spread > 0 ? '+' : ''}${spread} ${odds}`,
    spread,
    odds,
    hooked: false
  };
}

// ============================================================================
// API ERROR HANDLING UTILITIES - Prevent Silent Data Loss
// ============================================================================

/**
 * Safe API call wrapper that logs failures instead of silently swallowing them
 * This ensures Gary knows when data is unavailable vs actually zero/empty
 * 
 * @param {Function} apiCall - The async API call to execute
 * @param {any} defaultValue - Default value if call fails ([] for arrays, null for objects)
 * @param {string} context - Description of what this call is fetching (for logging)
 * @returns {Promise<any>} - Result or default value with logged failure
 */
export async function safeApiCall(apiCall, defaultValue, context = 'API call') {
  try {
    const result = await apiCall();
    return result;
  } catch (error) {
    console.warn(`[BDL API FAILURE] ${context}: ${error.message}`);
    console.warn(`[BDL API FAILURE] Gary will proceed WITHOUT this data - analysis may be incomplete`);
    return defaultValue;
  }
}

/**
 * Safe API call for arrays - returns empty array on failure with logging
 * @param {Function} apiCall - The async API call
 * @param {string} context - Context description
 * @returns {Promise<Array>}
 */
export async function safeApiCallArray(apiCall, context) {
  return safeApiCall(apiCall, [], context);
}

/**
 * Safe API call for objects - returns null on failure with logging
 * @param {Function} apiCall - The async API call
 * @param {string} context - Context description
 * @returns {Promise<Object|null>}
 */
export async function safeApiCallObject(apiCall, context) {
  return safeApiCall(apiCall, null, context);
}

/**
 * Check if a game status indicates completion (case-insensitive)
 * Handles various status formats: 'Final', 'final', 'FINAL', 'post', 'completed'
 * @param {string} status - Game status string
 * @returns {boolean}
 */
export function isGameCompleted(status) {
  if (!status || typeof status !== 'string') return false;
  const normalizedStatus = status.toLowerCase().trim();
  return ['final', 'post', 'completed', 'finished', 'closed'].includes(normalizedStatus);
}

/**
 * Format stat value, returning 'N/A' for missing stats instead of 0
 * This prevents Gary from thinking a player has 0 stats when data is just unavailable
 * 
 * @param {any} value - The stat value
 * @param {number} decimals - Decimal places (default 1)
 * @param {string} missingLabel - Label for missing data (default 'N/A')
 * @returns {string|number}
 */
export function formatStatValue(value, decimals = 1, missingLabel = 'N/A') {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
    return missingLabel;
  }
  if (typeof value === 'number') {
    return Number(value.toFixed(decimals));
  }
  return value;
}

/**
 * Format stat safely - returns null if genuinely missing, actual value otherwise
 * Use this when you need to distinguish between "0" and "unavailable"
 * 
 * @param {any} value - The stat value  
 * @returns {number|null}
 */
export function safeStatValue(value) {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
    return null;
  }
  return value;
}

// ============================================================================
// FUZZY PLAYER MATCHING - Handle Name Variations
// ============================================================================

/**
 * Normalize a player name for fuzzy matching
 * Handles common variations: "D.J. Moore" vs "DJ Moore", "LeBron James" vs "Lebron James"
 * @param {string} name - Player name
 * @returns {string} - Normalized name
 */
export function normalizePlayerName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[.']/g, '') // Remove periods and apostrophes: "D.J." -> "DJ", "O'Brien" -> "OBrien"
    .replace(/\s+jr\.?$/i, '') // Remove Jr suffix
    .replace(/\s+sr\.?$/i, '') // Remove Sr suffix
    .replace(/\s+iii$/i, '') // Remove III suffix
    .replace(/\s+ii$/i, '') // Remove II suffix
    .replace(/\s+iv$/i, '') // Remove IV suffix
    .replace(/[^a-z0-9\s]/g, '') // Remove remaining special chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Fuzzy match player names with tolerance for variations
 * @param {string} name1 - First name to compare
 * @param {string} name2 - Second name to compare
 * @returns {boolean} - True if names likely match
 */
export function fuzzyMatchPlayerName(name1, name2) {
  const n1 = normalizePlayerName(name1);
  const n2 = normalizePlayerName(name2);
  
  // Exact match after normalization
  if (n1 === n2) return true;
  
  // One contains the other (handles "LeBron" vs "LeBron James")
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Check last name match (for "J. Smith" vs "John Smith")
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');
  if (parts1.length > 0 && parts2.length > 0) {
    const lastName1 = parts1[parts1.length - 1];
    const lastName2 = parts2[parts2.length - 1];
    
    // Last names must match
    if (lastName1 === lastName2) {
      // If one has abbreviated first name, consider it a match
      const firstName1 = parts1[0] || '';
      const firstName2 = parts2[0] || '';
      if (firstName1.length <= 2 || firstName2.length <= 2) {
        // Abbreviated first name - check if starts match
        if (firstName1[0] === firstName2[0]) return true;
      }
    }
  }
  
  return false;
}

/**
 * Find best matching player from a list using fuzzy matching
 * @param {string} targetName - Name to search for
 * @param {Array} players - Array of player objects with 'first_name' and 'last_name'
 * @returns {Object|null} - Matched player or null
 */
export function findBestPlayerMatch(targetName, players) {
  if (!targetName || !Array.isArray(players)) return null;
  
  const targetNorm = normalizePlayerName(targetName);
  
  for (const player of players) {
    const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    if (fuzzyMatchPlayerName(targetName, fullName)) {
      return player;
    }
  }
  
  return null;
}

// ============================================================================
// INJURY DURATION UTILITIES - Identify Betting Edges vs Baked-in Absences
// ============================================================================

/**
 * Helper to parse injury date from BDL description (e.g., "Oct 9: Tatum..." or "Dec 25: Herro...")
 * @param {string} description - BDL injury description
 * @returns {Date|null} - Parsed date or null
 */
export function parseInjuryDate(description) {
  if (!description || typeof description !== 'string') return null;
  const today = new Date();
  const dateMatch = description.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}):/i);
  if (dateMatch) {
    const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = monthMap[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2]);
    const year = today.getFullYear();
    // If month is in the future, assume previous year
    const injuryDate = new Date(year, month, day);
    if (injuryDate > today) {
      injuryDate.setFullYear(year - 1);
    }
    return injuryDate;
  }
  return null;
}

/**
 * Calculate days since injury was reported
 * @param {string} description - BDL injury description
 * @returns {number|null} - Days or null
 */
export function getDaysSinceInjury(description) {
  const injuryDate = parseInjuryDate(description);
  if (!injuryDate) return null;
  const today = new Date();
  const diffMs = today - injuryDate;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Fix BDL status inconsistencies and add duration context for betting analysis
 * This is the SOURCE OF TRUTH for Gary's understanding of injuries.
 * 
 * @param {Object} injury - Raw BDL injury object
 * @returns {Object} - Enhanced injury object with 'duration' and 'isEdge'
 */
export function fixBdlInjuryStatus(injury) {
  if (!injury) return injury;
  
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const desc = (injury.description || '').toLowerCase();
  const rawDesc = injury.description || '';
  const returnDate = (injury.return_date || '').toString();
  
  // Return date matching today's month/day format
  const todayMonth = todayStr.split(' ')[0];
  const todayDay = todayStr.split(' ')[1];
  const isReturnToday = returnDate.includes(todayMonth) && returnDate.includes(todayDay);
  
  // Calculate days since injury was first reported
  const daysSinceReport = getDaysSinceInjury(rawDesc);
  injury.daysSinceReport = daysSinceReport;
  
  // 1. Fix Status Inconsistencies (BDL often lists as 'Out' when they are GTD)
  if (injury.status === 'Out') {
    if (desc.includes('questionable') || desc.includes('game-time decision') || desc.includes('gtd')) {
      injury.status = 'Questionable';
    } else if (desc.includes('day-to-day') || desc.includes('day to day')) {
      injury.status = 'Day-To-Day';
    } else if (isReturnToday) {
      injury.status = 'Questionable';
    }
  }
  
  // 2. Determine Duration Context
  
  // CATEGORY A: SEASON-LONG (Highest priority - NO EDGE)
  if (desc.includes('indefinitely') || desc.includes('no timetable') || desc.includes('no return') ||
      desc.includes('season-ending') || desc.includes('out for the season') || desc.includes('out for season') ||
      desc.includes('won\'t return') || desc.includes('will not return') || 
      desc.includes('rest of the season') || desc.includes('remainder of the season') ||
      desc.includes('acl') || desc.includes('achilles') || 
      injury.status === 'Injured Reserve' || injury.status === 'IR' || injury.status === 'LTIR' ||
      desc.includes('surgery') || desc.includes('underwent') || desc.includes('procedure')) {
    injury.duration = 'SEASON-LONG';
    injury.isEdge = false;
  } 
  // CATEGORY B: Based on time elapsed
  else if (daysSinceReport !== null) {
    if (daysSinceReport >= 42) { // 6+ weeks = SEASON-LONG (team stats have full baseline)
      injury.duration = 'SEASON-LONG';
      injury.isEdge = false;
    } else if (daysSinceReport >= 21) { // 3-6 weeks = MID-SEASON (team has mostly adjusted)
      injury.duration = 'MID-SEASON';
      injury.isEdge = false;
    } else if (daysSinceReport <= 14) { // 0-2 weeks = RECENT (This is the REAL EDGE)
      injury.duration = 'RECENT';
      injury.isEdge = true;
    } else { // 2-3 weeks = MID-SEASON
      injury.duration = 'MID-SEASON';
      injury.isEdge = false;
    }
  }
  // CATEGORY C: Keywords for recent/short-term
  else if (desc.includes('day-to-day') || desc.includes('questionable') || desc.includes('this week') || 
           desc.includes('game-time') || isReturnToday) {
    injury.duration = 'RECENT';
    injury.isEdge = true;
  }
  // CATEGORY D: Extended but not season-long
  else if (desc.includes('several weeks') || desc.includes('multiple weeks') || desc.includes('extended')) {
    injury.duration = 'MID-SEASON';
    injury.isEdge = false;
  }
  // DEFAULT
  else {
    injury.duration = injury.status === 'Out' ? 'MID-SEASON' : 'RECENT';
    injury.isEdge = injury.duration === 'RECENT';
  }
  
  return injury;
}

// ============================================================================
// DATA AVAILABILITY FLAGS - Help Gary Understand Missing Data
// ============================================================================

/**
 * Create a data availability object that explicitly shows what's missing
 * @param {Object} dataObject - Object with various data fields
 * @param {Array<string>} requiredFields - List of field names that are important
 * @returns {Object} - Data availability summary
 */
export function checkDataAvailability(dataObject, requiredFields = []) {
  if (!dataObject) {
    return {
      hasData: false,
      availableFields: [],
      missingFields: requiredFields,
      message: '⚠️ NO DATA AVAILABLE - Analysis may be incomplete'
    };
  }
  
  const available = [];
  const missing = [];
  
  for (const field of requiredFields) {
    const value = dataObject[field];
    if (value !== null && value !== undefined && value !== '' && value !== 'N/A') {
      available.push(field);
    } else {
      missing.push(field);
    }
  }
  
  return {
    hasData: available.length > 0,
    availableFields: available,
    missingFields: missing,
    message: missing.length > 0 
      ? `⚠️ MISSING DATA: ${missing.join(', ')}` 
      : '✓ All required data available'
  };
}

