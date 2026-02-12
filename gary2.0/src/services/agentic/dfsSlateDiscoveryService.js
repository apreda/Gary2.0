/**
 * DFS Slate Discovery Service
 *
 * DraftKings: Public lobby API (exact game-to-slate mappings) — structured, reliable
 * FanDuel: Gemini Grounding (searches DFS content sites) — no public FD API exists
 *
 * NO FALLBACKS between platforms. If DK API fails for DK, we fail.
 * If Grounding fails for FD, we fail. No cross-platform proxying.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { discoverSlatesFromDK } from '../draftKingsSlateService.js';

// Slate types we explicitly exclude
const EXCLUDED_SLATE_TYPES = [
  'showdown',
  'single game',
  'captain mode',
  'tiers',
  'battle royale'
];

/**
 * Discovers all available DFS slates for a given sport and platform.
 *
 * DraftKings → DK lobby API (structured)
 * FanDuel → Gemini Grounding (searches DFS sites)
 *
 * @param {string} sport - The sport (nba, nfl, etc.)
 * @param {string} platform - The platform (draftkings, fanduel)
 * @param {Date|string} date - The date to discover slates for
 * @returns {Promise<Array>} Array of slate objects
 * @throws {Error} If discovery fails — caller must handle
 */
export async function discoverDFSSlates(sport, platform, date = new Date()) {
  const normalizedSport = sport.toUpperCase();
  const normalizedPlatform = normalizePlatform(platform);

  console.log(`[Slate Discovery] Discovering ${normalizedSport} slates for ${normalizedPlatform}`);

  if (normalizedPlatform === 'fanduel') {
    return discoverFanDuelSlates(normalizedSport, date);
  }

  // DraftKings: structured API
  return discoverDraftKingsSlates(normalizedSport);
}

// ============================================================================
// DRAFTKINGS — Structured API
// ============================================================================

async function discoverDraftKingsSlates(sport) {
  const slates = await discoverSlatesFromDK(sport);

  if (!slates || slates.length === 0) {
    throw new Error(`[Slate Discovery] DraftKings API returned no slates for ${sport}. Cannot proceed.`);
  }

  const classicSlates = filterToClassicSlates(slates);

  if (classicSlates.length === 0) {
    throw new Error(`[Slate Discovery] DraftKings returned ${slates.length} slates but none are classic (2+ games).`);
  }

  console.log(`[Slate Discovery] Found ${classicSlates.length} DraftKings classic slates`);

  return classicSlates.map(s => ({
    ...s,
    id: s.id || generateSlateId(s.name),
    source: 'DraftKings API'
  }));
}

// ============================================================================
// FANDUEL — Gemini Grounding (searches DFS content sites)
// ============================================================================

async function discoverFanDuelSlates(sport, date) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('[Slate Discovery] GEMINI_API_KEY not set — cannot discover FanDuel slates via Grounding');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const dateObj = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
  const todayStr = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const todayISO = dateObj.toISOString().slice(0, 10);

  const query = `<date_anchor>
System Date: ${todayStr}
ISO Date: ${todayISO}
</date_anchor>

<grounding_instructions>
You MUST use Google Search to find this information. Do NOT guess or use training data.
Search for CURRENT FanDuel ${sport} DFS contest/slate information for TODAY (${todayStr}).
</grounding_instructions>

I need the EXACT FanDuel ${sport} DFS "Full Roster" slate information for TODAY, ${todayStr}.

FanDuel organizes their ${sport} DFS contests into slates like:
- "Main" (the largest slate with most games)
- "Express" (a mid-evening subset)
- "After Hours" / "Night" (late games only)

For EACH FanDuel Full Roster slate available today, tell me:
1. The slate NAME (Main, Express, After Hours, etc.)
2. The slate START TIME (ET)
3. The EXACT number of games
4. The EXACT list of matchups (Away @ Home format, e.g. "MIL @ ORL")

Search FanDuel's lobby, DFS news sites (RotoGrinders, RotoWire, DailyFantasyFuel, FantasyLabs),
or any source that lists FanDuel ${sport} DFS slates for today.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no explanation:
{
  "date": "${todayISO}",
  "platform": "FanDuel",
  "sport": "${sport}",
  "slates": [
    {
      "name": "Main",
      "startTime": "7:00 PM ET",
      "gameCount": 10,
      "games": ["MIL @ ORL", "WAS @ CLE"]
    }
  ]
}`;

  console.log(`[Slate Discovery] Querying Gemini Grounding for FanDuel ${sport} slates...`);

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview',
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 8192
    }
  });

  const result = await model.generateContent(query);
  const text = result.response.text();

  if (!text || text.length < 50) {
    throw new Error(`[Slate Discovery] Gemini Grounding returned empty/short response for FanDuel ${sport} slates. Cannot proceed.`);
  }

  // Parse JSON from response
  const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`[Slate Discovery] Gemini Grounding did not return JSON for FanDuel slates. Raw: ${text.slice(0, 300)}`);
  }

  // Clean trailing commas
  const cleaned = jsonMatch[0].replace(/,\s*([}\]])/g, '$1');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`[Slate Discovery] Invalid JSON from Grounding: ${e.message}. Raw: ${cleaned.slice(0, 300)}`);
  }

  if (!parsed.slates || !Array.isArray(parsed.slates) || parsed.slates.length === 0) {
    throw new Error(`[Slate Discovery] Grounding returned no FanDuel slates. Response: ${JSON.stringify(parsed).slice(0, 300)}`);
  }

  console.log(`[Slate Discovery] Found ${parsed.slates.length} FanDuel slates via Grounding`);

  // Convert to standard slate format
  return parsed.slates.map(s => {
    // Extract team abbreviations from game strings like "MIL @ ORL"
    const teams = [];
    const matchups = [];
    for (const game of (s.games || [])) {
      const parts = game.split(/\s*@\s*/);
      if (parts.length === 2) {
        teams.push(parts[0].trim(), parts[1].trim());
        matchups.push(game);
      }
    }

    return {
      name: s.name,
      id: generateSlateId(s.name),
      startTime: s.startTime,
      gameCount: s.gameCount || s.games?.length || 0,
      games: matchups,
      matchups,
      teams: [...new Set(teams)],
      source: 'FanDuel (Gemini Grounding)'
    };
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePlatform(platform) {
  const p = platform.toLowerCase();
  if (p === 'dk' || p === 'draftkings') return 'draftkings';
  if (p === 'fd' || p === 'fanduel') return 'fanduel';
  return p;
}

function filterToClassicSlates(slates) {
  return slates.filter(slate => {
    const nameLower = slate.name.toLowerCase();
    const isExcluded = EXCLUDED_SLATE_TYPES.some(excluded => nameLower.includes(excluded));
    return !isExcluded && (slate.gameCount >= 2 || (slate.matchups && slate.matchups.length >= 2));
  });
}

function generateSlateId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default {
  discoverDFSSlates
};
