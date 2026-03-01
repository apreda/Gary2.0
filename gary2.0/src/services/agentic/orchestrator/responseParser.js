import { normalizeSportToLeague } from './orchestratorHelpers.js';

/**
 * Parse props response — extract finalize_props tool call or JSON from Gary's response
 */
export function parsePropsResponse(content, toolCallArgs) {
  // If we received direct tool call args (from finalize_props), use those
  if (toolCallArgs && toolCallArgs.picks) {
    return toolCallArgs.picks;
  }

  // Fallback: try to extract from text response
  if (!content) return null;

  // Try ALL JSON code blocks (not just the first) — Flash may output game pick JSON before props JSON
  const jsonBlocks = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const match of jsonBlocks) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].player) return parsed;
      if (parsed.picks && Array.isArray(parsed.picks) && parsed.picks.length > 0) return parsed.picks;
    } catch (e) { /* continue to next block */ }
  }

  // Try raw JSON object with picks — find the specific block containing "picks": [
  const rawMatch = content.match(/\{[^{}]*"picks"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (rawMatch) {
    try {
      const parsed = JSON.parse(rawMatch[0]);
      if (parsed.picks && Array.isArray(parsed.picks)) return parsed.picks;
    } catch (e) { /* continue */ }
  }

  return null;
}


/**
 * Determine the current pass based on message history
 * Returns: 'investigation', 'steel_man', 'evaluation', 'final_decision', or 'default'
 */
export function determineCurrentPass(messages) {
  // Check from most recent to oldest
  const hasPass3 = messages.some(m =>
    m.content?.includes('PASS 3 - FINAL OUTPUT') || m.content?.includes('PASS 3 - PROPS EVALUATION PHASE')
  );
  if (hasPass3) return 'final_decision';

  const hasPass25 = messages.some(m => m.content?.includes('PASS 2.5 - CASE REVIEW'));
  if (hasPass25) return 'evaluation';

  const hasPass2 = messages.some(m => m.content?.includes('PASS 2 - STEEL MAN') || m.content?.includes('PASS 2 - MATCHUP ANALYSIS'));
  if (hasPass2) return 'steel_man';
  
  // Default to investigation (Pass 1)
  return 'investigation';
}

/**
 * Parse Gary's response to extract the pick JSON
 * 
 * IMPORTANT: We try to extract a valid pick from JSON FIRST.
 * Pass indicators are only checked if no valid pick is found in JSON.
 * This prevents false positives like "moving on" in analysis from triggering PASS.
 */
export function parseGaryResponse(content, homeTeam, awayTeam, sport, gameOdds = {}) {
  if (!content) return null;

  // Helper to fix common JSON issues from Gemini
  const fixJsonString = (jsonStr) => {
    // Fix 1: Remove + prefix from numeric values (e.g., "+610" -> "610" or "moneylineAway": +610 -> 610)
    // This handles cases like "moneylineAway": +610 or "odds": +110
    // We use a more robust regex that handles decimals and potential spaces
    let fixed = jsonStr.replace(/:\s*\+([-+]?\d*\.?\d+)/g, ': $1');
    
    // Fix 2: Remove + prefix from numbers in arrays or elsewhere
    fixed = fixed.replace(/,\s*\+([-+]?\d*\.?\d+)/g, ', $1');
    fixed = fixed.replace(/\[\s*\+([-+]?\d*\.?\d+)/g, '[ $1');
    
    // Fix 3: Remove stats array if present (can cause parsing issues)
    fixed = fixed.replace(/"stats"\s*:\s*\[[\s\S]*?\],?/g, '');
    
    // Fix 4: Handle cases where Gary puts a + sign right before a number without a colon
    // e.g. "moneylineAway":+130
    fixed = fixed.replace(/([:,\[])\+([-+]?\d*\.?\d+)/g, '$1$2');
    
    // Fix 5: Replace unescaped newlines in string values with spaces
    // This handles "Unterminated string" errors from newlines in rationale text
    fixed = fixed.replace(/"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
      // Recursively replace all newlines within string values
      return `"${p1.replace(/\n/g, ' ')} ${p2.replace(/\n/g, ' ')}"`;
    });
    
    // Fix 6: Handle truncated JSON by attempting to close it properly
    // Count open/close braces and brackets
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    
    // If JSON appears truncated, try to close it
    if (openBraces > closeBraces || openBrackets > closeBrackets) {
      // Remove trailing incomplete content (like partial strings)
      fixed = fixed.replace(/,\s*"[^"]*$/, ''); // Remove trailing partial key
      fixed = fixed.replace(/:\s*"[^"]*$/, ': null'); // Close partial string value
      fixed = fixed.replace(/,\s*$/, ''); // Remove trailing comma
      
      // Add missing closing brackets/braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixed += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixed += '}';
      }
    }
    
    return fixed;
  };

  // Try to find JSON in the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    let jsonStr = jsonMatch[1];
    try {
      const parsed = JSON.parse(jsonStr);
      return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
    } catch (e) {
      console.warn('[Orchestrator] Failed to parse JSON from code block:', e.message);
      // Try to fix common Gemini JSON issues
      try {
        const fixedJson = fixJsonString(jsonStr);
        const parsed = JSON.parse(fixedJson);
        console.log('[Orchestrator] Parsed JSON after fixing Gemini formatting issues');
        return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
      } catch (e2) {
        console.warn('[Orchestrator] Still failed after fixes:', e2.message);
      }
    }
  }

  // Try to find raw JSON object
  // Use greedy [\s\S]* before the final } to match the LAST closing brace,
  // not the first (which could be an inner nested object)
  const rawJsonMatch = content.match(/\{[\s\S]*?"pick"[\s\S]*\}/);
  if (rawJsonMatch) {
    let jsonStr = rawJsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
    } catch (e) {
      console.warn('[Orchestrator] Failed to parse raw JSON:', e.message);
      // Try to fix common Gemini JSON issues
      try {
        const fixedJson = fixJsonString(jsonStr);
        const parsed = JSON.parse(fixedJson);
        console.log('[Orchestrator] Parsed JSON after fixing Gemini formatting issues');
        return normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds);
      } catch (e2) {
        console.warn('[Orchestrator] Still failed after fixes:', e2.message);
        // Log a snippet of the problematic JSON
        console.log('[Orchestrator] JSON snippet:', jsonStr.substring(0, 500));
      }
    }
  }

  // NO PASS ALLOWED: Gary must always make a pick. If he tries to pass,
  // return null to trigger retry logic which will tell him to pick a side.
  const lowerContent = content.toLowerCase();
  const passIndicators = [
    'i\'m passing', 'im passing', 'i am passing',
    'no pick', 'passing on this', 'pass on this',
    '"type": "pass"', '"pick": "pass"', '"pick":"pass"',
    'this is a pass', 'staying away', 'stay away'
  ];

  const isPass = passIndicators.some(indicator => lowerContent.includes(indicator));
  if (isPass) {
    console.error('[Orchestrator] REJECTED: Gary tried to PASS — no passes allowed, must make a pick');
    return null; // Triggers retry — Gary will be told to pick a side
  }

  // 5. Last resort: Extract pick from natural language text
  // When Gary writes "I'm taking [Team] +3.5" as text instead of calling finalize_pick
  const cleanedText = content.replace(/\*\*/g, '');
  const textPickPatterns = [
    // "I'm taking [the] Team [at] +/-X.X" (spread)
    { re: /I.m taking\s+(?:the\s+)?(.+?)\s+(?:at\s+)?([+-]\d+\.?\d*)/, type: 'spread' },
    // "I'm taking [the] Team ML/moneyline"
    { re: /I.m taking\s+(?:the\s+)?(.+?)\s+(?:ML|moneyline)\b/i, type: 'ml' },
    // "My pick/call: Team [at] +/-X.X"
    { re: /My\s+(?:final\s+)?(?:pick|call)[:\s]+(?:the\s+)?(.+?)\s+(?:at\s+)?([+-]\d+\.?\d*)/i, type: 'spread' },
    // "My pick/call: Team ML"
    { re: /My\s+(?:final\s+)?(?:pick|call)[:\s]+(?:the\s+)?(.+?)\s+(?:ML|moneyline)\b/i, type: 'ml' },
  ];

  for (const { re, type } of textPickPatterns) {
    const match = cleanedText.match(re);
    if (match) {
      const teamName = match[1].replace(/[.*#]/g, '').trim();
      if (teamName.length < 3) continue; // Skip noise matches

      const spread = type === 'spread' ? match[2] : null;
      const pickStr = spread ? `${teamName} ${spread}` : `${teamName} ML`;

      // Extract rationale from the decision statement onward
      const pickIdx = cleanedText.indexOf(match[0]);
      let rationale = cleanedText.substring(pickIdx).trim();
      if (rationale.length < 300) {
        rationale = cleanedText.substring(Math.max(0, pickIdx - 2000)).trim();
      }
      rationale = `Gary's Take\n\n${rationale}`;

      console.log(`[Orchestrator] 📋 Extracted pick from text (last resort): "${pickStr}"`);
      return normalizePickFormat({ pick: pickStr, rationale }, homeTeam, awayTeam, sport, gameOdds);
    }
  }

  // No valid JSON pick found and no clear pass indicators - return null to trigger retry
  console.log('[Orchestrator] ⚠️ No valid pick JSON found in response');
  return null;
}

/**
 * Validate that a pick references one of the two teams in the game
 * Prevents wrong-game picks from being stored (e.g., "Miami Heat" for a Nuggets @ Bulls game)
 */
export function validatePickTeam(pickText, homeTeam, awayTeam) {
  if (!pickText) return false;
  const pickLower = pickText.toLowerCase();
  const homeWords = homeTeam.toLowerCase().split(' ');
  const awayWords = awayTeam.toLowerCase().split(' ');
  // Check if ANY significant word (3+ chars) from home or away team appears in pick
  const homeMatch = homeWords.some(w => w.length >= 3 && pickLower.includes(w));
  const awayMatch = awayWords.some(w => w.length >= 3 && pickLower.includes(w));
  return homeMatch || awayMatch;
}

export function normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds = {}) {
  // CRITICAL: Support both legacy format (pick) and new format (final_pick)
  // The new Pass 2.5 format uses "final_pick" instead of "pick"
  if (!parsed.pick && parsed.final_pick) {
    parsed.pick = parsed.final_pick;
    console.log(`[Orchestrator] 📋 Using final_pick as pick: "${parsed.pick}"`);
  }
  
  // NO PASS: If Gary outputs a PASS pick, reject it — he must pick a side
  const isPassPick = parsed.type === 'pass' ||
                     (parsed.pick && parsed.pick.toUpperCase() === 'PASS');

  if (isPassPick) {
    console.error('[Orchestrator] REJECTED: Gary output PASS in JSON — no passes allowed, must pick a side');
    return null; // Triggers retry
  }
  
  // NHL: ALWAYS moneyline (no puck line, no totals - Gary picks winners)
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  if (isNHL) {
    parsed.type = 'moneyline';
    console.log(`[Orchestrator] 🏒 NHL: Forcing type to moneyline (ML-only sport)`);
  }
  // DETECT TYPE FROM PICK TEXT if not explicitly provided (non-NHL)
  else if (!parsed.type && parsed.pick) {
    const pickLower = parsed.pick.toLowerCase();
    if (pickLower.includes(' ml ') || pickLower.includes(' moneyline') || pickLower.endsWith(' ml')) {
      parsed.type = 'moneyline';
      console.log(`[Orchestrator] 📋 Detected type: moneyline (from pick text)`);
    } else if (/[+-]\d+\.?\d*/.test(parsed.pick) && !pickLower.includes(' ml ')) {
      // Has a spread number like +3.5 or -5.5 but not ML
      parsed.type = 'spread';
      console.log(`[Orchestrator] 📋 Detected type: spread (from pick text)`);
    } else {
      // Default to moneyline as general default
      parsed.type = 'moneyline';
      console.log(`[Orchestrator] 📋 Defaulting type to: moneyline`);
    }
  }
  
  // EXTRACT ODDS FROM PICK TEXT if not explicitly provided
  // E.g., "Detroit Red Wings ML -185" → odds = -185
  if (!parsed.odds && parsed.pick) {
    const oddsMatch = parsed.pick.match(/([+-]\d{3,4})(?:\s*$|\s)/);
    if (oddsMatch) {
      parsed.odds = parseInt(oddsMatch[1], 10);
      console.log(`[Orchestrator] 📋 Extracted odds from pick text: ${parsed.odds}`);
    }
  }
  
  // EXTRACT CONFIDENCE from parsed data if available
  if (!parsed.confidence && parsed.confidence_score) {
    parsed.confidence = parsed.confidence_score;
    console.log(`[Orchestrator] Using confidence_score: ${parsed.confidence}`);
  }
  if (!parsed.confidence && !parsed.confidence_score) {
    console.warn(`[Orchestrator] WARNING: Gary did not output a confidence score — storing as null`);
  }
  
  // Clean up pick text - remove placeholder patterns like -X.X
  let pickText = parsed.pick || '';
  if (pickText.includes('-X.X') || pickText.includes('+X.X')) {
    // If spread placeholder, try to determine actual pick from context
    pickText = pickText.replace(/[+-]X\.X/g, 'ML');
  }

  // Strip parenthesized odds from pick text — Gary sometimes wraps odds in parens like "(−115)"
  pickText = pickText.replace(/\s*\([+-]\d{3,4}\)\s*$/, '').trim();

  // FIX: If pick says "Team spread -110" without actual number, insert the spread value
  if (pickText.toLowerCase().includes(' spread ') && parsed.spread) {
    const spreadNum = parseFloat(parsed.spread);
    if (!isNaN(spreadNum)) {
      const spreadStr = spreadNum > 0 ? `+${spreadNum}` : `${spreadNum}`;
      // Replace "spread" with actual spread number
      pickText = pickText.replace(/\s+spread\s+/i, ` ${spreadStr} `);
    }
  }

  // Ensure pick text includes odds if not already present
  // Use CORRECT odds for pick type — spread picks get spread odds, ML picks get ML odds
  // NEVER default to -110 or use ML odds for a spread pick
  let odds;
  if (parsed.type === 'spread') {
    // For spread picks: use spreadOdds, then game spread_odds — NEVER ML odds
    // Try parsed odds first, then game odds (field is spread_home_odds, not spread_odds)
    const pickLowerSpread = (parsed.pick || '').toLowerCase();
    const homeWordsSpread = (homeTeam || '').toLowerCase().split(/\s+/);
    const pickedHomeSpread = homeWordsSpread.some(w => w.length > 2 && pickLowerSpread.includes(w));
    odds = parsed.odds ?? parsed.spreadOdds
      ?? (pickedHomeSpread ? gameOdds.spread_home_odds : gameOdds.spread_away_odds)
      ?? gameOdds.spread_home_odds ?? null;
  } else {
    // For ML picks: determine which team was picked and use their ML odds
    const pickLower = (parsed.pick || '').toLowerCase();
    const homeWords = (homeTeam || '').toLowerCase().split(/\s+/);
    const pickedHome = homeWords.some(w => w.length > 2 && pickLower.includes(w));
    odds = parsed.odds ?? (pickedHome ? parsed.moneylineHome : parsed.moneylineAway)
      ?? (pickedHome ? gameOdds.moneyline_home : gameOdds.moneyline_away) ?? null;
  }
  if (odds == null) {
    console.warn(`[Orchestrator] ⚠️ NO ODDS AVAILABLE for pick "${pickText}" — AI and game data both missing`);
  }
  // Append odds to pick text if not already present
  // American odds are 3+ digits (e.g., -115, +111) — don't confuse with spreads (e.g., +10.5, -7.5)
  const alreadyHasOdds = /[+-]\d{3,}/.test(pickText);
  if (!alreadyHasOdds && odds != null && typeof odds === 'number') {
    const oddsStr = odds > 0 ? `+${odds}` : `${odds}`;
    pickText = `${pickText} ${oddsStr}`;
  }

  // SPREAD SIGN VALIDATION: Ensure the spread in pick text has the correct sign
  // Gary sometimes omits the sign or uses the wrong one (especially NCAAB)
  if (parsed.type === 'spread' && gameOdds.spread_home != null) {
    const spreadInText = pickText.match(/\s([+-]?)(\d+\.?\d*)\s/);
    if (spreadInText) {
      const currentSign = spreadInText[1]; // '+', '-', or '' (missing)
      const spreadNum = parseFloat(spreadInText[2]);

      // Determine if picked team is home or away
      const pickLower = pickText.toLowerCase();
      const homeWords = (homeTeam || '').toLowerCase().split(/\s+/);
      const awayWords = (awayTeam || '').toLowerCase().split(/\s+/);
      const pickedHome = homeWords.some(w => w.length > 2 && pickLower.includes(w));
      const pickedAway = awayWords.some(w => w.length > 2 && pickLower.includes(w));

      // Calculate correct spread from picked team's perspective
      const homeSpread = parseFloat(gameOdds.spread_home);
      if (!isNaN(homeSpread) && (pickedHome || pickedAway)) {
        const correctSpread = pickedHome ? homeSpread : -homeSpread;
        const correctSign = correctSpread >= 0 ? '+' : '-';
        const correctAbs = Math.abs(correctSpread);

        // Fix if: sign is missing, sign is wrong, OR number doesn't match odds
        if (!currentSign || (currentSign === '+' && correctSpread < 0) || (currentSign === '-' && correctSpread > 0)) {
          const oldFragment = spreadInText[0];
          const correctStr = correctSpread >= 0 ? `+${correctAbs}` : `-${correctAbs}`;
          const newFragment = ` ${correctStr} `;
          pickText = pickText.replace(oldFragment, newFragment);
          console.log(`[Orchestrator] 🔧 SPREAD SIGN FIX: "${oldFragment.trim()}" → "${correctStr}" (home_spread=${homeSpread}, picked=${pickedHome ? 'home' : 'away'})`);
        }
      }
    }
  }

  // Reject picks with too-short or invalid text — do NOT fabricate picks
  if (pickText.length < 5 || !pickText.match(/[A-Za-z]{3,}/)) {
    console.error(`[Orchestrator] REJECTED: Pick text too short/invalid: "${pickText}" — not fabricating a pick`);
    return null;
  }

  // Validate that the pick references one of the two teams in the game
  if (!validatePickTeam(pickText, homeTeam, awayTeam)) {
    console.error(`[Orchestrator] REJECTED: Pick "${pickText}" does not reference ${homeTeam} or ${awayTeam} — wrong game`);
    return null;
  }

  // Normalize contradicting_factors to always be { major: [], minor: [] }
  let contradictions = { major: [], minor: [] };
  // New flat format: contradicting_factors_major and contradicting_factors_minor
  if (parsed.contradicting_factors_major || parsed.contradicting_factors_minor) {
    contradictions.major = parsed.contradicting_factors_major || [];
    contradictions.minor = parsed.contradicting_factors_minor || [];
  }
  // Legacy: nested object format
  else if (parsed.contradicting_factors && typeof parsed.contradicting_factors === 'object' && !Array.isArray(parsed.contradicting_factors)) {
    contradictions.major = parsed.contradicting_factors.major || [];
    contradictions.minor = parsed.contradicting_factors.minor || [];
  }
  // Legacy: simple array format (treat as minor)
  else if (Array.isArray(parsed.contradicting_factors)) {
    contradictions.minor = parsed.contradicting_factors;
  }

  // Get rationale and validate it - try multiple fields as fallbacks
  let rationale = parsed.rationale || parsed.analysis || parsed.reasoning || '';

  // If rationale is still empty, try to construct one from other available data
  if (!rationale || rationale.length < 150) {
    // Try gary_take or analysis_summary (can be substantial)
    if (parsed.gary_take && parsed.gary_take.length > 50) {
      rationale = parsed.gary_take;
      console.log(`[Orchestrator] Using gary_take as rationale fallback (${rationale.length} chars)`);
    }
    else if (parsed.analysis_summary && parsed.analysis_summary.length > 50) {
      rationale = parsed.analysis_summary;
      console.log(`[Orchestrator] Using analysis_summary as rationale fallback (${rationale.length} chars)`);
    }
    // DO NOT fall back to supporting_factors — "Key factors: x, y, z" is not a proper Gary's Take
    // If we reach here, the rationale is too short and should trigger a retry
  }

  // Check for placeholder/invalid rationales - these should NOT happen
  const invalidRationales = [
    'see detailed analysis',
    'see analysis below',
    'detailed analysis below',
    'analysis below',
    'see above',
    'see below',
    'tbd',
    'to be determined',
    'key factors:'  // Catch any remaining bullet-point fallbacks
  ];

  const lowerRationale = rationale.toLowerCase().trim();
  const isPlaceholderRationale = invalidRationales.some(inv => lowerRationale.includes(inv));

  // Minimum 1000 chars — a proper Gary's Take should be 3-4 paragraphs (~300-400 words ≈ 1500-2400 chars)
  const isTooShort = rationale.length < 1000;

  // Retry if rationale is a placeholder, completely missing, or too short for a proper analysis
  if (isPlaceholderRationale || rationale.length === 0 || isTooShort) {
    console.log(`[Orchestrator] ⚠️ Invalid/short rationale detected (length: ${rationale.length}, placeholder: ${isPlaceholderRationale}, tooShort: ${isTooShort}) - will retry`);
    return null; // Return null to trigger retry
  }

  // TRUNCATION DETECTION: fixJsonString silently repairs broken JSON from MAX_TOKENS cutoff.
  // If the rationale ends mid-word (last char is alphanumeric, no sentence-ending punctuation),
  // it was likely truncated. Return null to trigger retry with concise-rationale instruction.
  const trimmedRationale = rationale.trim();
  const lastChar = trimmedRationale.slice(-1);
  const endsWithPunctuation = /[.!?")\]]/.test(lastChar);
  const endsWithWord = /[a-zA-Z0-9]/.test(lastChar);
  if (endsWithWord && !endsWithPunctuation) {
    console.log(`[Orchestrator] ⚠️ Rationale appears TRUNCATED (ends with "${trimmedRationale.slice(-20)}" — no sentence-ending punctuation) — will retry`);
    return null; // Return null to trigger retry
  }

  // Sanitize pick text — fix double plus signs (e.g., "++100" → "+100") and ensure clean formatting
  pickText = pickText.replace(/\+{2,}/g, '+').trim();

  // Ensure odds is a number, not a string like "+100" or "-110"
  if (typeof odds === 'string') {
    odds = parseInt(odds, 10) || null;
  }

  return {
    pick: pickText,
    type: parsed.type || 'spread',
    odds: odds,
    // CONFIDENCE - Gary's organic conviction in the bet (no fallback — must come from Gary)
    confidence: parsed.confidence ?? null,
    supporting_factors: parsed.supporting_factors || [],
    contradicting_factors: contradictions,
    homeTeam: parsed.homeTeam || homeTeam,
    awayTeam: parsed.awayTeam || awayTeam,
    league: normalizeSportToLeague(sport),
    sport: sport,
    rationale: rationale,
    // Include odds from Gary's output — fall back to game data, NEVER to -110
    spread: parsed.spread ?? gameOdds.spread_home ?? null,
    spreadOdds: parsed.spreadOdds ?? gameOdds.spread_home_odds ?? null,
    moneylineHome: parsed.moneylineHome ?? gameOdds.moneyline_home ?? null,
    moneylineAway: parsed.moneylineAway ?? gameOdds.moneyline_away ?? null,
    total: parsed.total ?? gameOdds.total ?? null,
    totalOdds: parsed.totalOdds ?? gameOdds.total_over_odds ?? null,
    // Additional judge fields
    momentum: parsed.momentum || null,
    agentic: true // Flag to identify agentic picks
  };
}

/**
 * Normalize sport to league name
 */

