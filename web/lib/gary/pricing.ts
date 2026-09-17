/**
 * Web-facing pricing — single source of truth for the /pricing page.
 *
 * GOLDEN RULE: this must match BOTH the iOS `GaryPricing` enum (Views.swift)
 * AND what Stripe actually charges. To change a price you update all three
 * together (Stripe link/trial → iOS GaryPricing → here), never one alone —
 * the site must never quote a number Stripe won't honor.
 *
 * Current account-owned billing checks included preview/founding access before
 * checkout. These catalog prices apply only when no included entitlement exists.
 * Keep actual Stripe prices and iOS pricing aligned when changing this catalog.
 */
export const PRICING = {
  allAccessMonthly: '$29.99',
  allAccessAnnual: '$179',
  allAccessAnnualMonthly: '$14.92',  // 179 / 12 — the annual card's effective rate
  single: '$9.99',
  twoSport: '$17.99',
  threeSport: '$24.99',
  trialDays: 7,
} as const;

/** Free picks and insights; Winners adds Gary’s favorite bets of the day. */
export const GATING: { capability: string; free: boolean; paid: boolean }[] = [
  { capability: 'Gary’s game picks', free: true, paid: true },
  { capability: 'Player prop picks', free: true, paid: true },
  { capability: 'Public track record / Billfold', free: true, paid: true },
  { capability: 'The Hub — insights and betting connections', free: true, paid: true },
  { capability: 'Winners — Gary’s best bets of the day', free: false, paid: true },
  { capability: "Past Winners picks and results", free: true, paid: true },
  { capability: 'Your Book — track your bets', free: true, paid: true },

];
