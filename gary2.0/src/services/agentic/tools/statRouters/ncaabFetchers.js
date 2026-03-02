import { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, fetchNBATeamScoringStats, fetchNBATeamAdvancedStats, fetchNBALeaders, fetchNBATeamBaseStats, fetchNBATeamOpponentStats, fetchNBATeamDefenseStats, fetchTopPlayersForTeam, formatRecentGames, buildPaceAnalysis, BDL_API_KEY, _nbaBaseStatsCache, _nbaAdvancedStatsCache, _nbaOpponentStatsCache, _nbaDefenseStatsCache, _nbaTeamScoringStatsCache, geminiGroundingSearch, getNcaabVenue, getBarttovikRatings } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';

export const ncaabFetchers = {

  // ===== NCAAB-SPECIFIC FETCHERS (Unique Calculations) =====
  // These calculate derived stats to avoid duplicate data
  
  NCAAB_EFG_PCT: async (bdlSport, home, away, season) => {
    try {
      const [homeStats, awayStats] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
      const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;

      // Calculate eFG% = (FGM + 0.5 * FG3M) / FGA
      const calcEfg = (data) => {
        if (!data) return null;
        const fgm = data.fgm || 0;
        const fg3m = data.fg3m || 0;
        const fga = data.fga || 0;
        if (fga === 0) return null;
        return ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1);
      };

      return {
        category: 'Effective FG%',
        home: {
          team: home.full_name || home.name,
          efg_pct: calcEfg(homeData) ? `${calcEfg(homeData)}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          efg_pct: calcEfg(awayData) ? `${calcEfg(awayData)}%` : 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_EFG_PCT fetch failed:', error.message);
      return { category: 'Effective FG%', error: 'Data unavailable' };
    }
  },

  NCAAB_AP_RANKING: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getRankingsGeneric(bdlSport, { season });
      const apRankings = rankings?.filter(r => r.poll === 'ap') || [];
      
      const homeRank = apRankings.find(r => r.team?.id === home.id);
      const awayRank = apRankings.find(r => r.team?.id === away.id);
      
      return {
        category: 'AP Poll Ranking',
        home: {
          team: home.full_name || home.name,
          ap_rank: homeRank?.rank || 'Unranked',
          trend: homeRank?.trend || '-',
          record: homeRank?.record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ap_rank: awayRank?.rank || 'Unranked',
          trend: awayRank?.trend || '-',
          record: awayRank?.record || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] AP Ranking fetch failed:', error.message);
      return {
        category: 'AP Poll Ranking',
        home: { team: home.full_name || home.name, ap_rank: 'N/A' },
        away: { team: away.full_name || away.name, ap_rank: 'N/A' }
      };
    }
  },

  NCAAB_COACHES_RANKING: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getRankingsGeneric(bdlSport, { season });
      const coachRankings = rankings?.filter(r => r.poll === 'coach') || [];
      
      const homeRank = coachRankings.find(r => r.team?.id === home.id);
      const awayRank = coachRankings.find(r => r.team?.id === away.id);
      
      return {
        category: 'Coaches Poll Ranking',
        home: {
          team: home.full_name || home.name,
          coaches_rank: homeRank?.rank || 'Unranked',
          trend: homeRank?.trend || '-',
          points: homeRank?.points || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          coaches_rank: awayRank?.rank || 'Unranked',
          trend: awayRank?.trend || '-',
          points: awayRank?.points || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] Coaches Ranking fetch failed:', error.message);
      return {
        category: 'Coaches Poll Ranking',
        home: { team: home.full_name || home.name, coaches_rank: 'N/A' },
        away: { team: away.full_name || away.name, coaches_rank: 'N/A' }
      };
    }
  },

  NCAAB_CONFERENCE_RECORD: async (bdlSport, home, away, season) => {
    try {
      // Some BDL NCAAB team objects may not include a valid conference_id; avoid passing it.
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });

      const homeStanding = Array.isArray(standings)
        ? standings.find(s => s.team?.id === home.id)
        : null;
      const awayStanding = Array.isArray(standings)
        ? standings.find(s => s.team?.id === away.id)
        : null;
      
      return {
        category: 'Conference Record',
        home: {
          team: home.full_name || home.name,
          conference_record: homeStanding?.conference_record || 'N/A',
          conference_win_pct: homeStanding?.conference_win_percentage 
            ? `${(homeStanding.conference_win_percentage * 100).toFixed(0)}%` 
            : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          conference_record: awayStanding?.conference_record || 'N/A',
          conference_win_pct: awayStanding?.conference_win_percentage 
            ? `${(awayStanding.conference_win_percentage * 100).toFixed(0)}%` 
            : 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] Conference Record fetch failed:', error.message);
      return {
        category: 'Conference Record',
        home: { team: home.full_name || home.name, conference_record: 'N/A' },
        away: { team: away.full_name || away.name, conference_record: 'N/A' }
      };
    }
  },

  NCAAB_TEMPO: async (bdlSport, home, away, season) => {
    try {
      // Use Barttorvik Tempo (real adjusted tempo, not broken BDL calc)
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);
      return {
        category: 'Tempo (Possessions/Game, Barttorvik)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          tempo: homeBartt?.tempo ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          tempo: awayBartt?.tempo ?? 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_TEMPO fetch failed:', error.message);
      return { category: 'Tempo (Possessions/Game)', error: 'Data unavailable' };
    }
  },

  NCAAB_OFFENSIVE_RATING: async (bdlSport, home, away, season) => {
    try {
      // Use Barttorvik AdjOE (real adjusted offensive efficiency, not broken BDL calc)
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);
      return {
        category: 'Adjusted Offensive Efficiency (Barttorvik AdjOE)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          offensive_rating: homeBartt?.adjOE ?? 'N/A',
          adjOE_rank: homeBartt?.adjOE_rank ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          offensive_rating: awayBartt?.adjOE ?? 'N/A',
          adjOE_rank: awayBartt?.adjOE_rank ?? 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_OFFENSIVE_RATING fetch failed:', error.message);
      return { category: 'Adjusted Offensive Efficiency (Barttorvik AdjOE)', error: 'Data unavailable' };
    }
  },

  NCAAB_DEFENSIVE_RATING: async (bdlSport, home, away, season) => {
    try {
      // Use Barttorvik AdjDE (real adjusted defensive efficiency)
      // Old BDL calc produced garbage values (2702 instead of ~100) due to broken team_season_stats
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(home.full_name || home.name),
        getBarttovikRatings(away.full_name || away.name)
      ]);
      return {
        category: 'Adjusted Defensive Efficiency (Barttorvik AdjDE)',
        source: 'barttorvik.com',
        home: {
          team: home.full_name || home.name,
          defensive_rating: homeBartt?.adjDE ?? 'N/A',
          adjDE_rank: homeBartt?.adjDE_rank ?? 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          defensive_rating: awayBartt?.adjDE ?? 'N/A',
          adjDE_rank: awayBartt?.adjDE_rank ?? 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_DEFENSIVE_RATING fetch failed:', error.message);
      return { category: 'Adjusted Defensive Efficiency (Barttorvik AdjDE)', error: 'Data unavailable' };
    }
  },

  NCAAB_TS_PCT: async (bdlSport, home, away, season) => {
    try {
      const [homeStats, awayStats] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
      ]);
      const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
      const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;

      // TS% = Points / (2 * (FGA + 0.44 * FTA))
      const calcTS = (data) => {
        if (!data) return null;
        const pts = data.pts || 0;
        const fga = data.fga || 0;
        const fta = data.fta || 0;
        const games = data.games_played || 1;
        const tsa = fga + 0.44 * fta; // True Shooting Attempts
        if (tsa === 0) return null;
        return ((pts / games) / (2 * (tsa / games)) * 100).toFixed(1);
      };

      return {
        category: 'True Shooting % (TS%)',
        home: {
          team: home.full_name || home.name,
          ts_pct: calcTS(homeData) ? `${calcTS(homeData)}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ts_pct: calcTS(awayData) ? `${calcTS(awayData)}%` : 'N/A'
        },
        note: 'True shooting percentage for both teams.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_TS_PCT fetch failed:', error.message);
      return { category: 'True Shooting % (TS%)', error: 'Data unavailable' };
    }
  },


  // ===== NCAAB FOUR FACTORS (Bundled — all 4 Dean Oliver metrics in one call) =====
  NCAAB_FOUR_FACTORS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    try {
      const { homeData, awayData } = await fetchBothTeamSeasonStats(bdlSport, home, away, season);

      const calcFourFactors = (data, oppData) => {
        if (!data) return { efg_pct: 'N/A', tov_rate: 'N/A', fta_rate: 'N/A', oreb_pct: 'N/A' };
        const fgm = data.fgm || 0;
        const fga = data.fga || 0;
        const fg3m = data.fg3m || 0;
        const fta = data.fta || 0;
        const tov = data.turnover || 0;
        const oreb = data.oreb || 0;
        // Use opponent DREB for correct ORB% formula; fall back to own DREB
        const oppDreb = oppData?.dreb || data.dreb || 0;

        return {
          efg_pct: fga > 0 ? `${((fgm + 0.5 * fg3m) / fga * 100).toFixed(1)}%` : 'N/A',
          tov_rate: (fga + 0.44 * fta + tov) > 0 ? `${(tov / (fga + 0.44 * fta + tov) * 100).toFixed(1)}%` : 'N/A',
          fta_rate: fga > 0 ? (fta / fga).toFixed(3) : 'N/A',
          oreb_pct: (oreb + oppDreb) > 0 ? `${(oreb / (oreb + oppDreb) * 100).toFixed(1)}%` : 'N/A'
        };
      };

      return {
        category: 'Four Factors (NCAAB)',
        source: 'Ball Don\'t Lie API (Team Season Stats)',
        home: {
          team: home.full_name || home.name,
          ...calcFourFactors(homeData, awayData)
        },
        away: {
          team: away.full_name || away.name,
          ...calcFourFactors(awayData, homeData)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_FOUR_FACTORS fetch failed:', error.message);
      return { category: 'Four Factors (NCAAB)', error: 'Data unavailable' };
    }
  },


  // ===== NCAAB L5 EFFICIENCY (Last 5 Games — eFG%, TS%, ORtg, DRtg) =====
  NCAAB_L5_EFFICIENCY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    try {
      console.log(`[Stat Router] Fetching NCAAB L5 Efficiency for ${away.name} @ ${home.name}`);

      // Fetch recent games to get last 5 game IDs for each team
      const [homeGamesRaw, awayGamesRaw] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);

      const filterCompleted = (games) => (Array.isArray(games) ? games : games?.data || [])
        .filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0)
        .sort((a, b) => new Date(b.date || b.datetime) - new Date(a.date || a.datetime));

      const homeGames = filterCompleted(homeGamesRaw);
      const awayGames = filterCompleted(awayGamesRaw);

      const homeGameIds = homeGames.slice(0, 5).map(g => g.id);
      const awayGameIds = awayGames.slice(0, 5).map(g => g.id);

      // Fetch L5 efficiency from BDL player stats
      const [homeL5, awayL5] = await Promise.all([
        homeGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(home.id, homeGameIds, bdlSport) : null,
        awayGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(away.id, awayGameIds, bdlSport) : null
      ]);

      const formatL5 = (l5Data) => {
        if (!l5Data?.efficiency) return { efg_pct: 'N/A', ts_pct: 'N/A', approx_ortg: 'N/A', approx_drtg: 'N/A', approx_net_rtg: 'N/A' };
        const e = l5Data.efficiency;
        return {
          games: e.games || 0,
          efg_pct: e.efg_pct ? `${e.efg_pct}%` : 'N/A',
          ts_pct: e.ts_pct ? `${e.ts_pct}%` : 'N/A',
          approx_ortg: e.approx_ortg || 'N/A',
          approx_drtg: e.approx_drtg || 'N/A',
          approx_net_rtg: e.approx_net_rtg || 'N/A',
          opp_efg_pct: e.opp_efg_pct ? `${e.opp_efg_pct}%` : undefined,
          opp_ppg: e.opp_ppg || undefined
        };
      };

      return {
        category: 'L5 Efficiency (NCAAB)',
        source: 'Ball Don\'t Lie API (Player Stats — Last 5 Games)',
        home: {
          team: home.full_name || home.name,
          ...formatL5(homeL5)
        },
        away: {
          team: away.full_name || away.name,
          ...formatL5(awayL5)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB_L5_EFFICIENCY fetch failed:', error.message);
      return { category: 'L5 Efficiency (NCAAB)', error: 'Data unavailable' };
    }
  },


  // ===== NCAAB GROUNDING-BASED ADVANCED STATS =====
  // These use Gemini Grounding to fetch advanced analytics not available in BDL
  
  NCAAB_BARTTORVIK_RATINGS: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Barttorvik ratings for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      // Barttorvik metrics are KenPom-equivalent (AdjOE ≈ AdjO, AdjDE ≈ AdjD, AdjEM ≈ AdjEM)
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      const formatTeam = (bartt, teamName) => ({
        team: teamName,
        t_rank: bartt ? `#${bartt.rank}` : 'N/A',
        adj_em: bartt ? ((bartt.adjEM > 0 ? '+' : '') + bartt.adjEM) : 'N/A',
        adj_offense: bartt?.adjOE ?? 'N/A',
        adj_defense: bartt?.adjDE ?? 'N/A',
        tempo: bartt?.tempo ?? 'N/A'
      });

      return {
        category: 'Barttorvik Ratings (T-Rank)',
        source: 'barttorvik.com API (direct)',
        home: formatTeam(homeBartt, homeTeamName),
        away: formatTeam(awayBartt, awayTeamName)
      };
    } catch (error) {
      console.warn('[Stat Router] Barttorvik ratings fetch failed:', error.message);
      return {
        category: 'Barttorvik Ratings',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, t_rank: 'N/A' },
        away: { team: away.full_name || away.name, t_rank: 'N/A' }
      };
    }
  },

  NCAAB_NET_RANKING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NET rankings for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding (split queries)`);

      const buildNetQuery = (teamName) => `Search ncaa.com for the 2025-26 college basketball season NCAA NET rankings.

What is the NET ranking for ${teamName}?

Respond with ONLY:
NET Ranking: [number]
Quad 1 Record: [W-L]
Quad 2 Record: [W-L]

Only report numbers from ncaa.com. If not found, write "not found".`;

      const groundingOpts = {
        temperature: 1.0,
        maxTokens: 2500,
        systemMessage: 'Search ncaa.com for 2025-26 NET rankings. Report only the numbers requested — no commentary.'
      };

      const [homeResponse, awayResponse] = await Promise.all([
        geminiGroundingSearch(buildNetQuery(homeTeamName), groundingOpts),
        geminiGroundingSearch(buildNetQuery(awayTeamName), groundingOpts)
      ]);

      const extractNetData = (response) => {
        const content = (response?.content || response?.choices?.[0]?.message?.content || '').toLowerCase();
        const netMatch = content.match(/net[^\d]*#?\s*(\d{1,3})/i) || content.match(/rank[^\d]*#?\s*(\d{1,3})/i);
        const q1Match = content.match(/quad\s*1[^\d]*(\d+-\d+)/i);
        const q2Match = content.match(/quad\s*2[^\d]*(\d+-\d+)/i);
        return {
          net_rank: netMatch ? netMatch[1] : 'N/A',
          quad_1: q1Match ? q1Match[1] : 'N/A',
          quad_2: q2Match ? q2Match[1] : 'N/A'
        };
      };

      return {
        category: 'NET Ranking',
        source: 'NCAA via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractNetData(homeResponse)
        },
        away: {
          team: awayTeamName,
          ...extractNetData(awayResponse)
        },
        raw_response: `HOME: ${(homeResponse?.content || '')}\n---\nAWAY: ${(awayResponse?.content || '')}`
      };
    } catch (error) {
      console.warn('[Stat Router] NET Ranking fetch failed:', error.message);
      return {
        category: 'NET Ranking',
        error: 'NET data unavailable',
        home: { team: home.full_name || home.name, net_rank: 'N/A' },
        away: { team: away.full_name || away.name, net_rank: 'N/A' }
      };
    }
  },

  NCAAB_STRENGTH_OF_SCHEDULE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Strength of Schedule for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      // WAB (Wins Above Bubble) and opponent quality metrics
      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      return {
        category: 'Strength of Schedule (Barttorvik)',
        source: 'barttorvik.com API (direct)',
        home: {
          team: homeTeamName,
          t_rank: homeBartt?.rank ?? 'N/A',
          wab: homeBartt?.wab ?? 'N/A',
          record: homeBartt?.record ?? 'N/A',
          barthag: homeBartt?.barthag ?? 'N/A',
          conference: homeBartt?.conferenceName ?? 'N/A'
        },
        away: {
          team: awayTeamName,
          t_rank: awayBartt?.rank ?? 'N/A',
          wab: awayBartt?.wab ?? 'N/A',
          record: awayBartt?.record ?? 'N/A',
          barthag: awayBartt?.barthag ?? 'N/A',
          conference: awayBartt?.conferenceName ?? 'N/A'
        },
        note: 'Barttorvik advanced metrics for both teams.'
      };
    } catch (error) {
      console.warn('[Stat Router] SOS fetch failed:', error.message);
      return {
        category: 'Strength of Schedule',
        error: 'SOS data unavailable',
        home: { team: home.full_name || home.name, sos_rank: 'N/A' },
        away: { team: away.full_name || away.name, sos_rank: 'N/A' }
      };
    }
  },

  NCAAB_QUAD_RECORD: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Quad records for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);

      // Ask for team-separated format to prevent cross-contamination
      const query = `What are the current Quad 1, Quad 2, Quad 3, and Quad 4 records for ${homeTeamName} and ${awayTeamName} college basketball teams in the ${getCurrentSeasonString()} season?

Quad records are based on opponent NET ranking and game location (home/away/neutral).

Format EXACTLY as:
=== ${homeTeamName} ===
Quad 1: [W-L]
Quad 2: [W-L]
Quad 3: [W-L]
Quad 4: [W-L]

=== ${awayTeamName} ===
Quad 1: [W-L]
Quad 2: [W-L]
Quad 3: [W-L]
Quad 4: [W-L]`;

      const response = await geminiGroundingSearch(query, {
        temperature: 1.0,
        maxTokens: 2500,
        systemMessage: 'You are a college basketball expert specializing in NCAA tournament metrics. Provide accurate Quad records with complete data for BOTH teams. Format each team separately.'
      });

      const content = response?.data || '';

      // Extract Quad records — split by team name to prevent first-match contamination
      const extractQuads = (text, teamName) => {
        // Isolate team section: find team name, take everything until the next team header or end
        const teamLower = teamName.toLowerCase();
        const textLower = text.toLowerCase();
        const teamIdx = textLower.indexOf(teamLower);

        let teamSection = text;
        if (teamIdx >= 0) {
          // Start from the team name, go until we hit another "===" or the other team
          const afterTeam = text.substring(teamIdx);
          // Find the next team separator (=== or the start of another team section)
          const nextSeparator = afterTeam.substring(teamLower.length).search(/===|\n\s*\n\s*[A-Z]/);
          teamSection = nextSeparator > 0
            ? afterTeam.substring(0, teamLower.length + nextSeparator)
            : afterTeam;
        }

        const q1Match = teamSection.match(/quad\s*1[^\d]*(\d+-\d+)/i);
        const q2Match = teamSection.match(/quad\s*2[^\d]*(\d+-\d+)/i);
        const q3Match = teamSection.match(/quad\s*3[^\d]*(\d+-\d+)/i);
        const q4Match = teamSection.match(/quad\s*4[^\d]*(\d+-\d+)/i);

        return {
          quad_1: q1Match ? q1Match[1] : 'N/A',
          quad_2: q2Match ? q2Match[1] : 'N/A',
          quad_3: q3Match ? q3Match[1] : 'N/A',
          quad_4: q4Match ? q4Match[1] : 'N/A'
        };
      };

      return {
        category: 'Quad Record (NCAA Tournament Metrics)',
        source: 'NCAA via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractQuads(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractQuads(content, awayTeamName)
        },
        raw_response: content
      };
    } catch (error) {
      console.warn('[Stat Router] Quad Record fetch failed:', error.message);
      return {
        category: 'Quad Record',
        error: 'Quad data unavailable',
        home: { team: home.full_name || home.name, quad_1: 'N/A' },
        away: { team: away.full_name || away.name, quad_1: 'N/A' }
      };
    }
  },


  // ===== NCAAB BARTTORVIK T-RANK AND TEMPO-FREE STATS =====
  // Uses barttorvik.com which defaults to 2026 season
  NCAAB_BARTTORVIK: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching Barttorvik T-Rank for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      const formatTeam = (bartt, teamName) => ({
        team: teamName,
        t_rank: bartt?.rank ?? 'N/A',
        adj_oe: bartt?.adjOE ?? 'N/A',
        adj_de: bartt?.adjDE ?? 'N/A',
        adj_em: bartt?.adjEM ?? 'N/A',
        barthag: bartt?.barthag ?? 'N/A',
        wab: bartt?.wab ?? 'N/A',
        tempo: bartt?.tempo ?? 'N/A',
        record: bartt?.record ?? 'N/A',
        conference: bartt?.conferenceName ?? 'N/A'
      });

      return {
        category: 'Barttorvik T-Rank (2026 Season)',
        source: 'barttorvik.com API (direct)',
        season: '2026',
        home: formatTeam(homeBartt, homeTeamName),
        away: formatTeam(awayBartt, awayTeamName)
      };
    } catch (error) {
      console.warn('[Stat Router] Barttorvik fetch failed:', error.message);
      return {
        category: 'Barttorvik T-Rank',
        error: 'Barttorvik data unavailable',
        home: { team: home.full_name || home.name, t_rank: 'N/A' },
        away: { team: away.full_name || away.name, t_rank: 'N/A' }
      };
    }
  },


  // ===== NCAAB HOME/AWAY SPLITS VIA BDL GAME RESULTS =====
  // Computes Season/L10/L5 home vs away records + point margins from BDL games

  NCAAB_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Home/Away Splits for ${awayTeamName} @ ${homeTeamName} via BDL Games`);

      // Fetch full season games for both teams
      const [homeGamesRaw, awayGamesRaw] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 50 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 50 })
      ]);

      const filterCompleted = (games) => (Array.isArray(games) ? games : games?.data || [])
        .filter(g => (g.home_team_score ?? g.home_score ?? 0) > 0 || (g.visitor_team_score ?? g.away_score ?? 0) > 0)
        .sort((a, b) => new Date(b.date || b.datetime) - new Date(a.date || a.datetime));

      const homeGames = filterCompleted(homeGamesRaw);
      const awayGames = filterCompleted(awayGamesRaw);

      // Compute home/away splits for a slice of games
      const calcSplitsForSlice = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
        let homePts = 0, homeOppPts = 0, homeGamesCount = 0;
        let awayPts = 0, awayOppPts = 0, awayGamesCount = 0;

        for (const g of games) {
          const isHome = g.home_team?.id === teamId || (g.home_team?.name || '').toLowerCase().includes(teamName.toLowerCase().split(' ').pop());
          const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
          if (teamScore === 0 && oppScore === 0) continue;

          if (isHome) {
            homeGamesCount++;
            homePts += teamScore;
            homeOppPts += oppScore;
            if (teamScore > oppScore) homeWins++; else homeLosses++;
          } else {
            awayGamesCount++;
            awayPts += teamScore;
            awayOppPts += oppScore;
            if (teamScore > oppScore) awayWins++; else awayLosses++;
          }
        }

        return {
          home_record: `${homeWins}-${homeLosses}`,
          away_record: `${awayWins}-${awayLosses}`,
          home_margin: homeGamesCount > 0 ? ((homePts - homeOppPts) / homeGamesCount).toFixed(1) : 'N/A',
          away_margin: awayGamesCount > 0 ? ((awayPts - awayOppPts) / awayGamesCount).toFixed(1) : 'N/A',
          home_games: homeGamesCount,
          away_games: awayGamesCount
        };
      };

      // Compute Season / L10 / L5 splits for a team
      const calcAllSplits = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        return {
          season: calcSplitsForSlice(games, teamId, teamName),
          l10: calcSplitsForSlice(games.slice(0, 10), teamId, teamName),
          l5: calcSplitsForSlice(games.slice(0, 5), teamId, teamName)
        };
      };

      return {
        category: 'Home/Away Splits (NCAAB)',
        source: 'Ball Don\'t Lie API (Game Results)',
        home: {
          team: homeTeamName,
          ...calcAllSplits(homeGames, home.id, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...calcAllSplits(awayGames, away.id, awayTeamName)
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Home/Away Splits failed:', error.message);
      return {
        category: 'Home/Away Splits (NCAAB)',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  NCAAB_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    
    try {
      console.log(`[Stat Router] Fetching NCAAB Recent Form with opponent quality`);
      
      // Get last 30 days of games for both teams
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          seasons: [season],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          seasons: [season],
          per_page: 50
        })
      ]);
      
      // Filter to completed games and get last 5
      const filterCompleted = (games) => (games || [])
        .filter(g => g.status === 'post' || g.period_detail === 'Final')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      
      const homeL5 = filterCompleted(homeGames);
      const awayL5 = filterCompleted(awayGames);
      
      const analyzeGames = (games, teamId, teamName) => {
        let wins = 0, losses = 0;
        const details = [];
        let totalMargin = 0;
        
        for (const g of games) {
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const oppName = isHome ? g.visitor_team?.full_name : g.home_team?.full_name;
          const margin = teamScore - oppScore;
          const won = margin > 0;
          
          if (won) wins++;
          else losses++;
          totalMargin += margin;
          
          details.push({
            opponent: oppName || 'Unknown',
            result: won ? 'W' : 'L',
            score: `${teamScore}-${oppScore}`,
            margin: margin,
            location: isHome ? 'HOME' : 'ROAD'
          });
        }
        
        const avgMargin = games.length > 0 ? (totalMargin / games.length).toFixed(1) : 0;
        
        return {
          team: teamName,
          l5_record: `${wins}-${losses}`,
          avg_margin: avgMargin > 0 ? `+${avgMargin}` : avgMargin,
          l5_win_pct: `${((wins / (wins + losses)) * 100).toFixed(0)}%`,
          games: details
        };
      };
      
      return {
        category: 'Recent Form L5 (NCAAB)',
        home: analyzeGames(homeL5, home.id, home.full_name || home.name),
        away: analyzeGames(awayL5, away.id, away.full_name || away.name),
        note: 'L5 record with margin and opponent data.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Recent Form failed:', error.message);
      return {
        category: 'Recent Form L5',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, l5_record: 'N/A' },
        away: { team: away.full_name || away.name, l5_record: 'N/A' }
      };
    }
  },


  // ===== NCAAB GROUNDING — CONFERENCE STRENGTH, OPPONENT QUALITY, HOME COURT =====

  NCAAB_CONFERENCE_STRENGTH: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Conference Strength for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      // Fetch Barttorvik ratings for both teams in parallel
      const [homeRatings, awayRatings] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      const formatTeamConf = (teamName, ratings) => {
        if (!ratings) return `${teamName}: Conference data unavailable`;
        const lines = [`${teamName} — ${ratings.conference || 'Unknown Conference'}`];
        if (ratings.rank != null) lines.push(`  T-Rank: #${ratings.rank}`);
        if (ratings.adjEM != null) lines.push(`  AdjEM: ${ratings.adjEM}`);
        if (ratings.adjOE != null) lines.push(`  AdjOE: ${ratings.adjOE}`);
        if (ratings.adjDE != null) lines.push(`  AdjDE: ${ratings.adjDE}`);
        if (ratings.barthag != null) lines.push(`  Barthag: ${ratings.barthag}`);
        if (ratings.record) lines.push(`  Record: ${ratings.record}`);
        return lines.join('\n');
      };

      const homeConf = homeRatings?.conference || 'Unknown';
      const awayConf = awayRatings?.conference || 'Unknown';
      const sameConference = homeConf !== 'Unknown' && homeConf === awayConf;

      let summary = `--- Conference Context ---\n`;
      summary += formatTeamConf(homeTeamName, homeRatings) + '\n\n';
      summary += formatTeamConf(awayTeamName, awayRatings) + '\n';

      if (sameConference) {
        summary += `\nBoth teams play in the ${homeConf}.`;
      } else if (homeConf !== 'Unknown' && awayConf !== 'Unknown') {
        summary += `\n${homeTeamName} plays in the ${homeConf}; ${awayTeamName} plays in the ${awayConf}.`;
      }

      return {
        category: 'Conference Strength (NCAAB)',
        source: 'Barttorvik API',
        home_team: homeTeamName,
        away_team: awayTeamName,
        home_conference: homeConf,
        away_conference: awayConf,
        home_ratings: homeRatings || null,
        away_ratings: awayRatings || null,
        raw_response: summary,
        note: 'Conference strength and T-Rank data for both teams.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Conference Strength fetch failed:', error.message);
      return {
        category: 'Conference Strength',
        error: 'Conference strength data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

  NCAAB_OPPONENT_QUALITY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Opponent Quality for ${awayTeamName} @ ${homeTeamName} via Barttorvik API`);

      const [homeBartt, awayBartt] = await Promise.all([
        getBarttovikRatings(homeTeamName),
        getBarttovikRatings(awayTeamName)
      ]);

      return {
        category: 'Opponent Quality Filter (NCAAB)',
        source: 'barttorvik.com API (direct)',
        home: {
          team: homeTeamName,
          t_rank: homeBartt?.rank ?? 'N/A',
          wab: homeBartt?.wab ?? 'N/A',
          barthag: homeBartt?.barthag ?? 'N/A',
          record: homeBartt?.record ?? 'N/A',
          adjEM: homeBartt?.adjEM ?? 'N/A',
          conference: homeBartt?.conferenceName ?? 'N/A'
        },
        away: {
          team: awayTeamName,
          t_rank: awayBartt?.rank ?? 'N/A',
          wab: awayBartt?.wab ?? 'N/A',
          barthag: awayBartt?.barthag ?? 'N/A',
          record: awayBartt?.record ?? 'N/A',
          adjEM: awayBartt?.adjEM ?? 'N/A',
          conference: awayBartt?.conferenceName ?? 'N/A'
        },
        note: 'WAB, T-Rank, and AdjEM data for both teams.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Opponent Quality fetch failed:', error.message);
      return {
        category: 'Opponent Quality',
        error: 'Opponent quality data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

  NCAAB_HOME_COURT_ADVANTAGE: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Home Court Advantage for ${awayTeamName} @ ${homeTeamName} via BDL games`);

      // BDL-based: Calculate actual home/away scoring differentials from completed games
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
      ]);

      const calcHomeSplits = (games, teamId, teamName) => {
        let homeWins = 0, homeLosses = 0, homePtsFor = 0, homePtsAgainst = 0, homeGamesCount = 0;
        let awayWins = 0, awayLosses = 0, awayPtsFor = 0, awayPtsAgainst = 0, awayGamesCount = 0;

        for (const game of games) {
          const isCompleted = game.status === 'Final' || game.status === 'post' || game.status === 'final' ||
            ((game.home_team_score ?? game.home_score ?? 0) > 0);
          if (!isCompleted) continue;

          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const teamScore = isHome
            ? (game.home_team_score ?? game.home_score ?? 0)
            : (game.visitor_team_score ?? game.away_score ?? 0);
          const oppScore = isHome
            ? (game.visitor_team_score ?? game.away_score ?? 0)
            : (game.home_team_score ?? game.home_score ?? 0);

          if (teamScore === 0 && oppScore === 0) continue;

          if (isHome) {
            homeGamesCount++;
            homePtsFor += teamScore;
            homePtsAgainst += oppScore;
            if (teamScore > oppScore) homeWins++; else homeLosses++;
          } else {
            awayGamesCount++;
            awayPtsFor += teamScore;
            awayPtsAgainst += oppScore;
            if (teamScore > oppScore) awayWins++; else awayLosses++;
          }
        }

        const homePPG = homeGamesCount > 0 ? (homePtsFor / homeGamesCount).toFixed(1) : 'N/A';
        const homeOppPPG = homeGamesCount > 0 ? (homePtsAgainst / homeGamesCount).toFixed(1) : 'N/A';
        const awayPPG = awayGamesCount > 0 ? (awayPtsFor / awayGamesCount).toFixed(1) : 'N/A';
        const awayOppPPG = awayGamesCount > 0 ? (awayPtsAgainst / awayGamesCount).toFixed(1) : 'N/A';
        const homeMargin = homeGamesCount > 0 ? ((homePtsFor - homePtsAgainst) / homeGamesCount).toFixed(1) : 'N/A';
        const awayMargin = awayGamesCount > 0 ? ((awayPtsFor - awayPtsAgainst) / awayGamesCount).toFixed(1) : 'N/A';

        return {
          home_record: `${homeWins}-${homeLosses}`,
          away_record: `${awayWins}-${awayLosses}`,
          home_ppg: homePPG,
          home_opp_ppg: homeOppPPG,
          home_margin: homeMargin,
          away_ppg: awayPPG,
          away_opp_ppg: awayOppPPG,
          away_margin: awayMargin,
          home_away_margin_gap: (homeGamesCount > 0 && awayGamesCount > 0)
            ? ((homePtsFor - homePtsAgainst) / homeGamesCount - (awayPtsFor - awayPtsAgainst) / awayGamesCount).toFixed(1)
            : 'N/A'
        };
      };

      const homeSplits = calcHomeSplits(homeGames, home.id, homeTeamName);
      const awaySplits = calcHomeSplits(awayGames, away.id, awayTeamName);

      return {
        category: 'Home Court Advantage (NCAAB)',
        source: 'BDL game results (calculated)',
        home: {
          team: homeTeamName,
          ...homeSplits
        },
        away: {
          team: awayTeamName,
          ...awaySplits
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Home Court Advantage fetch failed:', error.message);
      return {
        category: 'Home Court Advantage',
        error: 'Home court data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },


  // ===== NCAAB VENUE (Highlightly API — only source for NCAAB arena names) =====

  NCAAB_VENUE: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;

    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;

      console.log(`[Stat Router] Fetching NCAAB Venue for ${awayTeamName} @ ${homeTeamName} via Highlightly`);

      const venue = await getNcaabVenue(homeTeamName, awayTeamName);

      if (!venue) {
        return {
          category: 'Venue (NCAAB)',
          source: 'Highlightly API',
          venue: null,
          note: 'Venue data unavailable — could not match teams or find game in Highlightly',
          home_team: homeTeamName,
          away_team: awayTeamName
        };
      }

      return {
        category: 'Venue (NCAAB)',
        source: 'Highlightly API',
        venue,
        home_team: homeTeamName,
        away_team: awayTeamName
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Venue fetch failed:', error.message);
      return {
        category: 'Venue (NCAAB)',
        error: 'Venue data unavailable',
        home_team: home.full_name || home.name,
        away_team: away.full_name || away.name
      };
    }
  },

};
