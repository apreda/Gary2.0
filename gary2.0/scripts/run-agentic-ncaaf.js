import { runAgenticCli } from './run-agentic-cli.js';
import { buildNcaafAgenticContext } from '../src/services/agentic/ncaafAgenticContext.js';

runAgenticCli({
  sportKey: 'americanfootball_ncaaf',
  leagueLabel: 'NCAAF',
  buildContext: buildNcaafAgenticContext,
  windowHours: 48,
  limitDefault: 5
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NCAAF runner crashed:', error);
    process.exit(1);
  });

