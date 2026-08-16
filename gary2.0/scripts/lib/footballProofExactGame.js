const STATUS_RANK = Object.freeze({ scheduled: 0, live: 1, final: 2 });

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function exactGameId(value) {
  const id = value?.bdl_game_id ?? value?.game_id ?? value?.gameId ?? value?.id;
  return id == null || String(id).trim() === '' ? null : String(id);
}

function statusValue(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'post' || text === 'closed' || text === 'game over'
    || /\b(final|complete|completed)\b/.test(text)) return 'final';
  if (
    text === 'in'
    || text === 'inprogress'
    || /\b(active|live|in progress|ongoing|halftime|half|overtime)\b/.test(text)
    || /\b(?:q|quarter)\s*[1-4]\b/.test(text)
    || /\b[1-4](?:st|nd|rd|th)\s+(?:qtr|quarter)\b/.test(text)
    || /\b\d{1,2}:\d{2}\s*-\s*(?:1st|2nd|3rd|4th)\b/.test(text)
    || /^(?:ot\d*|\d+ot)$/.test(text)
  ) return 'live';
  if (/\b(scheduled|pre|pregame|not started|tba|tbd|delayed|postponed|suspended|canceled|cancelled)\b/.test(text)) {
    return 'scheduled';
  }
  return null;
}

function normalizedStatus(value) {
  return statusValue(value?.status)
    ?? statusValue(value?.status_state)
    ?? statusValue(value?.game_status)
    ?? null;
}

function strongerStatus(...values) {
  let strongest = null;
  for (const value of values) {
    const status = typeof value === 'string' ? statusValue(value) : normalizedStatus(value);
    if (status && (strongest == null || STATUS_RANK[status] > STATUS_RANK[strongest])) {
      strongest = status;
    }
  }
  return strongest;
}

function canonicalTeams(game) {
  return {
    away: game?.visitor_team ?? game?.away_team ?? null,
    home: game?.home_team ?? null,
  };
}

function hasProviderAbbreviations(game) {
  const teams = canonicalTeams(game);
  return Boolean(clean(teams.away?.abbreviation) && clean(teams.home?.abbreviation));
}

function kickoffMs(pick, game) {
  const value = pick?.commence_time
    ?? pick?.start_time
    ?? game?.date
    ?? game?.commence_time;
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function scorePair(score) {
  return {
    away: finite(score?.away_score ?? score?.visitor_team_score),
    home: finite(score?.home_score ?? score?.home_team_score),
  };
}

function hasUsableActiveScore(score) {
  const status = normalizedStatus(score);
  const scores = scorePair(score);
  return Boolean(
    status
    && STATUS_RANK[status] >= STATUS_RANK.live
    && scores.away != null
    && scores.home != null
  );
}

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, item]) => item != null));
}

function mergeTeam(existing, provider) {
  if (!existing && !provider) return null;
  return {
    ...definedEntries(existing),
    ...definedEntries(provider),
  };
}

function providerScores(game) {
  return {
    away: finite(game?.visitor_team_score ?? game?.away_team_score ?? game?.away_score),
    home: finite(game?.home_team_score ?? game?.home_score),
  };
}

function providerUpdatedAt(game) {
  return clean(game?.updated_at)
    ?? clean(game?.last_updated)
    ?? clean(game?.last_update)
    ?? clean(game?.status_updated_at)
    ?? null;
}

function scoreDetail(game, status) {
  const raw = clean(game?.detail) ?? clean(game?.status_detail);
  if (raw) return raw;
  if (status === 'final') return 'FINAL';
  return clean(game?.status);
}

/**
 * Merge two score receipts without ever moving a known game backward from
 * final/live to scheduled. The incoming receipt may still fill missing scores.
 */
export function mergeFootballProofScore(existing, incoming) {
  if (!existing && !incoming) return null;
  if (!existing) return { ...incoming };
  if (!incoming) return { ...existing };

  const existingStatus = normalizedStatus(existing);
  const incomingStatus = normalizedStatus(incoming);
  const status = strongerStatus(existingStatus, incomingStatus)
    ?? incomingStatus
    ?? existingStatus
    ?? null;
  const existingScores = scorePair(existing);
  const incomingScores = scorePair(incoming);
  const incomingIsAtLeastAsCurrent = !existingStatus
    || !incomingStatus
    || STATUS_RANK[incomingStatus] >= STATUS_RANK[existingStatus];

  return {
    ...existing,
    ...definedEntries(incoming),
    game_id: exactGameId(incoming) ?? exactGameId(existing),
    away_score: incomingIsAtLeastAsCurrent && incomingScores.away != null
      ? incomingScores.away
      : existingScores.away,
    home_score: incomingIsAtLeastAsCurrent && incomingScores.home != null
      ? incomingScores.home
      : existingScores.home,
    status: status ?? incoming?.status ?? existing?.status,
    detail: incomingIsAtLeastAsCurrent
      ? (clean(incoming?.detail) ?? clean(existing?.detail))
      : (clean(existing?.detail) ?? clean(incoming?.detail)),
    updated_at: incomingIsAtLeastAsCurrent
      ? (clean(incoming?.updated_at) ?? clean(existing?.updated_at))
      : (clean(existing?.updated_at) ?? clean(incoming?.updated_at)),
  };
}

export function needsExactFootballGame({ pick, game, score, nowMs = Date.now() } = {}) {
  if (!exactGameId(pick) && !exactGameId(game)) return false;
  if (!hasProviderAbbreviations(game)) return true;

  const state = strongerStatus(score, game, pick);
  const start = kickoffMs(pick, game);
  const activeOrFinal = (state && STATUS_RANK[state] >= STATUS_RANK.live)
    || (start != null && start <= nowMs);
  return Boolean(activeOrFinal && !hasUsableActiveScore(score));
}

/** Merge provider truth into one stored-pick game shell and score receipt. */
export function mergeExactFootballGame({ pick, game, score, providerGame, nowMs = Date.now() } = {}) {
  const expectedId = exactGameId(pick) ?? exactGameId(game);
  const providerId = exactGameId(providerGame);
  if (!expectedId || !providerId || providerId !== expectedId) {
    throw new Error(`Exact football game mismatch: expected ${expectedId ?? 'missing'}, received ${providerId ?? 'missing'}`);
  }

  const existingTeams = canonicalTeams(game);
  const providerTeams = canonicalTeams(providerGame);
  const away = mergeTeam(existingTeams.away, providerTeams.away);
  const home = mergeTeam(existingTeams.home, providerTeams.home);
  const providerStatus = normalizedStatus(providerGame);
  const mergedStatus = strongerStatus(score, game, providerGame);
  const scores = providerScores(providerGame);
  const providerIsActive = providerStatus
    && STATUS_RANK[providerStatus] >= STATUS_RANK.live;
  const existingGameScores = providerScores(game);
  const receiptScores = providerIsActive ? scores : { away: null, home: null };
  const date = clean(providerGame?.date)
    ?? clean(providerGame?.commence_time)
    ?? clean(game?.date)
    ?? clean(game?.commence_time);
  const seasonType = providerGame?.season_type
    ?? providerGame?.seasonType
    ?? game?.season_type
    ?? game?.seasonType
    ?? pick?.season_type
    ?? null;

  const mergedGame = {
    ...game,
    ...definedEntries(providerGame),
    id: providerId,
    date,
    commence_time: clean(providerGame?.commence_time) ?? date,
    season_type: seasonType,
    visitor_team: away,
    away_team: away,
    home_team: home,
    // A provider may encode a scheduled game as 0-0. Keep those values out of
    // the proof receipt until its own status says play has begun.
    visitor_team_score: receiptScores.away ?? existingGameScores.away,
    home_team_score: receiptScores.home ?? existingGameScores.home,
  };
  if (mergedStatus) mergedGame.status_state = mergedStatus;

  const providerReceipt = providerStatus
    ? {
      game_id: providerId,
      away_score: receiptScores.away,
      home_score: receiptScores.home,
      status: providerStatus,
      detail: scoreDetail(providerGame, providerStatus),
      updated_at: providerUpdatedAt(providerGame),
    }
    : null;
  let mergedScore = mergeFootballProofScore(score, providerReceipt);
  const start = kickoffMs(pick, mergedGame);
  if (start != null && start <= nowMs && normalizedStatus(mergedScore) === 'scheduled') {
    // Once the scheduled start has passed, an unresolved scheduled receipt
    // would make THE SWEAT draw WATCH again. Omit it so storage retains the
    // last verified live/final identity until provider truth catches up.
    mergedScore = null;
  }

  return { game: mergedGame, score: mergedScore };
}

/**
 * Hydrate only exact stored provider ids. This deliberately has no slate API
 * path: callers must supply the existing BDL `getGame(sportKey, gameId)` API.
 */
export async function hydrateExactFootballGames({
  records = [],
  gameById,
  scoreByGame,
  bdl,
  sportKey,
  nowMs = Date.now(),
} = {}) {
  if (!(gameById instanceof Map) || !(scoreByGame instanceof Map)) {
    throw new Error('Exact football hydration requires game and score maps');
  }
  if (!bdl?.getGame || !sportKey) {
    throw new Error('Exact football hydration requires getGame and a sport key');
  }

  const fetched = [];
  for (const record of records) {
    const pick = record?.pick ?? record;
    const gameId = exactGameId(pick);
    if (!gameId) continue;
    const game = gameById.get(gameId) ?? null;
    const score = scoreByGame.get(gameId) ?? null;
    if (!needsExactFootballGame({ pick, game, score, nowMs })) continue;

    const providerGame = await bdl.getGame(sportKey, gameId, 1);
    if (!providerGame) throw new Error(`Exact football game ${gameId} was not returned by provider`);
    const merged = mergeExactFootballGame({ pick, game, score, providerGame, nowMs });
    gameById.set(gameId, merged.game);
    if (merged.score) scoreByGame.set(gameId, merged.score);
    else scoreByGame.delete(gameId);
    fetched.push(gameId);
  }
  return fetched;
}

export default {
  hydrateExactFootballGames,
  mergeExactFootballGame,
  mergeFootballProofScore,
  needsExactFootballGame,
};
