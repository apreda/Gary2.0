import type { HTTP } from "./lifecycle.ts";

type Slot = { attempt_id: string | null; stripe_form: string | null; session_id: string | null };
type Config = { url: string; serviceKey: string; owner: string; live: boolean; stripeKey: string };
export class CheckoutBusy extends Error {}

/** A lease alone is insufficient: its replacement must recover any in-flight
 * Stripe request using the old immutable form and idempotency key first. */
export class CheckoutReservation {
  private slot: Slot = { attempt_id: null, stripe_form: null, session_id: null };
  private readonly token = crypto.randomUUID();
  private config: Config;
  private request: HTTP;
  private constructor(config: Config, request: HTTP) { this.config = config; this.request = request; }

  static async acquire(config: Config, request: HTTP): Promise<CheckoutReservation> {
    const reservation = new CheckoutReservation(config, request);
    const slot = await reservation.rpc("acquire_checkout_reservation");
    if (!slot) throw new CheckoutBusy("Another checkout request is in progress. Please try again in a moment.");
    reservation.slot = slot;
    return reservation;
  }
  private async rpc(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const { url, serviceKey, owner, live } = this.config;
    const response = await this.request(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_owner: owner, p_livemode: live, p_token: this.token, ...args }),
    });
    if (!response.ok) throw new CheckoutBusy("Checkout could not be reserved. Please try again.");
    return response.status === 204 ? null : response.json();
  }
  private async record(attempt: string, form: string, session: string | null): Promise<void> {
    this.slot = await this.rpc("record_checkout_reservation", { p_attempt_id: attempt, p_form: form, p_session_id: session });
  }
  async assertLease(): Promise<void> {
    this.slot = await this.rpc("touch_checkout_reservation");
  }
  async release(): Promise<void> { await this.rpc("release_checkout_reservation"); }
  private async stripe(path: string, init?: RequestInit): Promise<any> {
    const response = await this.request(`https://api.stripe.com/v1/${path}`, {
      ...init, headers: { Authorization: `Bearer ${this.config.stripeKey}`, ...init?.headers },
    });
    if (!response.ok) throw new Error("Checkout operation could not be confirmed");
    return response.json();
  }
  private validate(session: any): any {
    if (!session.id || session.client_reference_id !== this.config.owner || session.livemode !== this.config.live) throw new Error("Checkout owner mismatch");
    return session;
  }
  async recover(): Promise<any | null> {
    if (!this.slot.attempt_id || !this.slot.stripe_form) return null;
    if (this.slot.session_id) return this.validate(await this.stripe(`checkout/sessions/${encodeURIComponent(this.slot.session_id)}`));
    // A response can be lost after Stripe commits. Locate the attempt even
    // after Stripe's 24-hour idempotency retention window has elapsed.
    const customer = new URLSearchParams(this.slot.stripe_form).get("customer");
    for (let cursor: string | undefined; ;) {
      const query = new URLSearchParams({ customer: customer ?? "", limit: "100" });
      if (cursor) query.set("starting_after", cursor);
      const page = await this.stripe(`checkout/sessions?${query}`);
      const existing = (page.data ?? []).find((session: any) => session.metadata?.gary_attempt === this.slot.attempt_id && session.client_reference_id === this.config.owner && session.livemode === this.config.live);
      if (existing) {
        await this.record(this.slot.attempt_id, this.slot.stripe_form, existing.id);
        return this.validate(existing);
      }
      if (!page.has_more) break;
      const next = page.data?.at(-1)?.id;
      if (!next || next === cursor) throw new Error("Checkout recovery pagination failed");
      cursor = next;
    }
    return this.complete();
  }
  private async complete(): Promise<any> {
    const attempt = this.slot.attempt_id!, form = this.slot.stripe_form!;
    await this.assertLease();
    const session = this.validate(await this.stripe("checkout/sessions", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `gary-reserved-${attempt}` }, body: form,
    }));
    await this.record(attempt, form, session.id);
    return session;
  }
  async open(form: URLSearchParams): Promise<any> {
    const attempt = crypto.randomUUID();
    const stored = new URLSearchParams(form);
    stored.set("metadata[gary_attempt]", attempt);
    await this.record(attempt, stored.toString(), null);
    return this.complete();
  }
  async adopt(session: any, form: URLSearchParams): Promise<void> {
    if (this.slot.session_id === session.id) { await this.assertLease(); return; }
    await this.record(crypto.randomUUID(), form.toString(), this.validate(session).id);
  }
}
