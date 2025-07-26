import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';

export async function generateMLBPicks() {
  console.log('Processing MLB games');
  let sportPicks = [];
  
  // Normal picks
  try {
    console.log('Attempting to generate normal MLB picks...');
    const normalMlbPicks = await enhancedPicksService.generateDailyPicks('baseball_mlb');
    console.log(`Generated ${normalMlbPicks.length} normal MLB picks`);
    
    sportPicks = normalMlbPicks.map(pick => {
      // Parse the analysis to extract the structured pick data
      let pickData = null;
      try {
        if (typeof pick.analysis === 'string') {
          pickData = JSON.parse(pick.analysis);
        } else if (pick.analysis?.rawOpenAIOutput) {
          pickData = pick.analysis.rawOpenAIOutput;
        } else if (pick.analysis) {
          pickData = pick.analysis;
        }
      } catch (parseError) {
        console.error('Error parsing MLB pick analysis:', parseError);
      }
      
      // Return properly structured pick with extracted data
      return {
        ...pick,
        sport: 'baseball_mlb',
        pickType: 'normal',
        success: true,
        rawAnalysis: { rawOpenAIOutput: pickData },
        // Also include the fields directly for easier access
        pick: pickData?.pick || '',
        time: pickData?.time || pick.gameTime || 'TBD',
        type: pickData?.type || 'moneyline',
        league: pickData?.league || 'MLB',
        revenge: pickData?.revenge || false,
        awayTeam: pickData?.awayTeam || pick.awayTeam,
        homeTeam: pickData?.homeTeam || pick.homeTeam,
        momentum: pickData?.momentum || 0,
        rationale: pickData?.rationale || '',
        trapAlert: pickData?.trapAlert || false,
        confidence: pickData?.confidence || 0,
        superstition: pickData?.superstition || false
      };
    });
  } catch (e) { 
    console.error('Error generating normal MLB picks:', e);
  }

  // Prop picks
  try {
    console.log('Attempting to generate MLB prop picks...');
    const propPicks = await mlbPicksGenerationService.generateMLBPropPicks([]);
    console.log(`Generated ${propPicks.length} prop picks`);
    sportPicks = [...sportPicks, ...propPicks];
  } catch (e) { 
    console.error('Error generating MLB prop picks:', e);
  }
  
  console.log(`Total MLB picks generated: ${sportPicks.length}`);
  return sportPicks;
} 