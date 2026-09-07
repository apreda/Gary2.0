export const HOST_CHECK_INTERVAL_MS = 10 * 60_000;
const GiB = 1024 ** 3;

export function diskHealth(availableBytes) {
  return {
    id: 'host:internal-disk',
    status: availableBytes < 5 * GiB ? 'fail' : availableBytes < 15 * GiB ? 'warn' : 'ok',
    evidence: `${(availableBytes / GiB).toFixed(1)} GiB available on the production volume`,
  };
}

// Times, counts and wording can change without creating a new incident.
// Missing identities matter even when the overall status remains failed.
export function healthSignature(report) {
  return JSON.stringify(report.checks.filter(check => ['warn', 'fail'].includes(check.status)).map(check => ({
    id: check.id, status: check.status,
    missing: check.missing_game_ids?.map(String).sort(),
    incomplete: check.incomplete_game_ids?.map(String).sort(),
    missing_started: check.missing_started_game_ids?.map(String).sort(),
    missing_final_window: check.missing_final_window_game_ids?.map(String).sort(),
  })).sort((a, b) => a.id.localeCompare(b.id)));
}
