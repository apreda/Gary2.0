const fs = require('fs');
const path = require('path');

// First, make a backup of the original file
const filePath = path.join('gary2.0/src/services/propPicksService.js');
const backupPath = filePath + '.backup';
fs.copyFileSync(filePath, backupPath);
console.log(`Created backup at ${backupPath}`);

const content = fs.readFileSync(filePath, 'utf8');

// Fix the common syntax errors first
let fixedContent = content;

// 1. Fix the extra semicolons after function close braces (lines like 424-426)
fixedContent = fixedContent.replace(/\}\s*;(\s*\})/g, '}\n$1');

// 2. Fix missing commas in object literals
fixedContent = fixedContent.replace(/(\w+)\s*:\s*([^,{}\n]+)(\s*\n\s*)(\w+)\s*:/g, '$1: $2,$3$4:');

// 3. Fix the specific errors on lines 442-444 where it's trying to parse perplexity data
// We've already cleaned this up, so let's make sure the try-catch blocks are properly formed
fixedContent = fixedContent.replace(/\/\/ Fall back to Perplexity for data.*?try\s*\{[\s\S]*?perplexityService\.getPlayerPropInsights[\s\S]*?\}\s*catch[\s\S]*?\{[\s\S]*?\}/g, 
  '// No fallback to Perplexity - we\'re using MLB Stats API exclusively\n                  console.log("MLB Stats API is the only data source for prop picks");');

// Write the fixed content back to the file
fs.writeFileSync(filePath, fixedContent);
console.log('Applied first round of fixes to propPicksService.js');

// For a comprehensive fix, we might need to completely rewrite portions of the file
// Let's provide a script to scan for the most common lint issues
console.log('Scanning for common syntax issues...');

const lintIssues = [
  { pattern: /\}\s*;(\s*\})/g, issue: 'Extra semicolon after close brace' },
  { pattern: /try\s*\{[\s\S]*?\}(?!\s*catch)/g, issue: 'Try without catch' },
  { pattern: /(\w+)\s*(\s*\n\s*)(\w+)\s*:/g, issue: 'Missing comma in object literal' },
  { pattern: /:\s*function/g, issue: 'Old function syntax in object' },
];

let issueCount = 0;
lintIssues.forEach(lint => {
  const matches = fixedContent.match(lint.pattern);
  if (matches) {
    issueCount += matches.length;
    console.log(`Found ${matches.length} instances of: ${lint.issue}`);
  }
});

console.log(`Total issues found: ${issueCount}`);
console.log('Basic syntax fixes complete. Some manual fixing might still be needed.');

// Count braces to check balance
let openBraces = 0;
let closeBraces = 0;
for (let char of fixedContent) {
  if (char === '{') openBraces++;
  if (char === '}') closeBraces++;
}

console.log(`Brace balance after fix: open=${openBraces}, close=${closeBraces}, diff=${openBraces-closeBraces}`);

