import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUCTION_OUTDATED_MS,
  BAZAAR_OUTDATED_MS,
  nextMarketChangeAt,
} from "../lib/market-freshness";

test("market clock advances at expiry and age boundaries rather than polling", () => {
  const now = 1000000;
  assert.equal(nextMarketChangeAt(now), null);
  assert.equal(nextMarketChangeAt(now, now + 300000, now, now), now + 300000);
  assert.equal(
    nextMarketChangeAt(now + 300000, now + 300000, now, now),
    now + BAZAAR_OUTDATED_MS + 1,
  );
  assert.equal(
    nextMarketChangeAt(now + BAZAAR_OUTDATED_MS + 1, now + 300000, now, now),
    now + AUCTION_OUTDATED_MS + 1,
  );
  assert.equal(
    nextMarketChangeAt(now + AUCTION_OUTDATED_MS + 1, now + 300000, now, now),
    null,
  );
});
