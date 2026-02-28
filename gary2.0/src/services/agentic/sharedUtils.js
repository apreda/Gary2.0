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

/**
 * Merge odds across all bookmakers into a single unified object.
 * Deduplicates outcomes by name+point, keeping the first price seen.
 * @param {Array} bookmakers - Array of bookmaker objects from The Odds API
 * @returns {{ bookmaker: string, markets: Array }|null} Merged odds or null
 */
export function mergeBookmakerOdds(bookmakers = []) {
  if (!Array.isArray(bookmakers) || bookmakers.length === 0) return null;
  const marketKeyToOutcomes = new Map();
  for (const b of bookmakers) {
    const markets = Array.isArray(b?.markets) ? b.markets : [];
    for (const m of markets) {
      if (!m || !m.key || !Array.isArray(m.outcomes)) continue;
      if (!marketKeyToOutcomes.has(m.key)) marketKeyToOutcomes.set(m.key, new Map());
      const outMap = marketKeyToOutcomes.get(m.key);
      for (const o of m.outcomes) {
        if (!o || typeof o?.name !== 'string' || typeof o?.price !== 'number') continue;
        const key = `${o.name}|${typeof o.point === 'number' ? o.point : ''}`;
        if (!outMap.has(key)) {
          outMap.set(key, { name: o.name, price: o.price, ...(typeof o.point === 'number' ? { point: o.point } : {}) });
        }
      }
    }
  }
  const mergedMarkets = [];
  for (const [mkey, outMap] of marketKeyToOutcomes.entries()) {
    const outcomes = Array.from(outMap.values());
    if (outcomes.length) mergedMarkets.push({ key: mkey, outcomes });
  }
  return mergedMarkets.length ? { bookmaker: 'merged', markets: mergedMarkets } : null;
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

// ============================================================================
// INJURY DURATION UTILITIES - Identify Betting Edges vs Baked-in Absences
// ============================================================================

/**
 * Helper to parse injury date from BDL description (e.g., "Oct 9: Tatum..." or "Dec 25: Herro...")
 * @param {string} description - BDL injury description
 * @returns {{ date: Date, dateStr: string } | null} - Parsed date and original string, or null
 */
function parseInjuryDate(description) {
  if (!description || typeof description !== 'string') return null;
  const today = new Date();

  // Pattern 1: "Dec 25:" at start of description (most common BDL format)
  const dateMatch = description.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}):/i);
  if (dateMatch) {
    const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = monthMap[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2]);
    const year = today.getFullYear();
    const injuryDate = new Date(year, month, day);
    // If month is in the future, assume previous year (season wrap-around)
    if (injuryDate > today) {
      injuryDate.setFullYear(year - 1);
    }
    return {
      date: injuryDate,
      dateStr: `${dateMatch[1]} ${dateMatch[2]}` // e.g., "Dec 25"
    };
  }
  return null;
}

/**
 * Calculate days since injury was reported
 * @param {string} description - BDL injury description
 * @returns {number|null} - Days or null
 */
function getDaysSinceInjury(description) {
  const parsed = parseInjuryDate(description);
  if (!parsed) return null;
  const today = new Date();
  const diffMs = today - parsed.date;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get human-readable injury report date string
 * @param {string} description - BDL injury description
 * @returns {string|null} - Date string like "Jan 8" or null
 */
function getInjuryReportDateStr(description) {
  const parsed = parseInjuryDate(description);
  return parsed ? parsed.dateStr : null;
}

/**
 * Fix BDL status inconsistencies and add duration context for betting analysis
 * This is the SOURCE OF TRUTH for Gary's understanding of injuries.
 *
 * @param {Object} injury - Raw BDL injury object
 * @returns {Object} - Enhanced injury object with 'duration', 'isEdge', 'reportDateStr', and 'daysSinceReport'
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

  // Calculate days since injury was first reported AND extract the actual date string
  const daysSinceReport = getDaysSinceInjury(rawDesc);
  const reportDateStr = getInjuryReportDateStr(rawDesc);
  injury.daysSinceReport = daysSinceReport;
  injury.reportDateStr = reportDateStr; // e.g., "Jan 8" - the actual date for Gary to see

  // 1. Fix Status Inconsistencies (BDL often lists as 'Out' when they are GTD)
  // IMPORTANT: Only check the MOST RECENT update in the description, not historical text.
  // Descriptions often contain history like "Feb 5: Questionable... Feb 7: Ruled Out"
  // — checking the full string would incorrectly downgrade "Out" to "Questionable".
  if (injury.status === 'Out') {
    // Get the last segment of the description (most recent update)
    const segments = desc.split(/(?:;\s*|\.\s+|\n)/);
    const lastSegment = segments.filter(s => s.trim()).pop() || desc;

    // Only downgrade if the LATEST update indicates questionable/GTD
    if ((lastSegment.includes('questionable') || lastSegment.includes('game-time decision') || lastSegment.includes('gtd'))
        && !lastSegment.includes('ruled out') && !lastSegment.includes('will not play') && !lastSegment.includes('out for')) {
      injury.status = 'Questionable';
    } else if ((lastSegment.includes('day-to-day') || lastSegment.includes('day to day'))
        && !lastSegment.includes('ruled out') && !lastSegment.includes('will not play') && !lastSegment.includes('out for')) {
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
