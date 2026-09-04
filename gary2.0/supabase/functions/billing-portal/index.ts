import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = { "Access-Control-Allow-Origin": "https://www.betwithgary.ai", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: req.headers.get("authorization") ?? "" } });
    if (!who.ok) return json({ error: "Sign in to manage your subscription." }, 401);
    const user = await who.json();
    if (!user.id) return json({ error: "Sign in to manage your subscription." }, 401);
    const rows = await fetch(`${SUPABASE_URL}/rest/v1/user_entitlements?installation_id=eq.${encodeURIComponent(user.id)}&livemode=eq.true&stripe_subscription_id=not.is.null&select=stripe_subscription_id,stripe_customer_id&order=created_at.desc&limit=1`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!rows.ok) throw new Error("Subscription lookup failed");
    const [entry] = await rows.json();
    if (!entry) return json({ error: "There is no paid subscription on this account." }, 404);
    const key = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
    if (!key) return json({ error: "Billing management is temporarily unavailable." }, 503);
    let customer = entry.stripe_customer_id;
    if (!customer) {
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(entry.stripe_subscription_id)}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error("Customer lookup failed");
      customer = (await res.json()).customer;
    }
    if (typeof customer !== "string" || !customer.startsWith("cus_")) throw new Error("Missing billing customer");
    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer, return_url: "https://www.betwithgary.ai/account" }),
    });
    const portal = await res.json();
    if (!res.ok || !portal.url) throw new Error("Portal unavailable");
    return json({ url: portal.url });
  } catch (e) { console.error("billing portal failed", (e as Error).message); return json({ error: "Billing management couldn't be opened. Please try again." }, 503); }
});
