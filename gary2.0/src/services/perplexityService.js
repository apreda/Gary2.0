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
        model: 'llama-3.1-sonar-small-128k-online',
        temperature: 0.3,
        maxTokens: 500
      };
      
      // Merge options
      const requestOptions = { ...defaultOptions, ...options };

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
      
      const response = await axios.post(
        this.API_BASE_URL,
        {
          model: requestOptions.model,
          messages: messages,
          temperature: requestOptions.temperature,
          max_tokens: requestOptions.maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.API_KEY}`
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      return {
        success: true,
        data: response.data.choices?.[0]?.message?.content || 'No results found',
        raw: response.data
      };
      
    } catch (error) {
      console.error('Error in Perplexity search:', error);
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
    // When running in Node.js environment, dotenv should already have loaded
    // the environment variables from .env file
    if (typeof process !== 'undefined' && process.env) {
      return process.env.VITE_PERPLEXITY_API_KEY || '';
    }
    // When running in browser environment with Vite
    try {
      return import.meta.env?.VITE_PERPLEXITY_API_KEY || '';
    } catch (e) {
      console.error('Error loading Perplexity API key:', e);
      return '';
    }
  })(),
  
  /**
   * Base URL for Perplexity API
   */
  API_BASE_URL: (() => {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      // Use relative path - this will work for both local and deployed environments
      return '/api/perplexity-proxy';
    }
    // Use direct API in Node.js environment
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
  }
};

export default perplexityService;
