import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createScanHandler, normalizeScan, parseModelJSON } from "./handler.ts";

Deno.test("normalizeScan keeps only what a slip can prove", () => {
  const out = normalizeScan({
    sportsbook: "  DraftKings ",
    notes: "stake blurry",
    bets: [
      { description: " Chiefs -3.5 ", league: "nfl", market: "SPREAD", odds_american: -110.7, stake_dollars: 25.004, game_date: "2026-09-14", result: "won", legs: [] },
      { description: "3-leg SGP", league: "NBA", market: null, odds_american: 600, stake_dollars: 10, game_date: "2026-13-01", result: "maybe", legs: ["Luka over 29.5", "Mavs ML", " "] },
      { description: "", league: "MLB" },
      { description: "Bad odds", league: "XFL", market: "prop", odds_american: 50, stake_dollars: -5, game_date: null, result: null, legs: [] },
    ],
  });
  assertEquals(out.sportsbook, "DraftKings");
  assertEquals(out.notes, "stake blurry");
  assertEquals(out.bets.length, 3);
  assertEquals(out.bets[0], { description: "Chiefs -3.5", league: "NFL", market: "spread", odds_american: -110, stake_dollars: 25, game_date: "2026-09-14", result: "won", legs: [] });
  assertEquals(out.bets[1].market, "parlay");
  assertEquals(out.bets[1].game_date, null);
  assertEquals(out.bets[1].result, null);
  assertEquals(out.bets[1].legs, ["Luka over 29.5", "Mavs ML"]);
  assertEquals(out.bets[2].league, "OTHER");
  assertEquals(out.bets[2].odds_american, null);
  assertEquals(out.bets[2].stake_dollars, null);
});

Deno.test("parseModelJSON tolerates prose around the object", () => {
  assertEquals((parseModelJSON('Here you go: {"bets":[]} thanks') as { bets: unknown[] }).bets, []);
  let threw = false;
  try { parseModelJSON("no json here"); } catch { threw = true; }
  assert(threw);
});

function handlerWith(fetchImpl: typeof fetch) {
  return createScanHandler({ supabaseURL: "https://sb.test", anonKey: "anon", anthropicKey: "key", model: "claude-opus-5", fetch: fetchImpl });
}

Deno.test("scan flow: verifies the user, counts the scan, returns normalized bets, never writes a bet", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "11111111-2222-4333-8444-555555555555" }), { status: 200 });
    if (url.endsWith("/rpc/record_slip_scan")) {
      assertEquals((init?.headers as Record<string, string>).Authorization, "Bearer user-jwt");
      return new Response(JSON.stringify({ ok: true, used: 3, limit: 40 }), { status: 200 });
    }
    if (url.includes("api.anthropic.com")) {
      const body = JSON.parse(String(init?.body));
      assertEquals(body.output_config.format.type, "json_schema");
      assertEquals(body.messages[0].content[0].source.media_type, "image/png");
      return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ sportsbook: "FanDuel", notes: "", bets: [{ description: "Yankees ML", league: "MLB", market: "moneyline", odds_american: -150, stake_dollars: 50, game_date: null, result: null, legs: [] }] }) }] }), { status: 200 });
    }
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  const handler = handlerWith(fetchImpl);
  const res = await handler(new Request("https://fn.test/book-slip-scan", {
    method: "POST", headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: btoa("png-bytes"), media_type: "image/png" }),
  }));
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.ok, true);
  assertEquals(out.sportsbook, "FanDuel");
  assertEquals(out.bets[0].description, "Yankees ML");
  assertEquals(out.used, 3);
  assert(!calls.some((c) => c.includes("/rest/v1/user_bets")));
});

Deno.test("scan flow: no session, bad media, and the daily limit", async () => {
  const limited = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "11111111-2222-4333-8444-555555555555" }), { status: 200 });
    if (url.endsWith("/rpc/record_slip_scan")) return new Response(JSON.stringify({ message: "daily scan limit reached" }), { status: 400 });
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  const handler = handlerWith(limited);
  const noAuth = await handler(new Request("https://fn.test/x", { method: "POST", body: "{}" }));
  assertEquals(noAuth.status, 401);
  const badMedia = await handler(new Request("https://fn.test/x", {
    method: "POST", headers: { Authorization: "Bearer j" }, body: JSON.stringify({ image_base64: btoa("x"), media_type: "image/heic" }),
  }));
  assertEquals(badMedia.status, 400);
  const capped = await handler(new Request("https://fn.test/x", {
    method: "POST", headers: { Authorization: "Bearer j" }, body: JSON.stringify({ image_base64: btoa("x"), media_type: "image/jpeg" }),
  }));
  assertEquals(capped.status, 429);
});
