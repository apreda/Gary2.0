#!/usr/bin/env python3

import re

# Read the file
with open('gary2.0/src/pages/RealGaryPicks.jsx', 'r') as f:
    content = f.read()

# 1. Remove BetCard import since it's not used
content = content.replace("import { BetCard } from './BetCard';\n", "")

# 2. Remove excessive console.log statements (keep only essential ones)
# Remove debug logs that just print the entire data structure
content = re.sub(r'console\.log\(\'Complete Supabase data structure:\',.*?\);\n', '', content)
content = re.sub(r'console\.log\(\'Direct time field check:\',.*?\);\n', '', content)
content = re.sub(r'console\.log\(\'Processing valid pick from Supabase:\',.*?\);\n', '', content)
content = re.sub(r'console\.log\(\'Game time from database:\',.*?\);\n', '', content)
content = re.sub(r'console\.log\(\'Time field variations:\',.*?\);\n.*?\);\n', '', content, flags=re.DOTALL)
content = re.sub(r'console\.log\(\'Valid pick ready for rendering:\',.*?\);\n', '', content)
content = re.sub(r'console\.log\(\'Parsed and enhanced picksArray:\',.*?\);\n', '', content)
content = re.sub(r'console\.log\(`Original time parts:.*?\);\n', '', content)

# 3. Remove the entire debug logs effect that prints picks/loading/error
content = re.sub(
    r'// Debug logs for troubleshooting\s*\n\s*useEffect\(\(\) => \{\s*\n.*?console\.log.*?\n.*?console\.log.*?\n.*?console\.log.*?\n\s*\}, \[picks, loading, error\]\);\n',
    '',
    content,
    flags=re.DOTALL
)

# 4. Remove the comment "Using hardcoded performance values"
content = content.replace('\n  // Using hardcoded performance values\n', '')

# 5. Simplify the extractOddsFromAnalysis function
old_extract_odds = r'// Helper function to extract odds from analysis prompt\s*\n\s*const extractOddsFromAnalysis = \(pick\) => \{[\s\S]*?return \'\';\s*\n\s*\};'
new_extract_odds = '''// Helper function to extract odds from analysis prompt
            const extractOddsFromAnalysis = (pick) => {
              try {
                // Try to get directly from OpenAI output
                if (pick.rawAnalysis?.rawOpenAIOutput?.odds) {
                  return pick.rawAnalysis.rawOpenAIOutput.odds;
                }
                
                // Extract from analysis prompt if available
                if (pick.analysisPrompt) {
                  const teamName = pick.pick?.split(' ').slice(0, -1).join(' ');
                  const oddsMatch = pick.analysisPrompt.match(new RegExp(`${teamName}.*?\\(([-+]?\\d+)\\)`));
                  if (oddsMatch) return oddsMatch[1];
                }
              } catch (error) {
                console.error('Error extracting odds:', error);
              }
              return '';
            };'''
content = re.sub(old_extract_odds, new_extract_odds, content, flags=re.DOTALL)

# 6. Clean up comments that are too verbose
content = content.replace('// Removed unused state variables for bet tracking\n', '')
content = content.replace('\n  // Toast notification system', '')

# 7. Remove the unused reloadKey state and setter
content = content.replace('  const [reloadKey, setReloadKey] = useState(0);\n', '')
# Remove the setReloadKey usage
content = re.sub(r'// Increment reloadKey to force BetCard to reload\s*\n\s*setReloadKey\(prev => \{\s*\n.*?\n.*?\n\s*\}\);\s*\n', '', content, flags=re.DOTALL)

# 8. Remove unused pageTitle variable
content = re.sub(r'const pageTitle = visiblePicks\.length[\s\S]*?"Gary\'s Picks";\n', '', content)

# Write the cleaned content back
with open('gary2.0/src/pages/RealGaryPicks.jsx', 'w') as f:
    f.write(content)

print("Cleaned up RealGaryPicks.jsx:")
print("- Removed unused BetCard import")
print("- Removed excessive console.log statements")
print("- Removed debug logging effects")
print("- Simplified extractOddsFromAnalysis function")
print("- Removed unused reloadKey state")
print("- Removed unused pageTitle variable")
print("- Cleaned up verbose comments") 