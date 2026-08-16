// Run: node --test gary2.0/supabase/functions/grade-results/resultIdentity.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  matchedStoredGameId,
  normalizedResultSport,
  propResultIdentityKey,
  storedExactGameId,
} from "./resultIdentity.ts";

test("stored exact game ids accept current game_id and legacy bdl_game_id shapes", () => {
  assert.equal(storedExactGameId({ game_id: 5059640 }), "5059640");
  assert.equal(storedExactGameId({ bdl_game_id: "1393562" }), "1393562");
  assert.equal(storedExactGameId({ game_id: "  ", bdl_game_id: 1393563 }), "1393563");
});

test("matched stored identity fails closed on missing or conflicting provider ids", () => {
  assert.equal(matchedStoredGameId({ game_id: "5059640" }, 5059640), "5059640");
  assert.throws(() => matchedStoredGameId({}, 5059640), /missing an exact game id/i);
  assert.throws(() => matchedStoredGameId({ game_id: "5059640" }, 5059641), /does not match/i);
});

test("result sport labels are normalized once for persistence", () => {
  assert.equal(normalizedResultSport(" mlb "), "MLB");
  assert.equal(normalizedResultSport("MLB HR"), "MLB HR");
  assert.equal(normalizedResultSport(null), null);
});

test("prop exact key mirrors game, sport, player, market, side, and line", () => {
  const base = {
    gameDate: "2026-08-16", sport: "mlb", gameId: 5059640,
    playerName: "Royce Lewis", propType: "total_bases", bet: "over", line: "1.5",
  };
  const key = propResultIdentityKey(base);
  assert.equal(key, propResultIdentityKey({ ...base, sport: "MLB", line: 1.5 }));
  assert.notEqual(key, propResultIdentityKey({ ...base, gameId: 5059641 }));
  assert.notEqual(key, propResultIdentityKey({ ...base, bet: "under" }));
  assert.notEqual(key, propResultIdentityKey({ ...base, line: 2.5 }));
  assert.equal(propResultIdentityKey({ ...base, gameId: null }), null);
  assert.equal(propResultIdentityKey({ ...base, line: null }), null);
  assert.notEqual(propResultIdentityKey({ ...base, line: 0 }), null);
});
