// Creates a Stripe Checkout Session for the build-your-pass picker: 1-3
// sports on the GaryPricing ladder ($9.99 / $17.99 / $24.99 a month — the
// same numbers the app DISPLAYS, which is the whole point). The sport
// selection rides in session metadata and the webhook turns it into one
// entitlement row per sport.
//
// Jul 2 2026 rework: prices are now INLINE price_data at the exact
// GaryPricing amounts instead of pre-created Stripe Price ids. The old ids
// were a stale pre-Jun-5 ladder ($14.99 base, +$5) that charged $19.99 for a
// 2-sport bundle the app advertises at $17.99 — display and charge can never
// drift again because there is only one number and it lives here.
// 4+ sports are rejected: the picker caps at three and All-Access ($29.99)
// covers every board past that.
//
// POST { leagues: ["MLB","NHL"], identity: "<uuid>", mode?: "test"|"live" }
// -> { url } to open in the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const KEYS: Record<string, string> = {
  live: Deno.env.get("STRIPE_SECRET_KEY_LIVE") ?? "",
  test: Deno.env.get("STRIPE_SECRET_KEY_TEST") ?? "",
};

const SPORTS = ["MLB", "NBA", "NHL", "NFL", "NCAAF", "NCAAB"];

// GaryPricing ladder, in cents — MUST match the app's displayed prices
// (ios/GaryApp Views.swift GaryPricing: single $9.99, twoSport $17.99,
// threeSport $24.99).
const AMOUNT_CENTS: Record<number, number> = { 1: 999, 2: 1799, 3: 2499 };

const RETURN_URL = "https://www.betwithgary.ai";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let payload: { leagues?: string[]; identity?: string; mode?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }

  const mode = payload.mode === "test" ? "test" : "live";
  const key = KEYS[mode];
  if (!key) {
    return new Response(JSON.stringify({ error: `no ${mode} key configured` }), { status: 400 });
  }

  const leagues = [...new Set((payload.leagues ?? []).map((l) => String(l).toUpperCase()))];
  const identity = (payload.identity ?? "").trim();
  if (!identity) return new Response(JSON.stringify({ error: "identity required" }), { status: 400 });
  if (leagues.length < 1 || leagues.length > 3 || !leagues.every((l) => SPORTS.includes(l))) {
    return new Response(JSON.stringify({ error: "leagues must be 1-3 of " + SPORTS.join("/") + " (All-Access covers more)" }), { status: 400 });
  }

  const amount = AMOUNT_CENTS[leagues.length];
  const name = leagues.length === 1
    ? `${leagues[0]} Winners Pass — Monthly`
    : `${leagues.length}-Sport Winners Pass (${[...leagues].sort().join(" · ")}) — Monthly`;
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": name,
    "line_items[0][quantity]": "1",
    client_reference_id: identity,
    "metadata[sports]": leagues.join(","),
    "metadata[pass]": "monthly",
    success_url: RETURN_URL,
    cancel_url: RETURN_URL,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(key + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const session = await res.json();
  if (!res.ok || !session.url) {
    console.error("checkout session failed", res.status, session?.error?.message);
    return new Response(JSON.stringify({ error: session?.error?.message ?? "stripe error" }), { status: 502 });
  }

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
