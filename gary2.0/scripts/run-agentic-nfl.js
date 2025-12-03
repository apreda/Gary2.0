import { runAgenticCli } from './run-agentic-cli.js';
import { buildNflAgenticContext } from '../src/services/agentic/nflAgenticContext.js';

runAgenticCli({
  sportKey: 'americanfootball_nfl',
  leagueLabel: 'NFL',
  buildContext: buildNflAgenticContext,
  windowHours: 24 * 6,
  limitDefault: 4
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NFL runner crashed:', error);
    process.exit(1);
  });

