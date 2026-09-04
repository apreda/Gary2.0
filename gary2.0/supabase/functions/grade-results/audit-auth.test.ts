import { test } from "node:test";
import { strictEqual } from "node:assert";
import { isServiceAudit } from "./audit-auth.ts";
test("current Winners audit accepts only the configured service credential", () => {
  for (const authorization of [undefined, "Bearer anon", "Bearer user-jwt", "service", "Bearer service-suffix"]) {
    strictEqual(isServiceAudit(new Request("https://example.invalid", { headers: authorization ? { authorization } : {} }), "service"), false);
  }
  strictEqual(isServiceAudit(new Request("https://example.invalid", { headers: { authorization: "Bearer service" } }), "service"), true);
  strictEqual(isServiceAudit(new Request("https://example.invalid", { headers: { authorization: "Bearer " } }), ""), false);
});
