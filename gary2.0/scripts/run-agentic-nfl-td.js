#!/usr/bin/env node
/**
 * Agentic NFL Touchdown Scorer Runner
 * Special feature: Gary picks 5 standard TDs + 5 underdog TDs (+200 or better)
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Dynamic imports after env is loaded
const { oddsService } = await import('../src/services/oddsService.js');
const { propOddsService } = await import('../src/services/propOddsService.js');
const { openaiService } = await import('../src/services/openaiService.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');

const SPORT_KEY = 'americanfootball_nfl';

function getESTDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

// Format game time to readable EST string
function formatGameTimeEST(isoString) {
  if (!isoString) return 'TBD';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return 'TBD';
  }
}

function parseArgs() {
  return process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    acc[key.replace(/^--/, '')] = value ?? true;
    return acc;
  }, {});
}

/**
 * Run Gary's TD Scorer Analysis
 */
async function runTDScorerAnalysis(allTDProps, playerStats) {
  // Split into standard odds and underdog odds (+200 or better)
  const standardTDs = allTDProps.filter(p => p.odds < 200);
  const underdogTDs = allTDProps.filter(p => p.odds >= 200);

  console.log(`\n📊 TD Props Breakdown:`);
  console.log(`   Standard odds (<+200): ${standardTDs.length} players`);
  console.log(`   Underdog odds (+200+): ${underdogTDs.length} players`);

  const systemPrompt = `
You are Gary, the expert NFL analyst. You're picking Touchdown Scorers for today's games.

## YOUR TASK
You must make TWO types of TD scorer picks:

### CATEGORY 1: STANDARD TD SCORERS (5 picks)
Pick your 5 BEST touchdown scorer bets regardless of odds. These are your highest-confidence plays backed by:
- Red zone usage and targets
- Goal line carries
- Recent TD scoring trends
- Matchup advantages
- Game script projections

For standard picks, use line 0.5 (Over 0.5 TDs = scores at least 1 TD).

### CATEGORY 2: UNDERDOG TD SCORERS (5 picks)  
Pick 5 touchdown scorer bets with odds of +200 or better (higher payout). These are your VALUE plays:
- Players who could vulture a TD or score multiple
- Boom/bust candidates in high-scoring games
- Players in favorable TD-scoring situations that oddsmakers are undervaluing
- You CAN pick Over 1.5 TDs (2+ touchdowns) for players you think will have big games

## ANALYSIS APPROACH
- Consider red zone opportunity rates
- Look at defensive TD rates allowed by position
- Factor in game script (blowout vs close game)
- Consider goal-line personnel tendencies
- For 2+ TD picks, look at historical multi-TD games and matchup

## RESPONSE FORMAT (STRICT JSON)
{
  "standard_td_picks": [
    {
      "player": "Player Name",
      "team": "Team Abbreviation",
      "line": 0.5,
      "odds": -120,
      "matchup": "vs OPP",
      "rationale": "2-3 sentences explaining why this player will score"
    }
  ],
  "underdog_td_picks": [
    {
      "player": "Player Name", 
      "team": "Team Abbreviation",
      "line": 0.5,
      "odds": 250,
      "matchup": "vs OPP",
      "rationale": "2-3 sentences explaining the value opportunity"
    }
  ],
  "game_notes": "Brief overall thoughts on TD-scoring environment today"
}

IMPORTANT:
- Standard picks: Pick exactly 5 from any odds, line is always 0.5
- Underdog picks: Pick exactly 5 with odds +200 or better. Line can be 0.5 (1+ TD) or 1.5 (2+ TDs)
- Be specific about WHY each player will score
`;

  const userContent = JSON.stringify({
    date: getESTDate(),
    standard_td_options: standardTDs.slice(0, 50).map(p => ({
      player: p.player,
      team: p.team,
      odds: p.odds,
      matchup: p.matchup
    })),
    underdog_td_options: underdogTDs.slice(0, 60).map(p => ({
      player: p.player,
      team: p.team,
      odds: p.odds,
      matchup: p.matchup
    })),
    player_context: playerStats.substring(0, 4000)
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  console.log(`\n🤖 Gary analyzing TD scorers...`);
  
  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.5,
    maxTokens: 2000
  });

  // Parse response
  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('Failed to parse Gary response:', e.message);
    return null;
  }

  return parsed;
}

async function main() {
  const args = parseArgs();
  const shouldStore = args.store === '1' || args.store === 'true';
  const nocache = args.nocache === '1';

  console.log(`\n🏈 NFL Touchdown Scorer Picks`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}`);
  console.log(`${'='.repeat(50)}\n`);

  // Fetch NFL games
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache });
  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000; // 7 days for NFL

  const filteredGames = games
    .filter(g => {
      const tip = new Date(g.commence_time).getTime();
      return !Number.isNaN(tip) && tip > now && tip <= now + windowMs;
    })
    .slice(0, 10);

  console.log(`Found ${filteredGames.length} NFL games.\n`);

  if (filteredGames.length === 0) {
    console.log('⚠️ No upcoming NFL games found.');
    return;
  }

  // Collect all TD props across games
  const allTDProps = [];
  let playerStats = '';

  for (const game of filteredGames) {
    const matchup = `${game.away_team} @ ${game.home_team}`;
    console.log(`📡 Fetching TD props for ${matchup}...`);

    try {
      const props = await propOddsService.getPlayerPropOdds(SPORT_KEY, game.home_team, game.away_team);
      
      // Filter for TD props (anytime TD and TD over markets)
      const tdProps = props.filter(p => {
        const propType = (p.prop_type || '').toLowerCase();
        return propType === 'anytime_td' || 
               propType === 'player_anytime_td' ||
               propType === 'player_tds_over' ||
               propType === 'tds_over' ||
               (propType.includes('td') && !propType.includes('pass_td'));
      });

      tdProps.forEach(p => {
        allTDProps.push({
          player: p.player,
          team: p.team,
          odds: p.over_odds || p.odds,
          matchup: matchup,
          game_time: game.commence_time
        });
      });

      console.log(`   ✅ Found ${tdProps.length} TD props`);
    } catch (e) {
      console.warn(`   ⚠️ Could not fetch props: ${e.message}`);
    }
  }

  console.log(`\n📊 Total TD props collected: ${allTDProps.length}`);

  if (allTDProps.length === 0) {
    console.log('⚠️ No TD props available. Exiting.');
    return;
  }

  // Sort by odds for display
  allTDProps.sort((a, b) => a.odds - b.odds);

  // Get player stats for context (from first few games)
  try {
    const { formatNFLPlayerStats } = await import('../src/services/nflPlayerPropsService.js');
    for (const game of filteredGames.slice(0, 3)) {
      const stats = await formatNFLPlayerStats(game.home_team, game.away_team);
      playerStats += stats + '\n';
    }
  } catch (e) {
    console.warn('Could not fetch player stats:', e.message);
  }

  // Run Gary's analysis
  const result = await runTDScorerAnalysis(allTDProps, playerStats);

  if (!result) {
    console.error('❌ Failed to get TD picks from Gary');
    return;
  }

  // Display results
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏈 GARY'S TD SCORER PICKS`);
  console.log(`${'='.repeat(50)}`);

  console.log(`\n📋 STANDARD TD SCORERS (Gary's Best 5):`);
  (result.standard_td_picks || []).forEach((pick, i) => {
    console.log(`   ${i + 1}. ${pick.player} (${pick.team}) @ ${pick.odds > 0 ? '+' : ''}${pick.odds}`);
    console.log(`      ${pick.matchup}`);
    console.log(`      💡 ${pick.rationale}\n`);
  });

  console.log(`\n🎰 UNDERDOG TD SCORERS (5 Value Plays @ +200+):`);
  (result.underdog_td_picks || []).forEach((pick, i) => {
    console.log(`   ${i + 1}. ${pick.player} (${pick.team}) @ +${pick.odds}`);
    console.log(`      ${pick.matchup}`);
    console.log(`      💡 ${pick.rationale}\n`);
  });

  if (result.game_notes) {
    console.log(`\n📝 Gary's Notes: ${result.game_notes}`);
  }

  // Store if requested
  if (shouldStore) {
    console.log(`\n💾 Storing TD picks in Supabase...`);
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const dateParam = getESTDate();

    // Create lookup maps for game times - by player and by matchup
    const playerGameTimeMap = {};
    const matchupGameTimeMap = {};
    allTDProps.forEach(p => {
      playerGameTimeMap[p.player] = p.game_time;
      if (p.matchup) {
        matchupGameTimeMap[p.matchup] = p.game_time;
      }
    });

    // Helper to find game time - try player first, then matchup
    const findGameTime = (pick) => {
      // Try exact player match
      if (playerGameTimeMap[pick.player]) {
        return playerGameTimeMap[pick.player];
      }
      // Try matchup match
      if (pick.matchup && matchupGameTimeMap[pick.matchup]) {
        return matchupGameTimeMap[pick.matchup];
      }
      // Try partial matchup match (in case format differs)
      for (const [matchup, gameTime] of Object.entries(matchupGameTimeMap)) {
        if (pick.matchup && (matchup.includes(pick.matchup) || pick.matchup.includes(matchup))) {
          return gameTime;
        }
      }
      return null;
    };

    // Format picks for storage with time
    const standardPicks = (result.standard_td_picks || []).map(pick => {
      const line = pick.line || 0.5;
      const gameTime = findGameTime(pick);
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      return {
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.70, // Standard confidence for display
        rationale: pick.rationale,
        matchup: pick.matchup,
        td_category: 'standard',
        time: formatGameTimeEST(gameTime),
        commence_time: gameTime // ISO format for sorting
      };
    });

    const underdogPicks = (result.underdog_td_picks || []).map(pick => {
      const line = pick.line || 0.5;
      const gameTime = findGameTime(pick);
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      return {
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.50, // Lower confidence for underdogs (they're longshots!)
        rationale: pick.rationale,
        matchup: pick.matchup,
        td_category: 'underdog',
        time: formatGameTimeEST(gameTime),
        commence_time: gameTime // ISO format for sorting
      };
    });

    const allTDPicks = [...standardPicks, ...underdogPicks];

    // Fetch existing picks and merge
    const { data: existingData } = await supabase
      .from('prop_picks')
      .select('picks')
      .eq('date', dateParam)
      .single();

    let existingPicks = [];
    if (existingData?.picks) {
      // Keep non-NFL picks and non-TD NFL picks
      existingPicks = existingData.picks.filter(p => 
        p.sport !== 'NFL' || (p.sport === 'NFL' && p.td_category === undefined)
      );
    }

    const mergedPicks = [...existingPicks, ...allTDPicks];

    // Delete and re-insert
    await supabase.from('prop_picks').delete().eq('date', dateParam);
    
    const { error: insertError } = await supabase
      .from('prop_picks')
      .insert({
        date: dateParam,
        picks: mergedPicks,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error(`❌ Insert error: ${insertError.message}`);
    } else {
      console.log(`✅ Stored ${allTDPicks.length} NFL TD picks (5 standard + 5 underdog)`);
    }
  }

  console.log(`\n🏁 NFL TD Scorer Picks Complete.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('NFL TD runner crashed:', error);
    process.exit(1);
  });
