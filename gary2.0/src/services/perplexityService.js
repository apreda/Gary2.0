/**
 * Service for interacting with the Perplexity API
 * Provides real-time search capabilities for sports data and news
 */
import axios from 'axios';

// Simple in-memory cache for Perplexity responses
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache TTL

export const perplexityService = {
  /**
   * Search for information using Perplexity API
   * @param {string} query - The search query
   * @param {object} options - Additional options for the search
   * @returns {Promise<object>} - The search results
   */
  search: async function(query, options = {}) {
    try {
      console.log(`Searching Perplexity for: "${query}"`);
      
      // Default options with correct model name from Perplexity documentation
      const defaultOptions = {
        model: 'sonar',
        temperature: 0.3,
        maxTokens: 500
      };
      
      // Merge options
      const normalizeModel = (m) => {
        if (!m) return defaultOptions.model;
        const map = {
          // Current Perplexity model IDs
          'sonar': 'sonar',
          'sonar-pro': 'sonar-pro',
          'sonar-large': 'sonar-pro',
          'sonar-large-online': 'sonar-pro',
          'llama-3.1-sonar-large-128k-online': 'sonar-pro',
          'sonar-small': 'sonar',
          'sonar-small-online': 'sonar',
          'llama-3.1-sonar-small-128k-online': 'sonar'
        };
        return map[m] || m;
      };
      const requestOptions = { ...defaultOptions, ...options, model: normalizeModel(options.model) };

      // Add system message if provided
      const messages = [];
      if (options.systemMessage) {
        messages.push({
          role: 'system',
          content: options.systemMessage
        });
      }
      
      messages.push({
        role: 'user',
        content: query
      });
      
      // Decide headers based on whether we're calling our proxy or the vendor API
      const isProxy = this.API_BASE_URL.includes('/api/perplexity-proxy');
      const headers = { 'Content-Type': 'application/json' };
      if (!isProxy && this.API_KEY) {
        headers['Authorization'] = `Bearer ${this.API_KEY}`;
      }
      
      const postOnce = async (modelId) => {
        return axios.post(
          this.API_BASE_URL,
          {
            model: modelId,
            messages: messages,
            temperature: requestOptions.temperature,
            max_tokens: requestOptions.maxTokens
          },
          {
            headers,
            timeout: 60000
          }
        );
      };

      const candidates = Array.from(new Set([
        requestOptions.model,
        'sonar-pro',
        'sonar'
      ]));

      let response = null;
      let lastError = null;
      for (const modelId of candidates) {
        try {
          response = await postOnce(modelId);
          break;
        } catch (err) {
          const status = err?.response?.status;
          const errType = err?.response?.data?.error?.type;
          if (status === 400 && errType === 'invalid_model') {
            lastError = err;
            continue; // try next candidate model
          }
          throw err;
        }
      }
      if (!response) throw lastError || new Error('Perplexity request failed');
      
      return {
        success: true,
        data: response.data.choices?.[0]?.message?.content || 'No results found',
        raw: response.data
      };
      
    } catch (error) {
      console.error('Error in Perplexity search:', error.response?.data || error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  },
  
  /**
   * The Perplexity API key (will be loaded from environment variables)
   */
  API_KEY: (() => {
    // Only resolve secrets in server environments
    if (typeof window === 'undefined' && typeof process !== 'undefined' && process.env) {
      return process.env.PERPLEXITY_API_KEY || '';
    }
    // Never expose Perplexity key in the browser bundle
    return '';
  })(),
  
  /**
   * Base URL for Perplexity API
   */
  API_BASE_URL: (() => {
    // Browser: always use local proxy
    if (typeof window !== 'undefined') {
      return '/api/perplexity-proxy';
    }
    // Server: call vendor API directly to avoid Vercel deployment protection gates
    return 'https://api.perplexity.ai/chat/completions';
  })(),
  
  /**
   * Fetches real-time information using Perplexity's search capabilities
   * @param {string} query - The search query to send to Perplexity
   * @param {object} options - Additional options for the request
   * @returns {Promise<string>} - The search results as text
   */
  fetchRealTimeInfo: async function(query, options = {}) {
    try {
      // Optimize the query to be more direct and concise for better results
      const optimizedQuery = this._optimizeQuery(query);
      console.log(`🔥 Optimized query: ${optimizedQuery}`);
      
      const result = await this.search(optimizedQuery, {
        temperature: 0.1, // Low temperature for more factual responses
        maxTokens: 300,
        ...options
      });
      
      if (!result.success) {
        console.error('Failed to fetch real-time info');
        return '';
      }
      
      return result.data;
    } catch (error) {
      console.error('Error fetching real-time info:', error.message);
      return '';
    }
  },
  
  /**
   * Optimize a query to be more direct and concise for better Perplexity results
   * @param {string} query - The original query
   * @returns {string} - The optimized query
   * @private
   */
  _optimizeQuery: function(query) {
    // Remove unnecessary phrases and focus on key information
    const cleanedQuery = query
      .replace(/can you|please|could you|i need|i want|tell me|give me/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    return ` ${cleanedQuery}`;
  },
  
  /**
   * Get game time and headlines for a specific game using Perplexity
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} league - League code ('mlb', 'nba', 'nhl')
   * @returns {Promise<Object>} - Game time and headlines
   */
  getGameTimeAndHeadlines: async function(homeTeam, awayTeam, league) {
    try {
      const gameLinks = await this.getEspnGameLinks(league);
      if (gameLinks && gameLinks.length > 0) {
        console.log(`Getting ESPN game data for ${league} game: ${awayTeam} @ ${homeTeam}`);
        // Try to find specific game link
        // This is a simplified implementation - in reality, you'd need more robust team name matching
      }
      
      // If we couldn't get info from ESPN, try Ball Don't Lie API as a fallback
      console.log(`Trying Ball Don't Lie API to get game time for ${league} game: ${awayTeam} @ ${homeTeam}`);
    
      const { ballDontLieService } = await import('./ballDontLieService.js');
    
      let games = [];
      try {
        if (league.toUpperCase() === 'MLB') {
          games = await ballDontLieService.getMlbGamesByDate(new Date().toISOString().split('T')[0]);
        } else if (league.toUpperCase() === 'NBA') {
          games = await ballDontLieService.getNbaGamesByDate(new Date().toISOString().split('T')[0]);
        } else {
          console.log(`League ${league} not supported for game time lookup`);
        }
      } catch (err) {
        console.error(`Error getting games from Ball Don't Lie API:`, err);
      }
      
      // Filter for the specific game using new Ball Don't Lie API data structure
      const targetGame = games.find(game => {
        // Check if home_team and away_team objects exist and have display_name properties
        const homeTeamName = game.home_team?.display_name || game.home_team || '';
        const awayTeamName = game.away_team?.display_name || game.away_team || '';
        
        // Ensure all variables are strings before calling toLowerCase
        const safeHomeTeamName = typeof homeTeamName === 'string' ? homeTeamName : String(homeTeamName || '');
        const safeAwayTeamName = typeof awayTeamName === 'string' ? awayTeamName : String(awayTeamName || '');
        const safeHomeTeam = typeof homeTeam === 'string' ? homeTeam : String(homeTeam || '');
        const safeAwayTeam = typeof awayTeam === 'string' ? awayTeam : String(awayTeam || '');
        
        return (
          (safeHomeTeamName.toLowerCase().includes(safeHomeTeam.toLowerCase()) || 
           safeHomeTeam.toLowerCase().includes(safeHomeTeamName.toLowerCase())) && 
          (safeAwayTeamName.toLowerCase().includes(safeAwayTeam.toLowerCase()) || 
           safeAwayTeam.toLowerCase().includes(safeAwayTeamName.toLowerCase()))
        );
      });
      
      if (targetGame) {
        // Format the game time from the Ball Don't Lie API
        const gameTime = targetGame.time || targetGame.start_time || targetGame.commence_time;
        const gameDate = new Date(gameTime);
        
        // Check if the date is valid before formatting
        const gameTimeET = !isNaN(gameDate.getTime()) ? 
          gameDate.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }) + " ET" : 
          (targetGame.time || 'TBD');
        
        console.log(`Found game time from Ball Don't Lie API: ${gameTimeET}`);
        return {
          gameTime: gameTimeET,
          headlines: [],
          keyInjuries: { homeTeam: [], awayTeam: [] }
        };
      }
      
      return {
        gameTime: 'TBD',
        headlines: [],
        keyInjuries: { homeTeam: [], awayTeam: [] }
      };
    } catch (error) {
      console.error('Error in getGameTimeAndHeadlines:', error.message);
      return { gameTime: 'TBD', headlines: [], keyInjuries: { homeTeam: [], awayTeam: [] }};
    }
  },
  
  /**
   * Get game news and updates for a specific game
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name 
   * @param {string} league - League code
   * @returns {Promise<string>} - Game news and updates
   */
  getGameNews: async function(homeTeam, awayTeam, league) {
    const query = `What are the latest news and updates for the upcoming ${league} game between ${awayTeam} and ${homeTeam}? Focus only on recent injury reports, lineup changes, and betting trends.`;
    return await this.fetchRealTimeInfo(query, {
      temperature: 0.2,
      maxTokens: 200
    });
  },
  
  /**
   * Get rich structured game context for OpenAI consumption
   * Includes: player streaks, team trends, injuries, weather, fan storylines, superstition,
   * betting trends, key matchup insights, and citations
   */
  getRichGameContext: async function(homeTeam, awayTeam, league = 'mlb', dateStr = new Date().toISOString().slice(0, 10)) {
    try {
      const cacheKey = `richctx:${league}:${dateStr}:${homeTeam}|${awayTeam}`;
      const cached = cache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < CACHE_TTL) {
        return cached.v;
      }

      const systemMessage = [
        'You are a sports facts extractor.',
        'Return strict JSON only with keys:',
        'player_streaks[], team_trends[], injuries[], weather, bullpen_usage, manager_tendencies, umpire_data, travel_rest, stadium_factors, lineup_confirmation, fan_storylines[], superstition[], rivalry_history, clubhouse_vibes, motivation_factor, key_matchup_insights[], citations[], key_findings[].',
        'key_findings must contain the 3-4 most predictive, verifiable items across categories, each with a short rationale and source_url when possible.',
        'No text outside JSON.'
      ].join(' ');

      const query = [
        `Find current, verifiable context for the upcoming ${league.toUpperCase()} game`,
        `${awayTeam} at ${homeTeam} on ${dateStr} (ET).`,
        'Include only on-field/contextual factors (no betting trends):',
        'player hitting/pitching streaks; team trends (last 5/10/30); confirmed injuries and status;',
        'expected weather (stadium/roof, temp, wind); bullpen usage (last 7 days workload, top relievers availability);',
        'manager tendencies (bullpen decisions, platoons, pinch-hit history); umpire data (plate ump, zone tendencies, OU impact);',
        'travel & rest (distance, games last 10 days, day/night splits); stadium factors (park HR/run factors and today’s weather interaction);',
        'lineup confirmation timing and surprise changes; rivalry/history angles; clubhouse vibes (recent quotes); fan superstitions; motivation factor (playoff race).',
        'Also synthesize key_findings: 3-4 most predictive items with brief rationale and source_url.'
      ].join(' ');

      const attempt = async (prompt, preferLarge = true) => {
        const res = await this.search(prompt, {
          model: preferLarge ? 'sonar-pro' : 'sonar',
          temperature: 0.05,
          maxTokens: 1600,
          systemMessage
        });
        return res;
      };

      let res = await attempt(query, true);
      if (!res?.success || !res?.data) {
        console.warn('getRichGameContext: first attempt failed', res?.status, res?.error);
        // Simplify instruction and retry (often helps JSON compliance)
        const simplified = [
          `Return strict JSON with keys: player_streaks[], team_trends[], injuries[], weather, bullpen_usage, manager_tendencies, umpire_data, travel_rest, stadium_factors, lineup_confirmation, fan_storylines[], superstition[], rivalry_history, clubhouse_vibes, motivation_factor, key_matchup_insights[], citations[], key_findings[].`,
          `Game: ${awayTeam} at ${homeTeam} (${league.toUpperCase()}) on ${dateStr} (ET).`,
          'Focus on verifiable on-field/context factors only. key_findings = top 3-4 predictive items with rationale and source_url.'
        ].join(' ');
        res = await attempt(simplified, false);
        if (!res?.success || !res?.data) return {};
      }

      const tryParse = (txt) => {
        try { return JSON.parse(txt); } catch (e) {}
        const codeMatch = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeMatch && codeMatch[1]) { try { return JSON.parse(codeMatch[1]); } catch (e) {} }
        const braceMatch = txt.match(/\{[\s\S]*\}/);
        if (braceMatch && braceMatch[0]) { try { return JSON.parse(braceMatch[0]); } catch (e) {} }
        return null;
      };

      const obj = tryParse(res.data);
      if (obj && typeof obj === 'object') {
        cache.set(cacheKey, { t: Date.now(), v: obj });
        return obj;
      }
      return {};
    } catch (e) {
      console.error('getRichGameContext error:', e.message);
      return {};
    }
  },

  /**
   * Fetch advanced NHL analytics via Perplexity web search
   * Sources: Natural Stat Trick, MoneyPuck, Hockey-Reference, Elite Prospects
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} dateStr - Game date (YYYY-MM-DD)
   * @returns {Promise<Object>} - Advanced analytics as JSON
   */
  getNhlAdvancedStats: async function(homeTeam, awayTeam, dateStr = new Date().toISOString().slice(0, 10)) {
    try {
      const cacheKey = `nhl_adv:${dateStr}:${homeTeam}|${awayTeam}`;
      const cached = cache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < CACHE_TTL) {
        return cached.v;
      }

      const systemMessage = [
        'You are a hockey analytics expert.',
        'Return ONLY valid JSON (no markdown, no explanation) with these exact keys:',
        'home_advanced: {team, corsi_for_pct, expected_goals_for_pct, pdo, high_danger_chances_for_pct, goals_saved_above_expected},',
        'away_advanced: {team, corsi_for_pct, expected_goals_for_pct, pdo, high_danger_chances_for_pct, goals_saved_above_expected},',
        'goalie_matchup: {home_starter, home_record, home_sv_pct, home_gaa, home_gsax, away_starter, away_record, away_sv_pct, away_gaa, away_gsax},',
        'five_on_five: {home_cf_pct, home_xgf_pct, away_cf_pct, away_xgf_pct},',
        'recent_form: {home_last_10, home_goals_per_game_l10, away_last_10, away_goals_per_game_l10},',
        'key_analytics_insights: [] (3-4 most predictive metrics with brief rationale),',
        'data_sources: [] (URLs or site names where data was found).',
        'Use current 2024-25 season data. If a stat is unavailable, use null.'
      ].join(' ');

      const query = [
        `Find current advanced NHL analytics for the matchup: ${awayTeam} at ${homeTeam}`,
        `scheduled for ${dateStr} (2024-25 NHL season).`,
        'Search Natural Stat Trick, MoneyPuck, Hockey-Reference for:',
        '1. Corsi For % (CF%) - 5v5 shot attempt differential',
        '2. Expected Goals For % (xGF%) - 5v5 chance quality',
        '3. PDO (shooting% + save%) - luck indicator, league avg is 100',
        '4. High-Danger Chances For % - quality scoring chances',
        '5. Goals Saved Above Expected (GSAx) - goalie quality',
        '6. Expected starting goalies with recent stats',
        '7. Last 10 games record and scoring for both teams',
        'Provide the most recent available data for both teams.'
      ].join(' ');

      const attempt = async (prompt, preferLarge = true) => {
        const res = await this.search(prompt, {
          model: preferLarge ? 'sonar-pro' : 'sonar',
          temperature: 0.1,
          maxTokens: 1800,
          systemMessage
        });
        return res;
      };

      let res = await attempt(query, true);
      if (!res?.success || !res?.data) {
        console.warn('getNhlAdvancedStats: first attempt failed, retrying with simplified query');
        const simplified = [
          `Return JSON with NHL advanced stats for ${awayTeam} vs ${homeTeam}.`,
          'Keys: home_advanced, away_advanced, goalie_matchup, five_on_five, recent_form, key_analytics_insights, data_sources.',
          'Include Corsi%, xGF%, PDO, goalie save%, GSAx. Use null for unavailable stats.'
        ].join(' ');
        res = await attempt(simplified, false);
        if (!res?.success || !res?.data) {
          console.warn('getNhlAdvancedStats: both attempts failed');
          return this._getDefaultNhlAdvancedStats(homeTeam, awayTeam);
        }
      }

      const tryParse = (txt) => {
        if (!txt) return null;
        try { return JSON.parse(txt); } catch (e) {}
        const codeMatch = txt.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeMatch && codeMatch[1]) { try { return JSON.parse(codeMatch[1]); } catch (e) {} }
        const braceMatch = txt.match(/\{[\s\S]*\}/);
        if (braceMatch && braceMatch[0]) { try { return JSON.parse(braceMatch[0]); } catch (e) {} }
        return null;
      };

      const obj = tryParse(res.data);
      if (obj && typeof obj === 'object') {
        // Add metadata
        obj._source = 'perplexity';
        obj._fetchedAt = new Date().toISOString();
        cache.set(cacheKey, { t: Date.now(), v: obj });
        return obj;
      }
      
      console.warn('getNhlAdvancedStats: failed to parse response, using defaults');
      return this._getDefaultNhlAdvancedStats(homeTeam, awayTeam);
    } catch (e) {
      console.error('getNhlAdvancedStats error:', e.message);
      return this._getDefaultNhlAdvancedStats(homeTeam, awayTeam);
    }
  },

  /**
   * Default/fallback NHL advanced stats structure
   */
  _getDefaultNhlAdvancedStats: function(homeTeam, awayTeam) {
    return {
      home_advanced: { team: homeTeam, corsi_for_pct: null, expected_goals_for_pct: null, pdo: null, high_danger_chances_for_pct: null, goals_saved_above_expected: null },
      away_advanced: { team: awayTeam, corsi_for_pct: null, expected_goals_for_pct: null, pdo: null, high_danger_chances_for_pct: null, goals_saved_above_expected: null },
      goalie_matchup: { home_starter: null, home_record: null, home_sv_pct: null, home_gaa: null, home_gsax: null, away_starter: null, away_record: null, away_sv_pct: null, away_gaa: null, away_gsax: null },
      five_on_five: { home_cf_pct: null, home_xgf_pct: null, away_cf_pct: null, away_xgf_pct: null },
      recent_form: { home_last_10: null, home_goals_per_game_l10: null, away_last_10: null, away_goals_per_game_l10: null },
      key_analytics_insights: [],
      data_sources: [],
      _source: 'default',
      _fetchedAt: new Date().toISOString()
    };
  },

  /**
   * Get EPL advanced analytics (xG, possession, etc.) via Perplexity
   * BETA: Supplements BDL data with advanced metrics from football analytics sites
   */
  getEplAdvancedStats: async function(homeTeam, awayTeam, dateStr = new Date().toISOString().slice(0, 10)) {
    try {
      const cacheKey = `epl_adv:${dateStr}:${homeTeam}|${awayTeam}`;
      const cached = cache.get(cacheKey);
      if (cached && (Date.now() - cached.t) < CACHE_TTL) {
        return cached.v;
      }

      const systemMessage = [
        'You are a football (soccer) analytics expert specializing in EPL data.',
        'Return ONLY valid JSON (no markdown, no explanation) with these exact keys:',
        'home_advanced: {team, xg_for, xg_against, xg_difference, possession_pct, pass_completion_pct, shots_per_game, shots_on_target_per_game, big_chances_created, big_chances_missed, clean_sheets, ppg},',
        'away_advanced: {team, xg_for, xg_against, xg_difference, possession_pct, pass_completion_pct, shots_per_game, shots_on_target_per_game, big_chances_created, big_chances_missed, clean_sheets, ppg},',
        'form: {home_last_5: string like "WWDLW", home_goals_scored_l5: number, home_goals_conceded_l5: number, away_last_5: string, away_goals_scored_l5: number, away_goals_conceded_l5: number},',
        'head_to_head: {last_5_meetings: array of {date, home_team, away_team, score}, home_wins: number, away_wins: number, draws: number},',
        'key_injuries: {home: array of player names, away: array of player names},',
        'key_insights: array of 3-4 analytical insights about this matchup,',
        'data_sources: array of sources used.',
        'Use null for any stats you cannot find. Do NOT include markdown formatting.'
      ].join(' ');

      const query = [
        `Find current advanced EPL analytics for the matchup: ${awayTeam} at ${homeTeam}`,
        `scheduled for ${dateStr} (2024-25 Premier League season).`,
        'Search FBRef, Understat, FotMob, WhoScored for:',
        '1. Expected Goals (xG) for and against each team',
        '2. Possession and passing accuracy stats',
        '3. Shots and shots on target per game',
        '4. Recent form (last 5 matches)',
        '5. Head-to-head record last 5 meetings',
        '6. Key injuries for both squads',
        'Return as JSON only.'
      ].join(' ');

      let response = await this.search(query);

      if (!response) {
        console.warn('getEplAdvancedStats: first attempt failed, retrying with simplified query');
        const simplified = [
          `Return JSON with EPL advanced stats for ${awayTeam} vs ${homeTeam}.`,
          'Keys: home_advanced, away_advanced, form, head_to_head, key_injuries, key_insights, data_sources.',
          'Include xG, possession%, form (WWDLW format), recent H2H. Use null for unavailable stats.'
        ].join(' ');
        response = await this.search(simplified);
        if (!response) {
          console.warn('getEplAdvancedStats: both attempts failed');
          return this._getDefaultEplAdvancedStats(homeTeam, awayTeam);
        }
      }

      const tryParse = (txt) => {
        if (!txt) return null;
        try {
          const cleaned = txt.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch {}
        return null;
      };

      const parsed = tryParse(response);
      if (parsed) {
        parsed._source = 'perplexity';
        parsed._fetchedAt = new Date().toISOString();
        cache.set(cacheKey, { v: parsed, t: Date.now() });
        return parsed;
      }

      console.warn('getEplAdvancedStats: failed to parse response, using defaults');
      return this._getDefaultEplAdvancedStats(homeTeam, awayTeam);
    } catch (e) {
      console.error('getEplAdvancedStats error:', e.message);
      return this._getDefaultEplAdvancedStats(homeTeam, awayTeam);
    }
  },

  /**
   * Default/fallback EPL advanced stats structure
   */
  _getDefaultEplAdvancedStats: function(homeTeam, awayTeam) {
    return {
      home_advanced: { team: homeTeam, xg_for: null, xg_against: null, xg_difference: null, possession_pct: null, pass_completion_pct: null, shots_per_game: null, shots_on_target_per_game: null, big_chances_created: null, big_chances_missed: null, clean_sheets: null, ppg: null },
      away_advanced: { team: awayTeam, xg_for: null, xg_against: null, xg_difference: null, possession_pct: null, pass_completion_pct: null, shots_per_game: null, shots_on_target_per_game: null, big_chances_created: null, big_chances_missed: null, clean_sheets: null, ppg: null },
      form: { home_last_5: null, home_goals_scored_l5: null, home_goals_conceded_l5: null, away_last_5: null, away_goals_scored_l5: null, away_goals_conceded_l5: null },
      head_to_head: { last_5_meetings: [], home_wins: null, away_wins: null, draws: null },
      key_injuries: { home: [], away: [] },
      key_insights: [],
      data_sources: [],
      _source: 'default',
      _fetchedAt: new Date().toISOString()
    };
  },
  
  /**
   * Extract sports stats from an ESPN game page using Perplexity
   * This uses Perplexity to scrape ESPN for detailed stats
   * @param {string} gameUrl - The ESPN game page URL
   * @param {string} league - The league code ('mlb', 'nba', 'nhl')
   * @returns {Promise<Object>} - Stats as JSON
   */
  extractStatsFromEspn: async function(gameUrl, league = 'mlb') {
    try {
      // Create league-specific prompts
      let prompt = '';
      
      if (league === 'mlb') {
        prompt = `
        Go to ${gameUrl}.
        Extract the following as JSON:
          - Game information (Teams WITH designations of home and away, Venue, Date, Time in ET)
          - Probable pitchers with team clearly specified for each (Name, Team, Handedness, Record, ERA, WHIP, IP, H, K, BB, HR)
          - Batting leaders for each team with clear team labels (Team, Name, HR, AVG, RBI, OBP, SLG)
          - Team stats with explicit home/away designations (Team, Home/Away, AVG, Runs, Hits, HR, OBP, SLG, ERA, WHIP, BB, K, OBA)
          - Last 5 games for each team WITH EXPLICIT TEAM NAMES (Team, Date, Opponent, Result, Runs Scored, Runs Allowed)
          - Full injury report with team specificity (Team, Player, Position, Status, Return Date)
        `;
      } else if (league === 'nba') {
        prompt = `
        Go to ${gameUrl}.
        Extract the following as JSON:
          - Game information (Teams WITH designations of home and away, Venue, Date, Time in ET)
          - Team leaders WITH team name clearly indicated (Team, Player, Points, Rebounds, Assists) for each team
          - Team stats with explicit home/away designations (Team, Home/Away, PPG, RPG, APG, FG%, 3P%, FT%)
          - Last 5 games for each team WITH EXPLICIT TEAM NAMES (Team, Date, Opponent, Result, Points Scored, Points Allowed)
          - Full injury report with team specificity (Team, Player, Position, Status, Return Date)
          - Head to head stats for the season with clear team identification
        `;
      } else if (league === 'nhl') {
        prompt = `
        Go to ${gameUrl}.
        Extract the following as JSON:
          - Game information (Teams WITH designations of home and away, Venue, Date, Time in ET)
          - Team stats with explicit home/away designations (Team, Home/Away, Goals/Game, Goals Against/Game, Shots/Game, PP%, PK%)
          - Team leaders WITH team name clearly indicated (Team, Player, Goals, Assists, Points) for each team
          - Goalie stats with team specification (Team, Goalie, W-L, GAA, SV%)
          - Last 5 games for each team WITH EXPLICIT TEAM NAMES (Team, Date, Opponent, Result, Goals For, Goals Against)
          - Full injury report with team specificity (Team, Player, Position, Status, Return Date)
        `;
      }
      
      // Call Perplexity with specialized prompt as an expert sports data assistant
      const response = await this.search(prompt, {
        model: 'sonar',
        temperature: 0.2,
        maxTokens: 1024,
        systemMessage: 'You are an expert sports data assistant. Extract the requested data from ESPN as structured JSON. Format all statistics exactly as they appear on the site.'
      });
      
      if (!response.success) {
        console.error('Perplexity API call failed');
        return {};
      }
      
      const result = response.data;
      
      // Parse and return only the JSON block from the Perplexity response
      try {
        // Try to extract the first JSON object from the response content
        const match = result.match(/\{[\s\S]*\}/g);
        if (match) {
          return JSON.parse(match[0]);
        }
        return {};
      } catch (err) {
        console.error(`Failed to parse JSON from Perplexity response: ${err.message}`);
        return {};
      }
    } catch (error) {
      console.error(`Error extracting ESPN game stats: ${error.message}`);
      return {};
    }
  },
  
  /**
   * Fetch ESPN game URLs for a given league ('mlb', 'nba', 'nhl') and date.
   * Uses Perplexity to search for game data instead of direct ESPN API calls to avoid CORS issues.
   * @param {string} league - League code ('mlb', 'nba', 'nhl')
   * @param {string} dateStr - Date string in format like "2025-05-19" (null for today)
   * @returns {Promise<string[]>} - Array of ESPN game URLs
   */
  getEspnGameLinks: async function(league, dateStr) {
    try {
      // Format the date in a readable format for the query
      const currentDate = dateStr ? new Date(dateStr) : new Date();
      const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
      const formattedDate = currentDate.toLocaleDateString('en-US', options);
      
      // Customize query based on league
      let query;
      let leagueName = league;
      if (league.toLowerCase() === 'mlb') {
        query = `For today (${formattedDate}), give me all MLB games scheduled with home and away teams, starting times (ET), and pitcher matchups. If you know the ESPN game IDs, include those too. Format each game as: Team1 vs Team2, Time ET, Game ID: [id if known]`;
      } else {
        query = `What ${leagueName} games are scheduled for ${formattedDate}? Only list games with teams and ESPN game IDs if available.`;
      }
      
      console.log(`Getting ESPN game data via Perplexity for ${league} on ${formattedDate}`);
      const systemMessage = 'You are a professional sports data analyst who specializes in retrieving accurate game schedules. Format your response with clear team vs team matchups, one per line. Include ESPN game IDs whenever possible.';
      
      // Try to get data from The Odds API first as a more reliable source
      try {
        // Import oddsService
        const oddsService = (await import('./oddsService')).default;
        const games = await oddsService.getGamesForToday(league);
        
        if (games && games.length > 0) {
          console.log(`Using The Odds API data for ${league} games (${games.length} games found)`); 
          // Create basic game links from odds API data
          const gameLinks = [];
          for (const game of games) {
            const searchableTeams = `${game.home_team} ${game.away_team}`.toLowerCase().replace(/\s+/g, '+');
            const espnUrl = `https://www.espn.com/${league.toLowerCase()}/game?teams=${searchableTeams}`;
            gameLinks.push(espnUrl);
          }
          if (gameLinks.length > 0) {
            return gameLinks;
          }
        }
      } catch (oddsError) {
        console.log(`Unable to use The Odds API: ${oddsError.message}. Falling back to Perplexity.`);
      }
      
      // Fallback to Perplexity
      const result = await this.search(query, {
        systemMessage,
        temperature: 0.2,
        maxTokens: 1024
      });
      
      // Make sure we have a successful result with data before proceeding
      if (!result || !result.success || !result.data) {
        console.error('Failed to get data from Perplexity:', result?.error || 'No data returned');
        return [];
      }
      
      const responseText = result.data;
      
      // Check that responseText is a string before attempting to process it
      if (typeof responseText !== 'string') {
        console.error('Invalid response from Perplexity: Not a string', responseText);
        return [];
      }
      
      // Extract team matchups from the result
      const teamMatchups = this._extractTeamMatchups(responseText, league);
      console.log(`Extracted ${teamMatchups.length} game matchups for ${league}`);
      
      // If we found direct ESPN URLs, add them
      const gameLinks = [];
      const espnUrlRegex = /https?:\/\/(?:www\.)?espn\.com\/[^\/]+\/game\_\/gameId\/(\d+)/g;
      let match;
      while ((match = espnUrlRegex.exec(responseText)) !== null) {
        if (!gameLinks.includes(match[0])) {
          gameLinks.push(match[0]);
        }
      }
      
      // Extract game IDs if present
      const gameIdRegex = /game\s*id\s*[:=]?\s*(\d{9,})|espn\s*game\s*id\s*[:=]?\s*(\d{9,})|gameId\/(\d{9,})/gi;
      let idMatch;
      while ((idMatch = gameIdRegex.exec(responseText)) !== null) {
        const gameId = idMatch[1] || idMatch[2] || idMatch[3];
        if (gameId) {
          const espnUrl = `https://www.espn.com/${league.toLowerCase()}/game/_/gameId/${gameId}`;
          if (!gameLinks.includes(espnUrl)) {
            gameLinks.push(espnUrl);
          }
        }
      }
      
      // If we still have no links but have team matchups, we'll create generic team search links
      if (gameLinks.length === 0 && teamMatchups.length > 0) {
        for (const match of teamMatchups) {
          // Create a link that will help find stats even without a game ID
          const searchableTeams = `${match.homeTeam} ${match.awayTeam}`.toLowerCase().replace(/\s+/g, '+');
          const espnUrl = `https://www.espn.com/${league.toLowerCase()}/game?teams=${searchableTeams}`;
          gameLinks.push(espnUrl);
        }
      }
      
      console.log(`Found ${gameLinks.length} ESPN links for ${league} via Perplexity`);
      return gameLinks;
    } catch (error) {
      console.error(`Error fetching ESPN game links: ${error.message}`);
      return [];
    }
  },
  
  /**
   * Extract team matchups from Perplexity response
   * @param {string} responseText - Perplexity response text
   * @param {string} league - League code
   * @returns {Array} - Array of team matchup objects
   * @private
   */
  _extractTeamMatchups: function(responseText, league) {
    if (!responseText || typeof responseText !== 'string') {
      console.error('Invalid response text for team matchup extraction:', responseText);
      return [];
    }
    
    const matchups = [];
    const lines = responseText.split('\n');
    
    // Different patterns for different sports
    const mlbPattern = /(\w[\w\s.&'-]+)\s+(?:vs\.?|at|@)\s+(\w[\w\s.&'-]+)/gi;
    const generalPattern = /(\w[\w\s.&'-]+)\s+(?:vs\.?|at|@)\s+(\w[\w\s.&'-]+)/gi;
    
    const pattern = league.toLowerCase() === 'mlb' ? mlbPattern : generalPattern;
    
    for (const line of lines) {
      // Skip empty lines or lines that don't look like game matchups
      if (!line.trim() || line.trim().length < 10) continue;
      
      let matchFound = false;
      let match;
      
      // Try to extract team matchups from the line
      while ((match = pattern.exec(line)) !== null) {
        const homeTeam = match[1].trim();
        const awayTeam = match[2].trim();
        
        // Validate team names (basic sanity check)
        if (homeTeam.length < 3 || awayTeam.length < 3) continue;
        
        // Check if this matchup was already added
        const isDuplicate = matchups.some(m => 
          (m.homeTeam === homeTeam && m.awayTeam === awayTeam) ||
          (m.homeTeam === awayTeam && m.awayTeam === homeTeam)
        );
        
        if (!isDuplicate) {
          matchups.push({
            homeTeam,
            awayTeam,
            line: line.trim()
          });
          matchFound = true;
        }
      }
      
      // If we didn't find a match with the pattern, try a more general approach
      if (!matchFound && line.includes('vs')) {
        const parts = line.split('vs');
        if (parts.length === 2) {
          const homeTeam = parts[0].trim();
          // Extract away team (remove time/other info)
          let awayTeam = parts[1].trim();
          awayTeam = awayTeam.split(',')[0].trim();
          
          // Validate team names
          if (homeTeam.length >= 3 && awayTeam.length >= 3) {
            matchups.push({
              homeTeam,
              awayTeam,
              line: line.trim()
            });
          }
        }
      }
    }
    
    return matchups;
  },
  
  /**
   * Match team matchups with The Odds API data
   * @param {Array} matchups - Team matchup objects
   * @param {string} league - League code
   * @returns {Promise<Array>} - Array of team matchups with odds IDs
   * @private
   */
  _matchWithOddsApi: async function(matchups, league) {
    try {
      // Attempt to load the oddsService
      const oddsService = (await import('./oddsService')).default;
      const games = await oddsService.getGamesForToday(league);
      
      if (!games || games.length === 0) {
        return matchups;
      }
      
      // Enhance matchups with odds data where possible
      for (const match of matchups) {
        const matchedGame = games.find(game => {
          return (
            (game.home_team.includes(match.homeTeam) || match.homeTeam.includes(game.home_team)) && 
            (game.away_team.includes(match.awayTeam) || match.awayTeam.includes(game.away_team))
          );
        });
        
        if (matchedGame) {
          match.oddsId = matchedGame.id;
          match.commenceTime = matchedGame.commence_time;
          match.bookmakers = matchedGame.bookmakers;
        }
      }
      
      return matchups;
    } catch (error) {
      console.error('Error matching with The Odds API:', error.message);
      return matchups;
    }
  },
  
  /**
   * Get picks with ESPN stats for a league on a date
   * @param {string} league - League code ('mlb', 'nba', 'nhl')
   * @param {string} dateStr - Date string (or null for today)
   * @returns {Promise<Object>} - Picks with stats
   */
  getPicksWithEspnStats: async function(league = 'mlb', dateStr = null) {
    try {
      const gameLinks = await this.getEspnGameLinks(league, dateStr);
      console.log(`Found ${gameLinks.length} games for ${league}`);
      
      if (gameLinks.length === 0) {
        return {
          success: false,
          error: 'No games found',
          picks: []
        };
      }
      
      // Store all picks with stats
      const allPicksWithStats = [];
      
      // Process each game link
      for (const url of gameLinks) {
        try {
          console.log(`Processing ${url}`);
          
          // Extract stats from ESPN
          const stats = await this.extractStatsFromEspn(url, league);
          
          // Generate a pick using Gary's algo
          const garyEngine = (await import('./garyEngine')).default;
          const garyPick = await garyEngine.generatePickForGame({ 
            stats, 
            league,
            temperature: 0.7
          });
          
          // Extract gameId from URL
          const gameIdMatch = url.match(/gameId\/(\d+)/);
          const gameId = gameIdMatch ? gameIdMatch[1] : null;
          
          // Store picks with stats
          allPicksWithStats.push({
            url,
            gameId,
            stats,
            pick: garyPick,
            league,
            timestamp: new Date().toISOString()
          });
          
        } catch (err) {
          console.error(`Failed to process ${url}: ${err.message}`);
        }
      }
      
      return {
        success: true,
        picks: allPicksWithStats,
        count: allPicksWithStats.length,
        league,
        date: dateStr || 'today'
      };
      
    } catch (error) {
      console.error(`Error in getPicksWithEspnStats: ${error.message}`);
      return {
        success: false,
        error: error.message,
        picks: []
      };
    }
  },

  /**
   * Search for current injuries using Perplexity's Search API
   * Uses the new /search endpoint for structured, real-time results
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name  
   * @param {string} sport - Sport (NBA, NFL, etc.)
   * @returns {Promise<object>} - Structured injury data
   */
  searchInjuries: async function(homeTeam, awayTeam, sport) {
    try {
      const apiKey = process.env.PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY;
      if (!apiKey) {
        console.warn('[Perplexity] No API key for injury search');
        return { home: [], away: [], raw: null };
      }

      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const query = `${sport} injury report ${awayTeam} vs ${homeTeam} ${today} who is OUT DOUBTFUL QUESTIONABLE`;

      console.log(`[Perplexity Search API] Querying injuries: ${homeTeam} vs ${awayTeam}`);

      const response = await axios.post(
        'https://api.perplexity.ai/search',
        {
          query: query,
          max_results: 10,
          search_recency_filter: 'day' // Only get results from past 24 hours
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (!response.data?.results || response.data.results.length === 0) {
        console.log('[Perplexity Search API] No injury results found');
        return { home: [], away: [], raw: null };
      }

      // Parse the search results for injury information
      const injuries = this.parseInjurySearchResults(response.data.results, homeTeam, awayTeam);
      injuries.raw = response.data.results; // Keep raw for debugging

      console.log(`[Perplexity Search API] Found ${injuries.home.length} injuries for ${homeTeam}, ${injuries.away.length} for ${awayTeam}`);
      
      return injuries;

    } catch (error) {
      console.warn(`[Perplexity Search API] Injury search failed: ${error.message}`);
      return { home: [], away: [], raw: null };
    }
  },

  /**
   * Parse Perplexity Search API results for injury information
   */
  parseInjurySearchResults: function(results, homeTeam, awayTeam) {
    const injuries = { home: [], away: [] };
    const foundPlayers = new Set();

    // Common injury status patterns
    const statusPatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*(?:is|has been|remains|was)\s*(ruled out|out|doubtful|questionable|day-to-day|GTD)/gi,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\((out|doubtful|questionable|GTD)\)/gi,
      /(out|doubtful|questionable):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi
    ];

    const normalizeStatus = (status) => {
      const s = status.toLowerCase();
      if (s.includes('out') || s.includes('ruled out')) return 'Out';
      if (s.includes('doubtful')) return 'Doubtful';
      if (s.includes('questionable') || s.includes('gtd') || s.includes('day-to-day')) return 'Questionable';
      return 'Questionable';
    };

    const isHomeTeam = (text) => {
      const textLower = text.toLowerCase();
      return textLower.includes(homeTeam.toLowerCase()) || 
             textLower.includes(homeTeam.split(' ').pop().toLowerCase());
    };

    const isAwayTeam = (text) => {
      const textLower = text.toLowerCase();
      return textLower.includes(awayTeam.toLowerCase()) ||
             textLower.includes(awayTeam.split(' ').pop().toLowerCase());
    };

    for (const result of results) {
      const text = `${result.title || ''} ${result.snippet || ''}`;
      
      for (const pattern of statusPatterns) {
        let match;
        pattern.lastIndex = 0; // Reset regex
        
        while ((match = pattern.exec(text)) !== null) {
          let playerName, status;
          
          // Different capture group orders based on pattern
          if (match[1] && (match[2]?.toLowerCase().includes('out') || 
                          match[2]?.toLowerCase().includes('doubtful') || 
                          match[2]?.toLowerCase().includes('questionable'))) {
            playerName = match[1];
            status = match[2];
          } else if (match[2] && match[1]) {
            // Reverse pattern (status: player)
            playerName = match[2];
            status = match[1];
          }
          
          if (playerName && status && !foundPlayers.has(playerName.toLowerCase())) {
            foundPlayers.add(playerName.toLowerCase());
            
            const injury = {
              player: {
                first_name: playerName.split(' ')[0],
                last_name: playerName.split(' ').slice(1).join(' '),
                position: ''
              },
              status: normalizeStatus(status),
              source: 'perplexity_search',
              sourceUrl: result.url,
              date: result.date
            };
            
            // Determine which team based on context
            const contextStart = Math.max(0, match.index - 100);
            const contextEnd = Math.min(text.length, match.index + 100);
            const context = text.substring(contextStart, contextEnd);
            
            if (isHomeTeam(context)) {
              injuries.home.push(injury);
            } else if (isAwayTeam(context)) {
              injuries.away.push(injury);
            }
          }
        }
      }
    }

    return injuries;
  },

  /**
   * Simple query method for backwards compatibility
   */
  queryPerplexity: async function(query, options = {}) {
    return this.search(query, options);
  }
};

export default perplexityService;
