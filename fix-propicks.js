const fs = require('fs');
const path = require('path');

const filePath = path.join('gary2.0/src/services/propPicksService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Remove the Ball Don't Lie and SportsDB references in the prop picks generation flow
// This is a simplified approach - we'll delete all the problematic parts
// and set up a clean flow that only uses MLB Stats API

// Find the section that starts after our fixed section
const startIndex = content.indexOf("// For MLB, we'll let the generatePropBets function handle all player data");
const endIndex = content.indexOf("// Now generate prop picks using OpenAI");

if (startIndex > 0 && endIndex > startIndex) {
  // Extract the part before our fix
  const beforePart = content.substring(0, startIndex + "// For MLB, we'll let the generatePropBets function handle all player data".length + 100);
  
  // Extract the part after Ball Don't Lie/SportsDB section
  const afterPart = content.substring(endIndex);
  
  // Replace the Ball Don't Lie/SportsDB section with a simple approach
  const cleanCode = `
                // For MLB games, we don't need to fetch any additional player data here
                // The generatePropBets function will handle all MLB Stats API calls directly
                
                // Generate prop picks for this game
`;
  
  // Create the new content
  const newContent = beforePart + cleanCode + afterPart;
  
  // Write the fixed file
  fs.writeFileSync(filePath, newContent);
  console.log('Successfully cleaned up the prop picks generation flow!');
} else {
  console.error('Could not find the problematic section in the file.');
}
