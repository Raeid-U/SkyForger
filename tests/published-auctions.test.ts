import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublishedAuctionService } from "../lib/server/auctions/published";
import { buildBinPriceReport } from "../lib/server/auctions/pricing";
import { now, auction, snapshot } from "./fixtures/auctions";

function report() { return buildBinPriceReport(snapshot([auction(1)]), now); }

test("published service coalesces reads, retains expiry, and labels scheduled estimates", async () => {
  let at = now;
  let calls = 0;
  const data = report();
  const get = createPublishedAuctionService({ now: () => at, url: () => "https://example.com/prices.json", fetcher: async () => { calls++; return Response.json(data); } });
  const results = await Promise.all([get(), get()]);
  assert.equal(calls, 1);
  assert.equal(results[0].report.expiresAt, data.expiresAt);
  at = data.expiresAt + 1;
  const cached = await get();
  assert.equal(cached.refresh.state, "refresh-failed");
  assert.equal(cached.report.expiresAt, data.expiresAt);
});

test("missing snapshot config never falls back to Hypixel", async () => {
  let calls = 0;
  const get = createPublishedAuctionService({ url: () => undefined, fetcher: async () => { calls++; throw new Error("Unexpected request"); } });
  await assert.rejects(get());
  await assert.rejects(get());
  assert.equal(calls, 0);
});

test("invalid and oversized publication cannot replace a last-good report", async () => {
  let at = now;
  let value = report();
  const get = createPublishedAuctionService({ now: () => at, url: () => "https://example.com/prices.json", fetcher: async () => Response.json(value) });
  const first = await get();
  at += 61000;
  value = { ...value, quotes: [] };
  assert.deepEqual((await get()).report, first.report);
  at = now + 10800001;
  await assert.rejects(get());
  const oversized = createPublishedAuctionService({ now: () => now, url: () => "https://example.com/prices.json", fetcher: async () => new Response("{}", { headers: { "Content-Length": "1048577" } }) });
  await assert.rejects(oversized());
});
