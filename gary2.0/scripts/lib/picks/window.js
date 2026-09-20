/** Pure upcoming-game window selection; dates follow each sport's calendar policy. */
import { getESTDate, shiftDateKey } from '../../../src/utils/dateUtils.js';
import { pickGameDate } from './calendar.js';
import { filterNflWeekGames } from '../nflWeekWindow.js';

export function selectPickGameWindow(allGames, config, { dateFilter, now = new Date(),
  picksService, console = globalThis.console } = {}) {
  // Filter to games within time window
  let games;
  let timeLabel;

  // NFL: Filter to current NFL week or playoffs
  if (config.key === 'americanfootball_nfl') {
    const currentWeekNumber = picksService.getNFLWeekNumber();
    const currentWeekStart = picksService.getNFLWeekStart();

    // Detect if we're in playoffs based on DATE (Odds API doesn't have postseason flag)
    // NFL playoffs: Wild Card (early Jan), Divisional (mid Jan), Championship (late Jan), Super Bowl (early Feb)
    // Regular season ends around Week 18 (typically first week of January)
    const [, month, day] = getESTDate(now).split('-').map(Number);
    const isPlayoffPeriod = (month === 1 && day >= 10) || (month === 2 && day <= 15);
    const hasPlayoffGames = isPlayoffPeriod;

    if (isPlayoffPeriod) {
      console.log(`[${config.name}] Date check: ${month}/${day} - NFL Playoffs period detected`);
    }

    // CHECK: If --date flag is provided, filter to specific date(s) ONLY
    if (dateFilter) {
      // Parse comma-separated dates (e.g., "2025-12-25,2025-12-26")
      const targetDates = dateFilter.split(',').map(d => d.trim());
      console.log(`[${config.name}] --date filter active: targeting ${targetDates.join(', ')}`);

      games = allGames?.filter(g => {
        const gameDateEST = pickGameDate(config.key, g.commence_time);
        // Game date matches one of the target dates
        return targetDates.includes(gameDateEST);
      }) || [];

      timeLabel = `${targetDates.join(' & ')}`;
      console.log(`[${config.name}] Date filter: found ${games.length} games on ${targetDates.join(', ')}`);
    } else if (hasPlayoffGames) {
      // PLAYOFFS: Use simple rolling window instead of week-based filtering
      // Playoffs have irregular schedules (Wild Card weekend = Sat+Sun, Divisional = Sat+Sun, etc.)
      console.log(`[${config.name}] 🏈 PLAYOFFS DETECTED - using rolling window filter`);

      // Get all games within next 48 hours that haven't started
      const windowMs = 48 * 60 * 60 * 1000; // 48 hours
      games = allGames?.filter(g => {
        const gameTime = new Date(g.commence_time);
        return gameTime > now && gameTime <= new Date(now.getTime() + windowMs);
      }) || [];

      // Determine playoff round based on date (already have month/day from above)
      let playoffRound = 'Playoffs';
      if (month === 1) {
        if (day >= 10 && day <= 16) playoffRound = 'Wild Card';
        else if (day >= 17 && day <= 23) playoffRound = 'Divisional';
        else if (day >= 24 && day <= 31) playoffRound = 'Conference Championship';
      } else if (month === 2) {
        if (day <= 7) playoffRound = 'Conference Championship';
        else if (day <= 15) playoffRound = 'Super Bowl';
      }

      timeLabel = `NFL ${playoffRound}`;
      console.log(`[${config.name}] NFL ${playoffRound}: found ${games.length} games in next 48h`);
    } else {
      // REGULAR SEASON: Default NFL week-based filtering
      // NFL weeks run Tuesday-Monday, so we filter games that belong to the current week
      // Get end of current week (next Tuesday 5:00 AM ET to catch late Monday games)
      const today = getESTDate(now);
      const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
      games = filterNflWeekGames(allGames, currentWeekStart, now);
      timeLabel = isMonday ? `MNF (Week ${currentWeekNumber})` : `Week ${currentWeekNumber} (${currentWeekStart})`;
      console.log(`[${config.name}] NFL Week ${currentWeekNumber} filter: ${isMonday ? "Monday games only" : `${currentWeekStart} through ${shiftDateKey(currentWeekStart, 7)} 05:00 ET`}`);
    }
  } else if (config.useToday) {
    // CHECK: If --date flag is provided, filter to specific date(s) instead of today
    if (dateFilter) {
      const targetDates = dateFilter.split(',').map(d => d.trim());
      console.log(`[${config.name}] --date filter active: targeting ${targetDates.join(', ')}`);

      games = allGames?.filter(g => {
        const gameDateEST = pickGameDate(config.key, g.commence_time);
        // Game date matches one of the target dates
        return targetDates.includes(gameDateEST);
      }) || [];

      timeLabel = `${targetDates.join(' & ')}`;
      console.log(`[${config.name}] Date filter: found ${games.length} games on ${targetDates.join(', ')}`);
    } else {
      // Default: Get TODAY's games in EST timezone
      const todayEST = pickGameDate(config.key, now);

      const isNCAAB = config.key === 'basketball_ncaab';

      games = allGames?.filter(g => {
        const gameTime = new Date(g.commence_time);
        const gameDateEST = pickGameDate(config.key, g.commence_time);

        // Game must be today in EST AND hasn't started yet
        return gameDateEST === todayEST && gameTime >= now;
      }) || [];

      timeLabel = `today (${todayEST})`;
      console.log(`[${config.name}] EST date filter: today=${todayEST}, found ${games.length} ${isNCAAB ? 'games' : 'upcoming games'}`);
    }
  } else if (config.daysAhead) {
    // Weekly sports: Use days ahead
    const endTime = new Date(now.getTime() + config.daysAhead * 24 * 60 * 60 * 1000);
    games = allGames?.filter(g => {
      const gameTime = new Date(g.commence_time);
      return gameTime >= now && gameTime <= endTime;
    }) || [];
    timeLabel = 'this week';
  } else {
    // Fallback: all upcoming games
    games = allGames?.filter(g => new Date(g.commence_time) >= now) || [];
    timeLabel = 'upcoming';
  }
  return { games, timeLabel };
}
