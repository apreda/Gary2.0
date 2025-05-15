import { isPick } from '../types/picks';
import logger from './logger.js';

const log = logger.child({ module: 'pickUtils' });

/**
 * Validates and normalizes a pick object
 * @param {object} pick - The pick to validate
 * @returns {object} - The normalized pick
 * @throws {Error} - If the pick is invalid
 */
export function validateAndNormalizePick(pick) {
  if (!pick) {
    throw new Error('Pick cannot be null or undefined');
  }

  // Create a copy to avoid mutating the original
  const normalized = { ...pick };

  // Ensure required fields exist
  const requiredFields = [
    'sport',
    'league',
    'game_date',
    'home_team',
    'away_team',
    'pick_type',
    'pick_team',
    'confidence',
    'odds',
    'analysis'
  ];

  for (const field of requiredFields) {
    if (normalized[field] === undefined || normalized[field] === null) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate pick type
  if (!['moneyline', 'spread'].includes(normalized.pick_type)) {
    throw new Error(`Invalid pick_type: ${normalized.pick_type}. Must be 'moneyline' or 'spread'`);
  }

  // Validate confidence score
  const confidence = Number(normalized.confidence);
  if (isNaN(confidence) || confidence < 1 || confidence > 100) {
    throw new Error(`Invalid confidence: ${normalized.confidence}. Must be between 1 and 100`);
  }
  normalized.confidence = confidence;

  // Validate odds
  const odds = Number(normalized.odds);
  if (isNaN(odds)) {
    throw new Error(`Invalid odds: ${normalized.odds}. Must be a number`);
  }
  normalized.odds = odds;

  // Convert game_date to ISO string if it's a Date object
  if (normalized.game_date instanceof Date) {
    normalized.game_date = normalized.game_date.toISOString();
  }

  // Ensure timestamps are set
  const now = new Date().toISOString();
  normalized.created_at = normalized.created_at || now;
  normalized.updated_at = now;

  // Set default status if not provided
  normalized.status = normalized.status || 'pending';

  // Ensure key_metrics is an object
  if (normalized.key_metrics && typeof normalized.key_metrics !== 'object') {
    log.warn('key_metrics is not an object, converting to empty object');
    normalized.key_metrics = {};
  } else if (!normalized.key_metrics) {
    normalized.key_metrics = {};
  }

  // Ensure metadata is an object
  if (normalized.metadata && typeof normalized.metadata !== 'object') {
    log.warn('metadata is not an object, converting to empty object');
    normalized.metadata = {};
  } else if (!normalized.metadata) {
    normalized.metadata = {};
  }

  // Generate an ID if not provided
  if (!normalized.id) {
    normalized.id = generatePickId(normalized);
  }

  // Final validation with type guard
  if (!isPick(normalized)) {
    log.error({ pick: normalized }, 'Invalid pick format');
    throw new Error('Invalid pick format');
  }

  return normalized;
}

/**
 * Generates a deterministic ID for a pick based on its properties
 * @param {object} pick - The pick object
 * @returns {string} - A deterministic ID
 */
export function generatePickId(pick) {
  const { sport, game_date, home_team, away_team, pick_team, pick_type, pick_value } = pick;
  
  // Create a string representation of the pick's unique properties
  const pickString = [
    sport,
    new Date(game_date).toISOString().split('T')[0], // Just the date part
    home_team,
    away_team,
    pick_team,
    pick_type,
    pick_value?.toString() || ''
  ].join('|');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < pickString.length; i++) {
    const char = pickString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `pick_${Math.abs(hash).toString(36)}`;
}

/**
 * Filters out duplicate picks from an array
 * @param {Array} picks - Array of pick objects
 * @returns {Array} - Filtered array with unique picks
 */
export function removeDuplicatePicks(picks) {
  const seen = new Set();
  return picks.filter(pick => {
    const pickId = pick.id || generatePickId(pick);
    if (seen.has(pickId)) {
      log.warn({ pickId }, 'Removing duplicate pick');
      return false;
    }
    seen.add(pickId);
    return true;
  });
}

/**
 * Sorts picks by confidence (highest first)
 * @param {Array} picks - Array of pick objects
 * @returns {Array} - Sorted array of picks
 */
export function sortPicksByConfidence(picks) {
  return [...picks].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Filters picks by minimum confidence
 * @param {Array} picks - Array of pick objects
 * @param {number} minConfidence - Minimum confidence score (1-100)
 * @returns {Array} - Filtered array of picks
 */
export function filterPicksByConfidence(picks, minConfidence = 60) {
  return picks.filter(pick => pick.confidence >= minConfidence);
}

export default {
  validateAndNormalizePick,
  generatePickId,
  removeDuplicatePicks,
  sortPicksByConfidence,
  filterPicksByConfidence
};
