const fs = require('fs');
const path = require('path');

// Path to the file
const filePath = path.join(__dirname, 'gary2.0/src/services/sportsDataService.js');

// Read the file content
let content = fs.readFileSync(filePath, 'utf8');

// Fix the player_ids parameter formatting for home team
content = content.replace(
  /playerIds\.forEach\(\(id, index\) => \{\s*playerIdParams\[\`player_ids\[\]\`\] = id;\s*\}\);/g,
  "// Pass player IDs directly as an array\nplayerIdParams['player_ids[]'] = playerIds;"
);

// Fix the params spreading to use the array directly
content = content.replace(
  /\.\.\.playerIdParams \/\/ Spread the playerIdParams/g,
  "'player_ids[]': playerIds // Pass array directly"
);

// Write the changes back to the file
fs.writeFileSync(filePath, content);

console.log('Fixed NBA API integration successfully!');
