import { test } from "node:test";
import { strict as assert } from "node:assert";

// Import both real entrypoints with a fresh module identity and credentials
// that cannot reach production. Every network operation is intercepted.
let importNumber = 0;
const serviceKey = "fixture-service-key";
const game = {
  id: 99, status: "STATUS_FINAL", date: "2026-09-06T20:00:00Z",
  home_team: { name: "White Sox" }, away_team: { name: "Red Sox" },
  home_team_data: { runs: 0 }, away_team_data: { runs: 5 },
};
async function fixture(t, endpoint, options = {}) {
  let handler;
  const reads = [];
  const writes = [];
  const background = [];
  const env = {
    SUPABASE_URL: "https://fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    BALLDONTLIE_API_KEY: "fixture-provider-key",
    ...options.env,
  };
  const originals = { Deno: globalThis.Deno, EdgeRuntime: globalThis.EdgeRuntime, fetch: globalThis.fetch };
  Object.assign(globalThis, {
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    EdgeRuntime: { waitUntil: task => { background.push(task); } },
    fetch: async (input, init = {}) => {
      const url = new URL(input);
      const request = { path: url.pathname, method: init.method ?? "GET" };
      if (request.method !== "GET") {
        writes.push(request);
        throw new Error("Unexpected fixture mutation");
      }
      reads.push(request);
      if (!options.allowReads) throw new Error("Unauthorized request reached a dependency");
      if (url.hostname === "api.balldontlie.io") {
        if (url.pathname === "/mlb/v1/games") return Response.json({ data: options.evidence ? [game] : [] });
        if (url.pathname === "/mlb/v1/stats") return Response.json({ data: [] });
      }
      if (url.hostname === "fixture.invalid") {
        if (["/rest/v1/daily_picks", "/rest/v1/winners_board", "/rest/v1/prop_picks", "/rest/v1/prop_results", "/rest/v1/user_bets"].includes(url.pathname)) return Response.json([]);
      }
      throw new Error(`Unexpected fixture read: ${url.hostname}${url.pathname}`);
    },
  });
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  await import(`../${endpoint}/index.ts?authorization-fixture=${++importNumber}`);
  return { handler, reads, writes, background };
}

for (const endpoint of ["grade-results", "grade-props"]) {
  for (const [label, authorization] of [
    ["missing", undefined], ["anon", "Bearer fixture-anon-key"],
    ["user JWT", "Bearer fixture-user-jwt"], ["wrong scheme", `Basic ${serviceKey}`],
    ["service prefix", `Bearer ${serviceKey}-suffix`],
  ]) {
    test(`${endpoint} denies ${label} before all reads, writes, models and push work`, async t => {
      const f = await fixture(t, endpoint);
      for (const method of ["GET", "POST"]) {
        for (const query of ["", "?date=2026-09-06", "?dry=1&force=1&date=2026-09-06", "?winners=1&date=2026-09-06"]) {
          const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}${query}`, {
            method, headers: authorization ? { Authorization: authorization } : {},
          }));
          assert.equal(response.status, 403);
          assert.deepEqual(await response.json(), { ok: false, error: "Service authorization required" });
        }
      }
      assert.deepEqual(f.reads, []);
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.background, []);
    });
  }
  test(`${endpoint} cannot bypass authorization with an apikey header`, async t => {
    const f = await fixture(t, endpoint);
    const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}`, { headers: { apikey: serviceKey } }));
    assert.equal(response.status, 403);
    assert.deepEqual(f.reads, []);
  });
  for (const missingKey of [undefined, ""]) {
    test(`${endpoint} fails closed when the service credential is ${String(missingKey)}`, async t => {
      const f = await fixture(t, endpoint, { env: { SUPABASE_SERVICE_ROLE_KEY: missingKey, BALLDONTLIE_API_KEY: undefined } });
      const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}`, { headers: { Authorization: `Bearer ${serviceKey}` } }));
      assert.equal(response.status, 403);
      assert.deepEqual(f.reads, []);
    });
  }
  test(`${endpoint} accepts the exact service bearer used by the cron POST`, async t => {
    const f = await fixture(t, endpoint, { allowReads: true });
    const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}?date=2026-09-06`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}` } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.ok(f.reads.some(r => r.path === `/rest/v1/${endpoint === "grade-results" ? "daily_picks" : "prop_picks"}`));
    assert.deepEqual(f.writes, []);
  });
}

test("legacy anon GET evidence returns final-game evidence with only approved read dependencies", async t => {
  const f = await fixture(t, "grade-results", { allowReads: true, evidence: true });
  const response = await f.handler(new Request("https://fixture.invalid/grade-results?evidence=1&date=2026-09-06&matchup=Red%20Sox%20%40%20White%20Sox&force=1", { headers: { Authorization: "Bearer fixture-anon-key" } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.final_score, "5-0");
  assert.match(body.evidence, /5/);
  assert.deepEqual(f.reads.map(r => r.path).sort(), ["/mlb/v1/games", "/mlb/v1/games", "/mlb/v1/stats", "/rest/v1/prop_results"].sort());
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.background, []);
});

for (const [endpoint, method, query] of [
    ["grade-results", "POST", "evidence=1"],
    ["grade-results", "GET", "evidence=1&winners=1"],
    ["grade-results", "GET", "winners=1&evidence=1"],
    ["grade-results", "GET", "evidence=0&evidence=1"],
    ["grade-props", "GET", "evidence=1"],
  ]) {
  test(`public evidence never authorizes ${method} ${endpoint}?${query}`, async t => {
    const f = await fixture(t, endpoint);
    const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}?${query}&date=2026-09-06`, { method, headers: { Authorization: "Bearer fixture-anon-key" } }));
    assert.equal(response.status, 403);
    assert.deepEqual(f.reads, []);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.background, []);
  });
}
