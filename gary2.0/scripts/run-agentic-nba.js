import { runAgenticCli } from './run-agentic-cli.js';
import { buildNbaAgenticContext } from '../src/services/agentic/nbaAgenticContext.js';

runAgenticCli({
  sportKey: 'basketball_nba',
  leagueLabel: 'NBA',
  buildContext: buildNbaAgenticContext,
  windowHours: 18,
  limitDefault: 3
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NBA runner crashed:', error);
    process.exit(1);
  });

