import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBazaar } from "../lib/bazaar";

const book = { product_id: "REFINED_MITHRIL", buy_summary: [{ amount: 10, pricePerUnit: 100, orders: 2 }], sell_summary: [{ amount: 5, pricePerUnit: 110, orders: 1 }] };
test("preserves order-book sides and market timestamp", () => {
  const parsed = parseBazaar({ success: true, lastUpdated: 1700000000000, products: { REFINED_MITHRIL: book } });
  assert.equal(parsed.products.REFINED_MITHRIL.buy_summary[0].pricePerUnit, 100);
  assert.equal(parsed.products.REFINED_MITHRIL.sell_summary[0].pricePerUnit, 110);
  assert.equal(parsed.lastUpdated, 1700000000000);
});
test("rejects failed or malformed upstream responses", () => {
  for (const value of [{ success: false }, "<html>blocked</html>", { success: true, products: {} }]) assert.throws(() => parseBazaar(value));
});
test("rejects negative prices and invalid quantities", () => {
  for (const order of [{ amount: 1, pricePerUnit: -1, orders: 1 }, { amount: 0, pricePerUnit: 1, orders: 1 }]) {
    assert.throws(() => parseBazaar({ success: true, lastUpdated: 1700000000000, products: { X: { ...book, buy_summary: [order] } } }));
  }
});
test("retains empty books rather than inventing a zero price", () => {
  const parsed = parseBazaar({ success: true, lastUpdated: 1700000000000, products: { X: { ...book, buy_summary: [], sell_summary: [] } } });
  assert.deepEqual(parsed.products.X.buy_summary, []);
});
