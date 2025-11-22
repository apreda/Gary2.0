import 'dotenv/config';
import { ballDontLieService } from '../src/services/ballDontLieService.js';

const sportsConfig = [
  {
    key: 'basketball_nba',
    label: 'NBA',
    season: 2025,
    startDate: '2025-11-01',
    endDate: '2025-11-22',
    includeSeasonAverages: true,
    sampleTeams: 2
  },
  {
    key: 'basketball_ncaab',
    label: 'NCAAB',
    season: 2025,
    startDate: '2025-11-01',
    endDate: '2025-11-22',
    includeSeasonAverages: false,
    sampleTeams: 2
  },
  {
    key: 'americanfootball_ncaaf',
    label: 'NCAAF',
    season: 2025,
    startDate: '2025-10-15',
    endDate: '2025-11-22',
    includeSeasonAverages: false,
    sampleTeams: 2
  },
  {
    key: 'americanfootball_nfl',
    label: 'NFL',
    season: 2025,
    startDate: '2025-10-01',
    endDate: '2025-11-22',
    includeSeasonAverages: false,
    sampleTeams: 2
  },
  {
    key: 'baseball_mlb',
    label: 'MLB',
    season: 2025,
    startDate: '2025-06-01',
    endDate: '2025-09-30',
    includeSeasonAverages: false,
    sampleTeams: 2
  },
  {
    key: 'basketball_wnba',
    label: 'WNBA',
    season: 2025,
    startDate: '2025-07-01',
    endDate: '2025-09-15',
    includeSeasonAverages: false,
    sampleTeams: 2
  },
  {
    key: 'soccer_epl',
    label: 'EPL',
    season: 2025,
    startDate: '2025-09-01',
    endDate: '2025-11-22',
    includeSeasonAverages: false,
    sampleTeams: 2
  }
];

const normalizePlayerLine = (player) => {
  if (!player) return 'n/a';
  const first = player.first_name || '';
  const last = player.last_name || '';
  return `${first} ${last}`.trim() || `#${player.id}`;
};

const logSeasonAvgs = async (team, season) => {
  try {
    const rosterRaw = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 5 }, 0);
    const roster = rosterRaw.filter((player) => player?.team?.id === team.id);
    if (roster.length === 0) {
      console.warn('   ⚠️ No roster data found for season averages check.');
      return;
    }
    const playerIds = roster.slice(0, 5).map((player) => player.id);
    const seasonAvgs = await ballDontLieService.getNbaSeasonAverages({
      category: 'general',
      type: 'base',
      season,
      season_type: 'regular',
      player_ids: playerIds
    }, 0);
    console.log(`   Season averages fetched for ${seasonAvgs.length} players (team ${team.full_name})`);
    seasonAvgs.slice(0, 2).forEach((row) => {
      const stats = row?.stats || {};
      const ppg = stats.points_per_game ?? stats.points ?? stats.pts ?? 'n/a';
      const rpg = stats.rebounds_per_game ?? stats.rebounds ?? stats.reb ?? 'n/a';
      const apg = stats.assists_per_game ?? stats.assists ?? stats.ast ?? 'n/a';
      console.log(`     • Player ${row?.player?.id}: PPG ${ppg}, RPG ${rpg}, APG ${apg}`);
    });
  } catch (error) {
    console.warn('   ⚠️ Failed to fetch season averages:', error.message);
  }
};

async function inspectSport(config) {
  console.log('\n====================================================');
  console.log(`Checking ${config.label} (${config.key})`);
  console.log('----------------------------------------------------');
  try {
    const teams = await ballDontLieService.getTeams(config.key, {});
    console.log(`Teams available: ${teams.length}`);
    if (!Array.isArray(teams) || teams.length === 0) {
      console.warn('⚠️ No teams returned. Skipping sport.');
      return;
    }

    const standings = await ballDontLieService.getStandingsGeneric(config.key, { season: config.season });
    if (Array.isArray(standings) && standings.length) {
      const sampleStanding = standings[0];
      console.log(`Sample standing: team=${sampleStanding?.team?.full_name || 'n/a'} record=${sampleStanding?.wins || '?'}-${sampleStanding?.losses || '?'}`);
    } else {
      console.warn('⚠️ Standings not returned for this sport/season.');
    }

    const sampleTeams = teams.slice(0, config.sampleTeams || 2);
    for (const team of sampleTeams) {
      console.log(`\nTeam: ${team.full_name} (${team.id})`);
      console.log(`Conference/Division: ${team.conference || 'n/a'} / ${team.division || 'n/a'}`);

      const games = await ballDontLieService.getGames(
        config.key,
        {
          seasons: [config.season],
          team_ids: [team.id],
          postseason: false,
          start_date: config.startDate,
          end_date: config.endDate,
          per_page: 5
        },
        0
      );
      console.log(`  Games in window: ${Array.isArray(games) ? games.length : 0}`);
      if (Array.isArray(games) && games.length > 0) {
        const g = games[0];
        const vs = `${g?.visitor_team?.full_name || 'Unknown'} @ ${g?.home_team?.full_name || 'Unknown'}`;
        console.log(`   • Sample game: ${vs} on ${g?.date}`);
      }

      const injuries = await ballDontLieService.getInjuriesGeneric(config.key, { team_ids: [team.id] }, 0);
      console.log(`  Player injuries: ${Array.isArray(injuries) ? injuries.length : 0}`);
      if (Array.isArray(injuries) && injuries.length > 0) {
        const inj = injuries[0];
        console.log(`   • ${inj?.player?.first_name || ''} ${inj?.player?.last_name || ''}: ${inj?.status || 'status unknown'} (${inj?.description || 'no description'})`);
      }

      const players = await ballDontLieService.getPlayersGeneric(config.key, { team_ids: [team.id], per_page: 5 }, 0);
      console.log(`  Roster entries returned: ${players.length}`);
      if (players.length > 0) {
        console.log(`   • Sample players: ${players.slice(0, 3).map((p) => normalizePlayerLine(p)).join(', ')}`);
      }

      if (config.includeSeasonAverages && config.key === 'basketball_nba') {
        await logSeasonAvgs(team, config.season);
      }
    }
  } catch (error) {
    console.error(`❌ Error checking ${config.label}:`, error.message);
  }
}

async function run() {
  try {
    for (const sport of sportsConfig) {
      await inspectSport(sport);
    }
    console.log('\n✅ Multi-sport Ball Don\'t Lie stats check complete.');
  } catch (error) {
    console.error('\n❌ Multi-sport stats check failed:', error);
    process.exit(1);
  }
}

run();

