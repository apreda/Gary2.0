#!/usr/bin/env node
/**
 * Agentic Monday Night Football Touchdown Scorer Runner
 * Special feature: Gary picks 1 standard TD + 1 longshot TD + 1 First TD for MNF
 */
// Load environment variables FIRST
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

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

// Check if today is Monday in EST
function isMondayEST() {
  const now = new Date();
  const estDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return estDate.getDay() === 1; // 0 = Sunday, 1 = Monday
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

// Check if a game is today (Monday) in EST
function isGameToday(commenceTime) {
  if (!commenceTime) return false;
  const gameDate = new Date(commenceTime);
  const todayEST = getESTDate();
  
  // Convert game time to EST date
  const gameEST = new Date(gameDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const gameYear = gameEST.getFullYear();
  const gameMonth = String(gameEST.getMonth() + 1).padStart(2, '0');
  const gameDay = String(gameEST.getDate()).padStart(2, '0');
  const gameDateStr = `${gameYear}-${gameMonth}-${gameDay}`;
  
  return gameDateStr === todayEST;
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
 * Run Gary's MNF TD Scorer Analysis
 */
async function runMNFTDAnalysis(allTDProps, firstTDProps, playerStats, matchup) {
  // Split into standard odds and underdog odds (+200 or better)
  const standardTDs = allTDProps.filter(p => p.odds < 200);
  const underdogTDs = allTDProps.filter(p => p.odds >= 200);

  console.log(`\n📊 MNF TD Props Breakdown:`);
  console.log(`   Standard odds (<+200): ${standardTDs.length} players`);
  console.log(`   Underdog odds (+200+): ${underdogTDs.length} players`);
  console.log(`   First TD options: ${firstTDProps.length} players`);

  const systemPrompt = `
You are Gary, the expert NFL analyst. You're picking Touchdown Scorers for MONDAY NIGHT FOOTBALL.

## YOUR TASK
This is the primetime MNF game - make it count! You must make THREE TD scorer picks:

### PICK 1: STANDARD TD SCORER
Pick your #1 BEST touchdown scorer bet for tonight's MNF game. This is your highest-confidence play backed by:
- Red zone usage and targets
- Goal line carries
- Recent TD scoring trends
- Matchup advantages
- Game script projections

For the standard pick, use line 0.5 (Over 0.5 TDs = scores at least 1 TD).

### PICK 2: LONGSHOT TD SCORER
Pick 1 touchdown scorer bet with odds of +200 or better (higher payout). This is your VALUE play:
- A player who could vulture a TD or score multiple
- Someone in a favorable TD-scoring situation that oddsmakers are undervaluing
- You CAN pick Over 1.5 TDs (2+ touchdowns) if you think someone will have a big MNF game

### PICK 3: FIRST TD SCORER
Pick 1 player most likely to score the FIRST touchdown of the game. This is a HIGH VARIANCE play:
- Players who get early red zone usage
- Teams with strong opening drive scripts
- Goal line backs and red zone targets
- Consider each team's first-drive tendencies

## MONDAY NIGHT FOOTBALL CONTEXT
- Prime time games often see stars getting extra usage
- Home crowds can affect goal-line decisions
- Coaches sometimes save special plays for MNF
- Consider the national spotlight factor

## RESPONSE FORMAT (STRICT JSON)
{
  "standard_td_pick": {
    "player": "Player Name",
    "team": "Team Abbreviation",
    "line": 0.5,
    "odds": -120,
    "matchup": "${matchup}",
    "rationale": "3-4 sentences explaining why this player will score on MNF"
  },
  "longshot_td_pick": {
    "player": "Player Name", 
    "team": "Team Abbreviation",
    "line": 0.5,
    "odds": 250,
    "matchup": "${matchup}",
    "rationale": "3-4 sentences explaining the value opportunity for MNF"
  },
  "first_td_pick": {
    "player": "Player Name",
    "team": "Team Abbreviation",
    "odds": 500,
    "matchup": "${matchup}",
    "rationale": "3-4 sentences explaining why this player could score FIRST"
  },
  "mnf_preview": "2-3 sentences about tonight's MNF game and TD-scoring environment"
}

IMPORTANT:
- Standard pick: Pick exactly 1 from any odds, line is always 0.5
- Longshot pick: Pick exactly 1 with odds +200 or better. Line can be 0.5 (1+ TD) or 1.5 (2+ TDs)
- First TD pick: Pick exactly 1 player likely to score the first TD of the game
- Be specific about WHY each player will score TONIGHT
`;

  const userContent = JSON.stringify({
    date: getESTDate(),
    mnf_game: matchup,
    standard_td_options: standardTDs.slice(0, 30).map(p => ({
      player: p.player,
      team: p.team,
      odds: p.odds,
      matchup: p.matchup
    })),
    underdog_td_options: underdogTDs.slice(0, 40).map(p => ({
      player: p.player,
      team: p.team,
      odds: p.odds,
      matchup: p.matchup
    })),
    first_td_options: firstTDProps.slice(0, 30).map(p => ({
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

  console.log(`\n🤖 Gary analyzing MNF TD scorers...`);
  
  const raw = await openaiService.generateResponse(messages, {
    temperature: 1.0,
    maxTokens: 1800
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
  const forceRun = args.force === '1' || args.force === 'true';

  console.log(`\n🌙 MONDAY NIGHT FOOTBALL TD Picks`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}`);
  console.log(`${'='.repeat(50)}\n`);

  // Check if it's Monday (unless force flag is set)
  if (!isMondayEST() && !forceRun) {
    console.log('⚠️ Today is not Monday. MNF picks are only generated on Mondays.');
    console.log('   Use --force=1 to run anyway for testing.');
    return;
  }

  // Fetch NFL games
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache });
  const now = Date.now();
  const todayStr = getESTDate();

  // Filter to only today's games (should be MNF)
  const mnfGames = games.filter(g => isGameToday(g.commence_time));

  console.log(`Found ${mnfGames.length} NFL game(s) scheduled for today (MNF).\n`);

  if (mnfGames.length === 0) {
    console.log('⚠️ No MNF games found for today.');
    return;
  }

  // Usually just 1 MNF game, but handle the rare double-header
  const mnfGame = mnfGames[0];
  const matchup = `${mnfGame.away_team} @ ${mnfGame.home_team}`;
  
  console.log(`🏈 Tonight's MNF Game: ${matchup}`);
  console.log(`   Kickoff: ${formatGameTimeEST(mnfGame.commence_time)}`);

  // Collect TD props for the MNF game
  const allTDProps = [];
  const firstTDProps = [];
  let playerStats = '';

  console.log(`\n📡 Fetching TD props for ${matchup}...`);

  try {
    const props = await propOddsService.getPlayerPropOdds(SPORT_KEY, mnfGame.home_team, mnfGame.away_team, mnfGame.commence_time);
    
    // Filter for anytime TD props
    const tdProps = props.filter(p => {
      const propType = (p.prop_type || '').toLowerCase();
      return propType === 'anytime_td' || 
             propType === 'player_anytime_td' ||
             propType === 'player_tds_over' ||
             propType === 'tds_over' ||
             (propType.includes('td') && !propType.includes('pass_td') && !propType.includes('1st_td') && !propType.includes('first_td'));
    });

    // Filter for First TD props
    const firstProps = props.filter(p => {
      const propType = (p.prop_type || '').toLowerCase();
      return propType === 'first_td' || 
             propType === 'player_1st_td' ||
             propType === '1st_td';
    });

    tdProps.forEach(p => {
      allTDProps.push({
        player: p.player,
        team: p.team,
        odds: p.over_odds || p.odds,
        matchup: matchup,
        game_time: mnfGame.commence_time
      });
    });

    firstProps.forEach(p => {
      firstTDProps.push({
        player: p.player,
        team: p.team,
        odds: p.over_odds || p.odds,
        matchup: matchup,
        game_time: mnfGame.commence_time
      });
    });

    console.log(`   ✅ Found ${tdProps.length} anytime TD props, ${firstProps.length} first TD props`);
  } catch (e) {
    console.warn(`   ⚠️ Could not fetch props: ${e.message}`);
  }

  console.log(`\n📊 Total MNF TD props collected: ${allTDProps.length} anytime, ${firstTDProps.length} first TD`);

  if (allTDProps.length === 0) {
    console.log('⚠️ No TD props available for MNF. Exiting.');
    return;
  }

  // Sort by odds for display
  allTDProps.sort((a, b) => a.odds - b.odds);

  // Get player stats for context
  try {
    const { formatNFLPlayerStats } = await import('../src/services/nflPlayerPropsService.js');
    const stats = await formatNFLPlayerStats(mnfGame.home_team, mnfGame.away_team);
    playerStats = stats;
  } catch (e) {
    console.warn('Could not fetch player stats:', e.message);
  }

  // Run Gary's MNF analysis
  const result = await runMNFTDAnalysis(allTDProps, firstTDProps, playerStats, matchup);

  if (!result) {
    console.error('❌ Failed to get MNF TD picks from Gary');
    return;
  }

  // Display results
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🌙 GARY'S MNF TD PICKS - ${matchup}`);
  console.log(`${'='.repeat(50)}`);

  if (result.standard_td_pick) {
    const pick = result.standard_td_pick;
    console.log(`\n✅ STANDARD TD SCORER:`);
    console.log(`   ${pick.player} (${pick.team}) @ ${pick.odds > 0 ? '+' : ''}${pick.odds}`);
    console.log(`   💡 ${pick.rationale}\n`);
  }

  if (result.longshot_td_pick) {
    const pick = result.longshot_td_pick;
    console.log(`\n🎰 LONGSHOT TD SCORER:`);
    console.log(`   ${pick.player} (${pick.team}) @ +${pick.odds}`);
    console.log(`   💡 ${pick.rationale}\n`);
  }

  if (result.first_td_pick) {
    const pick = result.first_td_pick;
    console.log(`\n🥇 FIRST TD SCORER:`);
    console.log(`   ${pick.player} (${pick.team}) @ +${pick.odds}`);
    console.log(`   💡 ${pick.rationale}\n`);
  }

  if (result.mnf_preview) {
    console.log(`\n📺 MNF Preview: ${result.mnf_preview}`);
  }

  // Store if requested
  if (shouldStore) {
    console.log(`\n💾 Storing MNF TD picks in Supabase...`);
    
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

    // Format picks for storage
    const mnfPicks = [];

    if (result.standard_td_pick) {
      const pick = result.standard_td_pick;
      const line = pick.line || 0.5;
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      mnfPicks.push({
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.75, // Higher confidence for MNF standard pick
        rationale: pick.rationale,
        matchup: pick.matchup || matchup,
        td_category: 'standard',
        mnf_pick: true, // Flag to identify MNF picks
        time: formatGameTimeEST(mnfGame.commence_time),
        commence_time: mnfGame.commence_time
      });
    }

    if (result.longshot_td_pick) {
      const pick = result.longshot_td_pick;
      const line = pick.line || 0.5;
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      mnfPicks.push({
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.50, // Lower confidence for longshot
        rationale: pick.rationale,
        matchup: pick.matchup || matchup,
        td_category: 'underdog',
        mnf_pick: true, // Flag to identify MNF picks
        time: formatGameTimeEST(mnfGame.commence_time),
        commence_time: mnfGame.commence_time
      });
    }

    if (result.first_td_pick) {
      const pick = result.first_td_pick;
      mnfPicks.push({
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: 'First TD',
        line: 0.5,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.35, // Low confidence for first TD (high variance)
        rationale: pick.rationale,
        matchup: pick.matchup || matchup,
        td_category: 'first_td',
        mnf_pick: true, // Flag to identify MNF picks
        time: formatGameTimeEST(mnfGame.commence_time),
        commence_time: mnfGame.commence_time
      });
    }

    // Fetch existing picks and merge
    const { data: existingData } = await supabase
      .from('prop_picks')
      .select('picks')
      .eq('date', dateParam)
      .single();

    let existingPicks = [];
    if (existingData?.picks) {
      // Remove any existing MNF picks (to avoid duplicates on re-run)
      existingPicks = existingData.picks.filter(p => !p.mnf_pick);
    }

    const mergedPicks = [...existingPicks, ...mnfPicks];

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
      console.log(`✅ Stored ${mnfPicks.length} MNF TD picks (1 standard + 1 longshot + 1 first TD)`);
    }
  }

  console.log(`\n🏁 Monday Night Football TD Picks Complete.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('MNF TD runner crashed:', error);
    process.exit(1);
  });

