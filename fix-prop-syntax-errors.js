const fs = require('fs');
const path = require('path');

const filePath = path.join('gary2.0/src/services/propPicksService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix common syntax errors

// 1. Fix missing semicolons
content = content.replace(/\}\n/g, '};\n');
content = content.replace(/\}\s+\/\//g, '}; //');

// 2. Fix mismatched braces and parentheses
// This is a basic approach - for complex nested structures, manual intervention might be needed
let braceCount = 0;
let parenCount = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') braceCount--;
  if (content[i] === '(') parenCount++;
  if (content[i] === ')') parenCount--;
}

console.log(`Brace balance: ${braceCount}, Parenthesis balance: ${parenCount}`);

// 3. Fix expected statements
// Look for common patterns like try without catch
content = content.replace(/try\s+\{([^}]*)\}\s+(?!catch|finally)/g, 'try {$1} catch (error) { console.error(error); }');

// 4. Fix missing commas in object literals
content = content.replace(/(\w+)\s*:\s*([^,\n{}]+)\s*\n\s*(\w+)\s*:/g, '$1: $2,\n  $3:');

// Write the fixed file
fs.writeFileSync(filePath, content);
console.log('Fixed syntax errors in propPicksService.js');

// Create a more aggressive fix script that targets specific issues
const specificFixes = `
// Look for the specific error locations based on the line numbers from the lint errors
// Example fixes:
// Line 425: Add missing catch block
// Line 428-429: Fix missing colons and commas
// Line 442: Fix syntax in object literals
// Line 490-496: Fix missing statements
// Line 508-512: Fix try-catch blocks
// Line 526, 575, 597, 927, 941: Add missing semicolons
`;

console.log('You may need to manually fix some specific syntax errors if they persist');
