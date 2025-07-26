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
    console.log('Raw normal picks data:', normalMlbPicks);
    
    sportPicks = normalMlbPicks.map((pick, index) => {
      console.log(`Processing normal pick ${index + 1}:`, {
        id: pick.id,
        analysis: typeof pick.analysis,
        hasRawAnalysis: !!pick.rawAnalysis,
        sport: pick.sport
      });
      
      // Parse the analysis to extract the structured pick data
      let pickData = null;
      try {
        if (typeof pick.analysis === 'string') {
          pickData = JSON.parse(pick.analysis);
          console.log(`Parsed string analysis for pick ${index + 1}:`, pickData);
        } else if (pick.analysis?.rawOpenAIOutput) {
          pickData = pick.analysis.rawOpenAIOutput;
          console.log(`Found rawOpenAIOutput for pick ${index + 1}:`, pickData);
        } else if (pick.analysis) {
          pickData = pick.analysis;
          console.log(`Using direct analysis for pick ${index + 1}:`, pickData);
        }
      } catch (parseError) {
        console.error(`Error parsing MLB pick analysis for pick ${index + 1}:`, parseError);
      }
      
      // Return properly structured pick with extracted data
      const structuredPick = {
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
      
      console.log(`Structured pick ${index + 1} confidence:`, structuredPick.confidence);
      return structuredPick;
    });
    
    console.log(`Final normal picks array has ${sportPicks.length} picks with confidences:`, 
      sportPicks.map(p => p.confidence));
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