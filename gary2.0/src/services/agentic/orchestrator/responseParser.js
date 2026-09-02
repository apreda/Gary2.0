import { normalizeSportToLeague } from './orchestratorHelpers.js';
import { spreadForSide } from '../../marketTruth.js';

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
 * Detect which team a pick refers to. Returns 'home', 'away', or null.
 *
 * Strategy (in order):
 *   1. Full team name substring match — most reliable.
 *   2. Last-word (nickname) word-boundary match — distinguishes same-city
 *      matchups where a substring approach collides (Lakers vs Clippers,
 *      Yankees vs Mets, Rangers vs Islanders, Knicks vs Nets, Cubs vs
 *      White Sox, Dodgers vs Angels, etc.).
 *   3. Any 3+ char shared word fallback — partial mentions.
 *
 * Returns null when truly ambiguous (e.g. NCAA "Bulldogs" vs "Bulldogs" with
 * no full name in the pick) so the caller can decide how to handle it.
 */
export function detectPickedTeam(pickText, homeTeam, awayTeam) {
  if (!pickText || !homeTeam || !awayTeam) return null;
  const pick = String(pickText);
  const pickLower = pick.toLowerCase();
  const home = String(homeTeam).toLowerCase().trim();
  const away = String(awayTeam).toLowerCase().trim();
  if (!home || !away) return null;

  // 1) Full team name substring match
  const homeFull = home && pickLower.includes(home);
  const awayFull = away && pickLower.includes(away);
  if (homeFull && !awayFull) return 'home';
  if (awayFull && !homeFull) return 'away';

  // 2) Nickname (last word) — word-boundary regex so "Sox" can't match inside
  //    a longer word and "Nets" can't pull in "Hornets" coincidentally.
  const homeNick = home.split(/\s+/).pop();
  const awayNick = away.split(/\s+/).pop();
  if (homeNick && awayNick && homeNick !== awayNick) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const homeNickHit = new RegExp(`\\b${esc(homeNick)}\\b`, 'i').test(pick);
    const awayNickHit = new RegExp(`\\b${esc(awayNick)}\\b`, 'i').test(pick);
    if (homeNickHit && !awayNickHit) return 'home';
    if (awayNickHit && !homeNickHit) return 'away';
  }

  // 3) Any-significant-word fallback (3+ chars)
  const homeWords = home.split(/\s+/).filter(w => w.length >= 3);
  const awayWords = away.split(/\s+/).filter(w => w.length >= 3);
  const homeAny = homeWords.some(w => pickLower.includes(w));
  const awayAny = awayWords.some(w => pickLower.includes(w));
  if (homeAny && !awayAny) return 'home';
  if (awayAny && !homeAny) return 'away';

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
  // Keep the long-standing cross-sport compatibility check here. Football
  // applies its stricter unambiguous-side requirement inside normalizePickFormat.
  const homeMatch = homeWords.some(w => w.length >= 3 && pickLower.includes(w));
  const awayMatch = awayWords.some(w => w.length >= 3 && pickLower.includes(w));
  return homeMatch || awayMatch;
}

export function normalizePickFormat(parsed, homeTeam, awayTeam, sport, gameOdds = {}) {
  const isFootball = sport === 'americanfootball_nfl' || sport === 'NFL' ||
    sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  // CRITICAL: Support both legacy format (pick) and new format (final_pick)
  // The new Pass 2 format uses "final_pick" instead of "pick"
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
  
  // (NHL puck-line branch deleted Sep 1 2026 — the NHL lane died Aug 27.)
  // DETECT TYPE FROM PICK TEXT if not explicitly provided
  if (!parsed.type && parsed.pick) {
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
  
  // (The legacy hardcoded -200 "ML ODDS CEILING" force-to-spread died Sep 1
  // 2026: it silently rewrote a heavy-favorite ML into the picked side's
  // spread/run line BEFORE the ruled HOUSE LIMIT gate could run — bypassing
  // the founder's Aug-18 mechanism, where the cap fires a corrective RE-ASK
  // and GARY chooses which side of the 1.5 his read takes. agentLoop's
  // moneylinePastCap gate on GAME_ML_CAP is the one instrument law.)
  // EXTRACT ODDS FROM PICK TEXT if not explicitly provided
  // E.g., "Detroit Red Wings ML -185" → odds = -185
  if (!parsed.odds && parsed.pick) {
    const oddsMatch = parsed.pick.match(/([+-]\d{3,4})(?:\s*$|\s)/);
    if (oddsMatch) {
      parsed.odds = parseInt(oddsMatch[1], 10);
      console.log(`[Orchestrator] 📋 Extracted odds from pick text: ${parsed.odds}`);
    } else {
      // Unsigned American odds — the model sometimes drops the + on a plus-money
      // price (e.g. "Over 2.5 115"). A trailing 3-4 digit integer with no sign and
      // no decimal is positive odds; never let it silently store as null.
      const bare = parsed.pick.match(/(?:^|\s)(\d{3,4})\s*$/);
      if (bare && !new RegExp(`\\.${bare[1]}\\b|${bare[1]}\\.`).test(parsed.pick)) {
        parsed.odds = parseInt(bare[1], 10);
        console.log(`[Orchestrator] 📋 Inferred unsigned positive odds: +${parsed.odds}`);
      }
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

  // Strip literal "null" or "undefined" from pick text — Gary sometimes includes null when a value was missing
  pickText = pickText.replace(/\bnull\b/gi, '').replace(/\bundefined\b/gi, '').replace(/\s{2,}/g, ' ').trim();

  // Strip parenthesized odds from pick text — Gary sometimes wraps odds in parens like "(−115)"
  pickText = pickText.replace(/\s*\([+-]\d{3,4}\)\s*$/, '').trim();

  // Strip malformed short odds after "ML" — Gary sometimes truncates odds (e.g., "ML -02" instead of "ML -102")
  // Valid American odds are always 3+ digits. Short patterns after ML are malformed and should be removed.
  pickText = pickText.replace(/(\bML)\s+[+-]\d{1,2}\s*$/i, '$1').trim();

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
  const selectedSide = parsed.type === 'total'
    ? null
    : detectPickedTeam(parsed.pick, homeTeam, awayTeam);
  if (isFootball && parsed.type !== 'total' && selectedSide === null) {
    console.error(`[Orchestrator] REJECTED: pick side is ambiguous in "${pickText}" for ${homeTeam} vs ${awayTeam}`);
    return null;
  }

  let odds;
  let verifiedSpread = null;
  if (parsed.type === 'spread') {
    // The feed is authoritative. Gary may only repeat a price supplied in the
    // game market; model-authored odds are a fallback when the feed truly has
    // no side price, never an override of a verified sportsbook number.
    const pickedHomeSpread = selectedSide === 'home';
    verifiedSpread = isFootball ? spreadForSide(gameOdds, selectedSide) : null;
    odds = (pickedHomeSpread ? gameOdds.spread_home_odds : gameOdds.spread_away_odds) ?? null;
    if (isFootball && verifiedSpread === null) {
      console.error(`[Orchestrator] REJECTED: no verified sportsbook line for ${selectedSide} spread pick "${pickText}"`);
      return null;
    }
  } else {
    // For ML picks: determine which team was picked and use their ML odds
    const pickedHome = selectedSide === 'home';
    odds = (pickedHome ? gameOdds.moneyline_home : gameOdds.moneyline_away) ?? null;
  }

  if (odds == null) {
    console.error(`[Orchestrator] REJECTED: no verified sportsbook price for pick "${pickText}" — model-authored/default odds are not a market`);
    return null;
  }
  // Normalize the trailing odds. Strip an existing trailing price — a signed token
  // (always odds) OR an unsigned copy of THIS price (Gary drops the + on plus-money,
  // e.g. "... 105") — then append the authoritative price with a correct sign. Fixes
  // the missing-sign and doubled-odds ("... 105 +105") bugs without touching spread/
  // total lines (decimals or ≤2 digits never look like a 3+ digit trailing price).
  if (odds != null && typeof odds === 'number') {
    const absOdds = Math.abs(odds);
    pickText = pickText
      .replace(/\s*[+-]\d{3,}\s*$/, '')
      .replace(new RegExp(`\\s*${absOdds}\\s*$`), '')
      .trim();
    const oddsStr = odds > 0 ? `+${odds}` : `${odds}`;
    pickText = `${pickText} ${oddsStr}`;
  }

  // SPREAD SIGN VALIDATION: Ensure the spread in pick text has the correct sign
  // Gary sometimes omits the sign or uses the wrong one (especially NCAAB)
  const hasSpreadForSignValidation = isFootball
    ? verifiedSpread !== null
    : gameOdds.spread_home != null;
  if (parsed.type === 'spread' && hasSpreadForSignValidation) {
    const spreadInText = pickText.match(/\s([+-]?)(\d+\.?\d*)\s/);
    if (spreadInText) {
      const currentSign = spreadInText[1]; // '+', '-', or '' (missing)
      const spreadNum = parseFloat(spreadInText[2]);

      // Determine if picked team is home or away (full-name → nickname → word-fallback,
      // handling same-city collisions like Lakers vs Clippers and same-mascot NCAA cases
      // like Georgia Bulldogs vs Mississippi State Bulldogs).
      const signSide = isFootball
        ? selectedSide
        : detectPickedTeam(pickText, homeTeam, awayTeam);
      const pickedHome = signSide === 'home';
      const pickedAway = signSide === 'away';

      // Use the explicit selected-side line when present. Only derive by
      // negating the opposite side when the selected-side field is absent.
      if (pickedHome || pickedAway) {
        const correctSpread = isFootball
          ? verifiedSpread
          : pickedHome
            ? Number(gameOdds.spread_home)
            : -Number(gameOdds.spread_home);
        const correctSign = correctSpread >= 0 ? '+' : '-';
        const correctAbs = Math.abs(correctSpread);

        // Fix if: sign is missing, sign is wrong, OR number doesn't match the
        // verified market (the model once emitted Bills +0.0 on a -3.5 board).
        if (!currentSign || (currentSign === '+' && correctSpread < 0) || (currentSign === '-' && correctSpread > 0) || Math.abs(spreadNum - correctAbs) > 0.001) {
          const oldFragment = spreadInText[0];
          const correctStr = correctSpread >= 0 ? `+${correctAbs}` : `-${correctAbs}`;
          const newFragment = ` ${correctStr} `;
          pickText = pickText.replace(oldFragment, newFragment);
          const sourceLabel = isFootball ? `selected_spread=${correctSpread}` : `home_spread=${gameOdds.spread_home}`;
          console.log(`[Orchestrator] 🔧 SPREAD SIGN FIX: "${oldFragment.trim()}" → "${correctStr}" (${sourceLabel}, picked=${pickedHome ? 'home' : 'away'})`);
        }
      }
    }
  }

  // Reject picks with too-short or invalid text — do NOT fabricate picks
  if (pickText.length < 5 || !pickText.match(/[A-Za-z]{3,}/)) {
    console.error(`[Orchestrator] REJECTED: Pick text too short/invalid: "${pickText}" — not fabricating a pick`);
    return null;
  }

  // Validate that the pick references one of the two teams in the game.
  // Totals ("Over 2.5") legitimately name neither team — exempt them.
  if (parsed.type !== 'total' && !validatePickTeam(pickText, homeTeam, awayTeam)) {
    console.error(`[Orchestrator] REJECTED: Pick "${pickText}" does not reference ${homeTeam} or ${awayTeam} — wrong game`);
    return null;
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

  // Minimum 1000 chars — a proper Gary's Take should be 3-4 paragraphs (~300-400 words ≈ 1500-2400 chars).
  const minRationaleChars = 1000;
  const isTooShort = rationale.length < minRationaleChars;

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

  const finalSide = isFootball ? selectedSide : detectPickedTeam(pickText, homeTeam, awayTeam);
  const pickedHomeFinal = finalSide === 'home';
  const pickedAwayFinal = finalSide === 'away';
  const marketSpread = isFootball && parsed.type === 'spread'
    ? verifiedSpread
    : pickedHomeFinal
      ? gameOdds.spread_home
      : pickedAwayFinal
        ? (gameOdds.spread_away ?? (gameOdds.spread_home != null ? -Number(gameOdds.spread_home) : null))
        : null;
  const marketSpreadOdds = pickedHomeFinal
    ? gameOdds.spread_home_odds
    : pickedAwayFinal
      ? gameOdds.spread_away_odds
      : null;

  return {
    pick: pickText,
    type: parsed.type || 'spread',
    odds: odds,
    // CONFIDENCE - Gary's organic conviction in the bet (no fallback — must come from Gary)
    confidence: parsed.confidence ?? null,
    homeTeam: parsed.homeTeam || homeTeam,
    awayTeam: parsed.awayTeam || awayTeam,
    league: normalizeSportToLeague(sport),
    sport: sport,
    rationale: rationale,
    // Include odds from Gary's output — fall back to game data, NEVER to -110
    spread: marketSpread ?? parsed.spread ?? null,
    spreadOdds: marketSpreadOdds ?? parsed.spreadOdds ?? null,
    moneylineHome: gameOdds.moneyline_home ?? parsed.moneylineHome ?? null,
    moneylineAway: gameOdds.moneyline_away ?? parsed.moneylineAway ?? null,
    total: gameOdds.total ?? parsed.total ?? null,
    totalOdds: gameOdds.total_over_odds ?? parsed.totalOdds ?? null,
    // Additional judge fields
    momentum: parsed.momentum || null,
    agentic: true // Flag to identify agentic picks
  };
}

/**
 * Normalize sport to league name
 */
