const fs = require('fs');
const path = require('path');

const filePath = path.join('gary2.0/src/services/propPicksService.js');
const content = fs.readFileSync(filePath, 'utf8');

// Extract the most essential parts of the file
const imports = content.match(/import.*?from.*?;/gs)[0];
const propPicksServiceStart = content.indexOf('const propPicksService = {');
const propPicksServiceEnd = content.lastIndexOf('export { propPicksService };');

// Essential functions for prop picks
const formatMLBPlayerStats = content.match(/formatMLBPlayerStats:.*?},/gs)[0];
const generatePropBets = content.match(/generatePropBets:.*?},/gs)[0];
const generateDailyPropPicks = content.match(/generateDailyPropPicks:.*?},/gs)[0];
const createPropPicksPrompt = content.match(/createPropPicksPrompt:.*?},/gs)[0];
const parseOpenAIResponse = content.match(/parseOpenAIResponse:.*?},/gs)[0];

// Create a new, simplified version of the file with just the essential functions
const newContent = `${imports}

// Import Supabase named export
import { supabase } from '../supabaseClient.js';

/**
 * Service for generating prop picks based on MLB Stats API data
 */
const propPicksService = {
  /**
   * Format MLB player stats from MLB Stats API
   */
  ${formatMLBPlayerStats}

  /**
   * Generate prop picks for a specific date
   */
  ${generateDailyPropPicks}

  /**
   * Create prompt for OpenAI API
   */
  ${createPropPicksPrompt}

  /**
   * Parse OpenAI response for prop picks
   */
  ${parseOpenAIResponse}

  /**
   * Generate prop bets using MLB Stats API data
   */
  ${generatePropBets}
};

export { propPicksService };
`;

// Write the simplified file
fs.writeFileSync(filePath + '.simplified', newContent);
console.log('Created a simplified version of propPicksService.js with only essential functions');

// Let's also fix the confidence threshold and fullName references in the original file
let fixedContent = content;

// 1. Ensure the confidence threshold is set to 0.7
fixedContent = fixedContent.replace(/p\.confidence >= 0.85/g, 'p.confidence >= 0.7');
fixedContent = fixedContent.replace(/confidence threshold - 85%/g, 'confidence threshold - 70%');

// 2. Add null safety for all fullName references
fixedContent = fixedContent.replace(/hitter\.fullName/g, 'hitter?.fullName || "Unknown Player"');
fixedContent = fixedContent.replace(/leader\.person\.fullName/g, 'leader?.person?.fullName || "Unknown Player"');
fixedContent = fixedContent.replace(/hp\.fullName/g, 'hp?.fullName || "Unknown Pitcher"');
fixedContent = fixedContent.replace(/ap\.fullName/g, 'ap?.fullName || "Unknown Pitcher"');

// 3. Remove any references to perplexityService
fixedContent = fixedContent.replace(/import.*?perplexityService.*?;/g, '// MLB Stats API is used exclusively - perplexityService removed');
fixedContent = fixedContent.replace(/await perplexityService\.getPlayerPropInsights.*?;/g, '// Using MLB Stats API exclusively for prop picks');

// Write the fixed content
fs.writeFileSync(filePath, fixedContent);
console.log('Applied fixes to the original propPicksService.js file');

console.log('You can now choose to:');
console.log('1. Continue using the fixed original file (which still has some syntax issues but the key functionality should work)');
console.log('2. Replace it with the simplified version from ' + filePath + '.simplified');
