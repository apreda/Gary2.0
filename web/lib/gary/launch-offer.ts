/** Mirrors get_my_access; changing an entitlement requires the account/billing lane. */
export const LAUNCH_PREVIEW_END = '2026-10-01T04:00:00.000Z';
export const LAUNCH_OFFER = 'Winners is open for the launch preview until October 1, 2026 at midnight Eastern. Accounts created before that cutoff retain founding access to Winners. No purchase is needed for included access.';
export const FREE_OFFER = 'Full game picks and written reasoning, available player props, the Hub, the public record, and your private Book stay free.';
export const ACTIVE_COVERAGE = 'MLB, NFL and NCAAF are active. NBA is preparing for relaunch; earlier sports records remain available in the archive.';

export function isLaunchPreview(now = new Date()): boolean {
  return now.getTime() < Date.parse(LAUNCH_PREVIEW_END);
}
