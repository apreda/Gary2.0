import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { runTool } from "./brain.ts";

const dbWith = (games: any[]) => ({ get: async () => [], rpc: async () => games, userRpc: async () => null }) as any;

Deno.test("prop_board marks a bet he's already on, so he can't call it a new idea", async () => {
  const props = [{ label: "REBOUNDS", line: "10.5", odds: "-110", rate: "5/8" }];
  const db = {
    get: async (path: string) => {
      if (path.startsWith("daily_slate")) return [{ date: "2026-11-06", league: "NBA", away_team: "Oklahoma City Thunder", home_team: "Memphis Grizzlies", bdl_game_id: 1 }];
      if (path.startsWith("player_insight_cards")) return [{ player_name: "Isaiah Hartenstein", team_abbr: "OKC", props }, { player_name: "Ty Jerome", team_abbr: "MEM", props }];
      return [{ picks: [{ player: "Isaiah Hartenstein", bet: "over", prop: "rebounds 10.5" }] }];
    },
    rpc: async () => ({ today: [] }),
    userRpc: async () => null,
  } as any;
  const out = await runTool(db, "2026-11-06", "prop_board", { team: "Grizzlies" });
  assertStringIncludes(out, "Isaiah Hartenstein (OKC) [already your bet: over rebounds 10.5]: rebounds 10.5 over -110, cleared 5/8");
  assertStringIncludes(out, "Ty Jerome (MEM): rebounds");
});

Deno.test("stats says it can't find a player instead of handing back someone with the same last name", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: 1, first_name: "Anthony", last_name: "Simpson", position: "WR" }] }))) as any;
  try {
    const db = { get: async () => [], rpc: async () => null, userRpc: async () => null } as any;
    const out = await runTool(db, "2026-11-06", "stats", { league: "NCAAF", kind: "player_games", player: "Ty Simpson" });
    assertStringIncludes(out, "Couldn't find");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("team_games keeps the newest games of this season and leaves last season out", async () => {
  // The function returns newest first, then last season's games.
  const season = Array.from({ length: 14 }, (_, i) => ({ d: `2026-10-${String(30 - i).padStart(2, "0")}`, cur: true }));
  const out = await runTool(dbWith([...season, { d: "2026-01-04", cur: false }]), "2026-11-06", "team_games", { league: "NFL", team: "Chiefs" });
  const days = JSON.parse(out).map((g: any) => g.d);
  assertEquals(days.length, 12);
  assertEquals(days[0], "2026-10-30");
  assert(!days.includes("2026-01-04"));
});
