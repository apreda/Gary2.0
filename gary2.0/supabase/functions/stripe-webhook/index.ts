// Stripe webhook -> user_entitlements.
// Auth: Stripe signature verification (HMAC-SHA256 of `${t}.${body}`) against
// the TEST or LIVE signing secret — both endpoints point here. verify_jwt is
// off because Stripe calls us directly.
//
// Lifecycle:
//   checkout.session.completed    -> grant (bundle sessions carry metadata.sports
//                                    and grant one row per sport; payment-link
//                                    sessions resolve through LINK_MAP)
//   customer.subscription.deleted -> revoke (status = canceled)
//
// v10 (Jun 9 2026): June price flip links added — All-Access $29.99/mo and
// $179/yr (7-day card-required trials), test + live. Old $34.99 links stay
// mapped: the shipped App Store build still sells through them until the
// next release, and existing subscribers renew on them indefinitely.

const SECRETS = [
  Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",      // test endpoint
  Deno.env.get("STRIPE_WEBHOOK_SECRET_LIVE") ?? "", // live endpoint
].filter(Boolean);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Payment link -> entitlement.
const LINK_MAP: Record<string, { key: string; pass: string }> = {
  // LIVE — monthly subscriptions
  plink_1Tf2dILqUC52RoAIqzzuHrlK: { key: "MLB", pass: "monthly" },
  plink_1Tf2dJLqUC52RoAI7X7eTr4m: { key: "NBA", pass: "monthly" },
  plink_1Tf2dJLqUC52RoAI0LX8MIuy: { key: "NHL", pass: "monthly" },
  plink_1Tf2dKLqUC52RoAIsuBVEr9i: { key: "NFL", pass: "monthly" },
  plink_1Tf2dLLqUC52RoAINXPAjtbY: { key: "NCAAF", pass: "monthly" },
  plink_1Tf2dLLqUC52RoAIufwGQEgq: { key: "NCAAB", pass: "monthly" },
  plink_1Tf2dNLqUC52RoAIgKbKkpbK: { key: "ALL", pass: "monthly" },   // $34.99/3-day — shipped build
  // LIVE — June 9 2026 flip: $29.99/mo + $179/yr, 7-day card-required trials
  plink_1TgbaKLqUC52RoAIvLEooj2r: { key: "ALL", pass: "monthly" },
  plink_1TgbaKLqUC52RoAINLm0QilG: { key: "ALL", pass: "annual" },
  // TEST — monthly subscriptions
  plink_1Tf2JNLJVzRZvO5HTgHm6Nv9: { key: "MLB", pass: "monthly" },
  plink_1Tf2JQLJVzRZvO5HOqgKnyzy: { key: "NBA", pass: "monthly" },
  plink_1Tf2JSLJVzRZvO5HFuRqFaGd: { key: "NHL", pass: "monthly" },
  plink_1Tf2JnLJVzRZvO5H7oYqfBBy: { key: "NFL", pass: "monthly" },
  plink_1Tf2JqLJVzRZvO5HN4oNSrQ1: { key: "NCAAF", pass: "monthly" },
  plink_1Tf2JuLJVzRZvO5H3oNKGDI7: { key: "NCAAB", pass: "monthly" },
  plink_1Tf2LILJVzRZvO5HtecD92Si: { key: "ALL", pass: "monthly" },
  // TEST — June 9 2026 flip: $29.99/mo + $179/yr, 7-day card-required trials
  plink_1TgbEsLJVzRZvO5HmNa1JmJM: { key: "ALL", pass: "monthly" },
  plink_1TgbEtLJVzRZvO5HUsg5w60B: { key: "ALL", pass: "annual" },
  // TEST — legacy one-time season links (an old open tab still grants)
  plink_1TezsGLJVzRZvO5HNnoZr1qr: { key: "MLB", pass: "season" },
  plink_1TezsVLJVzRZvO5HgoNprUfZ: { key: "NBA", pass: "season" },
  plink_1TezsfLJVzRZvO5HJSHRhGOo: { key: "NHL", pass: "season" },
  plink_1TezsoLJVzRZvO5HP41HdNLm: { key: "NFL", pass: "season" },
  plink_1TezszLJVzRZvO5HchuFUkWe: { key: "NCAAF", pass: "season" },
  plink_1Tezt8LJVzRZvO5HwzVXIsGl: { key: "NCAAB", pass: "season" },
  plink_1TeztHLJVzRZvO5HH6WHQHxI: { key: "ALL", pass: "all" },
};

// Validate the exact raw body, support rotating signatures, and read Stripe's
// current subscription state so late checkout events cannot resurrect a cancel.
import { subscriptionState, verifyStripeSignature } from "../create-checkout/billing.ts";
import { cancelUnavailableOwnerSubscription } from "../create-checkout/lifecycle.ts";

async function stripe(path: string, live: boolean) {
  const key = Deno.env.get(live ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST");
  if (!key) throw new Error("Stripe key unavailable");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Stripe lookup failed: ${res.status}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const body = await req.text();
  if (!await verifyStripeSignature(body, req.headers.get("stripe-signature"), SECRETS)) return new Response("bad signature", { status: 401 });
  try {
    const event = JSON.parse(body);
    if (!event.id || !Number.isFinite(event.created) || typeof event.livemode !== "boolean") return new Response("bad event", { status: 400 });
    const live = event.livemode;
    const object = event.data?.object ?? {};
    let subId: string | null = null;
    let owner: string | null = null;
    let sports: string[] | null = null;
    let pass: string | null = null;
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      subId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
      owner = object.client_reference_id ?? null;
      const mapped = object.payment_link ? LINK_MAP[object.payment_link] : null;
      sports = object.metadata?.sports ? object.metadata.sports.split(",").map((s: string) => s.trim()) : mapped ? [mapped.key] : null;
      pass = object.metadata?.pass ?? mapped?.pass ?? null;
      if (!subId) return new Response(JSON.stringify({ ignored: "non-subscription checkout" }), { status: 200 });
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(event.type)) {
      subId = object.id;
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
      subId = object.subscription ?? object.parent?.subscription_details?.subscription;
    } else return new Response(JSON.stringify({ ignored: event.type }), { status: 200 });
    if (typeof subId !== "string" || !/^sub_[A-Za-z0-9]+$/.test(subId)) return new Response("no subscription", { status: 200 });
    let sub = await stripe(`subscriptions/${encodeURIComponent(subId)}`, live);
    if (sub.livemode !== live) throw new Error("Subscription mode mismatch");
    sub = await cancelUnavailableOwnerSubscription(sub, SUPABASE_URL, SERVICE_KEY,
      Deno.env.get(live ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST")!, fetch);
    owner = sub.metadata?.owner ?? owner;
    sports = sub.metadata?.sports ? sub.metadata.sports.split(",").map((s: string) => s.trim()) : sports;
    pass = sub.metadata?.pass ?? pass;
    const state = subscriptionState(sub);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_subscription_access`, {
      method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_subscription_id: subId, p_owner: owner, p_sports: sports,
        p_pass: pass, p_status: state.status, p_expires_at: state.expires_at,
        p_cancel: state.cancel_at_period_end, p_customer: state.stripe_customer_id,
        p_livemode: live, p_event_created: event.created }),
    });
    if (!res.ok) throw new Error(`Access synchronization failed: ${res.status}`);
    if (!await res.json()) {
      // A legacy subscription update can beat checkout delivery; returning 500
      // lets Stripe retry once the owner/session mapping arrives.
      return new Response("waiting for checkout identity", { status: 500 });
    }
    return new Response(JSON.stringify({ synced: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("stripe synchronization failed", (e as Error).message);
    return new Response("synchronization failed", { status: 500 });
  }
});
