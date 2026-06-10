/**
 * Web-facing pricing — single source of truth for the /pricing page.
 *
 * GOLDEN RULE: this must match BOTH the iOS `GaryPricing` enum (Views.swift)
 * AND what Stripe actually charges. To change a price you update all three
 * together (Stripe link/trial → iOS GaryPricing → here), never one alone —
 * the site must never quote a number Stripe won't honor.
 *
 * June 9 2026 flip — STAGED: $29.99/mo + 7-day trial + $179/yr annual. The
 * Stripe TEST catalog matches (prices on prod_UeKymtDX7E8fsw, 7-day
 * card-required trials on both links). ⚠️ PRE-SHIP (owner, live mode):
 * recreate the $29.99/7-day and $179/yr prices + payment links in LIVE mode
 * and swap the RELEASE links in iOS GaryPricing's checkoutLinks — this page
 * deploys together with that swap, never before.
 */
export const PRICING = {
  allAccessMonthly: '$29.99',
  allAccessAnnual: '$179',
  allAccessAnnualMonthly: '$14.92',  // 179 / 12 — the annual card's effective rate
  single: '$9.99',
  worldCup: '$14.99',
  twoSport: '$17.99',
  threeSport: '$24.99',
  trialDays: 7,
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
