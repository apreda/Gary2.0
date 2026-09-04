import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkoutPlan, subscriptionState, verifyStripeSignature } from "./billing.ts";

test("single, bundle and All-Access match the displayed prices", () => {
  assert.equal(checkoutPlan({ leagues: ["MLB"] }).amount, 999);
  assert.equal(checkoutPlan({ leagues: ["MLB", "NFL"] }).amount, 1799);
  assert.equal(checkoutPlan({ leagues: ["MLB", "NFL", "NCAAF"] }).amount, 2499);
  assert.equal(checkoutPlan({ plan: "ALL" }).amount, 2999);
  assert.deepEqual(checkoutPlan({ plan: "ALL_ANNUAL" }), { sports: ["ALL"], amount: 17900, interval: "year", pass: "annual", trial: 7, name: "Gary All-Access Winners Pass" });
});
test("duplicates are not charged twice and retired sports cannot be sold", () => {
  assert.equal(checkoutPlan({ leagues: ["mlb", "MLB"] }).amount, 999);
  for (const leagues of [[], ["NHL"], ["NCAAB"], ["MLB", "NFL", "NCAAF", "NBA"], [null], "MLB"]) assert.throws(() => checkoutPlan({ leagues }));
});
test("only active or trialing subscriptions grant access", () => {
  for (const status of ["active", "trialing"]) assert.equal(subscriptionState({ status }).status, "active");
  for (const status of ["incomplete", "incomplete_expired", "unpaid", "past_due", "paused"]) assert.equal(subscriptionState({ status }).status, "inactive");
  assert.equal(subscriptionState({ status: "canceled" }).status, "canceled");
});
test("cancel at period end retains paid time and exposes the end date", () => {
  const s = subscriptionState({ status: "active", cancel_at_period_end: true, current_period_end: 1800000000, customer: "cus_owner" });
  assert.equal(s.status, "active"); assert.equal(s.cancel_at_period_end, true);
  assert.equal(s.expires_at, "2027-01-15T08:00:00.000Z"); assert.equal(s.stripe_customer_id, "cus_owner");
});
test("new Stripe item periods use earliest expiration and handle empty items", () => {
  assert.equal(subscriptionState({ items: { data: [{ current_period_end: 1800000000 }, { current_period_end: 1800001000 }] } }).expires_at, "2027-01-15T08:00:00.000Z");
  assert.equal(subscriptionState({ items: { data: [] } }).expires_at, null);
});
async function signature(secret: string, body: string, t: number) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
test("signature accepts rotation and multiple v1 entries, rejects tampering/replay", async () => {
  const body = '{"type":"checkout.session.completed"}', t = 1800000000;
  const good = await signature("test-signing-secret", body, t);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${"a".repeat(64)},v1=${good}`, ["old-secret", "test-signing-secret"], t), true);
  assert.equal(await verifyStripeSignature(body + " ", `t=${t},v1=${good}`, ["test-signing-secret"], t), false);
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${good}`, ["test-signing-secret"], t + 301), false);
  assert.equal(await verifyStripeSignature(body, `t=NaN,v1=${good}`, ["test-signing-secret"], t), false);
  assert.equal(await verifyStripeSignature(body, null, ["test-signing-secret"], t), false);
});
