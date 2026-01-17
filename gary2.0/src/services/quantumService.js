/**
 * Quantum Random Number Service
 * 
 * Uses Outshift/Cisco's Quantum Random Number Generator (QRNG) to generate
 * truly random numbers from quantum phenomena.
 * 
 * TRACKING MODE (Jan 2026): Quantum scores are attached to picks for RESEARCH ONLY.
 * They are NOT used to filter or affect picks. All picks are stored with their
 * quantum scores so we can analyze correlation over time, but quantum scores
 * do NOT affect which picks survive or their confidence levels.
 * 
 * IMPORTANT: The quantum numbers have NO predictive power about sports outcomes.
 * This is purely for research/tracking purposes.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const QRNG_API_URL = 'https://api.qrng.outshift.com/api/v1/random_numbers';
const QRNG_API_KEY = process.env.QRNG_API_KEY;

// Threshold for pick survival (0.80 = top ~20% of picks)
const QUANTUM_THRESHOLD = 0.80;

/**
 * Fetch quantum random numbers from Outshift QRNG API
 * @param {number} count - Number of random numbers to generate
 * @returns {Promise<{numbers: number[], source: string}>} - Array of floats (0.0-1.0) and source
 */
async function fetchQuantumNumbers(count) {
  if (!QRNG_API_KEY) {
    console.warn('[Quantum] ⚠️ QRNG_API_KEY not set - using fallback random');
    return {
      numbers: Array.from({ length: count }, () => Math.random()),
      source: 'fallback'
    };
  }

  try {
    console.log(`[Quantum] 🌌 Fetching ${count} quantum random numbers from Outshift QRNG...`);
    
    const response = await fetch(QRNG_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-id-api-key': QRNG_API_KEY
      },
      body: JSON.stringify({
        encoding: 'raw',
        format: 'all',
        bits_per_block: 8,  // 8 bits = 0-255 range
        number_of_blocks: count
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Quantum] ⚠️ QRNG API error (${response.status}): ${errorText}`);
      console.warn('[Quantum] ⚠️ Falling back to Math.random()');
      return {
        numbers: Array.from({ length: count }, () => Math.random()),
        source: 'fallback'
      };
    }

    const data = await response.json();
    
    // The API returns objects with binary, octal, decimal, hexadecimal fields
    // We extract the decimal value (0-255) and normalize to 0.0-1.0
    let rawNumbers = [];
    
    if (data.random_numbers && Array.isArray(data.random_numbers)) {
      rawNumbers = data.random_numbers;
    } else if (data.result && Array.isArray(data.result)) {
      rawNumbers = data.result;
    } else if (data.data && Array.isArray(data.data)) {
      rawNumbers = data.data;
    } else if (Array.isArray(data)) {
      rawNumbers = data;
    } else {
      // Log the structure for debugging
      console.log('[Quantum] API response structure:', JSON.stringify(data).substring(0, 500));
      console.warn('[Quantum] ⚠️ Unexpected API response format - using fallback');
      return {
        numbers: Array.from({ length: count }, () => Math.random()),
        source: 'fallback'
      };
    }

    // Normalize to 0.0-1.0 range
    const normalizedNumbers = rawNumbers.map(item => {
      // Handle Outshift format: { binary, octal, decimal, hexadecimal }
      if (typeof item === 'object' && item.decimal !== undefined) {
        const decimalValue = parseInt(item.decimal, 10);
        return decimalValue / 255;
      }
      // If already a float between 0-1, use as-is
      if (typeof item === 'number' && item >= 0 && item <= 1) {
        return item;
      }
      // If uint8 (0-255), normalize
      if (typeof item === 'number' && item >= 0 && item <= 255) {
        return item / 255;
      }
      // Default: use random
      return Math.random();
    });

    console.log(`[Quantum] ✅ Received ${normalizedNumbers.length} quantum numbers from QRNG`);
    
    return {
      numbers: normalizedNumbers,
      source: 'qrng'
    };

  } catch (error) {
    console.warn(`[Quantum] ⚠️ QRNG fetch failed: ${error.message}`);
    console.warn('[Quantum] ⚠️ Falling back to Math.random()');
    return {
      numbers: Array.from({ length: count }, () => Math.random()),
      source: 'fallback'
    };
  }
}

/**
 * Apply quantum tagging to Gary's picks
 * 
 * NOTE: As of Jan 2026, quantum filtering is DISABLED. All picks are stored
 * with quantum scores attached for tracking/analysis purposes, but NO picks
 * are filtered out. This allows us to analyze quantum correlation over time
 * without losing any of Gary's picks.
 * 
 * @param {Array} picks - Array of pick objects from Gary
 * @param {string} sport - Sport name for logging
 * @param {Object} options - Optional configuration
 * @param {boolean} options.storeAll - If true, store ALL picks with quantum scores. If false, filter to HIGH only (>=0.80).
 * @returns {Promise<Array>} - Picks with quantumStrength attached (filtered if storeAll=false)
 */
async function applyQuantumFilter(picks, sport, options = {}) {
  if (!picks || picks.length === 0) {
    return [];
  }

  // Respect the storeAll option from caller
  // NBA/NHL PROPS use storeAll=false (filter to >=0.80)
  // Game picks and tracking sports use storeAll=true
  const storeAll = options.storeAll !== false; // Default true, but false if explicitly set
  
  console.log(`\n[Quantum] 🌌 Applying quantum ${storeAll ? 'tagging' : 'FILTER'} to ${picks.length} ${sport} picks...`);
  console.log(`[Quantum] 📊 Mode: ${storeAll ? 'TRACKING (store all)' : 'FILTER (only >=0.80 survive)'}`);

  // Fetch quantum numbers - one per pick
  const { numbers, source } = await fetchQuantumNumbers(picks.length);

  // Attach quantum strength to each pick
  const picksWithQuantum = picks.map((pick, i) => ({
    ...pick,
    quantumStrength: numbers[i],
    quantumSource: source
  }));

  // Log all picks with their quantum scores
  console.log(`\n[Quantum] 📊 ${sport} Quantum Scores:`);
  picksWithQuantum.forEach((pick, i) => {
    const score = pick.quantumStrength;
    const status = score >= QUANTUM_THRESHOLD ? '✅ HIGH' : 
                   score >= 0.25 ? '⚪ NEUTRAL' : '🔴 LOW';
    const matchup =
      pick.matchup ||
      (pick.awayTeam && pick.homeTeam ? `${pick.awayTeam} @ ${pick.homeTeam}` : null) ||
      (pick.away_team && pick.home_team ? `${pick.away_team} @ ${pick.home_team}` : null) ||
      'Unknown matchup';
    const pickText =
      pick.pick ||
      (pick.player && pick.prop ? `${pick.player} ${pick.bet || ''} ${pick.prop}`.trim() : null) ||
      pick.selection ||
      pick.title ||
      'Unknown pick';
    console.log(`   ${i + 1}. ${matchup}`);
    console.log(`      Pick: ${pickText}`);
    console.log(`      Quantum: ${score.toFixed(3)} → ${status}${storeAll ? ' (stored for tracking)' : ''}`);
  });

  // Count picks by quantum category
  const highCount = picksWithQuantum.filter(p => p.quantumStrength >= QUANTUM_THRESHOLD).length;
  const neutralCount = picksWithQuantum.filter(p => p.quantumStrength >= 0.25 && p.quantumStrength < QUANTUM_THRESHOLD).length;
  const lowCount = picksWithQuantum.filter(p => p.quantumStrength < 0.25).length;

  console.log(`\n[Quantum] 📊 ${sport} Quantum Distribution:`);
  console.log(`   ✅ HIGH (≥0.80):      ${highCount} picks`);
  console.log(`   ⚪ NEUTRAL (0.25-0.79): ${neutralCount} picks`);
  console.log(`   🔴 LOW (<0.25):       ${lowCount} picks`);
  console.log(`   Source: ${source === 'qrng' ? '🌌 Quantum (Outshift QRNG)' : '⚠️ Fallback (Math.random)'}`);

  // FILTER or STORE ALL based on storeAll option
  if (storeAll) {
    console.log(`\n[Quantum] ✅ Storing ALL ${picksWithQuantum.length} ${sport} picks with quantum scores for tracking`);
    return picksWithQuantum;
  } else {
    // FILTER MODE: Only return HIGH quantum picks (>=0.80)
    const survivors = picksWithQuantum.filter(p => p.quantumStrength >= QUANTUM_THRESHOLD);
    console.log(`\n[Quantum] 🎯 FILTER RESULT: ${survivors.length}/${picksWithQuantum.length} ${sport} picks survived (≥0.80 threshold)`);
    return survivors;
  }
}

/**
 * Check if quantum filtering is enabled
 * Can be disabled via --no-quantum CLI flag
 */
function isQuantumEnabled() {
  return !process.argv.includes('--no-quantum');
}

export {
  fetchQuantumNumbers,
  applyQuantumFilter,
  isQuantumEnabled,
  QUANTUM_THRESHOLD
};

export default {
  fetchQuantumNumbers,
  applyQuantumFilter,
  isQuantumEnabled,
  QUANTUM_THRESHOLD
};
