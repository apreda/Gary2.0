/**
 * Post-Game Audit Service
 * 
 * This service is designed to help Gary learn from his picks by analyzing
 * the LOGIC of his predictions, not just the outcomes.
 * 
 * KEY PRINCIPLE: A pick can be "right" (win) but logically flawed, or
 * "wrong" (loss) but logically sound. We audit the PROCESS, not the RESULT.
 * 
 * STATUS: STANDALONE - Not connected to Gary's active prompts yet.
 * This is built for future integration when ready.
 */

/**
 * Pick Record Structure
 * 
 * When storing a pick, capture these elements for later audit:
 * - pickId: unique identifier
 * - sport: NBA/NFL/NHL
 * - gameDate: ISO date string
 * - teams: { home, away }
 * - pickType: SPREAD/MONEYLINE/PASS
 * - pick: the actual pick (team name + line)
 * - confidence: Gary's stated confidence (if any)
 * - hardFactors: Array of Hard Factors Gary cited
 * - softFactors: Array of Soft Factors Gary cited
 * - keyReasoning: Gary's main thesis/argument
 * - structuralMatchup: Any specific unit vs unit matchup cited
 * - rosterContext: Any roster changes noted
 * - createdAt: timestamp
 */

export const PICK_AUDIT_SCHEMA = {
  pickId: 'string',
  sport: 'string',
  gameDate: 'string',
  teams: {
    home: 'string',
    away: 'string'
  },
  pickType: 'string', // SPREAD, MONEYLINE, PASS
  pick: 'string',
  odds: 'number',
  spread: 'number',
  
  // Reasoning breakdown
  hardFactors: 'array', // Hard Factors Gary cited
  softFactors: 'array', // Soft Factors Gary cited (and whether verified)
  keyReasoning: 'string', // Gary's main thesis
  structuralMatchup: 'string', // Specific matchup cited (if any)
  rosterContext: 'string', // Roster changes noted (if any)
  
  // Post-game results (filled in after game)
  result: {
    actualScore: { home: 'number', away: 'number' },
    pickWon: 'boolean',
    margin: 'number',
    keyEvents: 'string' // What actually decided the game
  },
  
  // Audit results (filled in during audit)
  audit: {
    processCorrect: 'boolean', // Was the LOGIC sound?
    hardFactorsPlayed: 'boolean', // Did Hard Factors show up as predicted?
    softFactorsPlayed: 'boolean', // Did Soft Factors play out?
    whatWeMissed: 'string', // Factor we should have caught
    lessonLearned: 'string', // Universal takeaway
    auditDate: 'string'
  },
  
  createdAt: 'string'
};

/**
 * Audit Categories
 * 
 * When auditing a pick, categorize the outcome:
 */
export const AUDIT_CATEGORIES = {
  // Good outcomes
  CORRECT_PROCESS_WIN: 'Process was sound, pick won - reinforce this logic',
  CORRECT_PROCESS_LOSS: 'Process was sound, pick lost - variance happens, no changes needed',
  
  // Learning opportunities  
  FLAWED_PROCESS_WIN: 'Process was flawed but pick won - dangerous! Don\'t reinforce bad logic',
  FLAWED_PROCESS_LOSS: 'Process was flawed and pick lost - identify the flaw and learn',
  
  // Specific flaw types
  MISSED_HARD_FACTOR: 'A Hard Factor existed that we didn\'t investigate',
  TRUSTED_SOFT_WITHOUT_VERIFICATION: 'Soft Factor wasn\'t backed by Hard data',
  WRONG_ARCHETYPE_ASSESSMENT: 'The matchup analysis was wrong (e.g., Sarr vs Zion)',
  IGNORED_ROSTER_CONTEXT: 'Didn\'t account for roster change impact on trends',
  RECENCY_BIAS: 'Over-weighted recent performance without structural support'
};

/**
 * Audit Questions to Ask
 * 
 * After a game, ask these questions to audit Gary's pick:
 */
export const AUDIT_QUESTIONS = {
  // Hard Factor verification
  hardFactorCheck: [
    'Did the Hard Factors Gary cited actually show up in the game?',
    'Example: If Gary said "Elite pass rush vs immobile QB", did the pass rush dominate?',
    'If Hard Factors didn\'t show up, why? Injury? Game script? Mis-assessment?'
  ],
  
  // Soft Factor verification
  softFactorCheck: [
    'Did Gary cite any Soft Factors in his reasoning?',
    'Were those Soft Factors backed by Hard data in his analysis?',
    'Did the Soft Factors actually influence the game outcome?'
  ],
  
  // Structural matchup verification
  structuralCheck: [
    'If Gary cited a specific unit vs unit matchup, did it play out as predicted?',
    'Was the archetype assessment correct?',
    'Example: "Rim protector vs paint scorer" - did the rim protector actually stop the scorer?'
  ],
  
  // What we missed
  blindSpotCheck: [
    'What factor actually decided the game that Gary didn\'t emphasize?',
    'Was this factor investigable with the data Gary had?',
    'Should this factor type be added to future investigations?'
  ],
  
  // Process vs outcome
  processCheck: [
    'Independent of the outcome, was Gary\'s reasoning sound?',
    'Would you make the same pick again with the same information?',
    'Did Gary identify the key factors, even if variance went against him?'
  ]
};

/**
 * Lesson Categories
 * 
 * Universal lessons that can be extracted and applied to future picks:
 */
export const LESSON_CATEGORIES = {
  ARCHETYPE_INSIGHT: 'New understanding of how certain archetypes interact',
  HARD_FACTOR_DISCOVERY: 'New Hard Factor identified that should be investigated',
  SOFT_FACTOR_WARNING: 'Soft Factor that commonly misleads without verification',
  ROSTER_PATTERN: 'Pattern about how roster changes affect performance',
  STRUCTURAL_MISMATCH: 'Specific unit vs unit interaction to watch for'
};

/**
 * Example Audit Flow
 * 
 * 1. BEFORE GAME: Store Gary's pick with full reasoning breakdown
 * 2. AFTER GAME: Get final score and key game events
 * 3. AUDIT: 
 *    - Compare Gary's cited factors to what actually happened
 *    - Categorize using AUDIT_CATEGORIES
 *    - Extract LESSON if applicable
 * 4. REVIEW: Periodically review lessons for patterns
 */

/**
 * Store a pick for later audit
 * @param {Object} pickData - Pick data following PICK_AUDIT_SCHEMA
 * @returns {Object} Stored pick with ID
 */
export async function storePick(pickData) {
  // TODO: Implement storage (database, file, etc.)
  // For now, this is a placeholder structure
  const pick = {
    ...pickData,
    pickId: `pick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString()
  };
  
  console.log('[PostGameAudit] Pick stored for later audit:', pick.pickId);
  return pick;
}

/**
 * Add game result to a stored pick
 * @param {string} pickId - The pick ID
 * @param {Object} result - Game result data
 */
export async function addGameResult(pickId, result) {
  // TODO: Implement result storage
  console.log('[PostGameAudit] Game result added to pick:', pickId);
  return { pickId, result };
}

/**
 * Perform audit on a completed pick
 * @param {string} pickId - The pick ID
 * @param {Object} auditData - Audit findings
 */
export async function auditPick(pickId, auditData) {
  // TODO: Implement audit storage
  const audit = {
    ...auditData,
    auditDate: new Date().toISOString()
  };
  
  console.log('[PostGameAudit] Audit completed for pick:', pickId);
  return { pickId, audit };
}

/**
 * Extract a universal lesson from an audit
 * @param {Object} audit - The completed audit
 * @param {string} category - Lesson category from LESSON_CATEGORIES
 * @param {string} lesson - The lesson text
 */
export async function extractLesson(audit, category, lesson) {
  // TODO: Implement lesson storage
  const lessonRecord = {
    lessonId: `lesson_${Date.now()}`,
    category,
    lesson,
    sourcePickId: audit.pickId,
    createdAt: new Date().toISOString()
  };
  
  console.log('[PostGameAudit] Lesson extracted:', lessonRecord);
  return lessonRecord;
}

/**
 * Get all lessons for a category
 * @param {string} category - Lesson category
 */
export async function getLessonsByCategory(category) {
  // TODO: Implement lesson retrieval
  console.log('[PostGameAudit] Getting lessons for category:', category);
  return [];
}

/**
 * Get audit summary for a time period
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 */
export async function getAuditSummary(startDate, endDate) {
  // TODO: Implement summary retrieval
  console.log('[PostGameAudit] Getting audit summary:', startDate, 'to', endDate);
  return {
    totalPicks: 0,
    correctProcess: 0,
    flawedProcess: 0,
    commonFlaws: [],
    lessonsLearned: []
  };
}

export default {
  PICK_AUDIT_SCHEMA,
  AUDIT_CATEGORIES,
  AUDIT_QUESTIONS,
  LESSON_CATEGORIES,
  storePick,
  addGameResult,
  auditPick,
  extractLesson,
  getLessonsByCategory,
  getAuditSummary
};
