const fs = require('fs');
const path = require('path');

const filePath = path.join('gary2.0/src/services/propPicksService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the standalone parseOpenAIResponse functions
content = content.replace(/\/\*\*\n \* Parses OpenAI response into structured prop picks\n \*\/\nfunction parseOpenAIResponse\([^{]*\{[\s\S]*?return \[\];\n  \}\n\}/g, '');

fs.writeFileSync(filePath, content);
console.log('Removed duplicate parseOpenAIResponse functions');
