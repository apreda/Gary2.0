import { picksService } from './src/services/picksService.js';
import { supabase } from './src/supabaseClient.js';

async function testPicksFix() {
  console.log('🧪 Testing picks generation and odds extraction fixes...\n');
  
  try {
    // Check current picks in database
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Checking picks for ${today}...`);
    
    const { data: existingPicks, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today)
      .maybeSingle();
    
    if (error) {
      console.error('❌ Error fetching picks:', error);
      return;
    }
    
    if (existingPicks && existingPicks.picks) {
      const picks = typeof existingPicks.picks === 'string' 
        ? JSON.parse(existingPicks.picks) 
        : existingPicks.picks;
      
      console.log(`📊 Found ${picks.length} existing picks:`);
      
      picks.forEach((pick, index) => {
        console.log(`\n${index + 1}. ${pick.league || 'Unknown League'} Pick:`);
        console.log(`   Pick: ${pick.pick || 'Not set'}`);
        console.log(`   Odds: ${pick.odds || 'MISSING/TBD'}`);
        console.log(`   Time: ${pick.time || 'Not set'}`);
        console.log(`   Confidence: ${pick.confidence || 'Not set'}`);
        
        // Check if odds are properly formatted
        if (!pick.odds || pick.odds === 'TBD' || pick.odds === '') {
          console.log(`   ⚠️  ISSUE: Odds are missing or TBD`);
        } else {
          console.log(`   ✅ Odds are present: ${pick.odds}`);
        }
        
        // Check if pick includes odds at the end
        if (pick.pick && pick.pick.match(/([-+]\d+)$/)) {
          console.log(`   ✅ Pick includes odds at end`);
        } else {
          console.log(`   ⚠️  ISSUE: Pick doesn't include odds at end`);
        }
      });
      
      // Summary
      const picksWithOdds = picks.filter(p => p.odds && p.odds !== 'TBD' && p.odds !== '');
      const picksWithOddsInPick = picks.filter(p => p.pick && p.pick.match(/([-+]\d+)$/));
      
      console.log(`\n📈 Summary:`);
      console.log(`   Total picks: ${picks.length}`);
      console.log(`   Picks with odds field: ${picksWithOdds.length}/${picks.length}`);
      console.log(`   Picks with odds in pick text: ${picksWithOddsInPick.length}/${picks.length}`);
      
      if (picksWithOdds.length === picks.length && picksWithOddsInPick.length === picks.length) {
        console.log(`   ✅ All picks have proper odds formatting!`);
      } else {
        console.log(`   ⚠️  Some picks are missing proper odds formatting`);
      }
      
    } else {
      console.log('📭 No picks found for today');
      
      // Try generating new picks to test the fixes
      console.log('\n🔄 Generating new picks to test fixes...');
      
      try {
        const newPicks = await picksService.generateDailyPicks();
        console.log(`✅ Generated ${newPicks.length} new picks`);
        
        // Check the new picks
        newPicks.forEach((pick, index) => {
          console.log(`\n${index + 1}. New ${pick.sport || 'Unknown'} Pick:`);
          console.log(`   Pick: ${pick.rawAnalysis?.rawOpenAIOutput?.pick || 'Not set'}`);
          console.log(`   Odds: ${pick.rawAnalysis?.rawOpenAIOutput?.odds || 'Not set'}`);
          console.log(`   Time: ${pick.rawAnalysis?.rawOpenAIOutput?.time || 'Not set'}`);
          console.log(`   League: ${pick.rawAnalysis?.rawOpenAIOutput?.league || 'Not set'}`);
        });
        
      } catch (genError) {
        console.error('❌ Error generating picks:', genError.message);
      }
    }
    
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    console.log('\n🏁 Test completed');
    process.exit(0);
  }
}

testPicksFix(); 