import test from "node:test";
import { deepStrictEqual, equal } from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { notifySettles, type UserSettleBatch } from "./push.ts";

test("actual settlement sender attaches each recipient's account to its Book destination", async () => {
  const first = "00000000-0000-4000-8000-000000000001";
  const second = "00000000-0000-4000-8000-000000000002";
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const originalFetch = globalThis.fetch;
  const previousDeno = Object.getOwnPropertyDescriptor(globalThis, "Deno");
  Object.defineProperty(globalThis, "Deno", { configurable: true, value: { env: { get: (name: string) => ({
    FIREBASE_PROJECT_ID: "fixture-project", FIREBASE_CLIENT_EMAIL: "fixture@example.invalid", FIREBASE_PRIVATE_KEY: key,
  } as Record<string, string>)[name] } } });
  const messages: Array<Record<string, any>> = [];
  let reads = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://fixture.invalid/rest/v1/push_tokens?")) {
      reads++;
      equal(new URL(url).searchParams.get("active"), "eq.true");
      return Response.json([
        { device_token: "first-phone", identity_id: first },
        { device_token: "second-phone", identity_id: second },
        { device_token: "first-tablet", identity_id: first },
      ]);
    }
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fixture-access" });
    equal(url, "https://fcm.googleapis.com/v1/projects/fixture-project/messages:send");
    const message = JSON.parse(String(init?.body)).message;
    messages.push(message);
    return Response.json({ name: "fixture-receipt" });
  }) as typeof fetch;
  try {
    const batches = new Map<string, UserSettleBatch>([
      [first, { events: [{ kind: "tail", status: "won", units: 1.2, streak_pick: true }], streakAfter: { current: 3 } }],
      [second, { events: [{ kind: "fade", status: "lost", units: -1, streak_pick: false }], streakAfter: null }],
    ]);
    deepStrictEqual(await notifySettles("https://fixture.invalid", {}, batches), { sent: 2, skipped: 0, failed: 0 });
    equal(reads, 1);
    equal(messages.length, 3);
    for (const message of messages) {
      const expected = message.token.startsWith("first-") ? first : second;
      deepStrictEqual(message.data, { destination: "book", book_scope: "you", account_id: expected });
      equal(message.notification.body, expected === first ? "Your tail won: +1.20u. 3-win streak." : "Your fade lost: -1.00u.");
      equal(Object.values(message.data).every(value => typeof value === "string"), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDeno) Object.defineProperty(globalThis, "Deno", previousDeno);
    else Reflect.deleteProperty(globalThis, "Deno");
  }
});
