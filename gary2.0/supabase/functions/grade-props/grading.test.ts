import test from "node:test";
import assert from "node:assert/strict";
import { gradePropResult } from "./grading.ts";

test("numeric over/under props push when actual equals the line", () => {
  assert.equal(gradePropResult(5, 5, "over"), "push");
  assert.equal(gradePropResult("5", "5.0", " UNDER "), "push");
  assert.equal(gradePropResult(6, 5, "over"), "won");
  assert.equal(gradePropResult(4, 5, "under"), "won");
});

test("binary prop sides preserve yes, anytime, and no semantics", () => {
  assert.equal(gradePropResult(1, 0.5, "yes"), "won");
  assert.equal(gradePropResult(0, 0.5, "yes"), "lost");
  assert.equal(gradePropResult(2, 0.5, "anytime"), "won");
  assert.equal(gradePropResult(0, 0.5, "no"), "won");
  assert.equal(gradePropResult(1, 0.5, "no"), "lost");
});

test("unknown directions and non-numeric evidence fail closed", () => {
  assert.equal(gradePropResult(3, 2.5, "lean under"), null);
  assert.equal(gradePropResult(3, 2.5, ""), null);
  assert.equal(gradePropResult(null, 2.5, "over"), null);
  assert.equal(gradePropResult(3, null, "over"), null);
});
