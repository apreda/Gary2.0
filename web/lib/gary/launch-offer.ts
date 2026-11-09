/** Mirrors get_my_access; changing an entitlement requires the account/billing lane. */
export const LAUNCH_PREVIEW_END = '2026-10-01T04:00:00.000Z';

/**
 * Winners is open to every visitor and account right now. Checked Nov 9 2026: the server's
 * gary_private.has_winners_access returns true for everyone, the iOS app has no purchase path, and the App Store
 * listing says "Everything in Gary is free right now." Until that changes the site quotes no price and offers no
 * plan (it had been telling visitors the free preview ended October 1 and listing plans from $9.99 a month).
 * The day paid plans start: set this to false together with the server gate, and the plans, prices and
 * founding-access copy below come back as they were.
 */
export const WINNERS_IS_FREE = true;

const PAID_LAUNCH_OFFER = 'Winners is open for the launch preview until October 1, 2026 at midnight Eastern. Accounts created before that cutoff retain founding access to Winners. No purchase is needed for included access.';
export const LAUNCH_OFFER = WINNERS_IS_FREE
  ? 'Everything in Gary is free right now, Winners included. No purchase is needed.'
  : PAID_LAUNCH_OFFER;
export const FREE_OFFER = 'Gary’s game picks, available player props, the public record, and your private Book stay free.';
export const ACTIVE_COVERAGE = 'Gary covers the NFL, the NBA, MLB and major-conference college football, each in its season. Earlier sports records remain available in the archive.';

export function isLaunchPreview(now = new Date()): boolean {
  return now.getTime() < Date.parse(LAUNCH_PREVIEW_END);
}
