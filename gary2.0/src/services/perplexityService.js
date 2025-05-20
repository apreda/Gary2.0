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
      const requestOptions = { ...defaultOptions, ...options };
      
      const response = await axios.post(
        this.API_BASE_URL,
        {
          model: requestOptions.model,
          messages: [
            {
              role: 'user',
              content: query
            }
          ],
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
    try {
      return import.meta.env?.VITE_PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY || '';
    } catch (e) {
      return process.env.VITE_PERPLEXITY_API_KEY || '';
    }
  })(),
  
  /**
   * Base URL for Perplexity API
   */
  API_BASE_URL: 'https://api.perplexity.ai/chat/completions',
  
  /**
   * Fetches real-time information using Perplexity's search capabilities
   * @param {string} query - The search query to send to Perplexity
   * @param {object} options - Additional options for the request
   * @returns {Promise<string>} - The search results as text
   */
  fetchRealTimeInfo: async function(query, options = {}) {
    try {
      console.log(`Fetching real-time information: "${query}"`);
      
      // Create a more concise, focused query
      let optimizedQuery = query;
      if (query.length > 150) {
        // Extract team names for very focused query
        const teamMatch = query.match(/between ([\w\s]+) and ([\w\s]+)/i);
        if (teamMatch && teamMatch.length >= 3) {
          const sportMatch = query.match(/(basketball|baseball|icehockey|soccer|football)_(\w+)/i);
          const sport = sportMatch ? sportMatch[0] : '';
          optimizedQuery = `${sport} ${teamMatch[1]} vs ${teamMatch[2]}: key injuries, form, betting trends. Brief factual analysis only.`;
          console.log(`🔥 Optimized query: ${optimizedQuery}`);
        }
      }
      
      // Default options with correct model name from Perplexity documentation
      const defaultOptions = {
        model: 'sonar', // Using the official model name from Perplexity documentation
        temperature: 0.3, // Lower temperature for more factual, faster responses
        maxTokens: 300    // Reasonable output length for sports analysis
      };
      
      // Merge default options with provided options
      const requestOptions = { ...defaultOptions, ...options };
      
      const response = await this.search(optimizedQuery, requestOptions);
      return response.success ? response.data : '';
      
    } catch (error) {
      console.error('Error in fetchRealTimeInfo:', error);
      return '';
    }
  },
  
  // No simulation responses - only use real API data
  
  /**
   * Gets the latest news and updates for a specific game
   * @param {string} homeTeam - The home team name
   * @param {string} awayTeam - The away team name
   * @param {string} league - The sports league (NBA, MLB, etc.)
   * @returns {Promise<string>} - The latest news as text
   */
  /**
   * Gets game time, headlines, and key injuries for a specific game
   * @param {string} homeTeam - The home team name
   * @param {string} awayTeam - The away team name
   * @param {string} league - The sports league (NBA, MLB, NHL, etc.)
   * @returns {Promise<object>} - Game time, headlines and injuries data
   */
  getGameTimeAndHeadlines: async function(homeTeam, awayTeam, league) {
    try {
      // First, try to get accurate game time from ESPN API
      try {
        console.log(`Getting ESPN game data for ${league} game: ${awayTeam} @ ${homeTeam}`);
        const gameLinks = await this.getEspnGameLinks(league === 'MLB' ? 'mlb' : league === 'NBA' ? 'nba' : league === 'NHL' ? 'nhl' : 'mlb');
        
        if (gameLinks && gameLinks.length > 0) {
          // Find the matching game link by matching team names
          const normalizedHomeTeam = homeTeam.toLowerCase().replace(/\s+/g, '');
          const normalizedAwayTeam = awayTeam.toLowerCase().replace(/\s+/g, '');
          
          // Get the first game that matches either home or away team
          for (const link of gameLinks) {
            const stats = await this.extractStatsFromEspn(link, league.toLowerCase());
            if (stats && stats['Game information']) {
              const gameInfo = stats['Game information'];
              // Check if this is the right game by matching team names
              const infoStr = JSON.stringify(gameInfo).toLowerCase();
              if (infoStr.includes(normalizedHomeTeam) || infoStr.includes(normalizedAwayTeam)) {
                // Extract game time
                if (gameInfo.Date && gameInfo.Time) {
                  console.log(`Found ESPN game time: ${gameInfo.Date} at ${gameInfo.Time}`);
                  // Add headlines and return
                  const headlines = [];
                  if (stats['Team leaders']) headlines.push(`Team leaders: ${JSON.stringify(stats['Team leaders']).slice(0, 100)}...`);
                  if (stats['Last 5 games']) headlines.push(`Recent form: ${JSON.stringify(stats['Last 5 games']).slice(0, 100)}...`);
                  
                  // Get injuries
                  const keyInjuries = { homeTeam: [], awayTeam: [] };
                  if (stats['Full injury report']) {
                    // Parse injuries by team
                    Object.entries(stats['Full injury report']).forEach(([team, players]) => {
                      if (team.toLowerCase().includes(normalizedHomeTeam)) {
                        keyInjuries.homeTeam = Array.isArray(players) ? players : [players];
                      } else if (team.toLowerCase().includes(normalizedAwayTeam)) {
                        keyInjuries.awayTeam = Array.isArray(players) ? players : [players];
                      }
                    });
                  }
                  
                  return {
                    gameTime: `${gameInfo.Time} ET`,
                    headlines: headlines.slice(0, 3),
                    keyInjuries
                  };
                }
              }
            }
          }
        }
      } catch (espnError) {
        console.warn('Failed to get game time from ESPN:', espnError.message);
      }
      
      // FALLBACK 1: Try to get game time from The Odds API
      try {
        console.log(`Trying The Odds API to get game time for ${league} game: ${awayTeam} @ ${homeTeam}`);
        
        // Import oddsService
        const { oddsService } = await import('./oddsService.js');
        
        // Map league to sport key format used by The Odds API
        const sportKey = league === 'NBA' ? 'basketball_nba' : 
                        league === 'MLB' ? 'baseball_mlb' : 
                        league === 'NHL' ? 'icehockey_nhl' : null;
        
        if (sportKey) {
          const games = await oddsService.getUpcomingGames(sportKey);
          
          // Find the matching game
          const game = games.find(g => {
            const gameHomeTeam = g.home_team.toLowerCase();
            const gameAwayTeam = g.away_team.toLowerCase();
            const searchHomeTeam = homeTeam.toLowerCase();
            const searchAwayTeam = awayTeam.toLowerCase();
            
            return (
              (gameHomeTeam.includes(searchHomeTeam) || searchHomeTeam.includes(gameHomeTeam)) &&
              (gameAwayTeam.includes(searchAwayTeam) || searchAwayTeam.includes(gameAwayTeam))
            );
          });
          
          if (game && game.commence_time) {
            // Format the game time from ISO to readable format
            const gameDate = new Date(game.commence_time);
            // Convert to Eastern Time
            const options = { 
              timeZone: 'America/New_York',
              hour: 'numeric',
              minute: 'numeric',
              hour12: true
            };
            const gameTimeET = gameDate.toLocaleTimeString('en-US', options);
            console.log(`Found game time from The Odds API: ${gameTimeET} ET`);
            
            return {
              gameTime: `${gameTimeET} ET`,
              headlines: [],
              keyInjuries: { homeTeam: [], awayTeam: [] }
            };
          }
        }
      } catch (oddsApiError) {
        console.warn('Failed to get game time from The Odds API:', oddsApiError.message);
      }
      
      // FALLBACK 2: Try to get game time from TheSportsDB API
      try {
        console.log(`Trying TheSportsDB API to get game time for ${league} game: ${awayTeam} @ ${homeTeam}`);
        
        // Import sportsDbApiService
        const { sportsDbApiService } = await import('./sportsDbApiService.js');
        
        // Map league to league ID used by TheSportsDB
        const leagueId = league === 'NBA' ? sportsDbApiService.leagueIds.NBA : 
                        league === 'MLB' ? sportsDbApiService.leagueIds.MLB : 
                        league === 'NHL' ? sportsDbApiService.leagueIds.NHL : null;
        
        if (leagueId) {
          // Get today's date in YYYY-MM-DD format
          const today = new Date().toISOString().split('T')[0];
          const events = await sportsDbApiService.getEventsByDate(leagueId, today);
          
          if (events && events.length > 0) {
            // Find the matching event
            const event = events.find(e => {
              const eventHomeTeam = (e.strHomeTeam || '').toLowerCase();
              const eventAwayTeam = (e.strAwayTeam || '').toLowerCase();
              const searchHomeTeam = homeTeam.toLowerCase();
              const searchAwayTeam = awayTeam.toLowerCase();
              
              return (
                (eventHomeTeam.includes(searchHomeTeam) || searchHomeTeam.includes(eventHomeTeam)) &&
                (eventAwayTeam.includes(searchAwayTeam) || searchAwayTeam.includes(eventAwayTeam))
              );
            });
            
            if (event && event.strTime) {
              console.log(`Found game time from TheSportsDB API: ${event.strTime}`);
              
              // Format the time to ensure it includes ET
              let gameTime = event.strTime;
              if (!gameTime.includes('ET')) {
                gameTime = `${gameTime} ET`;
              }
              
              return {
                gameTime: gameTime,
                headlines: [],
                keyInjuries: { homeTeam: [], awayTeam: [] }
              };
            }
          }
        }
      } catch (sportsDbError) {
        console.warn('Failed to get game time from TheSportsDB API:', sportsDbError.message);
      }
      
      // FALLBACK 3: Use Perplexity with a more specific query
      const query = `Search for the exact scheduled game time (in Eastern Time) for the upcoming ${league} game between ${awayTeam} (away) and ${homeTeam} (home) happening today or tomorrow. Also provide 2-3 key headlines about the matchup and list any key injuries for either team.

This is VERY important: Format your response in valid JSON like this exact structure:
{
"gameTime": "7:05 PM ET", 
"headlines": ["headline 1", "headline 2", "headline 3"],
"keyInjuries": {
  "homeTeam": ["Player 1 (Status)", "Player 2 (Status)"],
  "awayTeam": ["Player 3 (Status)", "Player 4 (Status)"]
}
}`;
      
      const response = await this.search(query, {
        temperature: 0.1, // Lower temperature for more factual responses
        maxTokens: 600,
        model: 'sonar-medium',
        systemMessage: 'You are a sports data extraction assistant that provides precise, accurate game information in valid JSON format. Always return valid JSON, never include explanations outside the JSON structure.'
      });
      
      if (!response.success) {
        // FALLBACK 4: If all else fails, generate a reasonable default time based on league
        const defaultTimes = {
          'NBA': '7:30 PM ET',
          'MLB': '7:05 PM ET',
          'NHL': '7:00 PM ET'
        };
        
        // Use league-specific default or general default
        const defaultTime = defaultTimes[league] || '7:00 PM ET';
        console.log(`Using default time for ${league} game: ${defaultTime}`);
        
        return { 
          gameTime: defaultTime, 
          headlines: [], 
          keyInjuries: { homeTeam: [], awayTeam: [] }
        };
      }
      
      // Try to parse structured data from the response
      try {
        // Look for JSON structure in the response
        const jsonMatch = response.data.match(/\{[\s\S]*\}/g);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);
          const gameTime = parsedData.gameTime || 'TBD';
          console.log(`Extracted game time from Perplexity: ${gameTime}`);
          
          // If Perplexity returned TBD, use our league-specific default
          if (gameTime === 'TBD') {
            const defaultTimes = {
              'NBA': '7:30 PM ET',
              'MLB': '7:05 PM ET',
              'NHL': '7:00 PM ET'
            };
            const defaultTime = defaultTimes[league] || '7:00 PM ET';
            parsedData.gameTime = defaultTime;
          }
          
          // If game time doesn't include ET, add it
          if (!parsedData.gameTime.includes('ET')) {
            parsedData.gameTime = `${parsedData.gameTime} ET`;
          }
          
          return {
            gameTime: parsedData.gameTime,
            headlines: Array.isArray(parsedData.headlines) ? parsedData.headlines : [],
            keyInjuries: parsedData.keyInjuries || { homeTeam: [], awayTeam: [] }
          };
        }
      } catch (parseError) {
        console.warn('Failed to parse JSON from game time response:', parseError.message);
      }
      
      // Fallback: Try to extract data using regex patterns if JSON parsing fails
      const gameTimeMatch = response.data.match(/gameTime[:\s]+(\"[^\"]+\"|\d{1,2}:\d{2}\s*[AP]M|\d{1,2}\s*[AP]M|TBD|TBA)/i);
      const gameTime = gameTimeMatch ? gameTimeMatch[1].replace(/\"/g, '') : 'TBD';
      
      // Extract headlines as bullet points or numbered items
      const headlines = [];
      const headlineMatches = response.data.match(/headlines:[\s\S]*?((?:-|\d+\.)\s+[^\n]+[\n]?)+/i);
      if (headlineMatches) {
        const headlinesList = headlineMatches[0].split(/\n/).filter(line => line.match(/^\s*(?:-|\d+\.)\s+/));
        headlines.push(...headlinesList.map(h => h.replace(/^\s*(?:-|\d+\.)\s+/, '').trim()));
      }
      
      return {
        gameTime: gameTime,
        headlines: headlines.slice(0, 3), // Limit to 3 headlines
        keyInjuries: { homeTeam: [], awayTeam: [] } // Basic structure for injuries
      };
    } catch (error) {
      console.error('Error in getGameTimeAndHeadlines:', error.message);
      return { gameTime: 'TBD', headlines: [], keyInjuries: { homeTeam: [], awayTeam: [] }};
    }
  },
  
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
   * This method is similar to what's used in prop picks to retrieve game data.
   * @param {string} league - League code ('mlb', 'nba', 'nhl')
   * @param {string} dateStr - Date string in format like "2025-05-19" (null for today)
   * @returns {Promise<string[]>} - Array of ESPN game URLs
   */
  getEspnGameLinks: async function(league = 'mlb', dateStr = null) {
    try {
      // Format the date for the query
      const today = new Date();
      const formattedDate = dateStr || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      
      // Define league-specific terms
      const leagueNames = {
        'mlb': 'MLB',
        'nba': 'NBA',
        'nhl': 'NHL'
      };
      
      const leagueName = leagueNames[league.toLowerCase()] || 'sports';
      
      // Create more effective queries for different sports
      // For MLB, we'll try to get specific team matchups with pitcher info
      let query = '';
      if (league.toLowerCase() === 'mlb') {
        query = `For today (${formattedDate}), give me all ${leagueName} games scheduled with home and away teams, starting times (ET), and pitcher matchups. If you know the ESPN game IDs, include those too. Format each game as: Team1 vs Team2, Time ET, Game ID: [id if known]`;
      } else {
        query = `What ${leagueName} games are scheduled for ${formattedDate}? List all games with format: Team1 vs Team2, Time ET. Include ESPN game IDs if known.`;
      }
      
      // Use Perplexity to get the information with a specialized system prompt
      console.log(`Getting ESPN game data via Perplexity for ${league} on ${formattedDate}`);
      const systemMessage = 'You are a professional sports data analyst who specializes in retrieving accurate game schedules. Format your response with clear team vs team matchups, one per line. Include ESPN game IDs whenever possible.';
      const result = await this.search(query, {
        systemMessage,
        temperature: 0.2,
        maxTokens: 1024
      });
      
      // Extract team matchups from the result
      const teamMatchups = this._extractTeamMatchups(result, league);
      console.log(`Extracted ${teamMatchups.length} game matchups for ${league}`);
      
      // First, try to match these with The Odds API to get IDs
      const oddsMatches = await this._matchWithOddsApi(teamMatchups, league);
      
      // If we found direct ESPN URLs, add them
      const gameLinks = [];
      const espnUrlRegex = /https?:\/\/(?:www\.)?espn\.com\/[^\/]+\/game\_\/gameId\/(\d+)/g;
      let match;
      while ((match = espnUrlRegex.exec(result)) !== null) {
        if (!gameLinks.includes(match[0])) {
          gameLinks.push(match[0]);
        }
      }
      
      // Extract game IDs if present
      const gameIdRegex = /game\s*id\s*[:=]?\s*(\d{9,})|espn\s*game\s*id\s*[:=]?\s*(\d{9,})|gameId\/(\d{9,})/gi;
      let idMatch;
      while ((idMatch = gameIdRegex.exec(result)) !== null) {
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
   * @param {string} response - Perplexity response text
   * @param {string} league - League code
   * @returns {Array} - Array of team matchup objects
   * @private
   */
  _extractTeamMatchups: function(response, league) {
    const matchups = [];
    const lines = response.split('\n');
    
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
   * @returns {Array} - Matchups with IDs if found
   * @private
   */
  _matchWithOddsApi: async function(matchups, league) {
    try {
      // If no matchups, just return
      if (!matchups || matchups.length === 0) return matchups;
      
      // Import oddsService dynamically to avoid circular dependencies
      const { oddsService } = await import('./oddsService.js');
      
      // Convert league codes
      const oddsLeague = league.toLowerCase() === 'mlb' ? 'baseball_mlb' :
                         league.toLowerCase() === 'nba' ? 'basketball_nba' :
                         league.toLowerCase() === 'nhl' ? 'hockey_nhl' : null;
      
      if (!oddsLeague) return matchups;
      
      // Get today's games from Odds API
      const options = { timeZone: 'America/New_York' };
      const today = new Date().toLocaleString('en-US', options).split(',')[0];
      
      const games = await oddsService.getGamesForSport(oddsLeague, today);
      
      if (!games || games.length === 0) return matchups;
      
      // Match team names with Odds API data
      for (const matchup of matchups) {
        // Normalize team names for comparison
        const homeTeamNorm = matchup.homeTeam.toLowerCase().replace(/\s+/g, '');
        const awayTeamNorm = matchup.awayTeam.toLowerCase().replace(/\s+/g, '');
        
        // Find matching game from Odds API
        const match = games.find(game => {
          const apiHome = game.home_team.toLowerCase().replace(/\s+/g, '');
          const apiAway = game.away_team.toLowerCase().replace(/\s+/g, '');
          
          return (apiHome.includes(homeTeamNorm) || homeTeamNorm.includes(apiHome)) &&
                 (apiAway.includes(awayTeamNorm) || awayTeamNorm.includes(apiAway));
        });
        
        if (match) {
          matchup.id = match.id;
          matchup.gameTime = match.commence_time;
          matchup.matchedTeams = { home: match.home_team, away: match.away_team };
        }
      }
      
      return matchups;
    } catch (error) {
      console.error('Error matching with Odds API:', error.message);
      return matchups;
    }
  },
  
  /**
   * Fetch game stats for all games today and provide to OpenAI for pick generation
   * This method combines ESPN stats extraction with OpenAI for normal pick generation
   * @param {string} league - League code ('mlb', 'nba', 'nhl')
   * @param {string} dateStr - Date string in YYYYMMDD format (null for today) 
   * @returns {Promise<Array>} - Array of picks with stats and reasoning
   */
  getPicksWithEspnStats: async function(league = 'mlb', dateStr = null) {
    try {
      // 1. Get all game links
      const links = await this.getEspnGameLinks(league, dateStr);
      console.log(`Fetched ${links.length} ESPN game links for ${league}`);
      
      const allPicksWithStats = [];
      
      // 2. For each link, get stats from Perplexity
      for (const url of links) {
        try {
          console.log(`Processing: ${url}`);
          
          // Extract teams from URL if possible
          const urlParts = url.split('/');
          const gameId = urlParts[urlParts.length - 1];
          
          // Extract stats using Perplexity
          const stats = await this.extractStatsFromEspn(url, league);
          console.log('Extracted stats from ESPN', Object.keys(stats));
          
          // Define the expected data fields we should have
          const expectedFields = [
            'Game information',
            'Probable pitchers',
            'Batting leaders',
            'Team stats',
            'Last 5 games',
            'Full injury report'
          ];
          
          // Calculate completeness score (0.0 to 1.0)
          const availableFields = Object.keys(stats);
          const completenessScore = availableFields.length / expectedFields.length;
          
          // Only proceed if we got sufficient stats (at least 75% of expected fields)
          if (completenessScore < 0.75) {
            console.log(`Insufficient stats extracted for ${url}: Score ${completenessScore.toFixed(2)} (${availableFields.length}/${expectedFields.length} fields)`);
            console.log(`Missing fields: ${expectedFields.filter(field => !availableFields.some(key => key.includes(field))).join(', ')}`);
            continue;
          }
          
          console.log(`✅ Stats completeness score for ${url}: ${(completenessScore * 100).toFixed(0)}%`);
          
          // Build a prompt for OpenAI using the extracted stats - with sport-specific instructions
          let dataSourcesText = '';
          
          // Sport-specific data source instructions
          if (league === 'mlb') {
            dataSourcesText = 'Game info, probable pitchers, batting leaders, team stats, last 5 games, injury report';
          } else if (league === 'nba') {
            dataSourcesText = 'Game info, team leaders, team stats, last 5 games, injury report, head-to-head stats';
          } else if (league === 'nhl') {
            dataSourcesText = 'Game info, team stats, team leaders, goalie stats, last 5 games, injury report';
          }
          
          const openAIPrompt = `
            Analyze this ${league.toUpperCase()} game using the following stats:
            ${JSON.stringify(stats, null, 2)}

            IMPORTANT: Pay careful attention to which stats belong to which team. Be 100% certain about home vs away team designations.
            
            CRITICAL: Your rationale MUST ONLY use the following data points: ${dataSourcesText}.
            DO NOT use any other data sources or information outside what is provided above.

            1. Make a clear pick (moneyline or spread only).
            2. Keep your analysis VERY SHORT (2-3 sentences max).
            3. Only include the specific data-driven reasons why you took that pick.
            4. Use Gary's confident voice but avoid unnecessary commentary.
          `;
          
          // Use the OpenAI service to get a pick with the stats
          const { openaiService } = await import('./openaiService.js');
          const garyPick = await openaiService.getCompletion(openAIPrompt, {
            model: 'gpt-4o',
            temperature: 0.7,
            systemMessage: "You are Gary, a veteran sports betting analyst with swagger. Give confident, data-driven picks."
          });
          
          // Add the result to our collection
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
