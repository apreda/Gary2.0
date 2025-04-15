// This script injects environment variables into the public/env-config.js file during build
const fs = require('fs');
const path = require('path');

// Define the path to the env-config.js file
const envConfigPath = path.join(__dirname, '../public/env-config.js');

// Read the current content of the file
try {
  let content = fs.readFileSync(envConfigPath, 'utf8');
  
  // Replace placeholders with actual environment variables
  content = content.replace('__ODDS_API_KEY__', process.env.VITE_ODDS_API_KEY || '');
  content = content.replace('__DEEPSEEK_API_KEY__', process.env.VITE_DEEPSEEK_API_KEY || '');
  content = content.replace('__DEEPSEEK_BASE_URL__', process.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1');
  
  // Write the modified content back to the file
  fs.writeFileSync(envConfigPath, content, 'utf8');
  
  console.log('✅ Environment variables injected into env-config.js');
} catch (error) {
  console.error('❌ Failed to inject environment variables:', error);
  process.exit(1);
}
