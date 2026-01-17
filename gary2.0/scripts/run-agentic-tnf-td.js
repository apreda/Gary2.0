#!/usr/bin/env node
/**
 * Agentic Thursday Night Football Touchdown Scorer Runner
 * Special feature: Gary picks 1 standard TD + 1 longshot TD + 1 First TD for TNF
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
const { perplexityService } = await import('../src/services/perplexityService.js');

const SPORT_KEY = 'americanfootball_nfl';

function getESTDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

// Check if today is Thursday in EST
function isThursdayEST() {
  const now = new Date();
  const estDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return estDate.getDay() === 4; // 0 = Sunday, 4 = Thursday
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

// Check if a game is today (Thursday) in EST
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
 * Run Gary's TNF TD Scorer Analysis - ENHANCED with defensive matchups
 */
async function runTNFTDAnalysis(allTDProps, firstTDProps, playerStats, matchup, defensiveMatchups) {
  // Split into standard odds and underdog odds (+200 or better)
  const standardTDs = allTDProps.filter(p => p.odds < 200);
  const underdogTDs = allTDProps.filter(p => p.odds >= 200);

  console.log(`\n📊 TNF TD Props Breakdown:`);
  console.log(`   Standard odds (<+200): ${standardTDs.length} players`);
  console.log(`   Underdog odds (+200+): ${underdogTDs.length} players`);
  console.log(`   First TD options: ${firstTDProps.length} players`);

  // Build defensive context string
  let defenseContext = '';
  if (defensiveMatchups && !defensiveMatchups._isDefault) {
    const homeD = defensiveMatchups.home_defense_vs_away || {};
    const awayD = defensiveMatchups.away_defense_vs_home || {};
    defenseContext = `
## DEFENSIVE MATCHUP DATA (USE THIS!)
Home Defense vs Away Offense:
- Rush Defense Rank: #${homeD.rush_defense_rank || '?'} (${homeD.rush_yards_allowed_per_game || '?'} yds/g allowed)
- Fantasy Points to RB: ${homeD.fantasy_points_allowed_to_rb || '?'}/game
- Fantasy Points to WR: ${homeD.fantasy_points_allowed_to_wr || '?'}/game
- Fantasy Points to TE: ${homeD.fantasy_points_allowed_to_te || '?'}/game

Away Defense vs Home Offense:
- Rush Defense Rank: #${awayD.rush_defense_rank || '?'} (${awayD.rush_yards_allowed_per_game || '?'} yds/g allowed)
- Fantasy Points to RB: ${awayD.fantasy_points_allowed_to_rb || '?'}/game
- Fantasy Points to WR: ${awayD.fantasy_points_allowed_to_wr || '?'}/game
- Fantasy Points to TE: ${awayD.fantasy_points_allowed_to_te || '?'}/game

Key Insights: ${defensiveMatchups.matchup_insights?.join(' | ') || 'N/A'}
`;
  }

  const systemPrompt = `
You are Gary, the expert NFL analyst. You're picking Touchdown Scorers for THURSDAY NIGHT FOOTBALL.
${defenseContext}

## YOUR TASK
This is the primetime TNF game - make it count! You must make THREE TD scorer picks:

### PICK 1: STANDARD TD SCORER
Pick your #1 BEST touchdown scorer bet for tonight's TNF game. This is your highest-confidence play backed by:
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
- You CAN pick Over 1.5 TDs (2+ touchdowns) if you think someone will have a big TNF game

### PICK 3: FIRST TD SCORER
Pick 1 player most likely to score the FIRST touchdown of the game. This is a HIGH VARIANCE play:
- Players who get early red zone usage
- Teams with strong opening drive scripts
- Goal line backs and red zone targets
- Consider each team's first-drive tendencies

## THURSDAY NIGHT FOOTBALL CONTEXT
- Short week for both teams = fatigue factor
- Less time to game plan = simpler offensive schemes
- Primetime games often see star players getting featured
- Running game typically more prominent on short rest

## RESPONSE FORMAT (STRICT JSON)
{
  "standard_td_pick": {
    "player": "Player Name",
    "team": "Team Abbreviation",
    "line": 0.5,
    "odds": -120,
    "matchup": "${matchup}",
    "rationale": "3-4 sentences explaining why this player will score on TNF"
  },
  "longshot_td_pick": {
    "player": "Player Name", 
    "team": "Team Abbreviation",
    "line": 0.5,
    "odds": 250,
    "matchup": "${matchup}",
    "rationale": "3-4 sentences explaining the value opportunity for TNF"
  },
  "first_td_pick": {
    "player": "Player Name",
    "team": "Team Abbreviation",
    "odds": 500,
    "matchup": "${matchup}",
    "rationale": "3-4 sentences explaining why this player could score FIRST"
  },
  "tnf_preview": "2-3 sentences about tonight's TNF game and TD-scoring environment"
}

IMPORTANT:
- Standard pick: Pick exactly 1 from any odds, line is always 0.5
- Longshot pick: Pick exactly 1 with odds +200 or better. Line can be 0.5 (1+ TD) or 1.5 (2+ TDs)
- First TD pick: Pick exactly 1 player likely to score the first TD of the game
- Be specific about WHY each player will score TONIGHT
`;

  const userContent = JSON.stringify({
    date: getESTDate(),
    tnf_game: matchup,
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

  console.log(`\n🤖 Gary analyzing TNF TD scorers...`);
  
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

  console.log(`\n🏈 THURSDAY NIGHT FOOTBALL TD Picks`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}`);
  console.log(`${'='.repeat(50)}\n`);

  // Check if it's Thursday (unless force flag is set)
  if (!isThursdayEST() && !forceRun) {
    console.log('⚠️ Today is not Thursday. TNF picks are only generated on Thursdays.');
    console.log('   Use --force=1 to run anyway for testing.');
    return;
  }

  // Fetch NFL games
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache });
  const now = Date.now();
  const todayStr = getESTDate();

  // Filter to only today's games (should be TNF)
  const tnfGames = games.filter(g => isGameToday(g.commence_time));

  console.log(`Found ${tnfGames.length} NFL game(s) scheduled for today (TNF).\n`);

  if (tnfGames.length === 0) {
    console.log('⚠️ No TNF games found for today.');
    return;
  }

  // Usually just 1 TNF game
  const tnfGame = tnfGames[0];
  const matchup = `${tnfGame.away_team} @ ${tnfGame.home_team}`;
  
  console.log(`🏈 Tonight's TNF Game: ${matchup}`);
  console.log(`   Kickoff: ${formatGameTimeEST(tnfGame.commence_time)}`);

  // Collect TD props for the TNF game
  const allTDProps = [];
  const firstTDProps = [];
  let playerStats = '';

  console.log(`\n📡 Fetching TD props for ${matchup}...`);

  try {
    const props = await propOddsService.getPlayerPropOdds(SPORT_KEY, tnfGame.home_team, tnfGame.away_team);
    
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
        game_time: tnfGame.commence_time
      });
    });

    firstProps.forEach(p => {
      firstTDProps.push({
        player: p.player,
        team: p.team,
        odds: p.over_odds || p.odds,
        matchup: matchup,
        game_time: tnfGame.commence_time
      });
    });

    console.log(`   ✅ Found ${tdProps.length} anytime TD props, ${firstProps.length} first TD props`);
  } catch (e) {
    console.warn(`   ⚠️ Could not fetch props: ${e.message}`);
  }

  console.log(`\n📊 Total TNF TD props collected: ${allTDProps.length} anytime, ${firstTDProps.length} first TD`);

  if (allTDProps.length === 0) {
    console.log('⚠️ No TD props available for TNF. Exiting.');
    return;
  }

  // Sort by odds for display
  allTDProps.sort((a, b) => a.odds - b.odds);

  // Get player stats for context
  try {
    const { formatNFLPlayerStats } = await import('../src/services/nflPlayerPropsService.js');
    const stats = await formatNFLPlayerStats(tnfGame.home_team, tnfGame.away_team);
    playerStats = stats;
  } catch (e) {
    console.warn('Could not fetch player stats:', e.message);
  }

  // Fetch defensive matchups (ENHANCED)
  let defensiveMatchups = null;
  try {
    console.log(`\n🛡️ Fetching defensive matchup data...`);
    defensiveMatchups = await perplexityService.getNFLDefensiveMatchups(
      tnfGame.home_team, 
      tnfGame.away_team, 
      getESTDate()
    );
    if (defensiveMatchups && !defensiveMatchups._isDefault) {
      console.log(`   ✅ Got LIVE defensive data`);
      const homeD = defensiveMatchups.home_defense_vs_away;
      const awayD = defensiveMatchups.away_defense_vs_home;
      console.log(`   ${tnfGame.home_team} Rush D: #${homeD?.rush_defense_rank}, Fantasy to RB: ${homeD?.fantasy_points_allowed_to_rb}`);
      console.log(`   ${tnfGame.away_team} Rush D: #${awayD?.rush_defense_rank}, Fantasy to RB: ${awayD?.fantasy_points_allowed_to_rb}`);
    } else {
      console.log(`   ⚠️ Using default defensive data`);
    }
  } catch (e) {
    console.warn(`   Could not fetch defensive matchups: ${e.message}`);
  }

  // Run Gary's TNF analysis with defensive context
  const result = await runTNFTDAnalysis(allTDProps, firstTDProps, playerStats, matchup, defensiveMatchups);

  if (!result) {
    console.error('❌ Failed to get TNF TD picks from Gary');
    return;
  }

  // Display results
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏈 GARY'S TNF TD PICKS - ${matchup}`);
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

  if (result.tnf_preview) {
    console.log(`\n📺 TNF Preview: ${result.tnf_preview}`);
  }

  // Store if requested
  if (shouldStore) {
    console.log(`\n💾 Storing TNF TD picks in Supabase...`);
    
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
    const tnfPicks = [];

    if (result.standard_td_pick) {
      const pick = result.standard_td_pick;
      const line = pick.line || 0.5;
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      tnfPicks.push({
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.75, // Higher confidence for TNF standard pick
        rationale: pick.rationale,
        matchup: pick.matchup || matchup,
        td_category: 'standard',
        tnf_pick: true, // Flag to identify TNF picks
        time: formatGameTimeEST(tnfGame.commence_time),
        commence_time: tnfGame.commence_time
      });
    }

    if (result.longshot_td_pick) {
      const pick = result.longshot_td_pick;
      const line = pick.line || 0.5;
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      tnfPicks.push({
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
        tnf_pick: true, // Flag to identify TNF picks
        time: formatGameTimeEST(tnfGame.commence_time),
        commence_time: tnfGame.commence_time
      });
    }

    if (result.first_td_pick) {
      const pick = result.first_td_pick;
      tnfPicks.push({
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
        tnf_pick: true, // Flag to identify TNF picks
        time: formatGameTimeEST(tnfGame.commence_time),
        commence_time: tnfGame.commence_time
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
      // Remove any existing TNF picks (to avoid duplicates on re-run)
      existingPicks = existingData.picks.filter(p => !p.tnf_pick);
    }

    const mergedPicks = [...existingPicks, ...tnfPicks];

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
      console.log(`✅ Stored ${tnfPicks.length} TNF TD picks (1 standard + 1 longshot + 1 first TD)`);
    }
  }

  console.log(`\n🏁 Thursday Night Football TD Picks Complete.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('TNF TD runner crashed:', error);
    process.exit(1);
  });
