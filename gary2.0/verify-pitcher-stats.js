/**
 * Verification script to test pitcher stats retrieval
 * This script tests the specific issue with null pitcher stats
 */

// Simple test function that can be run in browser console or Node.js
async function testPitcherStats() {
  console.log('=== Testing Pitcher Stats Retrieval ===');
  
  // Test with known pitcher IDs (these are real MLB player IDs)
  const testPitchers = [
    { id: 543037, name: 'Gerrit Cole' },
    { id: 592789, name: 'Jacob deGrom' },
    { id: 605483, name: 'Shane Bieber' },
    { id: 592450, name: 'Aaron Judge' } // This should fail as he's a hitter
  ];
  
  for (const pitcher of testPitchers) {
    console.log(`\n--- Testing ${pitcher.name} (ID: ${pitcher.id}) ---`);
    
    try {
      // Direct API call to test the endpoint
      const response = await fetch(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=season&group=pitching&season=2024&sportId=1`);
      
      if (!response.ok) {
        console.log(`❌ API Error: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      console.log('Raw API Response:', JSON.stringify(data, null, 2));
      
      if (data && data.stats && data.stats.length > 0) {
        const stats = data.stats[0].splits?.[0]?.stat || {};
        
        if (Object.keys(stats).length > 0) {
          console.log('✅ Stats found:');
          console.log(`   ERA: ${stats.era || 'N/A'}`);
          console.log(`   Wins: ${stats.wins || 'N/A'}`);
          console.log(`   Losses: ${stats.losses || 'N/A'}`);
          console.log(`   Strikeouts: ${stats.strikeOuts || 'N/A'}`);
          console.log(`   WHIP: ${stats.whip || 'N/A'}`);
          console.log(`   Games Started: ${stats.gamesStarted || 'N/A'}`);
        } else {
          console.log('❌ Empty stats object');
        }
      } else {
        console.log('❌ No stats data in response');
        
        // Try previous year
        console.log('Trying 2023 stats...');
        const response2023 = await fetch(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=season&group=pitching&season=2023&sportId=1`);
        
        if (response2023.ok) {
          const data2023 = await response2023.json();
          if (data2023 && data2023.stats && data2023.stats.length > 0) {
            const stats2023 = data2023.stats[0].splits?.[0]?.stat || {};
            if (Object.keys(stats2023).length > 0) {
              console.log('✅ Found 2023 stats:');
              console.log(`   ERA: ${stats2023.era || 'N/A'}`);
              console.log(`   Wins: ${stats2023.wins || 'N/A'}`);
              console.log(`   Losses: ${stats2023.losses || 'N/A'}`);
            }
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

// Test function for browser environment
function testInBrowser() {
  console.log('Testing MLB Stats API in browser...');
  testPitcherStats().catch(console.error);
}

// Export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testPitcherStats };
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  console.log('Browser environment detected. Run testInBrowser() to start test.');
}

// Instructions for testing
console.log(`
=== How to Test ===

1. In Browser Console:
   - Copy and paste this entire script
   - Run: testInBrowser()

2. In Node.js:
   - Save this file as verify-pitcher-stats.js
   - Run: node verify-pitcher-stats.js

3. Check for:
   - ✅ Successful API responses
   - ❌ Error messages
   - Raw API response structure
   - Actual stats data

This will help identify if the issue is:
- API endpoint problems
- Data structure changes
- Network/timeout issues
- Player ID problems
`);

// If running in Node.js, auto-execute
if (typeof window === 'undefined' && typeof module !== 'undefined') {
  testPitcherStats().catch(console.error);
} 