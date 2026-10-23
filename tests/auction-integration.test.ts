import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import { now, encoded, auction, snapshot } from "./fixtures/auctions";
import { auctionResponseSchema, binPriceReportSchema } from "../lib/auctions";
import { createAuctionPriceService, AuctionServiceError } from "../lib/server/auctions/service";
import { AuctionCollectionError } from "../lib/server/auctions/collector";
import { buildBinPriceReport } from "../lib/server/auctions/pricing";
import { createAuctionHandler } from "../pages/api/auctions";
import { marketQuote, marketQuoteDetails, rankRecipe, rankForgeRecipes } from "../lib/forge/pricing";
import { buildPlan } from "../lib/forge/planner";
import { defaultSettings } from "../lib/forge/settings";
import { recipeByOutput } from "../lib/forge/catalog";
import { isFlipOutput } from "../lib/forge/markets";

const settings = { ...defaultSettings, hotm: 10 };
const itemId = "mithril-necklace";
function report() { return buildBinPriceReport(snapshot([auction(1)]), now); }
function response() {
  const result = { code: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { result.headers[name] = value; return this; },
    status(code: number) { result.code = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  } as unknown as NextApiResponse;
  return { result, res };
}

test("shared response contract preserves reason codes and rejects malformed prices", () => {
  const data = report();
  assert.equal(binPriceReportSchema.parse(data).quotes.find((entry) => entry.itemId === itemId)!.warningCodes[0], "sparse-listings");
  const bad = { ...data, quotes: [{ ...data.quotes[0], unitPrice: -1 }] };
  assert.equal(binPriceReportSchema.safeParse(bad).success, false);
});

test("auction service coalesces simultaneous scans and reuses normalized cached listings", async () => {
  let calls = 0, at = now;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const get = createAuctionPriceService({ now: () => at, collect: async () => { calls++; await gate; return snapshot([auction(1)]); } });
  const first = get(), second = get();
  assert.equal(calls, 1);
  release();
  const results = await Promise.all([first, second]);
  assert.ok(results.every((result) => result.refresh.state === "fresh"));
  at += 1000;
  const cached = await get();
  assert.equal(calls, 1);
  assert.equal(cached.refresh.state, "cached");
  assert.equal(cached.report.evaluatedAt, at);
  auctionResponseSchema.parse(cached);
});

test("cached listings expire without re-scanning; the next valid offer becomes cheapest", async () => {
  let at = now, calls = 0;
  const get = createAuctionPriceService({ now: () => at, collect: async () => {
    calls++; return snapshot([auction(1, { starting_bid: 50, end: now + 1000 }), auction(2, { starting_bid: 100 })]);
  } });
  assert.equal((await get()).report.quotes.find((entry) => entry.itemId === itemId)!.unitPrice, 50);
  at += 1000;
  const next = (await get()).report.quotes.find((entry) => entry.itemId === itemId)!;
  assert.equal(next.unitPrice, 100);
  assert.equal(next.activeListings, 1);
  assert.equal(calls, 1);
});

test("refresh failures retain only still-fresh last-good data and impose a cooldown", async () => {
  let at = now, calls = 0;
  const get = createAuctionPriceService({ now: () => at, collect: async () => {
    calls++;
    if (calls > 1) throw new Error("offline");
    return snapshot([auction(1)]);
  } });
  await get();
  at += 60000;
  const fallback = await get();
  assert.equal(fallback.refresh.state, "refresh-failed");
  assert.equal(fallback.report.sourceUpdatedAt, now - 1000);
  await get(); assert.equal(calls, 2);
  at = now + 300000;
  await assert.rejects(get(), (error: unknown) => error instanceof AuctionServiceError);
});

test("rate limits are cached briefly without publishing a false no-listings result", async () => {
  let calls = 0;
  const get = createAuctionPriceService({ now: () => now, collect: async () => {
    calls++; throw new AuctionCollectionError("rate-limited", "upstream detail");
  } });
  for (let i = 0; i < 2; i++) await assert.rejects(get(), (error: unknown) => error instanceof AuctionServiceError && error.code === "rate-limited");
  assert.equal(calls, 1);
});

test("auction route validates method, preserves metadata, and bounds CDN caching by quote expiry", async () => {
  let calls = 0;
  const handler = createAuctionHandler(async () => {
    calls++; return { report: report(), refresh: { state: "cached", nextRefreshAt: now + 60000 } };
  }, () => now);
  const post = response(); await handler({ method: "POST" } as NextApiRequest, post.res);
  assert.equal(post.result.code, 405); assert.equal(calls, 0);
  const get = response(); await handler({ method: "GET" } as NextApiRequest, get.res);
  assert.equal(get.result.code, 200);
  assert.match(get.result.headers["Cache-Control"], /s-maxage=30/);
  assert.ok(!get.result.headers["Cache-Control"].includes("stale-while-revalidate"));
  auctionResponseSchema.parse(get.result.body);
  const expiresSoon = createAuctionHandler(async () => ({ report: { ...report(), expiresAt: now + 2000 }, refresh: { state: "cached", nextRefreshAt: now + 60000 } }), () => now);
  const near = response(); await expiresSoon({ method: "GET" } as NextApiRequest, near.res);
  assert.match(near.result.headers["Cache-Control"], /s-maxage=2/);
});

test("auction route failures return uncached, safe errors with retry timing", async () => {
  for (const code of ["unavailable", "rate-limited"] as const) {
    const handler = createAuctionHandler(async () => { throw new AuctionServiceError(code, 30); });
    const { result, res } = response(); await handler({ method: "GET" } as NextApiRequest, res);
    assert.equal(result.code, code === "rate-limited" ? 429 : 503);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(result.headers["Retry-After"], "30");
    assert.ok(!("report" in (result.body as object)));
  }
});

test("shared market pricing prioritizes manual overrides, rejects stale AH data, and propagates sparse metadata", () => {
  const data = report();
  const context = { report: data, now };
  const quote = marketQuoteDetails(itemId, 1, "sell", null, settings, context);
  assert.equal(quote.amount, 100);
  assert.ok(quote.warningCodes.includes("sparse-listings"));
  assert.ok(quote.warningCodes.includes("ah-fees-excluded"));
  assert.equal(quote.sourceUpdatedAt, data.sourceUpdatedAt);
  const stale = { report: data, now: now + 300000 };
  assert.equal(marketQuoteDetails(itemId, 1, "sell", null, settings, stale).reason, "stale-auction-data");
  assert.equal(marketQuote(itemId, 2, "sell", null, { ...settings, prices: { [itemId]: 777 } }, stale), 1554);
  assert.equal(marketQuoteDetails("tungsten-regulator", 1, "sell", null, settings, context).reason, "no-active-bin");
});

test("AH buy estimates cover whole listings, choose the cheapest retained subset, and require depth", () => {
  const data = buildBinPriceReport(snapshot([
    auction(1, { starting_bid: 100, item_bytes: encoded("MITHRIL_NECKLACE", 10) }),
    auction(2, { starting_bid: 11 }),
  ]), now);
  const context = { report: data, now };
  assert.equal(marketQuote(itemId, 1, "buy", null, settings, context), 11);
  assert.equal(marketQuote(itemId, 2, "buy", null, settings, context), 100);
  assert.equal(marketQuote(itemId, 11, "buy", null, settings, context), 111);
  assert.equal(marketQuoteDetails(itemId, 12, "buy", null, settings, context).reason, "insufficient-bin-depth");
});

test("AH reports feed recipe revenue and planner buy decisions without applying Bazaar tax", () => {
  const context = { report: report(), now };
  const recipe = recipeByOutput.get("mithril-necklace")!;
  const prices = Object.fromEntries(recipe.inputs.map((input) => [input.itemId, 1]));
  const row = rankRecipe(recipe, null, { ...settings, prices, tax: 0.9 }, context);
  assert.equal(row.revenue, 100);
  assert.equal(row.pricing.output.source, "auction");
  assert.equal(row.flipEligible, true);
  const titanium = recipeByOutput.get("titanium-necklace")!;
  const allInputs = Object.fromEntries(titanium.inputs.filter((input) => input.itemId !== itemId).map((input) => [input.itemId, 1]));
  const plan = buildPlan("titanium-necklace", 1, {}, { ...settings, prices: allInputs }, null, "cheapest", context);
  const dependency = plan.tree.children.find((entry) => entry.itemId === itemId)!;
  assert.equal(dependency.action, "buy");
  assert.equal(dependency.pricing.source, "auction");
  assert.equal(plan.materials.find((entry) => entry.itemId === itemId)!.cost, 100);
});

test("non-auctionable outputs cannot produce flip profits even with overrides, while planning recipes remain", () => {
  const ranking = rankForgeRecipes(null, settings);
  assert.equal(ranking.length, 117);
  for (const id of ["relic-of-power", "secret-railroad-pass"]) {
    assert.equal(isFlipOutput(id), false);
    assert.ok(recipeByOutput.has(id));
    assert.ok(!ranking.some((entry) => entry.recipe.outputId === id));
    assert.equal(rankRecipe(recipeByOutput.get(id)!, null, { ...settings, prices: { [id]: 100 } }).profit, null);
  }
});

test("one calculation uses one auction evaluation time even if the report expires mid-calculation", (t) => {
  const data = report();
  let clockCalls = 0;
  t.mock.method(Date, "now", () => clockCalls++ === 0 ? now : now + 300000);
  const rows = rankForgeRecipes(null, settings, { report: data });
  assert.equal(clockCalls, 1);
  assert.equal(rows.find((row) => row.recipe.outputId === itemId)!.revenue, 100);
});
