// Script to validate and fix the propPicksService.js file
const fs = require('fs');
const path = require('path');

// Path to the problematic file
const filePath = path.join(__dirname, 'gary2.0/src/services/propPicksService.js');

// Read the file content
try {
  let content = fs.readFileSync(filePath, 'utf8');
  console.log(`✅ Successfully read the file (${content.length} bytes)`);
  
  // Try to parse the file to validate its syntax
  try {
    // This will throw an error if the syntax is invalid
    new Function(content);
    console.log('✅ File syntax is valid!');
  } catch (parseError) {
    console.error('❌ Syntax error found:', parseError.message);
    
    // Make targeted fixes to common syntax issues
    
    // 1. Fix the export statement at the end
    if (content.includes('export { propPicksService };')) {
      content = content.replace('export { propPicksService };', 'export default propPicksService;');
      console.log('🔧 Fixed export statement');
    }
    
    // 2. Make sure there are no function definitions inside other functions
    // This is a heuristic search for potentially nested functions
    if (content.match(/function\s+\w+\s*\([^)]*\)\s*{[^}]*function\s+\w+\s*\(/)) {
      console.log('⚠️ Possible nested functions detected. These need manual inspection.');
    }
    
    // 3. Create a fixed backup file
    const backupPath = filePath + '.fixed';
    fs.writeFileSync(backupPath, content, 'utf8');
    console.log(`✅ Created fixed backup at ${backupPath}`);
    
    // 4. Check if all opening braces have matching closing braces
    const openingBraces = (content.match(/{/g) || []).length;
    const closingBraces = (content.match(/}/g) || []).length;
    
    if (openingBraces !== closingBraces) {
      console.log(`⚠️ Brace mismatch: ${openingBraces} opening braces, ${closingBraces} closing braces`);
    } else {
      console.log('✅ Braces are balanced');
    }
  }
} catch (error) {
  console.error('❌ Error reading file:', error.message);
}
