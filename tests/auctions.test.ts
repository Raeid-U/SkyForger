import { now, encoded, auction, snapshot } from "./fixtures/auctions";
import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionTargets, auctionTarget, excludedFlipOutputs } from "../lib/server/auctions/targets";
import { decodeAuctionItem, nonComparableReasons } from "../lib/server/auctions/item";
import { collectAuctionSnapshot, AuctionCollectionError, type RawAuction } from "../lib/server/auctions/collector";
import { buildBinPriceReport, resolveBinPrice } from "../lib/server/auctions/pricing";
import { recipeByOutput } from "../lib/forge/catalog";

function page(number = 0, auctions = [auction(1)], changes: Record<string, unknown> = {}) {
  return { success: true, page: number, totalPages: 1, totalAuctions: auctions.length, lastUpdated: now - 1000, auctions, ...changes };
}
function response(value: unknown) { return new Response(JSON.stringify(value)); }
function quote(auctions: RawAuction[], id = "mithril-necklace") {
  return buildBinPriceReport(snapshot(auctions), now).quotes.find((entry) => entry.itemId === id)!;
}
function pet(overrides: Record<string, unknown> = {}) {
  return encoded("PET", 1, { petInfo: JSON.stringify({ type: "AMMONITE", tier: "LEGENDARY", exp: 0, hideRightClick: false, noMove: false, petSoulbound: false, extraData: {}, ...overrides }) });
}

test("auction targets retain 75 eligible outputs and preserve non-auctionable craft recipes", () => {
  assert.equal(auctionTargets.length, 75);
  for (const id of excludedFlipOutputs.keys()) {
    assert.ok(recipeByOutput.has(id));
    assert.ok(!auctionTargets.some((entry) => entry.itemId === id));
  }
  assert.equal(auctionTarget("BEJEWELED_COLLAR")?.itemId, "bejeweled-collar");
  assert.equal(auctionTarget("PET", "TYRANNOSAURUS")?.itemId, "t-rex");
  assert.equal(auctionTarget("PET", "T_REX"), undefined);
});

test("NBT decoder rejects invalid encodings, impossible counts, and oversized payloads", () => {
  for (const value of ["", "bad!", "AAAA", "A".repeat(4 * 1024 * 1024 + 1), encoded("MITHRIL_NECKLACE", 0), encoded("MITHRIL_NECKLACE", -1)])
    assert.throws(() => decodeAuctionItem(value));
});

test("Legendary level 1 pets include partial XP below 660 and exclude level 2, wrong rarity, held items, skins and candy", () => {
  for (const exp of [0, 1, 659.99]) assert.deepEqual(nonComparableReasons(decodeAuctionItem(pet({ exp }))), []);
  for (const changes of [{ exp: 660 }, { exp: 2000 }, { tier: "EPIC" }, { heldItem: "QUICK_CLAW" }, { skin: "RARE_SKIN" }, { candyUsed: 1 }, { futureUpgrade: true }, { petSoulbound: true }, { noMove: true }, { extraData: { futureUpgrade: 1 } }])
    assert.ok(nonComparableReasons(decodeAuctionItem(pet(changes))).length);
  assert.throws(() => decodeAuctionItem(pet({ exp: -1 })));
});

test("equipment modifications and unreviewed attributes are excluded rather than mixed into clean pricing", () => {
  for (const extra of [{ modifier: "jaded" }, { rarity_upgrades: 1 }, { drill_part_engine: "ENGINE" }, { future_upgrade: 1 }] as Record<string, string | number>[])
    assert.ok(nonComparableReasons(decodeAuctionItem(encoded("MITHRIL_NECKLACE", 1, extra))).length);
  for (const attributes of [{ gems: { unlocked_slots: ["JADE_0"] } }, { enchantments: { efficiency: 5 } }])
    assert.ok(nonComparableReasons({ ...decodeAuctionItem(encoded()), attributes: { id: "MITHRIL_NECKLACE", ...attributes } }).length);
  assert.deepEqual(nonComparableReasons(decodeAuctionItem(encoded("MITHRIL_NECKLACE", 1, { uuid: "some-uuid", timestamp: "time" }))), []);
});

test("BIN quotes use stack unit prices and exclude expired, sold, future and non-BIN listings", () => {
  const result = quote([
    auction(1, { starting_bid: 1000, item_bytes: encoded("MITHRIL_NECKLACE", 10) }),
    auction(2, { starting_bid: 90 }), auction(3, { starting_bid: 1, end: now }),
    auction(4, { starting_bid: 1, claimed: true }), auction(5, { starting_bid: 1, bin: false }),
    auction(6, { starting_bid: 1, highest_bid_amount: 1 }), auction(7, { starting_bid: 1, start: now + 1 }),
  ]);
  assert.equal(result.status, "priced");
  assert.equal(result.unitPrice, 90);
  assert.equal(result.activeListings, 2);
  assert.equal(result.comparableUnits, 11);
  assert.equal(result.lowestListings[1].unitPrice, 100);
  assert.ok(result.warnings.length);
});

test("no listings differs from no comparable listings and neither invents a price", () => {
  assert.equal(quote([], "tungsten-regulator").status, "no-active-bin");
  assert.equal(quote([], "tungsten-regulator").unitPrice, null);
  const result = quote([auction(1, { item_bytes: pet({ exp: 660 }) })], "ammonite");
  assert.equal(result.status, "no-comparable-bin");
  assert.equal(result.unitPrice, null);
  assert.equal(result.activeListings, 1);
  assert.ok(quote([], "tungsten-regulator").warnings[0].includes("manual override"));
});

test("manual overrides take precedence while automatic quotes expire with data or listing expiry", () => {
  const report = buildBinPriceReport(snapshot([auction(1)]), now);
  assert.equal(resolveBinPrice(report, "mithril-necklace", undefined, now).unitPrice, 100);
  assert.equal(resolveBinPrice(report, "mithril-necklace", 123, now + 999999).unitPrice, 123);
  assert.equal(resolveBinPrice(report, "tungsten-regulator", 456, now).source, "manual");
  assert.equal(resolveBinPrice(report, "mithril-necklace", undefined, now + 100000).source, "stale");
  assert.throws(() => resolveBinPrice(report, "mithril-necklace", NaN, now));
  assert.throws(() => resolveBinPrice(report, "relic-of-power", 100, now));
});

test("corrupt BIN payloads and incomplete/stale snapshots fail closed", () => {
  assert.throws(() => quote([auction(1, { item_bytes: "invalid" })]), /unreadable BIN/);
  assert.throws(() => buildBinPriceReport({ ...snapshot([]), totalAuctions: 1 }, now), /incomplete/);
  assert.throws(() => buildBinPriceReport(snapshot([]), now + 300001), /stale/);
});

test("collector fetches all pages with no API key and preserves source timestamp", async () => {
  const requests: number[] = [];
  const report = await collectAuctionSnapshot({ now: () => now, fetcher: (async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.hypixel.net");
    assert.equal((init?.headers as Record<string, string>)["API-Key"], undefined);
    assert.equal(url.searchParams.has("key"), false);
    const number = Number(url.searchParams.get("page")); requests.push(number);
    return response(page(number, [auction(number + 1)], { totalPages: 3, totalAuctions: 3 }));
  }) as typeof fetch });
  assert.deepEqual(requests.sort(), [0, 1, 2]);
  assert.equal(report.auctions.length, 3);
  assert.equal(report.lastUpdated, now - 1000);
});

test("collector retries a rollover from page zero and never combines generations", async () => {
  let generation = 0;
  const result = await collectAuctionSnapshot({ now: () => now, fetcher: (async (input) => {
    const number = Number(new URL(String(input)).searchParams.get("page"));
    if (number === 0) generation++;
    const lastUpdated = generation === 1 && number === 0 ? now - 2000 : now - 1000;
    return response(page(number, [auction(number + 1)], { lastUpdated, totalPages: 2, totalAuctions: 2 }));
  }) as typeof fetch });
  assert.equal(generation, 2);
  assert.equal(result.lastUpdated, now - 1000);
});

test("collector rejects repeated rollovers, duplicate/missing auctions, stale pages, wrong page and malformed upstream", async () => {
  for (const scenario of ["rollover", "duplicate", "missing", "stale", "wrong-page", "invalid"] as const) {
    await assert.rejects(collectAuctionSnapshot({ now: () => now, fetcher: (async (input) => {
      const number = Number(new URL(String(input)).searchParams.get("page"));
      if (scenario === "invalid") return response({ success: false });
      return response(page(scenario === "wrong-page" ? 1 : number, [auction(scenario === "duplicate" ? 1 : number + 1)], {
        totalPages: 2, totalAuctions: scenario === "missing" ? 3 : 2,
        lastUpdated: scenario === "stale" ? now - 300001 : scenario === "rollover" ? now - 1000 + number : now - 1000,
      }));
    }) as typeof fetch }));
  }
});

test("collector exposes rate limits without retrying and rejects HTTP failures", async () => {
  for (const status of [429, 403, 503]) {
    let calls = 0;
    await assert.rejects(collectAuctionSnapshot({ now: () => now, fetcher: (async () => {
      calls++; return new Response("upstream", { status });
    }) as typeof fetch }), (error: unknown) => error instanceof AuctionCollectionError && error.code === (status === 429 ? "rate-limited" : "upstream"));
    assert.equal(calls, 1);
  }
});

test("collector bounds concurrency at four and honors cancellation before requesting", async () => {
  let pending = 0, peak = 0;
  const result = await collectAuctionSnapshot({ now: () => now, fetcher: (async (input) => {
    pending++; peak = Math.max(peak, pending);
    await new Promise((resolve) => setTimeout(resolve, 5));
    pending--;
    const number = Number(new URL(String(input)).searchParams.get("page"));
    return response(page(number, [auction(number + 1)], { totalPages: 8, totalAuctions: 8 }));
  }) as typeof fetch });
  assert.equal(result.auctions.length, 8);
  assert.equal(peak, 4);
  let calls = 0;
  await assert.rejects(collectAuctionSnapshot({ signal: AbortSignal.abort(), fetcher: (async () => {
    calls++; return response(page());
  }) as typeof fetch }));
  assert.equal(calls, 0);
});
