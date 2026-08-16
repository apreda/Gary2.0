function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scores(game) {
  const home = finite(game?.home_team_score ?? game?.home_score);
  const away = finite(game?.visitor_team_score ?? game?.away_team_score ?? game?.away_score);
  return home == null || away == null ? null : { home, away };
}

function teamId(team) {
  const value = team?.id ?? team?.team_id ?? null;
  return value == null ? null : String(value);
}

/** Grade one final football insight without inventing an outcome rule. */
export function gradeFootballInsightRow(row, game) {
  // AFTER GARY is a same-book market receipt, not a prediction about either
  // team. Keep it out of hit/miss grading even if a future UI/storage change
  // happens to attach a team id.
  if (row?.category === 'after_gary' || row?.meta?.kind === 'after_gary') {
    return { result: null, note: 'Same-book market receipt; context only' };
  }
  if (row?.category === 'the_sweat' || row?.meta?.kind === 'the_sweat') {
    return { result: null, note: 'Pick proof receipt; context only' };
  }
  if (row?.category === 'market_range' || row?.meta?.kind === 'market_range') {
    return { result: null, note: 'Sportsbook range; context only' };
  }
  if (row?.category === 'next_slate' || row?.meta?.kind === 'next_slate') {
    return { result: null, note: 'Future schedule preview; context only' };
  }

  const final = scores(game);
  if (!final) return { skip: true, reason: 'final score unavailable' };

  if (row?.meta?.metric === 'market_total_vs_slate_median') {
    const line = finite(row?.line_val ?? row?.meta?.total);
    const median = finite(row?.meta?.slate_median);
    if (line == null || median == null || line === median) {
      return { result: null, note: `Final total ${final.home + final.away}; market-context row` };
    }
    const actual = final.home + final.away;
    const result = actual === line
      ? 'push'
      : ((line > median && actual > line) || (line < median && actual < line) ? 'hit' : 'miss');
    const direction = line > median ? 'high-total' : 'low-total';
    return { result, note: `${direction} edge: final total ${actual} vs ${line}` };
  }

  // Team-stat connections name the side that held the verified edge. Grade
  // only whether that side won the game; this does not claim the stat itself
  // repeated in a one-game sample.
  const subject = row?.team_id == null ? null : String(row.team_id);
  const homeId = teamId(game?.home_team);
  const awayId = teamId(game?.visitor_team ?? game?.away_team);
  if (!subject || (subject !== homeId && subject !== awayId)) {
    return { result: null, note: `Final ${final.away}-${final.home}; evidence-context row` };
  }
  if (final.home === final.away) return { result: 'push', note: `Edge side tied ${final.home}-${final.away}` };
  const subjectWon = subject === homeId ? final.home > final.away : final.away > final.home;
  return {
    result: subjectWon ? 'hit' : 'miss',
    note: `Edge side ${subjectWon ? 'won' : 'lost'}; final ${final.away}-${final.home}`,
  };
}

export default { gradeFootballInsightRow };
