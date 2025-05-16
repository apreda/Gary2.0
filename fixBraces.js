// Script to add missing closing braces to propPicksService.js
const fs = require('fs');
const path = require('path');

// Path to the problematic file
const filePath = path.join(__dirname, 'gary2.0/src/services/propPicksService.js');
const outputPath = path.join(__dirname, 'gary2.0/src/services/propPicksService.js.fixed');

// Read the file content
try {
  let content = fs.readFileSync(filePath, 'utf8');
  console.log(`✅ Successfully read the file (${content.length} bytes)`);
  
  // Find missing braces
  const openingBraces = (content.match(/{/g) || []).length;
  const closingBraces = (content.match(/}/g) || []).length;
  
  if (openingBraces > closingBraces) {
    const missingBraces = openingBraces - closingBraces;
    console.log(`⚠️ Found ${missingBraces} missing closing braces`);
    
    // Add missing closing braces before the export statement
    const exportStatement = 'export default propPicksService;';
    
    if (content.includes(exportStatement)) {
      // Add the missing braces before the export statement
      const parts = content.split(exportStatement);
      let fixedContent = parts[0];
      
      // Add the missing braces
      for (let i = 0; i < missingBraces; i++) {
        fixedContent += '\n} // Auto-added closing brace';
      }
      
      // Add back the export statement
      fixedContent += '\n\n' + exportStatement;
      
      // Write the fixed content
      fs.writeFileSync(outputPath, fixedContent, 'utf8');
      console.log(`✅ Fixed file written to ${outputPath}`);
    } else {
      console.log('❌ Could not find export statement to insert braces');
    }
  } else {
    console.log('✅ No missing braces detected');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}
