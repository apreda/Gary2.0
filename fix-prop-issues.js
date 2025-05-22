const fs = require('fs');
const path = require('path');

const filePath = path.join('gary2.0/src/services/propPicksService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Add null safety checks to all instances of fullName
content = content.replace(/hitter\.fullName/g, 'hitter?.fullName || "Unknown Player"');
content = content.replace(/leader\.person\.fullName/g, 'leader?.person?.fullName || "Unknown Player"');
content = content.replace(/hp\.fullName/g, 'hp?.fullName || "Unknown Pitcher"');
content = content.replace(/ap\.fullName/g, 'ap?.fullName || "Unknown Pitcher"');

// Fix 2: Change confidence threshold from 0.85 to 0.7
// Look for confidence threshold pattern and replace it
content = content.replace(/p\.confidence >= 0.85/g, 'p.confidence >= 0.7');
content = content.replace(/confidence threshold - 85%/g, 'confidence threshold - 70%');

// Write the fixed file
fs.writeFileSync(filePath, content);
console.log('Fixed both the TypeError issue and updated confidence threshold to 70%!');
