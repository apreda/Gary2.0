/** NBA stat tools: Who is on each team and where it stands: top players, injuries, standings, records and splits. (split from nbaFetchers.js, Oct 13 2026). */
import { fetchNBATeamBaseStats, fetchTopPlayersForTeam, isPostseasonOptions } from '../statRouterCommon.js';
import { ballDontLieService } from '../../../../../providers/ballDontLieService.js';

export const teamsAndStandingsFetchers = {



  // ===== PLAYERS =====
  TOP_PLAYERS: async (bdlSport, home, away, season, options) => {
    // For NBA, use player-aggregated base stats which includes top_players
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season, isPostseasonOptions(options)),
        fetchNBATeamBaseStats(away.id, season, isPostseasonOptions(options))
      ]);
      
      return {
        category: 'Top Players',
        home: {
          team: home.full_name || home.name,
          players: homeStats?.top_players || [{ note: 'No player data' }]
        },
        away: {
          team: away.full_name || away.name,
          players: awayStats?.top_players || [{ note: 'No player data' }]
        }
      };
    }
    
    // For other sports, use the generic fetcher
    const [homePlayers, awayPlayers] = await Promise.all([
      fetchTopPlayersForTeam(bdlSport, home, season),
      fetchTopPlayersForTeam(bdlSport, away, season)
    ]);
    
    return {
      category: 'Top Players',
      home: {
        team: home.full_name || home.name,
        players: homePlayers
      },
      away: {
        team: away.full_name || away.name,
        players: awayPlayers
      }
    };
  },

  INJURIES: async (bdlSport, home, away) => {
    const teamIds = [home.id, away.id];
    const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
    
    // BDL's NBA rows carry the team as player.team_id (audit, Oct 13 2026: 21 injured players read as none).
    const teamOf = (i) => i.player?.team_id ?? i.player?.team?.id ?? i.team_id;
    const homeInjuries = injuries?.filter(i => teamOf(i) === home.id) || [];
    const awayInjuries = injuries?.filter(i => teamOf(i) === away.id) || [];
    
    return {
      category: 'Injuries',
      home: {
        team: home.full_name || home.name,
        injuries: homeInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment ?? i.description,
          return_date: i.return_date
        }))
      },
      away: {
        team: away.full_name || away.name,
        injuries: awayInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment ?? i.description,
          return_date: i.return_date
        }))
      }
    };
  },


  // ===== STANDINGS & RECORDS =====
  // ===== STANDINGS & RECORDS =====
  STANDINGS: async (bdlSport, home, away, season, options) => {
    // NCAAF/NCAAB standings require conference_id - skip to avoid 400 errors
    // Standings snapshot is already fetched in scoutReportBuilder with proper conference handling
    if (bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab') {
      return {
        category: 'Full Standings & Records',
        note: 'College standings require conference_id. Check the Scout Report standings snapshot for conference records.',
        home: { team: home.full_name || home.name, overall: 'See Scout Report', conference_record: 'See Scout Report' },
        away: { team: away.full_name || away.name, overall: 'See Scout Report', conference_record: 'See Scout Report' }
      };
    }

    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });

    // BDL publishes conference_record and division_record but NOT
    // conference_rank or division_rank — those fields simply do not exist in
    // the payload, so reading them yielded 'N/A' on every football game.
    // The rank is derivable from the same 32 rows: sort within the group by
    // wins, then point differential as the tiebreak. Computed, and labelled
    // as computed rather than presented as a fetched standing.
    const winPct = (row) => {
      const w = Number(row?.wins) || 0;
      const l = Number(row?.losses) || 0;
      const t = Number(row?.ties) || 0;
      const games = w + l + t;
      return games > 0 ? (w + t / 2) / games : 0;
    };
    const rankWithin = (row, keyFn) => {
      if (!row || !Array.isArray(standings)) return null;
      const key = keyFn(row);
      if (!key) return null;
      const group = standings.filter((s) => keyFn(s) === key);
      if (group.length < 2) return null;
      group.sort((a, b) => (winPct(b) - winPct(a))
        || ((Number(b.point_differential) || 0) - (Number(a.point_differential) || 0)));
      const index = group.findIndex((s) => s.team?.id === row.team?.id);
      return index === -1 ? null : { rank: index + 1, of: group.length };
    };
    const confKey = (s) => s?.team?.conference || null;
    const divKey = (s) => (s?.team?.conference && s?.team?.division)
      ? `${s.team.conference} ${s.team.division}` : null;

    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    const fmt = (r) => (r ? `${r.rank} of ${r.of}` : 'not derivable');

    const side = (team, st) => ({
      team: team.full_name || team.name,
      wins: st?.wins ?? 'N/A',
      losses: st?.losses ?? 'N/A',
      overall_record: st?.overall_record || (st?.wins != null && st?.losses != null ? `${st.wins}-${st.losses}` : 'N/A'),
      home_record: st?.home_record || 'N/A',
      away_record: st?.road_record || 'N/A',
      conference_record: st?.conference_record || 'N/A',
      conference_rank: fmt(rankWithin(st, confKey)),
      division_record: st?.division_record || 'N/A',
      division_rank: fmt(rankWithin(st, divKey)),
      playoff_seed: st?.playoff_seed ?? 'N/A',
      point_differential: st?.point_differential ?? 'N/A'
    });

    return {
      category: 'Full Standings & Records',
      source: 'Ball Don\'t Lie API',
      data_scope: 'Records are as published. Conference and division RANK are computed here by win percentage then point differential — BDL does not publish either as a field.',
      home: side(home, homeSt),
      away: side(away, awaySt),
      context: homeSt && awaySt
        ? `${home.name} (${homeSt.wins}-${homeSt.losses}, seed ${homeSt.playoff_seed ?? '—'}) vs ${away.name} (${awaySt.wins}-${awaySt.losses}, seed ${awaySt.playoff_seed ?? '—'})`
        : 'Standings comparison unavailable'
    };
  },

  TEAM_RECORD: async (bdlSport, home, away, season, options) => {
    // Alias for STANDINGS
    return teamsAndStandingsFetchers.STANDINGS(bdlSport, home, away, season);
  },

  CONFERENCE_STANDING: async (bdlSport, home, away, season, options) => {
    // Alias for STANDINGS
    return teamsAndStandingsFetchers.STANDINGS(bdlSport, home, away, season);
  },

  HOME_AWAY_SPLITS: async (bdlSport, home, away, season, options) => {
    // NCAAF: BDL standings require conference_id — no grounding fetcher available
    if (bdlSport === 'americanfootball_ncaaf') {
      return {
        category: 'Home/Away Splits',
        note: 'NCAAF home/away splits unavailable via BDL standings - use RECENT_FORM for game context',
        home: { team: home.full_name || home.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' },
        away: { team: away.full_name || away.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' }
      };
    }
    
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
    
    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Home/Away Splits',
      home: {
        team: home.full_name || home.name,
        overall: homeSt ? `${homeSt.wins}-${homeSt.losses}` : 'N/A',
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        overall: awaySt ? `${awaySt.wins}-${awaySt.losses}` : 'N/A',
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A'
      },
      comparison: 'Season home/away records and splits for both teams.'
    };
  },


  // ===== CONFERENCE STATS (REAL DATA - from BDL Standings) =====
  CONFERENCE_STATS: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching CONFERENCE_STATS for ${away.name} @ ${home.name}`);
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      // Parse conference record (format: "X-Y")
      const parseConfRecord = (record) => {
        if (!record || record === 'N/A') return { wins: 0, losses: 0, pct: null };
        const parts = record.split('-');
        const wins = parseInt(parts[0]) || 0;
        const losses = parseInt(parts[1]) || 0;
        const total = wins + losses;
        return { wins, losses, pct: total > 0 ? (wins / total * 100).toFixed(0) : null };
      };
      
      const homeConf = parseConfRecord(homeSt?.conference_record);
      const awayConf = parseConfRecord(awaySt?.conference_record);
      
      return {
        category: 'Conference Performance',
        source: 'Ball Don\'t Lie API (Standings)',
        home: {
          team: home.full_name || home.name,
          conference: homeSt?.team?.conference || 'N/A',
          conference_record: homeSt?.conference_record || 'N/A',
          conference_win_pct: homeConf.pct ? `${homeConf.pct}%` : 'N/A',
          conference_rank: homeSt?.conference_rank || 'N/A',
          division: homeSt?.team?.division || 'N/A',
          division_record: homeSt?.division_record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          conference: awaySt?.team?.conference || 'N/A',
          conference_record: awaySt?.conference_record || 'N/A',
          conference_win_pct: awayConf.pct ? `${awayConf.pct}%` : 'N/A',
          conference_rank: awaySt?.conference_rank || 'N/A',
          division: awaySt?.team?.division || 'N/A',
          division_record: awaySt?.division_record || 'N/A'
        },
        same_conference: homeSt?.team?.conference === awaySt?.team?.conference,
        same_division: homeSt?.team?.division === awaySt?.team?.division,
        comparison: homeSt?.team?.conference === awaySt?.team?.conference
          ? 'Conference game — standings and conference records for both teams.'
          : 'Non-conference game — standings and conference records for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching CONFERENCE_STATS:`, error.message);
      return {
        category: 'Conference Performance',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== NON-CONFERENCE STRENGTH (REAL DATA - calculated from games) =====
  NON_CONF_STRENGTH: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching NON_CONF_STRENGTH for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings to know each team's conference
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      const homeConf = homeSt?.team?.conference;
      const awayConf = awaySt?.team?.conference;
      
      // Build map of team ID -> conference
      const teamConfMap = {};
      for (const s of standings || []) {
        if (s.team?.id && s.team?.conference) {
          teamConfMap[s.team.id] = s.team.conference;
        }
      }
      
      // Get season games for both teams
      // BDL season=2025 means 2025-26 season, which starts Oct 2025
      const seasonStart = new Date(season, 9, 1); // Oct 1 of season year
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 100
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 100
        })
      ]);
      
      // Calculate non-conference record
      const calcNonConfRecord = (games, teamId, teamConf) => {
        let wins = 0, losses = 0;
        const nonConfGames = [];
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || game.home_score || 0;
          const awayScore = game.visitor_team_score || game.away_score || 0;
          if (homeScore === 0 && awayScore === 0) continue; // Unplayed
          
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          const oppId = isHome 
            ? (game.visitor_team?.id || game.visitor_team_id)
            : (game.home_team?.id || game.home_team_id);
          
          const oppConf = teamConfMap[oppId];
          
          // Non-conference = different conference
          if (oppConf && oppConf !== teamConf) {
            const won = isHome ? homeScore > awayScore : awayScore > homeScore;
            if (won) wins++;
            else losses++;
            nonConfGames.push({
              opponent: isHome ? game.visitor_team?.name : game.home_team?.name,
              result: won ? 'W' : 'L',
              opponent_conf: oppConf
            });
          }
        }
        
        const total = wins + losses;
        return {
          record: total > 0 ? `${wins}-${losses}` : 'No non-conf games',
          win_pct: total > 0 ? `${(wins / total * 100).toFixed(0)}%` : 'N/A',
          games_played: total,
          recent: nonConfGames.slice(-3).reverse()
        };
      };
      
      const homeNonConf = calcNonConfRecord(homeGames, home.id, homeConf);
      const awayNonConf = calcNonConfRecord(awayGames, away.id, awayConf);
      
      return {
        category: 'Non-Conference Strength',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          conference: homeConf || 'N/A',
          non_conf_record: homeNonConf.record,
          non_conf_win_pct: homeNonConf.win_pct,
          non_conf_games: homeNonConf.games_played,
          recent_non_conf: homeNonConf.recent
        },
        away: {
          team: away.full_name || away.name,
          conference: awayConf || 'N/A',
          non_conf_record: awayNonConf.record,
          non_conf_win_pct: awayNonConf.win_pct,
          non_conf_games: awayNonConf.games_played,
          recent_non_conf: awayNonConf.recent
        },
        comparison: 'Conference standings and playoff positioning data for both teams.',
        note: 'Non-conference records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NON_CONF_STRENGTH:`, error.message);
      return {
        category: 'Non-Conference Strength',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },
};
