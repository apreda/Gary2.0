# Gary — Stripe Setup Checklist (do this yourself)

> I can't drive the Stripe dashboard for you — it's a payments platform, so browser automation is blocked, and your account/bank/identity details should only ever be entered by you. This is the exact click-by-click so it takes ~15 minutes. Anything I should NOT touch (secret keys) is called out.

## The pricing model this is built around
Confirm this matches your intent — correct me on the ⚠️ items and I'll adjust both docs.

| Pass | Price | Type | Access |
|------|-------|------|--------|
| NBA Season Pass | $19.99 | **One-time** | NBA premium picks until NBA regular season ends |
| NFL Season Pass | $19.99 | One-time | NFL premium picks until NFL regular season ends |
| NHL Season Pass | $19.99 | One-time | NHL premium picks until NHL regular season ends |
| MLB Season Pass | $19.99 | One-time | MLB premium picks until MLB regular season ends |
| NCAAB Season Pass | $19.99 | One-time | NCAAB premium picks until its regular season ends |
| NCAAF Season Pass | $19.99 | One-time | NCAAF premium picks until its regular season ends |
| NBA/NFL/NHL/MLB/NCAAB/NCAAF **Playoff Pass** | ⚠️ **$TBD** | One-time | That sport's playoff premium picks |
| All-Sport Pass | $99.99 | One-time | ⚠️ all sports — **for how long?** (1 year? through current seasons?) Includes playoffs? |

**Key decisions to confirm:**
- ⚠️ **One-time, not auto-renew.** You said "it'll be a one-time pass… next year they have to buy again." So nothing auto-charges; a customer rebuys each season. (If you'd rather it auto-renew each season, tell me — different setup.)
- ⚠️ **Playoff pass price** — you said playoffs are "extra." What's the price per sport?
- ⚠️ **All-Sport Pass duration** — does $99.99 unlock everything for a calendar year, or through the current seasons? And does it include playoffs?

> Because these are **one-time** purchases, Stripe won't auto-expire access — your **backend stores an expiry date** (season end) per purchase and locks the picks when it passes. That logic is in the dev handoff.

---

## Step 0 — Have these ready (only you can enter them)
- Business legal name + address (or your name if sole proprietor)
- Tax ID — EIN, or SSN if sole proprietor
- A bank account + routing number for payouts
- A government photo ID for identity verification

## Step 1 — Create / log into the account
1. Go to **stripe.com** → Sign up (or log in if you have one).
2. Complete **Business settings → Account details**: business type, address, tax ID.
3. Add your **payout bank account**.
4. Complete **identity verification** when prompted.

*(Do all of this yourself — I won't and can't enter any of it.)*

## Step 2 — Start in TEST mode
Top-right of the dashboard, switch on **Test mode**. Build everything here first so your dev can test with fake cards before you go live.

## Step 3 — Create the products
**Product catalog → Add product.** Repeat for each row in the table above.

For each **season pass** (do all 6):
- **Name:** `NBA Season Pass` (etc.)
- **Price:** `19.99` USD, **One-time** (not recurring)
- **Add metadata** (click "Add metadata" on the product) — this is how your app knows what was bought:
  - `sport` = `NBA` (NFL / NHL / MLB / NCAAB / NCAAF)
  - `tier` = `regular_season`
- Save. **Copy the Price ID** (`price_…`) into the table in the dev handoff.

For each **playoff pass** (once you give me the price):
- **Name:** `NBA Playoff Pass`
- **Price:** `$TBD` USD, One-time
- **Metadata:** `sport` = `NBA`, `tier` = `playoffs`

For the **All-Sport Pass**:
- **Name:** `All-Sport Pass`
- **Price:** `99.99` USD, One-time
- **Metadata:** `tier` = `all_sport`

## Step 4 — Get the API keys (Developers → API keys)
- **Publishable key** (`pk_test_…`): safe to share — give to your dev / put in the website's frontend env.
- **Secret key** (`sk_test_…`): **sensitive.** Do NOT paste it into Slack, email, or any shared doc. Hand it to your dev to put directly into your **Supabase Edge Function secrets** (instructions in the handoff). Treat it like a password.

## Step 5 — Add the webhook (Developers → Webhooks → Add endpoint)
- **Endpoint URL:** your backend webhook (a Supabase Edge Function — your dev gives you the exact URL, looks like `https://<project>.functions.supabase.co/stripe-webhook`).
- **Events to send:** `checkout.session.completed` and `charge.refunded` (add `payment_intent.succeeded` too if your dev asks).
- Save, then **copy the Signing secret** (`whsec_…`) — also sensitive, also goes into Supabase secrets, not a shared doc.

## Step 6 — Customer-facing polish (Settings)
- **Branding:** add the Gary logo + brand color (shows on Checkout + receipts).
- **Customer emails:** turn on successful-payment receipts and refund emails.
- **Public business details:** support email, statement descriptor (what shows on card statements, e.g. `GARY AI`).

## Step 7 — Go live (after your dev has tested)
1. Finish **account activation** (Stripe will confirm business + bank + identity).
2. Switch **Test mode → off**.
3. **Re-create the products in live mode** — test products do NOT carry over. (Re-do Step 3 with Test mode off, copy the new live `price_…` IDs.)
4. Swap the live keys (`pk_live_…`, `sk_live_…`) and a **live webhook** signing secret into the website + Supabase.

---

### What to send me back
1. The ⚠️ confirmations (one-time vs auto-renew, playoff price, all-sport duration/playoffs).
2. Once products exist, the list of `price_…` IDs — I'll drop them into the dev handoff so it's copy-paste ready.
