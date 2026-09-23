// June's second desk search asks for each club's offseason acquisitions,
// spring-training standouts and spring stats. Right for March and April; from
// May on it asked for stale history (Sep 23 2026: a refusal paragraph plus a
// third-party projected lineup naming two hitters who were sitting). In season
// the same slot asks for the past week. June's own query is kept verbatim in
// the era file and still runs through April.

export function teamStateSearch(homeTeam, awayTeam, search, now = () => new Date()) {
  return (juneQuery, options) => {
    if (now().getMonth() <= 3) return search(juneQuery, options);
    const query = `MLB 2026: ${homeTeam} and ${awayTeam} current state heading into today's game. `
      + 'Find ALL of the following from the past week: '
      + `(1) ${homeTeam}: roster moves, injuries and returns, rotation and bullpen changes, the manager's announced plans for today's pitching, and storylines. `
      + `(2) ${awayTeam}: the same. `
      + '(3) Any storylines or context for this specific matchup. '
      + 'Include player names, dates and concrete details.';
    return search(query, options);
  };
}
