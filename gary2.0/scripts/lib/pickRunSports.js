// Keep the CLI's advertised lanes and --all selection on the same supported set.
// NBA remains explicitly supported with its pinned winning-era prompts.
export const SPORT_CONFIG = {
  nba: { key: 'basketball_nba', name: 'NBA', emoji: '🏀', useToday: true },
  nfl: { key: 'americanfootball_nfl', name: 'NFL', emoji: '🏈', daysAhead: 7 },
  ncaaf: { key: 'americanfootball_ncaaf', name: 'NCAAF', emoji: '🏈', fbsOnly: true, useToday: true },
  mlb: { key: 'baseball_mlb', name: 'MLB', emoji: '⚾', useToday: true },
};

export function selectPickSports(args) {
  const retired = ['--nhl', '--ncaab'].filter(flag => args.includes(flag));
  if (retired.length) {
    throw new Error(`Retired pick lanes: ${retired.join(', ')}. Supported flags: ${Object.keys(SPORT_CONFIG).map(sport => `--${sport}`).join(', ')}.`);
  }
  const supported = Object.keys(SPORT_CONFIG);
  return args.includes('--all')
    ? supported
    : supported.filter(sport => args.includes(`--${sport}`));
}
