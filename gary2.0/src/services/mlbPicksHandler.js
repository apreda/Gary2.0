import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';

export async function generateMLBPicks() {
  console.log('Processing MLB games');
  let sportPicks = [];
  // Normal picks
  try {
    const normalMlbPicks = await enhancedPicksService.generateDailyPicks('baseball_mlb');
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
  } catch (e) { /* Log if you want */ }

  // Prop picks
  try {
    const propPicks = await mlbPicksGenerationService.generateDailyPropPicks();
    sportPicks = [...sportPicks, ...propPicks];
  } catch (e) { /* Log if you want */ }
  
  return sportPicks;
} 