#!/usr/bin/env node
/**
 * Agentic Props CLI Runner
 * Generic CLI for running agentic prop picks pipeline
 */
// Load environment variables FIRST
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

// Dynamic imports after env is loaded (so geminiService gets correct proxy URL)
const { oddsService } = await import('../src/services/oddsService.js');
const { propOddsService } = await import('../src/services/propOddsService.js');
const { getPropsConstitution, applyPropsPerGameConstraint } = await import('../src/services/agentic/propsSharedUtils.js');
const { analyzeGame } = await import('../src/services/agentic/orchestrator/index.js');

const defaultArgv = process.argv.slice(2);

function parseArgs(argv = defaultArgv) {
  return argv.reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    const normalizedKey = key.replace(/^--/, '');
    acc[normalizedKey] = value ?? true;
    return acc;
  }, {});
}

function getESTDate() {
  // DST-safe: Use Intl with America/New_York timezone
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

export async function runAgenticPropsCli({
  sportKey,
  leagueLabel,
  buildContext,
  windowHours = 24 * 7,
  propsPerGame = 5,
  limitDefault = 5,
  useESTDayFiltering = false,  // If true, filter by EST day instead of rolling window
  regularOnly = false  // If true for NFL, only generate yards/receptions props (no TDs - use when TDs already stored)
}) {
  if (!sportKey || !buildContext) {
    throw new Error('runAgenticPropsCli requires sportKey and buildContext');
  }

  const args = parseArgs();
  const parsedLimit = Number.parseInt(args.limit || process.env.AGENTIC_PROPS_LIMIT || String(limitDefault), 10);
  const limit = Number.isNaN(parsedLimit) ? limitDefault : parsedLimit;
  const nocache = args.nocache === '1' || args.nocache === 'true';
  const shouldStore = args.store !== '0' && args.store !== 'false'; // Default TRUE, pass --store=0 to skip
  const matchupFilter = args.matchup || null;
  // CLI override for regularOnly: --regular=1 or --no-td=1
  const cliRegularOnly = regularOnly || args.regular === '1' || args['no-td'] === '1';
  // --test flag: store to test_prop_picks table instead of production (for testing)
  const useTestTable = args.test === true || args.test === '1' || args.test === 'true';
  const testTableName = useTestTable ? 'test_prop_picks' : 'prop_picks';

  console.log(`\n🏈 Agentic ${leagueLabel} Props Runner Starting...`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`🎯 Sport: ${leagueLabel}`);
  console.log(`📊 Games limit: ${limit}`);
  console.log(`🔧 Pipeline: ORCHESTRATOR (multi-pass)`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}${useTestTable ? ' (TEST MODE → test_prop_picks)' : ''}`);
  if (cliRegularOnly && leagueLabel === 'NFL') console.log(`🏈 Mode: Regular props only (yards/receptions - TDs handled separately)`);
  if (matchupFilter) console.log(`🔍 Matchup filter: ${matchupFilter}`);
  console.log(`${'='.repeat(50)}\n`);

  // Fetch upcoming games
  const games = await oddsService.getUpcomingGames(sportKey, { nocache });
  const now = Date.now();
  
  // Calculate time window based on filtering mode
  let todayStart, tomorrowStart;
  if (useESTDayFiltering) {
    // Use EST day boundaries for filtering (all games on current EST day)
    // DST-safe: Calculate using proper timezone offset
    const todayEST = getESTDate();
    // Create date at midnight EST/EDT (timezone-aware)
    const midnightToday = new Date(`${todayEST}T00:00:00`);
    // Get the timezone offset for EST/EDT dynamically
    const estOffset = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
    todayStart = new Date(`${todayEST}T00:00:00${estOffset}`).getTime();
    tomorrowStart = todayStart + (24 * 60 * 60 * 1000);
    console.log(`📅 EST Day Filter: ${todayEST} (${estOffset}), todayStart=${new Date(todayStart).toISOString()}, tomorrowStart=${new Date(tomorrowStart).toISOString()}`);
  }
  const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : null;

  // DEBUG: Log all games before filtering
  console.log(`\n🔍 DEBUG: ${games.length} games returned from oddsService:`);
  for (const g of games) {
    console.log(`   - ${g.away_team} @ ${g.home_team} | commence_time: ${g.commence_time} | id: ${g.id}`);
  }
  console.log(`🔍 DEBUG: now = ${new Date(now).toISOString()}, windowMs = ${windowMs}ms (${windowHours}h)\n`);

  const filtered = games
    .filter((game) => {
      const tip = new Date(game.commence_time).getTime();
      const tipIsNaN = Number.isNaN(tip);
      const tipInPast = tip <= now;
      const tipOutsideWindow = windowMs != null && tip > now + windowMs;

      // DEBUG: Log each game's filter result
      if (tipIsNaN || tipInPast || tipOutsideWindow) {
        console.log(`🚫 FILTERED OUT: ${game.away_team} @ ${game.home_team}`);
        console.log(`   commence_time: ${game.commence_time}, tip: ${tip}, isNaN: ${tipIsNaN}, inPast: ${tipInPast}, outsideWindow: ${tipOutsideWindow}`);
      }

      if (tipIsNaN) return false;

      if (useESTDayFiltering) {
        // Filter games starting on current EST day
        if (tip < todayStart || tip >= tomorrowStart) return false;
      } else {
        // Use rolling window (original behavior)
        if (tipInPast) return false;
        if (tipOutsideWindow) return false;
      }

      // Apply matchup filter if provided
      if (matchupFilter) {
        const matchupLower = matchupFilter.toLowerCase();
        const homeMatch = game.home_team.toLowerCase().includes(matchupLower);
        const awayMatch = game.away_team.toLowerCase().includes(matchupLower);
        if (!homeMatch && !awayMatch) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .slice(0, Math.max(limit, 1));

  console.log(`Found ${filtered.length} ${leagueLabel} games to process.\n`);

  if (filtered.length === 0) {
    console.log(`⚠️ No upcoming ${leagueLabel} games found within ${windowHours}h window.`);
    return;
  }

  const allPropPicks = [];

  for (const game of filtered) {
    const matchup = `${game.away_team} @ ${game.home_team}`;
    const gameTime = new Date(game.commence_time).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🏈 ${matchup}`);
    console.log(`⏰ ${gameTime} EST`);
    console.log(`${'='.repeat(50)}`);

    try {
      // Fetch available props for this game
      console.log(`\n📡 Fetching player props...`);
      let playerProps = [];
      try {
        playerProps = await propOddsService.getPlayerPropOdds(sportKey, game.home_team, game.away_team, game.commence_time);
        console.log(`✅ Found ${playerProps.length} prop lines`);
      } catch (propsError) {
        console.warn(`⚠️ Could not fetch props: ${propsError.message}`);
        continue;
      }

      if (playerProps.length === 0) {
        console.log(`⚠️ No props available for this game, skipping...`);
        continue;
      }

      let result;

      {
        console.log(`[Orchestrator Props] Building context for ${matchup}...`);
        const context = await buildContext(game, playerProps, { nocache, regularOnly: cliRegularOnly });

        // Prepare prop candidates and available lines for orchestrator
        const propCandidates = (context.propCandidates || []).slice(0, 14).map(p => ({
          player: p.player,
          team: p.team,
          props: p.props,
          recentForm: p.recentForm ? {
            targetTrend: p.recentForm.targetTrend,
            usageTrend: p.recentForm.usageTrend,
            formTrend: p.recentForm.formTrend
          } : null
        }));

        // Filter available lines to only validated players
        const validatedPlayerNames = new Set(
          (context.propCandidates || []).map(p => p.player.toLowerCase())
        );
        const availableLines = playerProps
          .filter(p => validatedPlayerNames.has(p.player.toLowerCase()))
          .slice(0, 80)
          .map(p => ({
            player: p.player,
            prop_type: p.prop_type,
            line: p.line,
            over_odds: p.over_odds,
            under_odds: p.under_odds
          }));

        const propsConstitution = getPropsConstitution(leagueLabel);

        result = await analyzeGame(game, sportKey, {
          mode: 'props',
          propContext: {
            propCandidates,
            availableLines,
            playerStats: context.playerStats || '',
            gameSummary: context.gameSummary || {},
            propsConstitution,
            narrativeContext: context.narrativeContext || null
          }
        });

        // Post-process orchestrator picks: normalize line + format prop for iOS display
        if (result.picks && result.picks.length > 0) {
          result.picks = result.picks.map(pick => {
            // Extract line from prop string if embedded (e.g. "player_points 25.5")
            let prop = pick.prop || '';
            let line = pick.line;
            const propParts = prop.match(/^([a-z_]+)\s+([\d.]+)$/i);
            if (propParts) {
              prop = propParts[1];
              if (!line) line = parseFloat(propParts[2]);
            }
            // If line is still missing, look it up from available lines
            if (!line && pick.player && prop) {
              const match = playerProps.find(p =>
                p.player.toLowerCase() === pick.player.toLowerCase() &&
                p.prop_type.toLowerCase() === prop.toLowerCase()
              );
              if (match) line = match.line;
            }
            if (!line) {
              console.log(`⚠️ Missing line for ${pick.player} ${prop} — could not resolve from available lines`);
            }

            // Format prop for iOS propDisplay():
            // Strip "player_" prefix → "player_points" becomes "points"
            // Append line number → "points 25.5"
            // iOS propDisplay("points 25.5") renders as "Points 25.5"
            let displayProp = prop.replace(/^player_/i, '');
            if (line) displayProp = `${displayProp} ${line}`;

            return {
              ...pick,
              prop: displayProp,
              line: line != null ? String(line) : null,
              sport: leagueLabel,
              matchup,
              commence_time: game.commence_time,
              bet: pick.bet ? (pick.bet.toLowerCase() === 'yes' ? 'over' : pick.bet.toLowerCase()) : pick.bet,
              confidence: pick.confidence || null
            };
          });

          // Apply 2-per-game constraint for NBA/NHL
          if (leagueLabel === 'NBA' || leagueLabel === 'NHL') {
            const { constrainedPicks } = applyPropsPerGameConstraint(result.picks, `${leagueLabel}-post`);
            result.picks = constrainedPicks;
          }
        }
      }

      if (result.picks && result.picks.length > 0) {
        console.log(`✅ Generated ${result.picks.length} picks for ${matchup}`);

        // DEBUG: Print full pick details with rationale
        for (const pick of result.picks) {
          console.log(`\n📊 PICK: ${pick.player} (${pick.team})`);
          console.log(`   Prop: ${pick.bet?.toUpperCase()} ${pick.prop} @ ${pick.odds}`);
          console.log(`   Confidence: ${Math.round((pick.confidence || 0) * 100)}%`);
          console.log(`   Gary's Take: ${pick.rationale || pick.analysis || 'N/A'}`);
          if (pick.key_stats) console.log(`   Key Stats: ${JSON.stringify(pick.key_stats)}`);
        }

        allPropPicks.push(...result.picks);
      } else {
        console.log(`⚠️ No confident prop picks for this game`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${matchup}:`, error.message);
    }
  }

  // Deduplicate and Prepare Final Picks
  if (allPropPicks.length === 0) {
    console.log(`\n⚠️ No prop picks generated across all games.`);
    return;
  }

  // CRITICAL: Deduplicate by player + prop_type
  const dedupeKey = (pick) => {
    const propType = (pick.prop || '').split(' ')[0].toLowerCase();
    return `${(pick.player || '').toLowerCase()}_${propType}`;
  };

  const deduped = new Map();
  for (const pick of allPropPicks) {
    const key = dedupeKey(pick);
    const existing = deduped.get(key);
    if (!existing || 
        (pick.confidence || 0) > (existing.confidence || 0) ||
        ((pick.confidence || 0) === (existing.confidence || 0) && (pick.ev || 0) > (existing.ev || 0))) {
      deduped.set(key, pick);
    }
  }

  const sortedPicks = Array.from(deduped.values()).sort((a, b) => {
    const confDiff = (b.confidence || 0) - (a.confidence || 0);
    if (confDiff !== 0) return confDiff;
    return (b.ev || 0) - (a.ev || 0);
  });

  // Validate picks before storage
  const validPicks = sortedPicks.filter(pick => {
    const hasPlayer = !!pick.player;
    const hasProp = !!(pick.prop || pick.prop_type);
    const hasBet = !!(pick.bet || pick.direction);
    const hasLine = pick.line !== undefined && pick.line !== null;
    if (!hasPlayer || !hasProp || !hasBet || !hasLine) {
      console.warn(`[Props CLI] ⚠️ Filtering invalid pick — missing fields:`, { player: pick.player, prop: pick.prop, bet: pick.bet, line: pick.line });
      return false;
    }
    return true;
  });

  if (validPicks.length < sortedPicks.length) {
    console.log(`[Props CLI] Filtered out ${sortedPicks.length - validPicks.length} invalid pick(s). ${validPicks.length} valid picks remain.`);
  }

  // STORAGE (Do this BEFORE the big summary print)
  if (shouldStore) {
    console.log(`\n💾 Storing ${validPicks.length} picks in Supabase...`);
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error(`❌ Missing Supabase credentials`);
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const dateParam = getESTDate();
      const { data: existingData } = await supabase
        .from(testTableName)
        .select('picks')
        .eq('date', dateParam)
        .single();

      let existingPicks = [];
      const newMatchups = new Set(validPicks.map(p => p.matchup?.toLowerCase()).filter(Boolean));
      // Check if new picks include TD picks (for NFL categorized format)
      const newHasTdPicks = validPicks.some(p => p.td_category);
      
      if (existingData?.picks) {
        existingPicks = existingData.picks.filter(p => {
          // Always keep picks from other sports
          if (p.sport !== leagueLabel) return true;
          
          const pickMatchup = p.matchup?.toLowerCase();
          const isSameMatchup = pickMatchup && newMatchups.has(pickMatchup);
          
          // For NFL: If new picks include TD picks, filter out existing TD picks for same matchup
          // This prevents duplicates when running NFL props (which now outputs categorized TD picks)
          if (leagueLabel === 'NFL' && p.td_category && newHasTdPicks && isSameMatchup) {
            console.log(`[Storage] Replacing existing ${p.td_category} TD pick for ${pickMatchup}`);
            return false;
          }
          
          // Keep existing TD picks if new picks don't include TDs (standalone TD script didn't run yet)
          if (p.td_category && !newHasTdPicks) return true;
          
          // Filter out existing regular props for same matchup
          return !isSameMatchup;
        });
      }

      const mergedPicks = [...existingPicks, ...validPicks];
      
      // Use upsert instead of delete-then-insert (atomic, race-safe)
      const { error: upsertError } = await supabase
        .from(testTableName)
        .upsert({
          date: dateParam,
          picks: mergedPicks,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'date'
        });

      if (upsertError) {
        console.error(`❌ Upsert error: ${upsertError.message}`);
      } else {
        console.log(`✅ Successfully stored picks for ${dateParam}`);
      }
    }
  }

  // FINAL SUMMARY
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏆 FINAL ${leagueLabel} PICKS SUMMARY`);
  console.log(`${'='.repeat(50)}`);
  
  validPicks.forEach((pick, i) => {
    const conf = pick.confidence ? (pick.confidence * 100).toFixed(0) : '?';
    const bet = pick.bet ? pick.bet.toUpperCase() : '?';
    console.log(`${i + 1}. ${pick.player || 'Unknown'} (${pick.team || '?'}): ${bet} ${pick.prop || '?'} ${pick.line || '?'} @ ${pick.odds || '?'} (${conf}% confidence)`);
  });

  console.log(`\n🏁 Agentic ${leagueLabel} Props Runner Complete.\n`);
}
