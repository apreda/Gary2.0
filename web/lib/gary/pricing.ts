/**
 * Web-facing pricing — single source of truth for the /pricing page.
 *
 * GOLDEN RULE: this must match BOTH the iOS `GaryPricing` enum (Views.swift)
 * AND what Stripe actually charges. To change a price you update all three
 * together (Stripe link/trial → iOS GaryPricing → here), never one alone —
 * the site must never quote a number Stripe won't honor.
 *
 * Planned next change (pending the Stripe reconfig): All-Access → $29.99/mo
 * with a 7-day trial, plus a new $179/yr annual price+link. Flip the constants
 * here + in GaryPricing the moment the Stripe side is live.
 */
export const PRICING = {
  allAccessMonthly: '$34.99',
  allAccessAnnual: '$179',   // surfaces only once the Stripe annual link exists
  single: '$9.99',
  worldCup: '$14.99',
  twoSport: '$17.99',
  threeSport: '$24.99',
  trialDays: 3,
} as const;

/** Free vs. paid — the honest gating story. Free = the brain (the resource);
 *  paid = the Winners board (the bets Gary would actually make). */
export const GATING: { capability: string; free: boolean; paid: boolean }[] = [
  { capability: 'Full game slate + written reasoning', free: true, paid: true },
  { capability: 'Player props slate', free: true, paid: true },
  { capability: 'Public track record / Billfold', free: true, paid: true },
  { capability: 'The Hub — edges, trends, receipts', free: true, paid: true },
  { capability: 'Winners — the plays Gary would actually bet', free: false, paid: true },
  { capability: "Each board's own graded record", free: false, paid: true },
  { capability: 'Live in-game tracking on your boards', free: false, paid: true },
  { capability: 'Alerts the second a board posts', free: false, paid: true },
];
