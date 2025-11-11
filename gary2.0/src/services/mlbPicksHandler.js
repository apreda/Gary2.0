import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';
import { ballDontLieService } from './ballDontLieService.js';

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
      
      // Attempt to compute recommended sportsbook using BDL v2 odds for the game date
      try {
        const dt = structuredPick.time && typeof structuredPick.time === 'string'
          ? new Date(structuredPick.time)
          : new Date();
        const dateStr = isNaN(dt.getTime())
          ? new Date().toISOString().slice(0, 10)
          : dt.toISOString().slice(0, 10);
        const games = await ballDontLieService.getGames('baseball_mlb', { start_date: dateStr, end_date: dateStr, per_page: 100, postseason: false }, 1);
        // Find matching game by team names
        const home = String(structuredPick.homeTeam || '').toLowerCase();
        const away = String(structuredPick.awayTeam || '').toLowerCase();
        const bdlGame = Array.isArray(games) ? games.find(g => {
          const h = (g?.home_team?.full_name || g?.home_team?.display_name || g?.home_team || '').toLowerCase();
          const a = (g?.away_team?.full_name || g?.away_team?.display_name || g?.away_team || '').toLowerCase();
          return (h.includes(home) || home.includes(h)) && (a.includes(away) || away.includes(a));
        }) : null;
        if (bdlGame && bdlGame.id != null) {
          const rows = await ballDontLieService.getOddsV2({ game_ids: [bdlGame.id], per_page: 100 });
          if (Array.isArray(rows) && rows.length) {
            const pickStr = structuredPick.pick || '';
            const type = (structuredPick.type || '').toLowerCase();
            const isHome = pickStr.toLowerCase().includes(home);
            const isAway = pickStr.toLowerCase().includes(away);
            const side = isHome ? 'home' : (isAway ? 'away' : null);
            if (side) {
              let best = null;
              if (type === 'moneyline') {
                for (const r of rows) {
                  const odds = side === 'home' ? r.moneyline_home_odds : r.moneyline_away_odds;
                  if (typeof odds !== 'number') continue;
                  if (!best || odds > best.odds) best = { vendor: r.vendor, odds };
                }
              } else if (type === 'spread') {
                const m = pickStr.match(/([+-]?\d+(\.\d+)?)/);
                const target = m ? parseFloat(m[1]) : null;
                for (const r of rows) {
                  const valStr = side === 'home' ? r.spread_home_value : r.spread_away_value;
                  const odds = side === 'home' ? r.spread_home_odds : r.spread_away_odds;
                  if (!valStr || typeof odds !== 'number') continue;
                  const val = parseFloat(valStr);
                  if (isNaN(val)) continue;
                  const matches = target == null ? true : Math.abs(val - target) < 0.01;
                  if (!matches) continue;
                  if (!best || odds > best.odds) best = { vendor: r.vendor, odds, line: val };
                }
              }
              if (best) structuredPick.recommendedSportsbook = best;
            }
          }
        }
      } catch (e) {
        console.warn('MLB recommendedSportsbook computation failed:', e?.message || e);
      }
      
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
    // Sort by confidence then ev and cap to 10
    const cappedPropPicks = Array.isArray(propPicks)
      ? propPicks
          .sort((a, b) => (b.confidence !== a.confidence ? b.confidence - a.confidence : (b.ev || 0) - (a.ev || 0)))
          .slice(0, 10)
      : [];
    sportPicks = [...sportPicks, ...cappedPropPicks];
  } catch (e) { 
    console.error('Error generating MLB prop picks:', e);
  }
  
  console.log(`Total MLB picks generated: ${sportPicks.length}`);
  return sportPicks;
} 