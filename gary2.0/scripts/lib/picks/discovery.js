/** Provider discovery, exact-slate recovery, current league metadata and CLI filters. */
import { exactFootballGameDiscoveryOptions } from '../pickRunReliability.js';
import { classifyNcaafCoveredGames } from '../../../src/services/ncaafGamePolicy.js';
import { mergeExactGameWithSlate } from './slate.js';
import { selectPickGameWindow } from './window.js';

export function createPickGameDiscovery({ oddsService, picksService, ballDontLieService, fetchDailySlateGame,
  console = globalThis.console }) {
  async function discoverPickGames(config, { dateFilter, gameIdFilter, matchupFilter, timeFilter, gameLimit, gameOffset = 0 } = {}) {
    // Fetch games
    console.log(`[${config.name}] Fetching upcoming games...`);

    let allGames = await oddsService.getUpcomingGames(config.key, {
      nocache: true,
      targetDate: dateFilter,
      ...exactFootballGameDiscoveryOptions(config.key, gameIdFilter),
    });
    if (gameIdFilter && dateFilter) {
      try {
        const slateGame = await fetchDailySlateGame(config.key, dateFilter.split(',')[0].trim(), gameIdFilter);
        if (slateGame) {
          const liveIndex = (allGames || []).findIndex(game => String(game.bdl_game_id ?? game.id ?? '') === String(gameIdFilter));
          if (liveIndex >= 0) {
            allGames[liveIndex] = mergeExactGameWithSlate(allGames[liveIndex], slateGame);
          } else {
            allGames = [...(allGames || []), slateGame];
          }
          console.log(`[${config.name}] Exact game ${gameIdFilter}: matched saved schedule and merged available opening fields; missing prices remain unavailable`);
        }
      } catch (slateError) {
        console.warn(`[${config.name}] Exact daily_slate fallback unavailable: ${slateError.message}`);
      }
    }

    let { games, timeLabel } = selectPickGameWindow(allGames, config, { dateFilter, picksService, console });

    // NFL: Enrich games with playoff round significance (Wild Card, Divisional, Championship, Super Bowl)
    if (config.key === 'americanfootball_nfl' && games.length > 0) {
      const weekToSignificance = {
        1: 'Wild Card',
        2: 'Divisional Round',
        3: 'Conference Championship',
        4: 'Super Bowl'
      };
      if (gameIdFilter) {
        // The exact provider response already carries postseason/week. Do not
        // download the full postseason slate just to label one scheduler game.
        for (const game of games) {
          if (game.postseason && game.week) {
            game.gameSignificance = weekToSignificance[game.week] || 'Playoff';
          }
        }
      } else try {
        console.log(`[${config.name}] Checking for postseason games via BDL...`);
        const bdlGames = await ballDontLieService.getGames('americanfootball_nfl', {
          postseason: true,
          seasons: [new Date().getMonth() <= 2 ? new Date().getFullYear() - 1 : new Date().getFullYear()],
          per_page: 100
        });

        if (bdlGames && bdlGames.length > 0) {
          // Create a map of BDL games by team matchup for quick lookup
          const bdlGameMap = new Map();
          for (const g of bdlGames) {
            const homeKey = g.home_team?.full_name?.toLowerCase() || g.home_team?.name?.toLowerCase() || '';
            const awayKey = g.visitor_team?.full_name?.toLowerCase() || g.visitor_team?.name?.toLowerCase() || '';
            const key = `${homeKey}:${awayKey}`;
            bdlGameMap.set(key, g);
          }

          // Enrich each game with gameSignificance
          for (const game of games) {
            const homeKey = game.home_team?.toLowerCase() || '';
            const awayKey = game.away_team?.toLowerCase() || '';
            const key = `${homeKey}:${awayKey}`;

            const bdlGame = bdlGameMap.get(key);
            if (bdlGame && bdlGame.postseason && bdlGame.week) {
              game.gameSignificance = weekToSignificance[bdlGame.week] || 'Playoff';
              console.log(`[${config.name}] ✓ ${game.away_team} @ ${game.home_team}: ${game.gameSignificance}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[${config.name}] Could not fetch postseason data from BDL:`, err.message);
      }
    }

    // Founder Sep 19: either major-conference team or Notre Dame qualifies.
    if (config.key === 'americanfootball_ncaaf') {
      const ncaafTeams = await ballDontLieService.getTeams('americanfootball_ncaaf');
      const classified = classifyNcaafCoveredGames(games, ncaafTeams);
      if (classified.unresolved.length) console.warn(`[NCAAF] Conference identity unavailable for ${classified.unresolved.length} game(s); continuing the identified matchups`);
      console.log(`[NCAAF] Coverage: ${games.length} → ${classified.accepted.length} major-conference/Notre Dame games`);
      games = classified.accepted;
    }

    // NCAAF: stamp conference names + AP Top 25 ranks (founder, Aug 25 2026).
    // The app's college navigation defaults to ranked matchups and filters
    // the rest by conference — both reads come from these per-side fields.
    // Fail-soft by contract: navigation chrome never delays a pick.
    if (config.key === 'americanfootball_ncaaf' && games.length > 0) {
      try {
        const { attachNcaafGameMetadata } = await import('../../../src/services/ncaafGameMetadata.js');
        await attachNcaafGameMetadata(games);
      } catch (metaErr) {
        console.warn(`[${config.name}] Conference/rank stamping skipped: ${metaErr.message}`);
      }
    }

    // Apply --game-id filter (exact, used by scheduler — no ambiguity)
    if (gameIdFilter) {
      const targetId = String(gameIdFilter);
      const before = games.length;
      games = games.filter(game => String(game.bdl_game_id ?? game.id ?? '') === targetId);
      console.log(`[${config.name}] Game ID filter "${targetId}": ${before} -> ${games.length} games`);
      if (games.length === 0) {
        console.log(`[${config.name}] No game found with id "${targetId}"`);
      }
    }

    // Apply --matchup filter to run a single specific game
    if (matchupFilter) {
      const filterLower = matchupFilter.toLowerCase();
      const beforeMatchupFilter = games.length;
      games = games.filter(game => {
        const homeTeam = (game.home_team || '').toLowerCase();
        const awayTeam = (game.away_team || '').toLowerCase();
        // Match if filter appears in either team name
        return homeTeam.includes(filterLower) || awayTeam.includes(filterLower);
      });
      console.log(`[${config.name}] Matchup filter "${matchupFilter}": ${beforeMatchupFilter} -> ${games.length} games`);
      if (games.length === 0) {
        console.log(`[${config.name}] No games found matching "${matchupFilter}"`);
      }
    }

    // Apply --time filter to filter games by start time in EST (e.g., "12" for 12pm, "12,1" for 12pm and 1pm)
    if (timeFilter) {
      const targetHours = timeFilter.split(',').map(h => parseInt(h.trim(), 10));
      const beforeTimeFilter = games.length;
      games = games.filter(game => {
        const gameTime = new Date(game.commence_time);
        // Convert to EST hour (12-hour format for easier matching)
        const estHour = parseInt(gameTime.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          hour12: false
        }), 10);
        // Match if game hour matches any of the target hours
        return targetHours.includes(estHour);
      });
      const hoursDisplay = targetHours.map(h => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`).join(', ');
      console.log(`[${config.name}] Time filter (${hoursDisplay} EST): ${beforeTimeFilter} -> ${games.length} games`);
      if (games.length > 0) {
        games.forEach(g => {
          const gameTime = new Date(g.commence_time);
          const estTimeStr = gameTime.toLocaleString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          console.log(`   - ${g.away_team} @ ${g.home_team} (${estTimeStr} EST)`);
        });
      }
    }

    // Apply max games limit if specified
    // --limit flag overrides config.maxGames for testing
    // --offset flag skips N games before applying limit (for parallel terminals)
    const MAX_GAMES = gameLimit || config.maxGames || 100;
    const limitedGames = games.slice(gameOffset, gameOffset + MAX_GAMES);

    const offsetNote = gameOffset ? ` --offset ${gameOffset}` : '';
    const limitNote = gameLimit ? ` (--limit ${gameLimit}${offsetNote})` : (games.length > MAX_GAMES ? ` (limited to ${MAX_GAMES})` : '');
    console.log(`[${config.name}] Found ${allGames?.length || 0} total games, ${games.length} ${timeLabel}${limitNote}`);

    // Replace games with limited version
    const finalGames = limitedGames;
    return finalGames;
  }
  return { discoverPickGames };
}
