export type HTTP = typeof fetch;
export function trialDays(availableDays: number, hasPriorSubscription: boolean): number {
  return hasPriorSubscription ? 0 : availableDays;
}

export async function checkoutAttempt(customer: string, owner: string, live: boolean, sports: string[], pass: string, key: string, request: HTTP): Promise<{ session: any | null; previous: string }> {
  // Stripe returns newest first. Open attempts are reused; an expired or
  // completed attempt supplies the next idempotency generation. Wall-clock
  // buckets could create two checkouts for simultaneous requests at a boundary.
  for (let cursor: string | undefined; ;) {
    const query = new URLSearchParams({ customer, limit: "100" });
    if (cursor) query.set("starting_after", cursor);
    const response = await request(`https://api.stripe.com/v1/checkout/sessions?${query}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error("Existing checkout could not be verified");
    const page = await response.json();
    for (const session of page.data ?? []) {
      if (session.client_reference_id !== owner || session.livemode !== live || session.metadata?.pass !== pass ||
        session.metadata?.sports?.split(",").sort().join(",") !== [...sports].sort().join(",")) continue;
      return { session: session.status === "open" && session.url ? session : null, previous: session.id };
    }
    if (!page.has_more) return { session: null, previous: "first" };
    const next = page.data?.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Checkout session pagination failed");
    cursor = next;
  }
}

export async function expireSession(id: string, key: string, request: HTTP): Promise<any> {
  const url = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`;
  const headers = { Authorization: `Bearer ${key}` };
  const response = await request(`${url}/expire`, { method: "POST", headers });
  if (response.ok) return response.json();
  // Payment can complete at the same instant. Return that completed session
  // so deletion can cancel its subscription before removing the account.
  const current = await request(url, { headers });
  if (!current.ok) throw new Error("Checkout session could not be closed");
  const session = await current.json();
  if (!["expired", "complete"].includes(session.status)) throw new Error("Checkout session remains open");
  return session;
}

export async function closeOwnedSessions(owner: string, live: boolean, key: string, tracked: string[], request: HTTP, keepSessionId?: string, beforeExpire?: () => Promise<void>): Promise<string[]> {
  const found = new Map<string, any>();
  // Legacy clients made sessions before session tracking existed. Stripe has
  // no client_reference_id list filter, so filter its paginated open sessions
  // by that exact owner. This also catches sessions opened in another tab.
  for (let cursor: string | undefined; ;) {
    const query = new URLSearchParams({ status: "open", limit: "100" });
    if (cursor) query.set("starting_after", cursor);
    const response = await request(`https://api.stripe.com/v1/checkout/sessions?${query}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error("Open checkout sessions could not be verified");
    const page = await response.json();
    for (const session of page.data ?? []) if (session.client_reference_id === owner && session.livemode === live) found.set(session.id, session);
    if (!page.has_more) break;
    const next = page.data?.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Checkout session pagination failed");
    cursor = next;
  }
  for (const id of tracked) if (!found.has(id)) {
    const response = await request(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error("Saved checkout session could not be verified");
    const session = await response.json();
    if (session.client_reference_id !== owner || session.livemode !== live) throw new Error("Checkout session ownership mismatch");
    found.set(id, session);
  }
  const subscriptions = new Set<string>();
  for (let session of found.values()) {
    if (session.id === keepSessionId) continue;
    if (session.status === "open") {
      await beforeExpire?.();
      session = await expireSession(session.id, key, request);
    }
    if (!["complete", "expired"].includes(session.status)) throw new Error("Checkout session could not be closed");
    const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (typeof id === "string" && /^sub_[A-Za-z0-9]+$/.test(id)) subscriptions.add(id);
  }
  return [...subscriptions];
}

export async function cancelUnavailableOwnerSubscription(
  subscription: any, supabaseURL: string, serviceKey: string, stripeKey: string, request: HTTP,
): Promise<any> {
  // Only our canonical subscription metadata proves account ownership. Old
  // payment-link client_reference_id values were sometimes installation IDs.
  const owner = subscription.metadata?.owner;
  if (typeof owner !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)) return subscription;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const user = await request(`${supabaseURL}/auth/v1/admin/users/${encodeURIComponent(owner)}`, { headers });
  let unavailable = user.status === 404;
  if (!user.ok && !unavailable) throw new Error("Subscription owner lookup unavailable");
  if (!unavailable) {
    const deletion = await request(`${supabaseURL}/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(owner)}&select=user_id`, { headers });
    if (!deletion.ok) throw new Error("Account deletion status unavailable");
    unavailable = (await deletion.json()).length > 0;
  }
  if (!unavailable || ["canceled", "incomplete_expired"].includes(subscription.status)) return subscription;
  const url = `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscription.id)}`;
  const cancel = await request(`${url}?invoice_now=false&prorate=false`, { method: "DELETE", headers: { Authorization: `Bearer ${stripeKey}` } });
  if (cancel.ok) {
    const canceled = await cancel.json();
    if (canceled.status === "canceled") return canceled;
  }
  const reread = await request(url, { headers: { Authorization: `Bearer ${stripeKey}` } });
  if (!reread.ok) throw new Error("Deleted account subscription cancellation failed");
  const latest = await reread.json();
  if (latest.status !== "canceled") throw new Error("Deleted account subscription remains billable");
  return latest;
}

export async function customerSubscriptions(customer: string, key: string, request: HTTP): Promise<any[]> {
  const subscriptions: any[] = [];
  for (let cursor: string | undefined; ;) {
    const query = new URLSearchParams({ customer, status: "all", limit: "100" });
    if (cursor) query.set("starting_after", cursor);
    const response = await request(`https://api.stripe.com/v1/subscriptions?${query}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error("Existing subscriptions could not be verified");
    const page = await response.json();
    subscriptions.push(...(page.data ?? []));
    if (!page.has_more) return subscriptions;
    const next = page.data?.at(-1)?.id;
    if (!next || next === cursor) throw new Error("Subscription pagination failed");
    cursor = next;
  }
}
