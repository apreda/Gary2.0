import { runAgenticCli } from './run-agentic-cli.js';
import { buildNcaabAgenticContext } from '../src/services/agentic/ncaabAgenticContext.js';

runAgenticCli({
  sportKey: 'basketball_ncaab',
  leagueLabel: 'NCAAB',
  buildContext: buildNcaabAgenticContext,
  windowHours: 18,
  limitDefault: 10,  // Higher limit since we filter out low-data games
  skipLowDataGames: true
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NCAAB runner crashed:', error);
    process.exit(1);
  });

