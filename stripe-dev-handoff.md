# Gary — Stripe Integration Handoff (web + iOS)

This is everything the developer needs to wire Stripe into the Gary website (Vite + React) and iOS app, on top of the existing Supabase backend. The model is **one-time purchases that grant time-limited, per-sport access** — not recurring subscriptions.

## 1. Architecture at a glance
1. User picks one or more sports (or the All-Sport Pass) on the website.
2. Frontend calls a Supabase Edge Function `create-checkout-session`, which creates a **Stripe Checkout Session in `payment` mode** (one-time) with a line item per chosen pass.
3. User pays on Stripe-hosted Checkout, returns to a success URL.
4. Stripe fires `checkout.session.completed` → Edge Function `stripe-webhook` writes an **entitlement** row per purchased sport, with an `expires_at` = that sport's season end.
5. The website and iOS app read the user's **active** entitlements and unlock the matching premium picks. When `expires_at` passes, access locks automatically.
6. **iOS:** the app does not embed a payment sheet. A "Get premium picks" button **links out to the website checkout** (app-to-web), passing the signed-in user so the purchase attaches to their account; on return the app refreshes entitlements. (US-compliant under the current Epic ruling; outside the US, confirm App Store rules before shipping.)

Because purchases are one-time, there are **no subscription/renewal webhooks** to manage — simpler than a recurring model. Expiry is enforced by us, not Stripe.

## 2. Product / price IDs — LIVE in the Stripe account (TEST mode)
These are already created in the "Gary A.I sandbox" account (`acct_1TcXw4LJVzRZvO5H`). All prices are **one-time** (`type: one_time`), USD. Both the product and the price carry `sport`/`tier` metadata.

> ⚠️ These are **TEST-mode** IDs (`livemode: false`). Before launch, recreate the catalog in **live** mode and swap these IDs — test objects do not transfer.

| Pass | Amount | Stripe Price ID | Product ID | sport | tier |
|------|--------|-----------------|------------|-------|------|
| NBA Season Pass | $19.99 | `price_1TduaJLJVzRZvO5HjkHqWO0a` | `prod_UdAvlMohWU0dSw` | NBA | regular_season |
| NFL Season Pass | $19.99 | `price_1TduaKLJVzRZvO5HlJc4sFSm` | `prod_UdAv1BWOzmrYem` | NFL | regular_season |
| NHL Season Pass | $19.99 | `price_1TduaMLJVzRZvO5HqSi7onoy` | `prod_UdAvLvR05Z1lTt` | NHL | regular_season |
| MLB Season Pass | $19.99 | `price_1TduaNLJVzRZvO5HanpWz9fW` | `prod_UdAvA1Pq0ANkAt` | MLB | regular_season |
| NCAAB Season Pass | $19.99 | `price_1TduaPLJVzRZvO5Hkkh1yNEZ` | `prod_UdAwn3S1AQqQJk` | NCAAB | regular_season |
| NCAAF Season Pass | $19.99 | `price_1TduaPLJVzRZvO5HxoFs7rqY` | `prod_UdAwGArmIgDs7z` | NCAAF | regular_season |
| All-Sport Pass | $99.99 | `price_1TduaRLJVzRZvO5HrkVu1TvF` | `prod_UdAwOWLr4WKcFD` | — | all_sport |

### Playoff passes (one-time, $9.99 — `tier=playoffs`)
| Pass | $9.99 Price ID | Product ID | Promo |
|------|----------------|------------|-------|
| NBA Playoff Pass | `price_1Tdv5ELJVzRZvO5H41QYwfww` | `prod_UdBQZhzxnQHhbd` | **FREE now** |
| NHL Playoff Pass | `price_1Tdv5ULJVzRZvO5H0VjrIxPj` | `prod_UdBQGySCDAV4Ze` | **FREE now** |
| NFL Playoff Pass | `price_1Tdv5ULJVzRZvO5Hg5hUmDAo` | `prod_UdBQr5wHeApEmi` | — |
| MLB Playoff Pass | `price_1Tdv5WLJVzRZvO5HVClaq5ZB` | `prod_UdBQzViFHUO1lW` | — |
| NCAAB Playoff Pass | `price_1Tdv5XLJVzRZvO5HKjcFZEfS` | `prod_UdBQ8U51YWYd2g` | — |
| NCAAF Playoff Pass | `price_1Tdv5YLJVzRZvO5HPWlSuj1s` | `prod_UdBQWIRqZ1SImo` | — |

**Free promo — NBA & NHL playoffs (display as ~~$9.99~~ Free):**
Their products carry `promo=playoffs_free` and `compare_at_amount=999` in metadata, plus a second **$0 price**:
- NBA $0 price: `price_1Tdv67LJVzRZvO5HuxoIcTWo` · NHL $0 price: `price_1Tdv68LJVzRZvO5Hi74sXZVT`
- Frontend: if product metadata `promo == playoffs_free`, render the price struck through using `compare_at_amount` (999 → "$9.99") next to "Free".
- "Free" should be granted as an entitlement **without a Stripe charge** — do NOT push the $0 price through card Checkout (Stripe rejects sub-$0.50 card payments). Just write the playoff entitlement directly when the user claims it. When the promo ends, switch the frontend to the $9.99 price.
- Note: playoff **price** objects have no price-level metadata (only the **product** does) — the webhook already keys off product metadata, so this is fine.

The webhook reads `sport`/`tier` from the price's **product** metadata to decide what to unlock — so the code never hardcodes price IDs to sports.

## 3. Secrets & env (where each key goes)
**Never commit these; never put secret/whsec keys in the frontend or a shared doc.**

Frontend (`.env`, exposed to browser — safe):
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…   # pk_test_… while testing
```

Supabase Edge Function secrets (server-side only):
```
supabase secrets set STRIPE_SECRET_KEY=sk_live_…
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…
# SUPABASE_SERVICE_ROLE_KEY is already available to functions for privileged DB writes
```

## 4. Database — entitlements
New migration (matches existing `supabase/migrations/` style):
```sql
create table public.entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  sport        text,                    -- e.g. 'MLB'; null for all_sport
  tier         text not null,           -- 'regular_season' | 'playoffs' | 'all_sport'
  status       text not null default 'active',  -- 'active' | 'refunded' | 'expired'
  stripe_session_id   text unique,
  stripe_payment_intent text,
  purchased_at  timestamptz not null default now(),
  expires_at    timestamptz              -- season end; access locks after this
);
alter table public.entitlements enable row level security;
create policy "own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);
-- writes happen only from the webhook via service role (bypasses RLS)
```

"Does this user have access to sport X right now?" =
```sql
select exists (
  select 1 from entitlements
  where user_id = $1 and status = 'active'
    and (expires_at is null or expires_at > now())
    and (tier = 'all_sport' or sport = $2)
);
```

**Season-end config:** the webhook needs each sport's regular-season (and playoff) end date to set `expires_at`. Keep this in a small config the owner maintains each year — do NOT hardcode and forget, seasons shift annually:
```ts
// VERIFY these dates each season — placeholders, not authoritative
const SEASON_END: Record<string, string> = {
  NBA: '2026-04-12', NFL: '2027-01-10', NHL: '2026-04-18',
  MLB: '2026-09-28', NCAAB: '2026-03-15', NCAAF: '2026-12-06',
};
```

## 5. Edge Function — `create-checkout-session`
- Auth: require the Supabase JWT; derive `user_id` server-side (don't trust the client).
- Build `line_items` from the sport(s) the user selected → their Price IDs.
- `mode: 'payment'` (one-time). Set `client_reference_id` = `user_id` and also put `user_id` in `metadata` so the webhook can attach the purchase.
- `success_url` / `cancel_url` back to the site (include `{CHECKOUT_SESSION_ID}` template var on success).
- Return the session `url`; frontend does `window.location = url`.

## 6. Edge Function — `stripe-webhook`
**Endpoint URL (test):** `https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/stripe-webhook` — subscribe it to `checkout.session.completed` (add `charge.refunded` for the refund → revoke path). The owner creates this endpoint in the Stripe dashboard and pastes its `whsec_…` signing secret into Supabase secrets.
- Read the raw body and verify with `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.constructEventAsync` in Deno).
- `checkout.session.completed`: expand line items → for each, read product metadata `sport`/`tier` → upsert an `entitlements` row (`user_id` from `client_reference_id`, `expires_at` from `SEASON_END[sport]`, `stripe_session_id` for idempotency).
- `charge.refunded`: set matching entitlement(s) `status='refunded'` to revoke access.
- Always return 200 quickly; do work idempotently (Stripe retries).

## 7. Access enforcement
- **Website:** before rendering premium picks for a sport, check the entitlement query above; otherwise show the paywall/CTA. RLS lets the client read its own entitlements directly, or expose a tiny `has_access(sport)` RPC.
- **Server/pick delivery:** also gate the premium-pick API/Edge Function by entitlement so picks can't be pulled without access (don't rely on the client alone).

## 8. iOS app-to-web (SwiftUI)
- A "Unlock [sport] premium picks" button opens the website checkout in `SFSafariViewController` / `ASWebAuthenticationSession`, passing a short-lived auth token (or deep-link the logged-in web session) so the purchase ties to the same Supabase user.
- On return to the app, re-fetch entitlements and unlock the matching premium picks in `PropsHubView` / premium views.
- **Compliance:** US external-link purchases are allowed under the current ruling and (for now) without Apple commission, but it's actively litigated. Confirm current App Store Review Guidelines + per-region rules before submitting; keep the in-app messaging within Apple's external-link entitlement format.

## 9. Test plan (Test mode first)
- Use `pk_test`/`sk_test` and test webhook secret.
- Card `4242 4242 4242 4242`, any future expiry/CVC.
- Verify: single-sport purchase unlocks only that sport; multi-sport cart unlocks each; All-Sport unlocks everything; refund revokes; access locks after a (temporarily backdated) `expires_at`.
- Use the Stripe CLI (`stripe listen --forward-to <function-url>`) to test webhooks locally.

## 10. Go-live checklist
- Owner re-creates products in **live** mode (test products don't transfer) → update the Price ID table above.
- Swap `pk_live`/`sk_live` and a **live** webhook signing secret into frontend env + Supabase secrets.
- Point the live webhook endpoint at the deployed function URL; confirm a real $1 test or first purchase end-to-end.

---
**Open items from the owner (needed to finalize):** playoff pass price; All-Sport Pass duration + whether it includes playoffs; confirmation that all passes are one-time (no auto-renew); verified season-end dates.
