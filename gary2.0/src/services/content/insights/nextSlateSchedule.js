// Presentation data from the schedule rows already read by next-slate discovery.
// This adds no forecast, model call, provider request or inferred kickoff time.

function text(value) {
  if (value == null) return null;
  const result = String(value).trim();
  return result || null;
}

export function nextSlateSchedule(kickoffRows, checkedAt = new Date().toISOString()) {
  const instant = new Date(checkedAt);
  if (!Number.isFinite(instant.getTime())) throw new Error('Next-slate schedule needs a valid check timestamp');
  const seen = new Set();
  const games = kickoffRows.map(({ game, kickoff, slateDate }) => {
    const id = text(game?.id ?? game?.game_id);
    if (!id || seen.has(id)) throw new Error('Next-slate schedule needs unique provider game IDs');
    seen.add(id);
    const away = game?.away_team ?? game?.visitor_team;
    const home = game?.home_team;
    return {
      game_id: id,
      away_team_id: text(away?.id),
      home_team_id: text(home?.id),
      away_team: text(away?.full_name ?? away?.display_name ?? away?.name),
      home_team: text(home?.full_name ?? home?.display_name ?? home?.name),
      away_abbr: text(away?.abbreviation),
      home_abbr: text(home?.abbreviation),
      scheduled_date: slateDate,
      kickoff_status: kickoff.status,
      commence_time: kickoff.status === 'confirmed' ? kickoff.iso : null,
      game_status: text(game?.status),
    };
  });
  games.sort((a, b) => {
    if (a.commence_time && b.commence_time) return a.commence_time.localeCompare(b.commence_time) || a.game_id.localeCompare(b.game_id);
    if (a.commence_time) return -1;
    if (b.commence_time) return 1;
    return a.game_id.localeCompare(b.game_id);
  });
  return {
    // This is the collector's check time. It is not a provider update timestamp.
    next_slate_checked_at: instant.toISOString(),
    next_slate_games: games,
  };
}
