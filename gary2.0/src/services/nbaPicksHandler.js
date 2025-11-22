import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { perplexityService } from './perplexityService.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js'; // Import shared helper

export async function generateNBAPicks(options = {}) {
  console.log('Processing NBA games');
  if (options.nocache) {
    console.log('NBA nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames('basketball_nba', { nocache: options.nocache === true });
  console.log(`Found ${games.length} NBA games from odds service`);
  
  // Get today's date in EST time zone format (YYYY-MM-DD)
  const today = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = today.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  console.log(`NBA filtering: Today in EST is ${estFormattedDate}`);
  
  // Filter to REST OF TODAY in EST (exclude past games; include all remaining today)
  const nowUtcMs = Date.now();
  const todayEstStr = today.toLocaleDateString('en-US', estOptions);
  let todayGames = games.filter(game => {
    const gameDateEstStr = new Date(game.commence_time).toLocaleDateString('en-US', estOptions);
    const gameTimeMs = new Date(game.commence_time).getTime();
    const includeGame = (gameDateEstStr === todayEstStr) && gameTimeMs >= nowUtcMs;
    console.log(`NBA Game: ${game.away_team} @ ${game.home_team}, Time (EST): ${new Date(game.commence_time).toLocaleString('en-US', estOptions)}, Include (rest of today): ${includeGame}`);
    return includeGame;
  });

  console.log(`After EST rest-of-day filtering: ${todayGames.length} NBA games remaining today`);

  // If options.onlyAtIndex is provided, process only that game
  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    todayGames = idx >= 0 && idx < todayGames.length ? [todayGames[idx]] : [];
  }

  const normalizeTeamName = (name = '') => {
    let str = name.toLowerCase();
    const replacements = [
      { from: /\blos angeles\b/g, to: 'la' },
      { from: /\bnew york\b/g, to: 'ny' },
      { from: /\bsan antonio\b/g, to: 'sa' },
      { from: /\bnew orleans\b/g, to: 'no' },
      { from: /\boklahoma city\b/g, to: 'okc' },
      { from: /\bgolden state\b/g, to: 'gs' }
    ];
    replacements.forEach(({ from, to }) => {
      str = str.replace(from, to);
    });
    return str.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const mascotToken = (name = '') => {
    const parts = name.trim().split(/\s+/);
    return parts.length ? parts[parts.length - 1].toLowerCase() : '';
  };

  const resolveTeamByName = (teamName = '', teams = []) => {
    if (!teamName || !Array.isArray(teams)) return null;
    const targetCanonical = normalizeTeamName(teamName);
    const targetMascot = mascotToken(teamName);

    return (
      teams.find((team) => {
        const fullCanonical = normalizeTeamName(team.full_name || '');
        if (!fullCanonical) return false;
        if (fullCanonical === targetCanonical) return true;
        if (fullCanonical.includes(targetCanonical) || targetCanonical.includes(fullCanonical)) return true;
        const teamMascot = mascotToken(team.full_name);
        if (teamMascot && targetMascot && teamMascot === targetMascot) return true;
        return false;
      }) || null
    );
  };

  const sportPicks = [];
  for (const game of todayGames) {
    const gameId = `nba-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`🔄 PICK GENERATION STARTED: ${new Date().toISOString()}`);
      console.log(`Processing NBA game: ${game.away_team} @ ${game.home_team}`);

      // Resolve teams with canonical/mascot matching
      const nbaTeams = await ballDontLieService.getNbaTeams();
      const homeTeam = resolveTeamByName(game.home_team, nbaTeams);
      const awayTeam = resolveTeamByName(game.away_team, nbaTeams);

      if (!homeTeam) {
        console.warn(`[NBA] Unable to resolve home team for ${game.home_team}`);
      }
      if (!awayTeam) {
        console.warn(`[NBA] Unable to resolve away team for ${game.away_team}`);
      }

      let homeTeamInfo = null;
      let awayTeamInfo = null;
      try {
        if (homeTeam) {
          homeTeamInfo = {
            name: homeTeam.full_name,
            abbreviation: homeTeam.abbreviation,
            conference: homeTeam.conference,
            division: homeTeam.division
          };
        }
        if (awayTeam) {
          awayTeamInfo = {
            name: awayTeam.full_name,
            abbreviation: awayTeam.abbreviation,
            conference: awayTeam.conference,
            division: awayTeam.division
          };
        }
      } catch {}

      // Regular season context (no playoffs)
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const season = month <= 6 ? year - 1 : year; // NBA season year label
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 21);
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = now.toISOString().slice(0, 10);

      const teamIds = [];
      if (homeTeam) teamIds.push(homeTeam.id);
      if (awayTeam) teamIds.push(awayTeam.id);

      // Fetch recent games and injuries (nocache via ttl=0)
      const [homeRecent, awayRecent, injuries] = await Promise.all([
        homeTeam ? ballDontLieService.getGames('basketball_nba', { seasons: [season], team_ids: [homeTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 }, options.nocache ? 0 : 10) : Promise.resolve([]),
        awayTeam ? ballDontLieService.getGames('basketball_nba', { seasons: [season], team_ids: [awayTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 }, options.nocache ? 0 : 10) : Promise.resolve([]),
        ballDontLieService.getInjuriesGeneric('basketball_nba', { team_ids: teamIds }, options.nocache ? 0 : 5)
      ]);

      // Build structured season report blocks (standings, season averages, top players)
      const standingsAll = await ballDontLieService.getStandingsGeneric('basketball_nba', { season });
      const findStand = (team) => Array.isArray(standingsAll) ? standingsAll.find(r => r?.team?.id === team?.id) : null;
      const pickBasic = (s) => {
        if (!s) return {};
        const record = (s?.wins != null && s?.losses != null) ? `${s.wins}-${s.losses}` : undefined;
        const homeRec = s?.home_record;
        const awayRec = s?.road_record;
        const streak = s?.streak || s?.current_streak || undefined;
        // PPG/OPPG not directly in standings; leave undefined
        return { record, homeRec, awayRec, streak };
      };
      const basics = {
        home: pickBasic(findStand(homeTeam)),
        away: pickBasic(findStand(awayTeam))
      };

      // Pull player season averages to compute four-factor proxies and top-3 players
      const loadTeamAverages = async (team) => {
        if (!team?.id) return { base: [], scoring: [], players: [] };
        const roster = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 100 });
        const ids = (Array.isArray(roster) ? roster : []).map(p => p.id).filter(Boolean).slice(0, 100);
        const [base, scoring, advanced, usage] = await Promise.all([
          ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'base', season, season_type: 'regular', player_ids: ids }),
          ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'scoring', season, season_type: 'regular', player_ids: ids }),
          ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'advanced', season, season_type: 'regular', player_ids: ids }),
          ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'usage', season, season_type: 'regular', player_ids: ids })
        ]);
        return { 
          base: Array.isArray(base) ? base : [], 
          scoring: Array.isArray(scoring) ? scoring : [], 
          advanced: Array.isArray(advanced) ? advanced : [],
          usage: Array.isArray(usage) ? usage : [],
          players: Array.isArray(roster) ? roster : [] 
        };
      };
      const [homeAvg, awayAvg] = await Promise.all([loadTeamAverages(homeTeam), loadTeamAverages(awayTeam)]);

      const aggFourFactors = (baseList) => {
        if (!Array.isArray(baseList) || baseList.length === 0) return {};
        let fgm = 0, fg3m = 0, fga = 0, ftm = 0, fta = 0, oreb = 0, tov = 0;
        baseList.forEach(e => {
          const s = e?.stats || {};
          fgm += Number(s.fgm || s.field_goals_made || 0);
          fga += Number(s.fga || s.field_goals_attempted || 0);
          fg3m += Number(s.fg3m || s.three_point_field_goals_made || 0);
          ftm += Number(s.ftm || s.free_throws_made || 0);
          fta += Number(s.fta || s.free_throws_attempted || 0);
          oreb += Number(s.oreb || s.offensive_rebounds || 0);
          tov += Number(s.tov || s.turnovers || 0);
        });
        const efg = fga > 0 ? (fgm + 0.5 * fg3m) / fga : undefined;
        const tovRateDen = (fga + 0.44 * fta + tov);
        const tovRate = tovRateDen > 0 ? (tov / tovRateDen) : undefined;
        const ftRate = fga > 0 ? (ftm / fga) : undefined;
        return {
          effectiveFgPct: efg,
          turnoverRate: tovRate,
          offensiveRebRate: oreb, // proxy: ORB per-game (sum of per-player avgs)
          freeThrowRate: ftRate
        };
      };
      const aggAdvanced = (advList, usageList) => {
        if (!Array.isArray(advList) || advList.length === 0) return {};
        const safeVals = (arr, key) => {
          const vals = arr.map(e => Number(e?.stats?.[key])).filter(v => Number.isFinite(v));
          if (!vals.length) return undefined;
          const sum = vals.reduce((a, b) => a + b, 0);
          return sum / vals.length;
        };
        const ts = safeVals(advList, 'true_shooting_percentage');
        const efg = safeVals(advList, 'effective_field_goal_percentage');
        const ortg = safeVals(advList, 'offensive_rating');
        const drtg = safeVals(advList, 'defensive_rating');
        const net = (typeof ortg === 'number' && typeof drtg === 'number') ? (ortg - drtg) : safeVals(advList, 'net_rating');
        const usg = Array.isArray(usageList) && usageList.length ? safeVals(usageList, 'usage_percentage') : undefined;
        return { trueShootingPct: ts, effectiveFgPctAdv: efg, offensiveRating: ortg, defensiveRating: drtg, netRating: net, usagePct: usg };
      };

      const pickTop3 = (baseList, scoringList, rosterList) => {
        const byId = new Map();
        scoringList.forEach(row => {
          const pid = row?.player?.id;
          const pts = Number(row?.stats?.points_per_game || row?.stats?.pts || 0);
          if (pid) byId.set(pid, { pid, pts });
        });
        const entries = Array.from(byId.values()).sort((a, b) => b.pts - a.pts).slice(0, 3);
        return entries.map(({ pid }) => {
          const base = baseList.find(x => x?.player?.id === pid)?.stats || {};
          const plyr = rosterList.find(x => x?.id === pid) || {};
          const name = (plyr.first_name && plyr.last_name) ? `${plyr.first_name} ${plyr.last_name}` : (plyr.full_name || '');
          const pts = Number((base.points_per_game ?? base.pts) || 0);
          const reb = Number((base.rebounds_per_game ?? base.reb) || 0);
          const ast = Number((base.assists_per_game ?? base.ast) || 0);
          return { id: pid, name, ptsPerGame: pts, rebPerGame: reb, astPerGame: ast };
        });
      };

      const seasonSummary = {
        home: { ...aggFourFactors(homeAvg.base), adv: aggAdvanced(homeAvg.advanced, homeAvg.usage) },
        away: { ...aggFourFactors(awayAvg.base), adv: aggAdvanced(awayAvg.advanced, awayAvg.usage) }
      };
      const topPlayers = {
        home: pickTop3(homeAvg.base, homeAvg.scoring, homeAvg.players),
        away: pickTop3(awayAvg.base, awayAvg.scoring, awayAvg.players)
      };

      // Keep a human-readable notes block for debugging
      let report = '\n## REGULAR SEASON CONTEXT:\n\n';
      report += `Season: ${season}-${season + 1}\n\n`;
      report += `Recent window: ${startStr} to ${endStr}\n\n`;
      report += `- ${game.home_team} recent games: ${Array.isArray(homeRecent) ? homeRecent.length : 0}\n`;
      report += `- ${game.away_team} recent games: ${Array.isArray(awayRecent) ? awayRecent.length : 0}\n\n`;
      if (Array.isArray(injuries) && injuries.length > 0) {
        report += `Injuries sample (${Math.min(5, injuries.length)} shown):\n`;
        injuries.slice(0, 5).forEach(inj => {
          const fn = inj?.player?.first_name || '';
          const ln = inj?.player?.last_name || '';
          report += `- ${fn} ${ln}: ${inj?.status || 'Unknown'} — ${inj?.description || ''}\n`;
        });
        report += '\n';
      }

      // Merge odds across all bookmakers; for NBA use The Odds API-only path (BDL odds fallback disabled)
      let oddsData = null;
      const mergeBookmakers = (bookmakersArr = []) => {
        const marketKeyToOutcomes = new Map();
        for (const b of bookmakersArr) {
          const markets = Array.isArray(b?.markets) ? b.markets : [];
          for (const m of markets) {
            if (!m || !m.key || !Array.isArray(m.outcomes)) continue;
            if (!marketKeyToOutcomes.has(m.key)) marketKeyToOutcomes.set(m.key, new Map());
            const outMap = marketKeyToOutcomes.get(m.key);
            for (const o of m.outcomes) {
              if (!o || typeof o?.name !== 'string' || typeof o?.price !== 'number') continue;
              const key = `${o.name}|${typeof o.point === 'number' ? o.point : ''}`;
              if (!outMap.has(key)) {
                outMap.set(key, { name: o.name, price: o.price, ...(typeof o.point === 'number' ? { point: o.point } : {}) });
              }
            }
          }
        }
        const mergedMarkets = [];
        for (const [mkey, outMap] of marketKeyToOutcomes.entries()) {
          const outcomes = Array.from(outMap.values());
          if (outcomes.length) mergedMarkets.push({ key: mkey, outcomes });
        }
        return mergedMarkets.length ? { bookmaker: 'merged', markets: mergedMarkets } : null;
      };
      oddsData = mergeBookmakers(Array.isArray(game.bookmakers) ? game.bookmakers : []);
      const hasMlOrSpread = (data) =>
        Array.isArray(data?.markets) && data.markets.some(
          (m) => (m.key === 'h2h' || m.key === 'spreads') && Array.isArray(m.outcomes) && m.outcomes.some(o => typeof o?.price === 'number')
        );

      if (!hasMlOrSpread(oddsData)) {
        console.log(`[NBA] No ML/spread odds present from upstream list. Using The Odds API directly for ${game.away_team} @ ${game.home_team}.`);
        try {
          const upcoming = await oddsService.getOdds('basketball_nba');
          const normalize = (s) => String(s || '').toLowerCase().replace(/\\./g, '').replace(/[^a-z0-9]/g, '');
          const mascot = (s) => {
            const parts = String(s || '').trim().split(' ');
            return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
          };
          const h1 = normalize(game.home_team);
          const a1 = normalize(game.away_team);
          const mH1 = mascot(game.home_team);
          const mA1 = mascot(game.away_team);
          const match = Array.isArray(upcoming) ? upcoming.find(evt => {
            const h2 = normalize(evt.home_team);
            const a2 = normalize(evt.away_team);
            const mH2 = mascot(evt.home_team);
            const mA2 = mascot(evt.away_team);
            return (h1 === h2 && a1 === a2) || (h1 === a2 && a1 === h2) || ((mH1 === mH2 && mA1 === mA2) || (mH1 === mA2 && mA1 === mH2));
          }) : null;
          if (match && Array.isArray(match.bookmakers) && match.bookmakers.length > 0) {
            const merged = mergeBookmakers(match.bookmakers);
            if (hasMlOrSpread(merged)) {
              console.log('[NBA] Successfully attached Odds API markets to game.');
              oddsData = merged;
            } else {
              console.log('[NBA] Odds API returned bookmakers but missing ML/spread.');
            }
          } else {
            console.log('[NBA] Odds API did not return a matching event for this game.');
          }
        } catch (e) {
          console.warn('[NBA] Odds API direct fetch failed:', e?.message || e);
        }
      }

      // Removed "model" logic per user guidance

      // Perplexity key findings (trim to 3–4)
      let richKeyFindings = [];
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nba', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
      } catch {}

      const teamStatsCombined = homeTeamInfo || awayTeamInfo ? { home: homeTeamInfo, away: awayTeamInfo } : null;

      const gameObj = {
        id: gameId,
        sport: 'nba',
        league: 'NBA',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats: teamStatsCombined,
        gameContext: { season, postseason: false, notes: 'Regular season context from BDL NBA', richKeyFindings },
        homeTeamStats: homeTeamInfo,
        awayTeamStats: awayTeamInfo,
        statsReport: {
          basics,
          seasonSummary,
          topPlayers,
          rawNotes: report
        },
        playoffPlayerStats: null,
        seriesData: null,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      console.log(`Making Gary pick for NBA game: ${game.away_team} @ ${game.home_team}`);
      const result = await makeGaryPick(gameObj);
      
      if (result.success) {
        console.log(`Successfully generated NBA pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
        // Compute recommended sportsbook from in-memory bookmakers
        try {
          const extract = result.rawAnalysis?.rawOpenAIOutput || result.pick || {};
          const rec = computeRecommendedSportsbook({
            pickType: (extract.type || '').toLowerCase(),
            pickStr: extract.pick || '',
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
          });
          if (rec) result.recommendedSportsbook = rec;
        } catch (e) {
          console.warn('Failed to compute recommended sportsbook (NBA):', e?.message || e);
        }
        // Return the formatted pick data
        return {
          ...result,
          game: `${game.away_team} @ ${game.home_team}`,
          sport: 'basketball_nba',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          gameTime: game.commence_time,
          pickType: 'normal',
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`Failed to generate NBA pick for ${game.away_team} @ ${game.home_team}:`, result.error);
        return null;
      }
    }, { force: options.force === true });
    
    // Only add successful results to sportPicks (avoiding duplication)
    if (result && result.success) {
      sportPicks.push(result);
    }
  }
  
  if (sportPicks.length > 0) {
    console.log(`Total NBA picks generated: ${sportPicks.length}`);
  }
  return sportPicks;
} 