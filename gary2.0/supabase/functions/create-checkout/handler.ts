import { checkoutPlan } from "./billing.ts";
import { checkoutAttempt, closeOwnedSessions, customerSubscriptions, expireSession, trialDays } from "./lifecycle.ts";

import { CheckoutBusy, CheckoutReservation } from "./reservation.ts";

const RETURN_URL = "https://www.betwithgary.ai/winners";
const cors = { "Access-Control-Allow-Origin": "https://www.betwithgary.ai", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } }); }

export function createCheckoutHandler(config: { supabaseURL: string; anonKey: string; serviceKey: string; stripeLiveKey?: string; stripeTestKey?: string }, request: typeof fetch = globalThis.fetch) {
  const fetch: typeof globalThis.fetch = (input, init) => request(input, { ...init, signal: AbortSignal.timeout(20000) });
  const SUPABASE_URL = config.supabaseURL, ANON_KEY = config.anonKey, SERVICE_KEY = config.serviceKey;
  return async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let reservation: CheckoutReservation | null = null;
  try {
    const authorization = req.headers.get("authorization") ?? "";
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authorization } });
    if (!who.ok) return json({ error: "Sign in to choose a plan." }, 401);
    const user = await who.json();
    if (!user.id) return json({ error: "Sign in to choose a plan." }, 401);
    const deletion = await fetch(`${SUPABASE_URL}/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: { apikey: ANON_KEY, Authorization: authorization } });
    if (!deletion.ok) return json({ error: "We couldn't verify your account. Please try again." }, 503);
    if ((await deletion.json()).length) return json({ error: "Account deletion is in progress. Checkout is unavailable." }, 409);
    let payload;
    try { payload = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
    if (!payload || typeof payload !== "object") return json({ error: "Invalid request." }, 400);
    let plan;
    try { plan = checkoutPlan(payload); } catch (e) { return json({ error: (e as Error).message }, 400); }
    const mode = payload.mode === "test" ? "test" : "live";
    const key = (mode === "test" ? config.stripeTestKey : config.stripeLiveKey);
    if (!key) return json({ error: "Checkout is unavailable. Your account has not been charged." }, 503);
    // The launch promise is server enforced too: a founding/free account never
    // lands on a live checkout for access it already has.
    const accessRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_access`, { method: "POST", headers: { apikey: ANON_KEY, Authorization: authorization, "Content-Type": "application/json" }, body: "{}" });
    if (!accessRes.ok) return json({ error: "We couldn't verify your access. Please try again." }, 503);
    const access = await accessRes.json();
    if (mode === "live" && (access.preview || access.founding)) return json({ error: "Winners is already included with your free access.", access }, 409);
    if (mode === "live" && (access.sports.includes("ALL") || plan.sports.some((s: string) => access.sports.includes(s)) || (plan.sports.includes("ALL") && access.sports.length > 0))) return json({ error: "You already have this access. Manage your existing subscription from your profile." }, 409);
    reservation = await CheckoutReservation.acquire({ url: SUPABASE_URL, serviceKey: SERVICE_KEY, owner: user.id, live: mode === "live", stripeKey: key }, fetch);
    const recovered = await reservation.recover();
    const form = new URLSearchParams({
      mode: "subscription", client_reference_id: user.id,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(plan.amount),
      "line_items[0][price_data][recurring][interval]": plan.interval,
      "line_items[0][price_data][product_data][name]": plan.name,
      "line_items[0][quantity]": "1", "metadata[sports]": plan.sports.join(","),
      "metadata[pass]": plan.pass, "metadata[owner]": user.id, "subscription_data[metadata][sports]": plan.sports.join(","),
      "subscription_data[metadata][owner]": user.id, "subscription_data[metadata][pass]": plan.pass,
      success_url: `${RETURN_URL}?checkout=success`, cancel_url: `${RETURN_URL}?checkout=canceled`,
    });
    // Reuse the account's billing customer so every pass is manageable in
    // the same portal. Older subscriptions may not have cached this id yet.
    const ownerRows = await fetch(`${SUPABASE_URL}/rest/v1/user_entitlements?installation_id=eq.${encodeURIComponent(user.id)}&livemode=eq.${mode === "live"}&stripe_subscription_id=not.is.null&select=stripe_subscription_id,stripe_customer_id&order=created_at.asc&limit=1`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!ownerRows.ok) return json({ error: "We couldn't verify your billing account. Please try again." }, 503);
    const [prior] = await ownerRows.json();
    let customer = prior?.stripe_customer_id ?? (typeof recovered?.customer === "string" ? recovered.customer : undefined);
    if (prior && !customer) {
      const existing = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(prior.stripe_subscription_id)}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!existing.ok) return json({ error: "We couldn't verify your existing plan. Please try again." }, 503);
      customer = (await existing.json()).customer;
    }
    if (!customer) {
      const saved = await fetch(`${SUPABASE_URL}/rest/v1/account_checkout_sessions?user_id=eq.${encodeURIComponent(user.id)}&livemode=eq.${mode === "live"}&customer_id=not.is.null&select=customer_id&order=created_at.desc&limit=1`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      if (!saved.ok) return json({ error: "We couldn't verify your billing account. Please try again." }, 503);
      customer = (await saved.json())[0]?.customer_id;
    }
    if (!customer) {
      const customerForm = new URLSearchParams({ "metadata[owner]": user.id });
      if (user.email) customerForm.set("email", user.email);
      const created = await fetch("https://api.stripe.com/v1/customers", { method: "POST", headers: {
        Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `gary-customer-${mode}-${user.id}`,
      }, body: customerForm });
      if (!created.ok) return json({ error: "Your billing account couldn't be opened. Please try again." }, 503);
      customer = (await created.json()).id;
    }
    if (typeof customer !== "string" || !/^cus_[A-Za-z0-9]+$/.test(customer)) return json({ error: "Your billing account couldn't be verified." }, 503);
    form.set("customer", customer);
    const subscriptionRows = await customerSubscriptions(customer, key, fetch);
    const hasPriorSubscription = !!prior || subscriptionRows.length > 0;
    if (subscriptionRows.some((sub: any) => ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(sub.status) &&
      sub.metadata?.owner === user.id && sub.metadata?.sports?.split(",").some((sport: string) => sport === "ALL" || plan.sports.includes("ALL") || plan.sports.includes(sport)))) {
      await closeOwnedSessions(user.id, mode === "live", key, [], fetch, undefined, () => reservation!.assertLease());
      return json({ error: "You already have this plan. Manage your existing subscription from your profile." }, 409);
    }
    const days = trialDays(plan.trial, hasPriorSubscription);
    if (days) form.set("subscription_data[trial_period_days]", String(days));
    form.set("metadata[trial_days]", String(days));
    const attempt = await checkoutAttempt(customer, user.id, mode === "live", plan.sports, plan.pass, key, fetch);
    let session = attempt.session;
    if (session && session.metadata?.trial_days !== String(days)) session = null;
    // All plan choices share this account/mode lease. A deliberate plan change
    // closes the old session first; a payment racing that closure stops here.
    const completed = await closeOwnedSessions(user.id, mode === "live", key,
      recovered?.status === "open" ? [recovered.id] : [], fetch, session?.id, () => reservation!.assertLease());
    if (completed.length) return json({ error: "A previous checkout has completed. Refresh your profile before choosing another plan." }, 409);
    if (session) await reservation.adopt(session, form);
    else session = await reservation.open(form);
    if (!session.url || !session.id || session.status !== "open") return json({ error: "This checkout has finished. Refresh your profile before choosing another plan." }, 409);
    try {
      const saved = await fetch(`${SUPABASE_URL}/rest/v1/account_checkout_sessions?on_conflict=session_id`, {
        method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: session.id, user_id: user.id, livemode: mode === "live", customer_id: customer }),
      });
      if (!saved.ok) throw new Error("Checkout owner could not be recorded");
      const [stillUser, deletionAgain] = await Promise.all([
        fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: authorization } }),
        fetch(`${SUPABASE_URL}/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, { headers: { apikey: ANON_KEY, Authorization: authorization } }),
      ]);
      if (!stillUser.ok || !deletionAgain.ok || (await deletionAgain.json()).length) throw new Error("Account deletion began during checkout");
    } catch {
      await expireSession(session.id, key, fetch);
      return json({ error: "Your account changed while checkout was opening. Sign in again or finish account deletion." }, 409);
    }
    await reservation.assertLease();
    return json({ url: session.url });
  } catch (e) {
    if (e instanceof CheckoutBusy) return json({ error: e.message }, 409);
    console.error("checkout unavailable", (e as Error).name); return json({ error: "Checkout is temporarily unavailable." }, 503);
  } finally {
    if (reservation) try { await reservation.release(); } catch { console.error("checkout reservation release deferred"); }
  }
  };
}
