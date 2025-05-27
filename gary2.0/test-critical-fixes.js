/**
 * Test Critical Fixes
 * 1. Perplexity Proxy (POST endpoint)
 * 2. NBA Playoff Stats Balance
 * 3. NHL Processing
 */

console.log('🔧 Testing Critical Fixes...\n');

// Test 1: Perplexity Proxy
async function testPerplexityProxy() {
  console.log('1️⃣ Testing Perplexity Proxy...');
  
  try {
    const response = await fetch('https://www.betwithgary.ai/api/perplexity-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'pplx-7b-online',
        messages: [
          {
            role: 'user',
            content: 'Test message for proxy verification'
          }
        ]
      })
    });
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 405) {
      console.log('   ❌ Still getting 405 Method Not Allowed');
    } else if (response.status === 200) {
      console.log('   ✅ Perplexity proxy working!');
    } else {
      console.log(`   ⚠️ Unexpected status: ${response.status}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Test 2: NBA Team Matching
async function testNbaTeamMatching() {
  console.log('\n2️⃣ Testing NBA Team Matching...');
  
  try {
    const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
    
    // Test both teams from your example
    const knicks = await ballDontLieService.getTeamByName('New York Knicks');
    const pacers = await ballDontLieService.getTeamByName('Indiana Pacers');
    
    console.log(`   Knicks found: ${knicks ? '✅' : '❌'} (ID: ${knicks?.id})`);
    console.log(`   Pacers found: ${pacers ? '✅' : '❌'} (ID: ${pacers?.id})`);
    
    if (knicks && pacers) {
      // Test playoff stats for both
      const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats(
        'New York Knicks',
        'Indiana Pacers',
        2024
      );
      
      console.log(`   Knicks players: ${playerStats.home.length}`);
      console.log(`   Pacers players: ${playerStats.away.length}`);
      
      if (playerStats.home.length > 0 && playerStats.away.length > 0) {
        console.log('   ✅ Both teams have playoff stats');
      } else {
        console.log('   ⚠️ Imbalanced playoff stats detected');
      }
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Test 3: NHL Service Check
async function testNhlService() {
  console.log('\n3️⃣ Testing NHL Service...');
  
  try {
    const { nhlPlayoffService } = await import('./src/services/nhlPlayoffService.js');
    
    // Test if NHL service exists and works
    const report = await nhlPlayoffService.generateNhlPlayoffReport(
      'Boston Bruins',
      'Toronto Maple Leafs'
    );
    
    if (report && report.length > 0) {
      console.log('   ✅ NHL playoff service working');
      console.log(`   Report length: ${report.length} characters`);
    } else {
      console.log('   ❌ NHL playoff service not working');
    }
    
  } catch (error) {
    console.log(`   ❌ NHL Service Error: ${error.message}`);
  }
}

// Run all tests
async function runTests() {
  await testPerplexityProxy();
  await testNbaTeamMatching();
  await testNhlService();
  
  console.log('\n🏁 Test Summary:');
  console.log('   - Check Perplexity proxy status above');
  console.log('   - Check NBA team balance above');
  console.log('   - Check NHL service status above');
}

runTests(); 