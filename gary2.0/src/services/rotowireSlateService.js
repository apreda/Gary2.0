/**
 * RotoWire Slate Scraper Service
 * 
 * Scrapes actual DFS slate data from RotoWire using Puppeteer
 * RotoWire gets their data directly from DraftKings/FanDuel, making it
 * the SOURCE OF TRUTH for which games are in each slate.
 * 
 * For slates where we can't scrape the teams directly, we use Tank01
 * game times to infer which teams are in each slate based on the
 * slate's start time and game count.
 * 
 * Usage:
 *   import { fetchSlatesFromRotoWire } from './rotowireSlateService.js';
 *   const slates = await fetchSlatesFromRotoWire('fanduel', 'NBA');
 */

import puppeteer from 'puppeteer';

// Cache slates for 1 hour to avoid excessive scraping
const slateCache = new Map();
const injuryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const INJURY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes for injuries as they change fast

/**
 * Fetch lineups and injuries from RotoWire lineups page
 * 
 * @param {string} sport - 'NBA', 'NFL', 'NHL'
 * @returns {Promise<Object>} Object with lineups and injuries per team
 */
export async function fetchLineupsAndInjuries(sport = 'NBA') {
  const sportUpper = sport.toUpperCase();
  const cacheKey = `lineups-${sportUpper}`;
  
  // Check cache
  const cached = injuryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < INJURY_CACHE_TTL_MS) {
    console.log(`[RotoWire] 📦 Using cached lineups/injuries for ${sportUpper}`);
    return cached.data;
  }
  
  let sportPath = 'basketball';
  let pagePath = 'nba-lineups.php';
  
  if (sportUpper === 'NFL') {
    sportPath = 'football';
    pagePath = 'nfl-lineups.php';
  } else if (sportUpper === 'NHL') {
    sportPath = 'hockey';
    pagePath = 'nhl-lineups.php';
  }
  
  const url = `https://www.rotowire.com/${sportPath}/${pagePath}`;
  console.log(`[RotoWire] 🌐 Scraping lineups/injuries from: ${url}`);
  
  let browser = null;
  
  // Wrap entire scraping in a timeout promise (max 20 seconds)
  const scrapePromise = (async () => {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1200 });
      
      // Use faster 'domcontentloaded' instead of 'networkidle2' and shorter timeout
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
        console.warn(`[RotoWire] Page load slow/failed: ${e.message}`);
        // Continue anyway - page may have partially loaded
      });
      
      // Give page a moment to render
      await new Promise(r => setTimeout(r, 2000));
    
    const data = await page.evaluate((sportName) => {
      const results = {};
      
      // Select all game boxes
      const gameBoxes = document.querySelectorAll('.lineups, .lineup-box, .lineup__box');
      
      gameBoxes.forEach(box => {
        // Find team names
        const teams = Array.from(box.querySelectorAll('.lineup__abbr, .lineup__team-name, [class*="team-name"]'))
          .map(el => el.textContent?.trim().toUpperCase());
        
        if (teams.length >= 2) {
          const awayTeam = teams[0];
          const homeTeam = teams[1];
          
          results[awayTeam] = { opponent: homeTeam, lineups: [], injuries: [] };
          results[homeTeam] = { opponent: awayTeam, lineups: [], injuries: [] };
          
          // Find starters/lineups
          const lineupLists = box.querySelectorAll('.lineup__list, .lineup__main');
          lineupLists.forEach((list, idx) => {
            const teamKey = idx === 0 ? awayTeam : homeTeam;
            const players = Array.from(list.querySelectorAll('.lineup__player, [class*="player"]'));
            players.forEach(p => {
              const name = p.querySelector('a')?.textContent?.trim() || p.textContent?.trim();
              const pos = p.querySelector('.lineup__pos')?.textContent?.trim() || '';
              if (name) {
                results[teamKey].lineups.push({ name, position: pos, isStarter: true });
              }
            });
          });
          
          // Find injuries
          const injuryLists = box.querySelectorAll('.lineup__injuries, .lineup__injury');
          injuryLists.forEach((list, idx) => {
            const teamKey = idx === 0 ? awayTeam : homeTeam;
            const players = Array.from(list.querySelectorAll('li, .lineup__player'));
            players.forEach(p => {
              const name = p.querySelector('a')?.textContent?.trim() || p.textContent?.trim();
              const status = p.querySelector('.lineup__status, .lineup__inj')?.textContent?.trim() || '';
              if (name && name.length > 2) {
                // Clean up name (often contains status at the end like "LeBron James (Q)")
                let cleanName = name.split('(')[0].trim();
                let cleanStatus = status || '';
                
                if (!cleanStatus && name.includes('(')) {
                  const match = name.match(/\(([^)]+)\)/);
                  if (match) cleanStatus = match[1];
                }
                
                results[teamKey].injuries.push({ 
                  name: cleanName, 
                  status: cleanStatus.toUpperCase() 
                });
              }
            });
          });
        }
      });
      
      return results;
    }, sportUpper);
    
    console.log(`[RotoWire] ✅ Found lineups/injuries for ${Object.keys(data).length} teams`);
    
    // Cache result
    injuryCache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
  } catch (error) {
    console.error(`[RotoWire] ❌ Lineup scraping failed: ${error.message}`);
    return {};
  } finally {
    if (browser) {
      await browser.close().catch(e => console.warn(`[RotoWire] Browser close error: ${e.message}`));
    }
  }
  })();

  // Race the scrape against a 20-second timeout
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.warn(`[RotoWire] ⏱️ Scraping timeout (20s) - returning empty data`);
      resolve({});
    }, 20000);
  });

  return Promise.race([scrapePromise, timeoutPromise]);
}

/**
 * Fetch DFS slates from RotoWire by scraping their optimizer page
 * 
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @param {string} date - Optional date string (defaults to today)
 * @returns {Promise<Array>} Array of slate objects with teams
 */
export async function fetchSlatesFromRotoWire(platform = 'fanduel', sport = 'NBA', date = null) {
  const cacheKey = `${platform}-${sport}-${date || 'today'}`;
  
  // Check cache first
  const cached = slateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[RotoWire] 📦 Using cached slates for ${platform} ${sport}`);
    return cached.slates;
  }
  
  const platformParam = platform === 'fanduel' ? '?site=FanDuel' : '';
  const sportPath = sport.toLowerCase();
  const url = `https://www.rotowire.com/daily/${sportPath}/optimizer.php${platformParam}`;
  
  console.log(`[RotoWire] 🌐 Scraping slates from: ${url}`);
  
  let browser = null;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to RotoWire
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for the page to fully load
    await page.waitForSelector('button, .slate-selector, [class*="slate"]', { timeout: 10000 }).catch(() => {});
    
    // Click on "Change Slate" button to reveal slate dropdown
    // Use evaluate to find and click the button
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const changeSlateBtn = buttons.find(btn => 
        btn.textContent?.includes('Change Slate') || 
        btn.textContent?.includes('Change')
      );
      if (changeSlateBtn) {
        changeSlateBtn.click();
        return true;
      }
      return false;
    });
    
    if (clicked) {
      await new Promise(r => setTimeout(r, 1000)); // Wait for dropdown animation
    } else {
      console.log('[RotoWire] ⚠️ Change Slate button not found, trying alternative methods...');
    }
    
    // Extract slate data from the page
    const slates = await page.evaluate((platformName) => {
      const results = [];
      
      // Look for slate rows in the dropdown/modal
      // RotoWire typically shows: Slate Name | Game Type | Start Time | Games Count
      const slateRows = document.querySelectorAll('[class*="slate-row"], [class*="slate-option"], tr[class*="slate"], .modal-body tr, [role="listbox"] [role="option"]');
      
      if (slateRows.length > 0) {
        slateRows.forEach(row => {
          const text = row.textContent || '';
          const cells = row.querySelectorAll('td, [class*="cell"], span');
          
          if (cells.length >= 3) {
            const name = cells[0]?.textContent?.trim() || '';
            const gameType = cells[1]?.textContent?.trim() || '';
            const startTime = cells[2]?.textContent?.trim() || '';
            const gamesCount = parseInt(cells[3]?.textContent?.trim()) || 0;
            
            // Only include Full Roster / Classic slates, not SingleGame/Showdown
            if (name && (gameType.includes('Full') || gameType.includes('Classic') || !gameType.includes('Single'))) {
              results.push({
                name,
                type: gameType || 'Classic',
                startTime,
                gameCount: gamesCount,
                teams: [] // Will be populated when slate is selected
              });
            }
          }
        });
      }
      
      // Fallback: Try to find slate info from visible elements on the page
      if (results.length === 0) {
        // Look for the current slate info
        const slateHeader = document.querySelector('[class*="slate-name"], [class*="slate-header"], h2, h3');
        const gamesSection = document.querySelector('[class*="games"], [class*="matchup"]');
        
        if (slateHeader) {
          const slateName = slateHeader.textContent?.trim() || 'Main';
          
          // Extract teams from visible games
          const teams = [];
          const teamElements = document.querySelectorAll('[class*="team-abbr"], [class*="team-name"], .matchup-team, [class*="away"], [class*="home"]');
          teamElements.forEach(el => {
            const teamText = el.textContent?.trim();
            if (teamText && teamText.length <= 4 && /^[A-Z]{2,4}$/.test(teamText)) {
              teams.push(teamText);
            }
          });
          
          results.push({
            name: slateName,
            type: 'Classic',
            startTime: 'TBD',
            gameCount: Math.floor(teams.length / 2) || 0,
            teams: [...new Set(teams)]
          });
        }
      }
      
      return results;
    }, platform);
    
      // Valid NBA team abbreviations (to filter out positions like PG, PF, SF, SG, C)
    const NBA_TEAMS = new Set([
      'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GS', 'GSW',
      'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NO', 'NOP', 'NY', 
      'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SA', 'SAS', 'TOR', 'UTA', 'WAS'
    ]);
    
    // If we found slates, try to get the teams for the main slate
    if (slates.length > 0 && slates[0].teams.length === 0) {
      // Extract teams from the current page view
      const teams = await page.evaluate(() => {
        const teamSet = new Set();
        
        // Look for team abbreviations in the games section
        const teamElements = document.querySelectorAll('[class*="team"], [class*="abbr"], .matchup span, td');
        teamElements.forEach(el => {
          const text = el.textContent?.trim();
          // Match 2-4 letter team abbreviations
          if (text && /^[A-Z]{2,4}$/.test(text)) {
            teamSet.add(text);
          }
        });
        
        // Also check for team names in game cards
        const gameCards = document.querySelectorAll('[class*="game"], [class*="matchup"]');
        gameCards.forEach(card => {
          const text = card.textContent;
          // Extract teams from "TOR @ BOS" or "TOR vs BOS" format
          const matches = text.match(/([A-Z]{2,4})\s*[@vs]+\s*([A-Z]{2,4})/gi);
          if (matches) {
            matches.forEach(match => {
              const parts = match.split(/[@vs]+/i);
              parts.forEach(p => {
                const team = p.trim();
                if (team.length >= 2 && team.length <= 4) {
                  teamSet.add(team.toUpperCase());
                }
              });
            });
          }
        });
        
        return [...teamSet];
      });
      
      // Filter to only valid NBA teams
      slates[0].teams = teams.filter(t => NBA_TEAMS.has(t));
    }
    
    // Filter teams in all slates to only valid NBA teams
    slates.forEach(slate => {
      if (slate.teams && slate.teams.length > 0) {
        slate.teams = slate.teams.filter(t => NBA_TEAMS.has(t));
      }
      
      // For slates with "@" in the name (e.g., "TOR @ BOS"), extract teams from name
      if (slate.name.includes('@') && slate.teams.length === 0) {
        const match = slate.name.match(/([A-Z]{2,4})\s*@\s*([A-Z]{2,4})/);
        if (match) {
          slate.teams = [match[1], match[2]].filter(t => NBA_TEAMS.has(t));
        }
      }
    });
    
    // Filter out Showdown/SingleGame slates - only keep "Classic" type Full Roster slates
    // Single game slates have "@" in the name or "1 games" count typically
    const classicSlates = slates.filter(slate => {
      const name = slate.name.toLowerCase();
      const isShowdown = name.includes('@') || 
                         name.includes('showdown') || 
                         name.includes('single') ||
                         name.includes('2h ') ||  // Second half slates
                         slate.gameCount === 1;
      return !isShowdown;
    });
    
    // Replace slates with filtered classic slates
    slates.length = 0;
    slates.push(...classicSlates);
    
    console.log(`[RotoWire] ✅ Found ${slates.length} slates`);
    slates.forEach(s => {
      console.log(`   📋 ${s.name}: ${s.gameCount} games (${s.startTime}) - ${s.teams.length} teams`);
    });
    
    // Cache the results
    slateCache.set(cacheKey, { slates, timestamp: Date.now() });
    
    return slates;
    
  } catch (error) {
    console.error(`[RotoWire] ❌ Scraping failed: ${error.message}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Get teams for a specific slate by clicking on it
 * 
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @param {string} slateName - Name of the slate to select
 * @returns {Promise<Array>} Array of team abbreviations
 */
export async function getTeamsForSlate(platform, sport, slateName) {
  const platformParam = platform === 'fanduel' ? '?site=FanDuel' : '';
  const sportPath = sport.toLowerCase();
  const url = `https://www.rotowire.com/daily/${sportPath}/optimizer.php${platformParam}`;
  
  console.log(`[RotoWire] 🔍 Getting teams for ${slateName} slate...`);
  
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Click on "Change Slate" to open dropdown
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes('Change Slate'));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));
    
    // Click on the specific slate by name
    await page.evaluate((name) => {
      const elements = Array.from(document.querySelectorAll('*'));
      const el = elements.find(e => e.textContent?.trim() === name);
      if (el) el.click();
    }, slateName);
    await page.waitForTimeout(1000);
    
    // Extract teams from the visible games
    const teams = await page.evaluate(() => {
      const teamSet = new Set();
      
      // Find team abbreviations
      document.querySelectorAll('[class*="team"], .matchup, [class*="game"]').forEach(el => {
        const text = el.textContent;
        const matches = text.match(/\b([A-Z]{2,4})\b/g);
        if (matches) {
          matches.forEach(m => {
            if (m.length >= 2 && m.length <= 4) {
              teamSet.add(m);
            }
          });
        }
      });
      
      return [...teamSet];
    });
    
    console.log(`[RotoWire] ✅ Found ${teams.length} teams for ${slateName}: ${teams.join(', ')}`);
    
    return teams;
    
  } catch (error) {
    console.error(`[RotoWire] ❌ Failed to get teams for ${slateName}: ${error.message}`);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Populate teams for slates using game data
 * For slates without team data, we log a warning since the game times
 * function was removed from tank01DfsService.
 * 
 * @param {Array} slates - Slates from RotoWire (may have empty teams)
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {Promise<Array>} Slates with teams populated (or as-is if can't populate)
 */
export async function populateSlateTeams(slates, dateStr) {
  if (!slates || slates.length === 0) return slates;
  
  // Check if any slates need team data
  const needsTeams = slates.some(s => !s.teams || s.teams.length === 0);
  if (!needsTeams) return slates;
  
  console.log('[RotoWire] ℹ️ Some slates missing team data - returning as-is');
  console.log('[RotoWire] 💡 RotoWire scraper should populate teams directly');
  
  // Return slates as-is - the RotoWire scraper should have already populated teams
  // If not, the calling code should handle the fallback
  return slates;
}

/**
 * Clear the slate cache
 */
export function clearSlateCache() {
  slateCache.clear();
  console.log('[RotoWire] 🗑️ Slate cache cleared');
}

export default {
  fetchSlatesFromRotoWire,
  getTeamsForSlate,
  populateSlateTeams,
  clearSlateCache,
  fetchLineupsAndInjuries
};
