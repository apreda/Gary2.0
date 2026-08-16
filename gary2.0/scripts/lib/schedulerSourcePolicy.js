export class SchedulerSourceSchemaError extends Error {
  constructor({ sportKey, gameId, value, reason }) {
    const rendered = value == null || value === '' ? 'missing' : JSON.stringify(value);
    super(`${sportKey} game ${gameId ?? '?'} has ${reason} start time (${rendered})`);
    this.name = 'SchedulerSourceSchemaError';
    this.code = 'SCHEDULER_SOURCE_SCHEMA';
    this.sportKey = sportKey;
    this.gameId = gameId ?? null;
  }
}

/** Parse a non-football provider start or fail the entire sport snapshot. */
export function requireNonFootballStart(game, sportKey, startIso) {
  if (typeof startIso !== 'string' || startIso.trim() === '') {
    throw new SchedulerSourceSchemaError({
      sportKey,
      gameId: game?.id,
      value: startIso,
      reason: 'a missing',
    });
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(startIso.trim())) {
    throw new SchedulerSourceSchemaError({
      sportKey,
      gameId: game?.id,
      value: startIso,
      reason: 'a date-only',
    });
  }
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    throw new SchedulerSourceSchemaError({
      sportKey,
      gameId: game?.id,
      value: startIso,
      reason: 'an unparseable',
    });
  }
  return start;
}
