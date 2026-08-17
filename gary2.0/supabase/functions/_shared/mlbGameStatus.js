const INTERRUPTED_STATUSES = new Set([
  'delayed',
  'postponed',
  'suspended',
  'cancelled',
]);
const RECOVERABLE_INTERRUPTION_STATUSES = new Set([
  'delayed',
  'postponed',
  'suspended',
]);

function statusText(rawStatus) {
  if (rawStatus && typeof rawStatus === 'object') {
    return [
      rawStatus.detailedState,
      rawStatus.status,
      rawStatus.detail,
      rawStatus.reason,
      rawStatus.abstractGameState,
      rawStatus.codedGameState,
    ].filter(Boolean).join(' ');
  }
  return String(rawStatus ?? '');
}

/**
 * Normalize both Ball Don't Lie's MLB status field and MLB StatsAPI's status
 * object without erasing interruption state. BDL uses an ISO timestamp for a
 * normal scheduled game; StatsAPI uses strings such as "Pre-Game" and
 * "Delayed" inside a status object.
 */
export function normalizeMlbGameStatus(rawStatus) {
  const rawText = statusText(rawStatus).trim();
  const upper = rawText.toUpperCase();

  if (/POSTPON/.test(upper)) {
    return { status: 'postponed', detail: 'POSTPONED', interrupted: true };
  }
  if (/SUSPEND/.test(upper)) {
    return { status: 'suspended', detail: 'SUSPENDED', interrupted: true };
  }
  if (/DELAY|RAIN DELAY/.test(upper)) {
    return { status: 'delayed', detail: 'DELAYED', interrupted: true };
  }
  if (/CANCEL/.test(upper)) {
    return { status: 'cancelled', detail: 'CANCELLED', interrupted: true };
  }
  if (/FINAL|GAME OVER|COMPLETED|FORFEIT/.test(upper)) {
    return { status: 'final', detail: 'FINAL', interrupted: false };
  }
  if (
    !upper
    || /^\d{4}-\d{2}-\d{2}T/.test(rawText)
    || /SCHEDULED|PRE-?GAME|PREVIEW|WARMUP/.test(upper)
  ) {
    return { status: 'scheduled', detail: null, interrupted: false };
  }
  return { status: 'live', detail: null, interrupted: false };
}

export function isInterruptedMlbGameStatus(status) {
  return INTERRUPTED_STATUSES.has(String(status ?? '').trim().toLowerCase());
}

export function isRecoverableMlbGameInterruption(status) {
  return RECOVERABLE_INTERRUPTION_STATUSES.has(String(status ?? '').trim().toLowerCase());
}
