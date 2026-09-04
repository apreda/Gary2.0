import { test } from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert";
import { createDeleteAccountHandler } from "./handler.ts";
const owner = "10000000-0000-0000-0000-000000000001";
const config = { supabaseURL: "https://supabase.invalid", anonKey: "anon", serviceKey: "service", stripeLiveKey: "live", stripeTestKey: "test" };
const call = (body = "{}") => new Request("https://function.invalid", { method: "POST", headers: { Authorization: "Bearer owner-jwt", Origin: "https://www.betwithgary.ai" }, body });
const response = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status });

function fake(options: { rows?: any[]; stripeFailure?: boolean; mismatch?: boolean; authFailure?: boolean; deleteFailure?: boolean; analyticsFailure?: boolean; apple?: boolean } = {}) {
  const calls: { url: string; method: string; authorization: string | null }[] = [];
  const request = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method, authorization: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/auth/v1/user")) return Promise.resolve(options.authFailure ? response({}, 401) : response({ id: owner, identities: [{ provider: options.apple ? "apple" : "email" }] }));
    if (url.includes("/app_events?identity=eq.")) return Promise.resolve(response(null, options.analyticsFailure ? 503 : 204));
    if (url.includes("/account_deletion_requests")) return Promise.resolve(response(null, 204));
    if (url.includes("/account_checkout_sessions")) return Promise.resolve(response([]));
    if (url.includes("api.stripe.com/v1/checkout/sessions?")) return Promise.resolve(response({ data: [], has_more: false }));
    if (url.includes("/user_entitlements")) return Promise.resolve(response(options.rows ?? []));
    if (url.includes("api.stripe.com")) {
      if (options.stripeFailure) return Promise.resolve(response({ error: "unavailable" }, 503));
      const live = url.includes("sub_live");
      return Promise.resolve(response({ id: live ? "sub_live" : "sub_test", livemode: live, status: method === "DELETE" ? "canceled" : "active", metadata: { owner: options.mismatch ? "someone-else" : owner } }));
    }
    if (url.includes("/logout")) return Promise.resolve(response(null, 204));
    if (url.includes("/admin/users")) return Promise.resolve(response({}, options.deleteFailure ? 503 : 200));
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;
  return { request, calls };
}
test("deletion preflight allows the real web origin and does no work", async () => {
  const f = fake();
  const res = await createDeleteAccountHandler(config, f.request)(new Request("https://test.invalid", { method: "OPTIONS", headers: { Origin: "https://www.betwithgary.ai" } }));
  assertEquals(res.status, 204); assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://www.betwithgary.ai"); assertEquals(f.calls.length, 0);
});
test("unauthenticated deletion cannot touch database or Stripe", async () => {
  const f = fake({ authFailure: true }); const res = await createDeleteAccountHandler(config, f.request)(call());
  assertEquals(res.status, 401); assertEquals(f.calls.length, 1);
});
test("client-supplied owner is ignored; all subscription modes cancel before auth deletion", async () => {
  const f = fake({ rows: [
    { stripe_subscription_id: "sub_live", livemode: true },
    { stripe_subscription_id: "sub_live", livemode: true },
    { stripe_subscription_id: "sub_test", livemode: false },
  ] });
  const res = await createDeleteAccountHandler(config, f.request)(call('{"user_id":"someone-else","subscription_id":"sub_victim"}'));
  assertEquals(res.status, 200); assertEquals((await res.json()).canceled_subscriptions, 2);
  const cancels = f.calls.filter((c) => c.url.includes("api.stripe.com") && c.method === "DELETE");
  assertEquals(cancels.length, 2); assertEquals(cancels[0].authorization, "Bearer live"); assertEquals(cancels[1].authorization, "Bearer test");
  assertEquals(cancels.every((c) => c.url.includes("invoice_now=false&prorate=false")), true);
  assertEquals(f.calls.at(-1)?.url.endsWith(`/admin/users/${owner}`), true);
  assertEquals(f.calls.at(-2)?.url.endsWith("/logout?scope=global"), true);
  assertEquals(f.calls.some((c) => c.url.includes("someone-else") || c.url.includes("sub_victim")), false);
});
test("Stripe verification failure preserves account and clears deletion intent for retry", async () => {
  const f = fake({ rows: [{ stripe_subscription_id: "sub_live", livemode: true }], stripeFailure: true });
  const res = await createDeleteAccountHandler(config, f.request)(call());
  assertEquals(res.status, 503); assertEquals((await res.json()).signed_out, false);
  assertEquals(f.calls.some((c) => c.url.includes("/admin/users") || c.url.includes("/logout")), false);
  assertEquals(f.calls.at(-1)?.url.includes("/account_deletion_requests?user_id=eq."), true);
});
test("conflicting Stripe owner refuses cancellation", async () => {
  const f = fake({ rows: [{ stripe_subscription_id: "sub_live", livemode: true }], mismatch: true });
  const res = await createDeleteAccountHandler(config, f.request)(call());
  assertEquals(res.status, 503);
  assertEquals(f.calls.some((c) => c.url.includes("api.stripe.com") && c.method === "DELETE"), false);
});
test("missing billing key preserves account", async () => {
  const f = fake({ rows: [{ stripe_subscription_id: "sub_live", livemode: true }] });
  const res = await createDeleteAccountHandler({ ...config, stripeLiveKey: undefined }, f.request)(call());
  assertEquals(res.status, 503); assertEquals(f.calls.some((c) => c.url.includes("/admin/users")), false);
});
test("auth deletion failure reports reauthentication after successful global signout", async () => {
  const f = fake({ deleteFailure: true });
  const res = await createDeleteAccountHandler(config, f.request)(call());
  assertEquals(res.status, 503); assertEquals((await res.json()).signed_out, true);
});
test("account analytics cleanup uses only authenticated identity before auth deletion", async () => {
  const f = fake(); const res = await createDeleteAccountHandler(config, f.request)(call('{"installation_id":"victim","identity":"victim"}'));
  assertEquals(res.status, 200);
  const removed = f.calls.filter((c) => c.url.includes("/app_events"));
  assertEquals(removed.length, 1); assertEquals(removed[0].method, "DELETE");
  assertEquals(removed[0].url.endsWith(`identity=eq.${owner}`), true);
  assertEquals(f.calls.some((c) => c.url.includes("victim")), false);
});
test("analytics cleanup failure does not claim deletion or revoke account session", async () => {
  const f = fake({ analyticsFailure: true }); const res = await createDeleteAccountHandler(config, f.request)(call());
  assertEquals(res.status, 503);
  assertEquals(f.calls.some((c) => c.url.includes("/admin/users") || c.url.includes("/logout")), false);
});
test("Apple accounts receive manual revocation guidance after successful deletion only", async () => {
  const f = fake({ apple: true }); const res = await createDeleteAccountHandler(config, f.request)(call());
  const body = await res.json();
  assertEquals(body.ok, true); assertEquals(body.apple_revocation_required, true);
  assertEquals(body.apple_revocation_url, "https://support.apple.com/en-us/102571");
  const other = await createDeleteAccountHandler(config, fake().request)(call());
  assertEquals((await other.json()).apple_revocation_required, false);
});
