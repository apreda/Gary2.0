import { assert, assertEquals } from "jsr:@std/assert@1";
import { runTool } from "./brain.ts";

const dbWith = (games: any[]) => ({ get: async () => [], rpc: async () => games, userRpc: async () => null }) as any;

Deno.test("team_games keeps the newest games of this season and leaves last season out", async () => {
  // The function returns newest first, then last season's games.
  const season = Array.from({ length: 14 }, (_, i) => ({ d: `2026-10-${String(30 - i).padStart(2, "0")}`, cur: true }));
  const out = await runTool(dbWith([...season, { d: "2026-01-04", cur: false }]), "2026-11-06", "team_games", { league: "NFL", team: "Chiefs" });
  const days = JSON.parse(out).map((g: any) => g.d);
  assertEquals(days.length, 12);
  assertEquals(days[0], "2026-10-30");
  assert(!days.includes("2026-01-04"));
});
