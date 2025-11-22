import 'dotenv/config';
import { ballDontLieService } from '../src/services/ballDontLieService.js';

const normalizeTeamName = (name = '') =>
  name
    .toLowerCase()
    .replace(/\blos angeles\b/g, 'la')
    .replace(/\bnew york\b/g, 'ny')
    .replace(/\bsan antonio\b/g, 'sa')
    .replace(/\bnew orleans\b/g, 'no')
    .replace(/\boklahoma city\b/g, 'okc')
    .replace(/\bgolden state\b/g, 'gs')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const mascotToken = (name = '') => {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
};

const resolveTeam = (teams, targetName) => {
  const canonical = normalizeTeamName(targetName);
  const mascot = mascotToken(targetName);
  return (
    teams.find((team) => {
      const teamCanonical = normalizeTeamName(team.full_name || '');
      if (!teamCanonical) return false;
      if (teamCanonical === canonical) return true;
      if (teamCanonical.includes(canonical) || canonical.includes(teamCanonical)) return true;
      const teamMascot = mascotToken(team.full_name);
      return teamMascot && teamMascot === mascot;
    }) || null
  );
};

async function run() {
  try {
    const teams = await ballDontLieService.getNbaTeams();
    const standings = await ballDontLieService.getStandingsGeneric('basketball_nba', { season: 2025 });

    const targets = [
      'Charlotte Hornets',
      'Los Angeles Clippers',
      'Memphis Grizzlies',
      'Dallas Mavericks'
    ];

    for (const name of targets) {
      const team = resolveTeam(teams, name);
      if (!team) {
        console.warn(`⚠️ Could not resolve team: ${name}`);
        continue;
      }

      const record = standings?.find((row) => row?.team?.id === team.id) || {};

      console.log('\n==============================');
      console.log(`Team: ${team.full_name} (${team.abbreviation})`);
      console.log(`Conference / Division: ${team.conference} / ${team.division}`);
      console.log(`Record: ${record.wins ?? '?'}-${record.losses ?? '?'}`);
      console.log('------------------------------');

      const recentGames = await ballDontLieService.getGames(
        'basketball_nba',
        {
          seasons: [2025],
          team_ids: [team.id],
          postseason: false,
          start_date: '2025-11-01',
          end_date: '2025-11-22',
          per_page: 5
        },
        0
      );
      console.log(`Recent Games Returned: ${recentGames?.length || 0}`);
      recentGames.slice(0, 2).forEach((game) => {
        console.log(` - ${game.visitor_team?.full_name} @ ${game.home_team?.full_name} (${game.date})`);
      });

      const rosterRaw = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 10 }, 0);
      const roster = rosterRaw.filter((player) => player?.team?.id === team.id);
      console.log(`Roster Entries (filtered): ${roster.length}`);
      roster.slice(0, 3).forEach((player) => {
        console.log(`   • ${player.first_name} ${player.last_name} (id: ${player.id})`);
      });

      const playerIds = roster.slice(0, 5).map((player) => player.id);
      const seasonAvgs = await ballDontLieService.getNbaSeasonAverages({
        category: 'general',
        type: 'base',
        season: 2025,
        season_type: 'regular',
        player_ids: playerIds
      }, 0);

      console.log(`Season averages pulled for ${seasonAvgs.length} players`);
      seasonAvgs.slice(0, 2).forEach((row) => {
        const stats = row?.stats || {};
        const ppg = stats.points_per_game ?? stats.points ?? stats.pts ?? 'n/a';
        const rpg = stats.rebounds_per_game ?? stats.rebounds ?? stats.reb ?? 'n/a';
        const apg = stats.assists_per_game ?? stats.assists ?? stats.ast ?? 'n/a';
        console.log(`   • Player ${row?.player?.id}: PPG ${ppg}, RPG ${rpg}, APG ${apg}`);
      });
    }

    console.log('\n✅ Ball Don\'t Lie NBA stats check complete.');
  } catch (error) {
    console.error('\n❌ Failed to fetch NBA stats from Ball Don\'t Lie:', error);
    process.exit(1);
  }
}

run();

