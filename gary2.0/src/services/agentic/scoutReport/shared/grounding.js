/**
 * Shared Grounding Functions for Scout Report Builders
 *
 * Contains all Gemini grounding-related functions used across
 * multiple per-sport modules and external files.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { formatSeason, nbaSeason } from '../../../../utils/dateUtils.js';
import { seasonForSport, findTeamInStandings, sportToBdlKey } from './utilities.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

// Lazy-initialize Gemini for grounded searches (supports key rotation)
import { isUsingBackupKey } from '../../modelConfig.js';

let geminiClient = null;
let _groundingKeyIsBackup = false;
const GROUNDING_CACHE_TTL_MS = 90 * 1000; // in-memory: 90s (dedup within single run)

// ═══════════════════════════════════════════════════════════════════════════
// FILE-BASED GROUNDING CACHE — persists across script runs (game picks → props)
// ═══════════════════════════════════════════════════════════════════════════
const DISK_CACHE_DIR = join(process.env.TMPDIR || '/tmp', 'gary-grounding-cache');
const DISK_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function ensureDiskCacheDir() {
  if (!existsSync(DISK_CACHE_DIR)) mkdirSync(DISK_CACHE_DIR, { recursive: true });
}

function diskCacheKey(query) {
  return createHash('md5').update(query.trim().toLowerCase()).digest('hex');
}

function readDiskCache(query) {
  try {
    const file = join(DISK_CACHE_DIR, `${diskCacheKey(query)}.json`);
    if (!existsSync(file)) return null;
    const stat = statSync(file);
    if (Date.now() - stat.mtimeMs > DISK_CACHE_TTL_MS) {
      unlinkSync(file);
      return null;
    }
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data?.success && data?.data) {
      console.log(`[Grounding Search] ♻️ Disk cache hit (saved a grounding call)`);
      return data;
    }
    return null;
  } catch { return null; }
}

function writeDiskCache(query, result) {
  try {
    ensureDiskCacheDir();
    const file = join(DISK_CACHE_DIR, `${diskCacheKey(query)}.json`);
    writeFileSync(file, JSON.stringify(result), 'utf8');
  } catch (e) {
    // Non-fatal — just skip caching
  }
}

function pruneDiskCache() {
  try {
    if (!existsSync(DISK_CACHE_DIR)) return;
    const files = readdirSync(DISK_CACHE_DIR);
    const now = Date.now();
    let pruned = 0;
    for (const f of files) {
      const fp = join(DISK_CACHE_DIR, f);
      try {
        if (now - statSync(fp).mtimeMs > DISK_CACHE_TTL_MS) { unlinkSync(fp); pruned++; }
      } catch {}
    }
    if (pruned > 0) console.log(`[Grounding Cache] Pruned ${pruned} expired entries`);
  } catch {}
}

// Prune on startup
pruneDiskCache();
const _groundingSearchCache = new Map();
export function getGeminiClient() {
  // Recreate client if key was rotated
  if (geminiClient && isUsingBackupKey() !== _groundingKeyIsBackup) {
    geminiClient = null;
  }
  if (!geminiClient) {
    const apiKey = isUsingBackupKey()
      ? (process.env.GEMINI_API_KEY_BACKUP || process.env.GEMINI_API_KEY)
      : process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Scout Report] GEMINI_API_KEY not set - Grounding disabled');
      return null;
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
    _groundingKeyIsBackup = isUsingBackupKey();
  }
  return geminiClient;
}

function buildGroundingCacheKey(query, options = {}) {
  return JSON.stringify({
    backupKey: isUsingBackupKey(),
    query,
    maxTokens: options.maxTokens ?? 2000,
    temperature: options.temperature ?? 1.0,
    thinkingLevel: options.thinkingLevel ?? 'high',
    useProFallback: !!options._useProFallback
  });
}

function pruneGroundingCache(now = Date.now()) {
  for (const [key, entry] of _groundingSearchCache.entries()) {
    if ((entry.expiresAt || 0) <= now) {
      _groundingSearchCache.delete(key);
    }
  }
}


/**
 * Fetch a snapshot of the league landscape (standings) to ground analysis
 * This prevents Gary from using historical knowledge for current season evaluation.
 */
export async function fetchStandingsSnapshot(sport, homeTeam = null, awayTeam = null, ncaabConferenceIds = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || sport === 'NCAAF') return '';

    const currentSeason = seasonForSport(sport);
    const seasonLabel = `${currentSeason}-${String(currentSeason + 1).slice(-2)}`;

    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
    if (!standings || standings.length === 0) return '';

    // Sort by conference/division and rank
    const snapshot = [];

    // NBA: Team-specific standings context for tonight's matchup
    if (sport === 'NBA') {
      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => `${s.wins ?? 0}-${s.losses ?? 0}`;

      // TONIGHT'S MATCHUP - Team-specific standings with conference_rank
      // This helps Gary understand where each team sits in the league right now
      if (homeTeam && awayTeam) {
        const homeStanding = findTeamInStandings(standings, homeTeam);
        const awayStanding = findTeamInStandings(standings, awayTeam);

        const formatTeamStanding = (team, standing) => {
          if (!standing) return `${team}: (standings unavailable)`;
          const conf = standing.team?.conference || standing.conference || '?';
          const rank = standing.conference_rank || '?';
          const record = formatRec(standing);
          const homeRec = standing.home_record || '?';
          const roadRec = standing.road_record || '?';
          return `${team}: #${rank} in ${conf} (${record}) | Home: ${homeRec} | Road: ${roadRec}`;
        };

        snapshot.push('TONIGHT\'S TEAMS IN STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      return `
NBA LEAGUE CONTEXT (CURRENT ${seasonLabel} STANDINGS FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // NHL: Groups by Conference and Division
    if (sport === 'NHL') {
      // NHL standings use conference_name and division_name
      const east = standings.filter(s => s.conference_name === 'Eastern').sort((a, b) => (b.points || 0) - (a.points || 0));
      const west = standings.filter(s => s.conference_name === 'Western').sort((a, b) => (b.points || 0) - (a.points || 0));

      // NHL record includes OT losses: W-L-OTL
      const formatRec = (s) => `${s.wins}-${s.losses}-${s.ot_losses || 0}`;

      // TONIGHT'S MATCHUP - Team-specific standings
      if (homeTeam && awayTeam) {
        const homeStanding = findTeamInStandings(standings, homeTeam);
        const awayStanding = findTeamInStandings(standings, awayTeam);

        const formatTeamStanding = (team, standing) => {
          if (!standing) return `${team}: (standings unavailable)`;
          const conf = standing.conference_name || '?';
          const div = standing.division_name || '?';
          const record = formatRec(standing);
          const pts = standing.points || 0;
          const homeRec = standing.home_record || '?';
          const roadRec = standing.road_record || '?';
          const streak = standing.streak || '?';
          return `${team}: ${pts} PTS (${record}) | ${div} Div | Home: ${homeRec} | Road: ${roadRec} | Streak: ${streak}`;
        };

        snapshot.push('TONIGHT\'S TEAMS IN STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      snapshot.push('EASTERN CONFERENCE TOP 3: ' + east.slice(0, 3).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      snapshot.push('EASTERN CONFERENCE BOTTOM 2: ' + east.slice(-2).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      snapshot.push('WESTERN CONFERENCE TOP 3: ' + west.slice(0, 3).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));
      snapshot.push('WESTERN CONFERENCE BOTTOM 2: ' + west.slice(-2).map(s => `${s.team.full_name} (${formatRec(s)}, ${s.points} pts)`).join(', '));

      return `
NHL LEAGUE CONTEXT (CURRENT 2025-26 NHL STANDINGS FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // NCAAB: Conference standings
    if (sport === 'NCAAB') {
      // For NCAAB, we need to fetch standings by conference
      // ncaabConferenceIds should be passed from the roster depth call
      if (!ncaabConferenceIds || (!ncaabConferenceIds.home && !ncaabConferenceIds.away)) {
        return ''; // Can't fetch NCAAB standings without conference IDs
      }

      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => `${s.wins ?? 0}-${s.losses ?? 0}`;
      const formatConfRec = (s) => s.conference_record || `${s.wins ?? 0}-${s.losses ?? 0}`;

      // Fetch both teams' conference standings
      const uniqueConfs = [...new Set([ncaabConferenceIds.home, ncaabConferenceIds.away].filter(Boolean))];
      const confStandings = {};
      for (const confId of uniqueConfs) {
        confStandings[confId] = await ballDontLieService.getNcaabStandings(confId, currentSeason);
      }

      // Format team standing for NCAAB
      const formatTeamStanding = (team, standing) => {
        if (!standing) return `${team}: (standings unavailable)`;
        const conf = standing.conference?.short_name || standing.conference?.name || '?';
        const confRec = formatConfRec(standing);
        const overallRec = formatRec(standing);
        const seed = standing.playoff_seed ? `#${standing.playoff_seed}` : '';
        const homeRec = standing.home_record || '?';
        const awayRec = standing.away_record || '?';
        return `${team}: ${seed} in ${conf} | Conf: ${confRec} | Overall: ${overallRec} | Home: ${homeRec} | Away: ${awayRec}`;
      };

      if (homeTeam && awayTeam) {
        const homeConf = confStandings[ncaabConferenceIds.home] || [];
        const awayConf = confStandings[ncaabConferenceIds.away] || [];

        const homeStanding = findTeamInStandings(homeConf, homeTeam);
        const awayStanding = findTeamInStandings(awayConf, awayTeam);

        snapshot.push('TONIGHT\'S TEAMS IN CONFERENCE STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      return `
NCAAB CONFERENCE STANDINGS (CURRENT 2025-26 SEASON FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // NFL: Conference and Division standings
    if (sport === 'NFL') {
      // NFL uses conference (AFC/NFC) and division
      const afc = standings.filter(s => s.team?.conference === 'AFC').sort((a, b) => (b.wins || 0) - (a.wins || 0));
      const nfc = standings.filter(s => s.team?.conference === 'NFC').sort((a, b) => (b.wins || 0) - (a.wins || 0));

      // Use ?? to coerce null to 0 (BDL can return null for 0 wins/losses)
      const formatRec = (s) => s.overall_record || `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ''}`;

      const formatTeamStanding = (team, standing) => {
        if (!standing) return `${team}: (standings unavailable)`;
        const conf = standing.team?.conference || '?';
        const div = standing.team?.division || '?';
        const record = formatRec(standing);
        const confRec = standing.conference_record || '?';
        const divRec = standing.division_record || '?';
        const streak = standing.win_streak > 0 ? `W${standing.win_streak}` : (standing.win_streak < 0 ? `L${Math.abs(standing.win_streak)}` : '-');
        return `${team}: ${record} | ${conf} ${div} | Conf: ${confRec} | Div: ${divRec} | Streak: ${streak}`;
      };

      if (homeTeam && awayTeam) {
        const homeStanding = findTeamInStandings(standings, homeTeam);
        const awayStanding = findTeamInStandings(standings, awayTeam);

        snapshot.push('TONIGHT\'S TEAMS IN STANDINGS:');
        snapshot.push(`  [HOME] ${formatTeamStanding(homeTeam, homeStanding)}`);
        snapshot.push(`  [AWAY] ${formatTeamStanding(awayTeam, awayStanding)}`);
        snapshot.push('');
      }

      snapshot.push('AFC TOP 3: ' + afc.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('NFC TOP 3: ' + nfc.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));

      return `
NFL STANDINGS (CURRENT ${currentSeason} SEASON FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // General top 5 for other sports (fallback)
      const top5 = [...standings].sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, 5);
      // Use ?? to coerce null to 0 (BDL returns null for 0 losses)
      const formatRec = (s) => s.overall_record || `${s.wins ?? 0}-${s.losses ?? 0}`;
      snapshot.push('LEAGUE TOP 5: ' + top5.map(s => `${s.team.name} (${formatRec(s)})`).join(', '));

    return `
LEAGUE CONTEXT (CURRENT STANDINGS FROM BDL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  } catch (error) {
    console.warn(`[Scout Report] Error fetching standings snapshot:`, error.message);
    return '';
  }
}

/**
 * Internal helper: Gemini grounding search with Flash primary, Pro 429 fallback.
 * Used by data fetchers for fetchCurrentState.
 */
export async function groundingSearch(genAI, query, todayFull) {
  const searchModel = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 1.0,
      thinkingConfig: { thinkingLevel: 'high' }
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  });

  const prompt = `<date_anchor>Today is ${todayFull}. Your training data is from 2024 — it is NOW 2026. You MUST use Google Search.</date_anchor>

Search for: ${query}

Return ALL relevant information you find. Be thorough and comprehensive.
Include: dates, scores, player names, quotes, statistics, headlines, article titles.
Report raw factual information — do not summarize into a brief overview.
If you find multiple articles, report details from EACH one.
Do NOT include ATS records, betting trends, or against-the-spread statistics.`;

  try {
    const result = await searchModel.generateContent(prompt);
    return result.response.text() || '';
  } catch (error) {
    const errorMsg = error.message?.toLowerCase() || '';
    const is429 = error.status === 429 ||
      error.message?.includes('429') ||
      errorMsg.includes('resource has been exhausted') ||
      errorMsg.includes('quota');

    if (is429) {
      // On 429: retry with backup API key on Flash (gemini-3-pro is dead since March 2026)
      console.warn(`[groundingSearch] Flash 429 - retrying with backup key: ${error.message?.slice(0, 80)}`);
      try {
        const proModel = genAI.getGenerativeModel({
          model: 'gemini-3-flash-preview',
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 1.0 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        });
        const proResult = await proModel.generateContent(prompt);
        return proResult.response.text() || '';
      } catch (proError) {
        console.error(`[groundingSearch] Pro fallback also failed: ${proError.message?.slice(0, 80)}`);
        return null;
      }
    }

    // Non-429 errors: log and return null
    console.error(`[groundingSearch] Error (non-retryable): ${error.message?.slice(0, 80)}`);
    return null;
  }
}

// GEMINI MODEL POLICY (HARDCODED - DO NOT CHANGE)
// Flash is PRIMARY for grounding. 2.5 Flash as 429 fallback (gemini-3-pro is dead since March 2026).
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_GROUNDING_MODELS = ['gemini-3-flash-preview'];

export function validateGroundingModel(model) {
  if (!ALLOWED_GROUNDING_MODELS.includes(model)) {
    console.error(`[GROUNDING MODEL POLICY VIOLATION] Attempted to use "${model}" - ONLY Gemini 3 allowed!`);
    return 'gemini-3-flash-preview'; // Default to Flash for grounding
  }
  return model;
}

export async function geminiGroundingSearch(query, options = {}) {
  const now = Date.now();
  pruneGroundingCache(now);
  const cacheKey = buildGroundingCacheKey(query, options);

  // 1. Check in-memory cache (dedup within single run)
  const cached = _groundingSearchCache.get(cacheKey);
  if (cached) {
    if (cached.value) {
      console.log('[Grounding Search] Reusing cached grounding result');
      return cached.value;
    }
    if (cached.promise) {
      console.log('[Grounding Search] Joining in-flight grounding request');
      return cached.promise;
    }
  }

  // 2. Check disk cache (dedup across runs — game picks → props)
  const diskResult = readDiskCache(query);
  if (diskResult) {
    _groundingSearchCache.set(cacheKey, { value: diskResult, expiresAt: now + GROUNDING_CACHE_TTL_MS });
    return diskResult;
  }

  // 3. Make the actual grounding call
  const requestPromise = runGeminiGroundingSearch(query, options)
    .then(result => {
      if (result?.success && result?.data) {
        _groundingSearchCache.set(cacheKey, {
          value: result,
          expiresAt: Date.now() + GROUNDING_CACHE_TTL_MS
        });
        // Write to disk for cross-run sharing
        writeDiskCache(query, result);
      } else {
        _groundingSearchCache.delete(cacheKey);
      }
      return result;
    })
    .catch(error => {
      _groundingSearchCache.delete(cacheKey);
      throw error;
    });

  _groundingSearchCache.set(cacheKey, {
    promise: requestPromise,
    expiresAt: now + GROUNDING_CACHE_TTL_MS
  });

  return requestPromise;
}

async function runGeminiGroundingSearch(query, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.warn('[Grounding Search] Gemini not available');
    return { success: false, data: null, error: 'Gemini API not configured' };
  }

  const maxRetries = options.maxRetries ?? 3;
  let lastError;
  // Track if we've already tried Pro fallback (to avoid infinite loops)
  let usedProFallback = options._usedProFallback ?? false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Flash for all grounding (gemini-3-pro is dead since March 2026)
      const requestedModel = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
      const modelName = validateGroundingModel(requestedModel);

      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{
          google_search: {}
        }],
        generationConfig: {
          temperature: 1.0, // Gemini 3: Keep at 1.0 - lower values cause looping/degraded performance
          maxOutputTokens: options.maxTokens ?? 2000,
          thinkingConfig: { thinkingLevel: options.thinkingLevel ?? 'high' }
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      });

      // ═══════════════════════════════════════════════════════════════════════════
      // 2026 GROUNDING FRESHNESS PROTOCOL
      // Prevents "Concept Drift" where Gemini's training data clashes with 2026 reality
      // ═══════════════════════════════════════════════════════════════════════════
      const today = new Date();
      const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const todayISO = today.toISOString().slice(0, 10); // YYYY-MM-DD for filtering

      // Calculate current season context using centralized function
      const seasonContext = formatSeason(nbaSeason());

      // Build the Freshness Protocol query with XML anchoring
      const dateAwareQuery = `<date_anchor>
  System Date: ${todayStr}
  ISO Date: ${todayISO}
  Season Context: ${seasonContext} (NBA/NHL mid-season, NFL playoffs)
</date_anchor>

<grounding_instructions>
  GROUND TRUTH HIERARCHY (MANDATORY):
  1. PRIMARY TRUTH: This System Date and Search Tool results are the absolute "Present"
  2. SECONDARY TRUTH: Your internal training data is a "Historical Archive" from 2024 or earlier
  3. CONFLICT RESOLUTION: If your training says Player X is on Team A, but Search shows a trade to Team B,
     your training is an "Amnesia Gap" - USE THE SEARCH RESULT

  FRESHNESS RULES:
  1. Initialize Google Search for this query - DO NOT skip the search
  2. ONLY use search results from the past 7 days (preferably past 24-48 hours)
  3. If a search result is dated prior to ${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}, flag it as "Historical" and DO NOT use for current analysis
  4. EVIDENCE SUPREMACY: Surrender intuition to Search Tool results. Search results ARE the facts.

  ANTI-LAZY VERIFICATION:
  - Do NOT assume you know current rosters, injuries, or stats from training data
  - VERIFY claims using Search - if you can't find verification, say "unverified"
  - For injuries: Look for articles from the LAST 24 HOURS specifically
  - If an article says "tonight" or "returns tonight", verify the article date matches ${todayStr}
</grounding_instructions>

<query>
${query}
</query>

CRITICAL REMINDER: Today is ${todayStr}. Use ONLY fresh search results. Your 2024 training data is outdated.`;

      const result = await model.generateContent(dateAwareQuery);
      const response = result.response;

      // Debug: Log raw response structure for troubleshooting
      if (!response || !response.text) {
        console.error(`[Grounding Search] Invalid response object from ${modelName}:`, JSON.stringify(response || 'null', null, 2).substring(0, 500));
      }

      let text = response.text();

      // Clean up chain-of-thought reasoning that sometimes leaks into responses
      // This fixes the "Wait, that snippet is from 2025..." issue
      if (text) {
        // Remove internal reasoning patterns
        const chainOfThoughtPatterns = [
          /Wait,\s+(?:that|this|I|let me)[^.]*\./gi,           // "Wait, that snippet is from..."
          /I need to[^.]*\./gi,                                  // "I need to check..."
          /Let me (?:search|check|look|find)[^.]*\./gi,         // "Let me search for..."
          /Hmm,?\s+[^.]*\./gi,                                   // "Hmm, this doesn't look right..."
          /Actually,?\s+(?:I|that|this)[^.]*\./gi,              // "Actually, I should..."
          /(?:^|\n)\s*\*[^*]+\*\s*(?:$|\n)/gm,                  // Remove asterisk-surrounded thoughts
          /snippet\s+\d+\.?\d*[^.]*from\s+(?:the\s+)?(?:last|previous)[^.]*\./gi, // "snippet 1.4 in the last search..."
        ];

        for (const pattern of chainOfThoughtPatterns) {
          text = text.replace(pattern, '');
        }

        // Clean up extra whitespace from removals
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }

      // Debug log: Show first 200 chars of grounding response
      if (text) {
        console.log(`[Grounding Search] Response received (${text.length} chars). Preview: ${text.substring(0, 200).replace(/\n/g, ' ')}...`);
      }

      // VALIDATION: Check for garbage/truncated responses
      // Allow short responses if they look like valid data (e.g., "13-2" for a record, "72°F" for weather)
      const MIN_USEFUL_LENGTH = 50;
      const looksLikeValidShortResponse = text && (
        /^\d{1,2}\s*[-–]\s*\d{1,2}/.test(text.trim()) ||  // Record format: "13-2", "15-0"
        /^\d+°?F?\s*$/.test(text.trim()) ||                // Temperature: "72", "72°F"
        /^[A-Z][a-z]+ [A-Z][a-z]+/.test(text.trim())       // Player name: "Fernando Mendoza"
      );

      if (!text || (text.length < MIN_USEFUL_LENGTH && !looksLikeValidShortResponse)) {
        console.warn(`[Grounding Search] [WARNING] Response too short (${text?.length || 0} chars). May be garbage or truncated.`);
        return {
          success: false,
          data: null,
          error: `Response too short: ${text?.length || 0} chars (expected at least ${MIN_USEFUL_LENGTH})`,
          raw: text
        };
      }

      // Check for common error patterns in response
      const textLower = (text || '').toLowerCase();
      const errorPatterns = ['i cannot', 'i\'m unable', 'no information', 'unable to find', 'error:'];
      if (text.length < 200 && !looksLikeValidShortResponse && errorPatterns.some(p => textLower.includes(p))) {
        console.warn(`[Grounding Search] [WARNING] Response looks like an error/refusal: "${text.substring(0, 100)}"`);
        return {
          success: false,
          data: null,
          error: `Response appears to be an error or refusal`,
          raw: text
        };
      }

      return {
        success: true,
        data: text,
        raw: text
      };
    } catch (error) {
      lastError = error;
      const errorMsg = error.message?.toLowerCase() || '';

      // Check for 429 rate limit - fall back to Pro if Flash is exhausted
      const is429 = error.status === 429 ||
        error.message?.includes('429') ||
        errorMsg.includes('resource has been exhausted') ||
        errorMsg.includes('quota');

      if (is429 && !usedProFallback && !options._useProFallback) {
        console.log(`[Grounding Search] ⚠️ Flash quota exceeded (429) - falling back to Pro`);
        // Recursive call with Pro model
        return runGeminiGroundingSearch(query, {
          ...options,
          _useProFallback: true,
          _usedProFallback: true
        });
      }

      // Reverse fallback: Pro 429 → try rotating API key, then Flash
      if (is429 && options._useProFallback) {
        if (!isUsingBackupKey()) {
          const { rotateToBackupKey } = await import('../../modelConfig.js');
          if (rotateToBackupKey()) {
            console.log(`[Grounding Search] ⚠️ Pro quota exceeded — rotated to backup API key, retrying`);
            geminiClient = null; // Force client recreation with new key
            return runGeminiGroundingSearch(query, {
              ...options,
              _useProFallback: false,
              _usedProFallback: false
            });
          }
        }
        console.log(`[Grounding Search] ⚠️ Pro also quota exceeded (429) - falling back to Flash`);
        return runGeminiGroundingSearch(query, {
          ...options,
          _useProFallback: false,
          _usedProFallback: true
        });
      }

      // Check if this is a retryable network error
      const isRetryable =
        error.status >= 500 ||
        error.message?.includes('500') ||
        error.message?.includes('503') ||
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('etimedout') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('connection') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'UND_ERR_CONNECT_TIMEOUT';

      if (isRetryable && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[Grounding Search] ⚠️ Retryable error (attempt ${attempt}/${maxRetries}): ${error.message?.slice(0, 60)}...`);
        console.log(`[Grounding Search] 🔄 Waiting ${delay/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('[Grounding Search] Error:', error.message);
      return { success: false, data: null, error: error.message };
    }
  }

  // Should not reach here, but just in case
  console.error('[Grounding Search] Max retries exceeded:', lastError?.message);
  return { success: false, data: null, error: lastError?.message || 'Max retries exceeded' };
}

/**
 * Get game weather using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} dateStr - Game date string
 * @returns {Object} - Weather object
 */
export async function getGroundedWeather(homeTeam, awayTeam, dateStr, gameTime = null) {
  // Get current time for staleness check
  const now = new Date();
  const currentTimeStr = now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const currentDateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // Game time context for query
  const gameTimeContext = gameTime ? ` at ${gameTime}` : '';

  const query = `IMPORTANT: Current time is ${currentTimeStr} EST on ${currentDateStr}.

What is the CURRENT weather forecast for the NFL game ${awayTeam} @ ${homeTeam} on ${dateStr}${gameTimeContext}?

STRICT REQUIREMENTS:
1. Only use weather forecasts published TODAY (${currentDateStr}) or within the last 2 hours
2. Provide the forecast specifically for GAME TIME${gameTimeContext}, not current conditions
3. If the game is more than 12 hours away, note that forecasts may change
4. For precipitation forecasts (rain/snow), indicate the PROBABILITY PERCENTAGE if available

Include:
1. Temperature at game time (in Fahrenheit)
2. Conditions at game time (sunny, cloudy, rain, snow) - with probability if precipitation
3. Wind speed and direction at game time
4. Is this a dome/indoor stadium? (if so, weather is controlled)
5. Forecast confidence: HIGH (clear skies), MODERATE (temperature/wind only), LOW (precipitation forecast)

Be specific and factual. Only report what current forecasts actually say.`;

  const result = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 1500 });

  if (result.success && result.data) {
    return parseWeatherFromText(result.data);
  }

  return null;
}

// Helper to parse weather from grounded text
export function parseWeatherFromText(text) {
  const lower = text.toLowerCase();

  // Check for dome/indoor
  if (lower.includes('dome') || lower.includes('indoor') || lower.includes('retractable roof')) {
    return {
      temperature: 72,
      conditions: 'Indoor/Dome',
      wind: 'N/A',
      wind_speed: 0,
      isDome: true,
      is_dome: true,
      forecast_confidence: 'HIGH'
    };
  }

  // Extract temperature
  const tempMatch = text.match(/(\d{1,3})\s*(?:°|degrees?\s*)?F/i) ||
                    text.match(/temperature[:\s]+(\d{1,3})/i) ||
                    text.match(/(\d{1,3})\s*degrees/i);
  const temperature = tempMatch ? parseInt(tempMatch[1], 10) : null;

  // Extract conditions
  let conditions = 'Clear';
  let precipProbability = null;

  // Check for precipitation with probability
  const precipProbMatch = text.match(/(\d+)\s*%\s*(?:chance|probability|likelihood)\s*(?:of\s*)?(?:rain|snow|precipitation)/i) ||
                          text.match(/(?:rain|snow|precipitation)[^.]*?(\d+)\s*%/i);
  if (precipProbMatch) {
    precipProbability = parseInt(precipProbMatch[1], 10);
  }

  if (lower.includes('snow')) conditions = precipProbability ? `Snow (${precipProbability}% chance)` : 'Snow';
  else if (lower.includes('rain') || lower.includes('showers')) conditions = precipProbability ? `Rain (${precipProbability}% chance)` : 'Rain';
  else if (lower.includes('storm') || lower.includes('thunder')) conditions = precipProbability ? `Storms (${precipProbability}% chance)` : 'Storms';
  else if (lower.includes('overcast')) conditions = 'Overcast';
  else if (lower.includes('partly cloudy')) conditions = 'Partly Cloudy';
  else if (lower.includes('cloud')) conditions = 'Cloudy';
  else if (lower.includes('sunny') || lower.includes('clear')) conditions = 'Clear';

  // Extract wind
  const windMatch = text.match(/wind[:\s]+(\d+)\s*(?:mph|miles)/i) ||
                    text.match(/(\d+)\s*mph\s*wind/i) ||
                    text.match(/winds?\s*(?:of\s*)?(\d+)/i);
  const windSpeed = windMatch ? parseInt(windMatch[1], 10) : null;
  const wind = windSpeed ? `${windSpeed} mph` : null;

  // Determine forecast confidence
  let forecastConfidence = 'HIGH';
  const hasPrecip = lower.includes('rain') || lower.includes('snow') || lower.includes('storm');
  const isFarOut = lower.includes('may change') || lower.includes('could change') || lower.includes('uncertain');

  if (hasPrecip && precipProbability && precipProbability < 50) {
    forecastConfidence = 'LOW';
  } else if (hasPrecip) {
    forecastConfidence = 'MODERATE';
  } else if (isFarOut) {
    forecastConfidence = 'MODERATE';
  }

  // Extract explicit confidence if stated
  if (lower.includes('confidence: high') || lower.includes('high confidence')) forecastConfidence = 'HIGH';
  else if (lower.includes('confidence: moderate') || lower.includes('moderate confidence')) forecastConfidence = 'MODERATE';
  else if (lower.includes('confidence: low') || lower.includes('low confidence')) forecastConfidence = 'LOW';

  return {
    temperature,
    conditions,
    wind,
    wind_speed: windSpeed,
    isDome: false,
    is_dome: false,
    forecast_confidence: forecastConfidence,
    precipitation_probability: precipProbability
  };
}
