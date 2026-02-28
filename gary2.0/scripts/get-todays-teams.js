#!/usr/bin/env node
// Outputs only home team names for a sport, one per line (no log noise)
import '../src/loadEnv.js';
const { oddsService } = await import('../src/services/oddsService.js');

const sportMap = { nba: 'basketball_nba', nhl: 'icehockey_nhl', ncaab: 'basketball_ncaab' };
const sport = sportMap[process.argv[2]];
if (!sport) { process.exit(1); }

// Suppress all console output during fetch
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
console.log = () => {};
console.warn = () => {};
console.error = () => {};

const games = await oddsService.getUpcomingGames(sport);

// Restore console and output only team names
console.log = origLog;
console.warn = origWarn;
console.error = origError;

games.forEach(g => console.log(g.home_team));
