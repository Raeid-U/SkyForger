import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBazaar } from "../../lib/bazaar";

// Opt-in network check, separate from the deterministic unit test suite.
test("public Hypixel Bazaar endpoint works without an API key", async () => {
  const response = await fetch("https://api.hypixel.net/v2/skyblock/bazaar", {
    signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" },
  });
  assert.equal(response.status, 200);
  const snapshot = parseBazaar(await response.json());
  const count = Object.keys(snapshot.products).length;
  assert.ok(count > 0, "Expected populated Bazaar products");
  console.log(`Validated ${count} products; market timestamp ${new Date(snapshot.lastUpdated).toISOString()}`);
});
