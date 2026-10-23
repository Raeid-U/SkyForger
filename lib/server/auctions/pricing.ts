import { auctionTargets, auctionTarget } from "./targets";
import { decodeAuctionItem, nonComparableReasons } from "./item";
import type { AuctionSnapshot } from "./collector";

import type { BinPriceReport, BinQuote, BinListing } from "../../auctions";
export type { BinPriceReport, BinQuote, BinListing } from "../../auctions";
export { resolveBinPrice } from "../../auctions";

export type NormalizedAuctionSnapshot = Omit<AuctionSnapshot, "auctions"> & {
  listings: { itemId: string; startsAt: number; listing: BinListing; reasons: string[] }[];
};

export function normalizeAuctionSnapshot(snapshot: AuctionSnapshot): NormalizedAuctionSnapshot {
  if (snapshot.auctions.length !== snapshot.totalAuctions || new Set(snapshot.auctions.map((auction) => auction.uuid)).size !== snapshot.totalAuctions)
    throw new Error("Cannot price an incomplete auction snapshot.");
  const listings: NormalizedAuctionSnapshot["listings"] = [];
  for (const auction of snapshot.auctions) {
    if (!auction.bin || auction.claimed || (auction.highest_bid_amount ?? 0) > 0 || auction.starting_bid <= 0) continue;
    let item;
    try { item = decodeAuctionItem(auction.item_bytes); }
    catch { throw new Error(`Cannot price snapshot: unreadable BIN item ${auction.uuid}.`); }
    const target = auctionTarget(item.apiId, item.pet?.type);
    if (!target) continue;
    listings.push({
      itemId: target.itemId, startsAt: auction.start, reasons: nonComparableReasons(item),
      listing: { auctionId: auction.uuid, quantity: item.count, totalPrice: auction.starting_bid, unitPrice: auction.starting_bid / item.count, endsAt: auction.end },
    });
  }
  return { lastUpdated: snapshot.lastUpdated, fetchedAt: snapshot.fetchedAt, totalPages: snapshot.totalPages, totalAuctions: snapshot.totalAuctions, listings };
}

export function buildBinPriceReport(snapshot: AuctionSnapshot, now = Date.now()): BinPriceReport {
  return summarizeAuctionSnapshot(normalizeAuctionSnapshot(snapshot), now);
}

export function summarizeAuctionSnapshot(snapshot: NormalizedAuctionSnapshot, now = Date.now()): BinPriceReport {
  if (!Number.isSafeInteger(now) || now < snapshot.lastUpdated - 30000 || now - snapshot.lastUpdated >= 300000)
    throw new Error("Cannot price a stale auction snapshot.");
  const quotes = new Map<string, BinQuote>(auctionTargets.map((target) => [target.itemId, {
    itemId: target.itemId, name: target.name, status: "no-active-bin", unitPrice: null,
    activeListings: 0, comparableListings: 0, comparableUnits: 0, lowestListings: [], excludedVariants: {}, warningCodes: [], warnings: [],
  }]));
  for (const { itemId, listing, reasons, startsAt } of snapshot.listings) {
    if (startsAt > now || listing.endsAt <= now) continue;
    const quote = quotes.get(itemId)!;
    quote.activeListings++;
    if (reasons.length) {
      for (const reason of reasons) quote.excludedVariants[reason] = (quote.excludedVariants[reason] ?? 0) + 1;
      continue;
    }
    quote.comparableListings++;
    quote.comparableUnits += listing.quantity;
    quote.lowestListings.push(listing);
    quote.lowestListings.sort((a, b) => a.unitPrice - b.unitPrice || a.auctionId.localeCompare(b.auctionId));
    quote.lowestListings.length = Math.min(5, quote.lowestListings.length);
  }
  for (const quote of quotes.values()) {
    if (quote.comparableListings) {
      quote.status = "priced";
      quote.unitPrice = quote.lowestListings[0].unitPrice;
      if (quote.comparableListings < 3) {
        quote.warningCodes.push("sparse-listings");
        quote.warnings.push("Few comparable BIN listings are available. This asking price may be inflated and may not reflect a realizable sale price.");
      }
    } else if (quote.activeListings) {
      quote.status = "no-comparable-bin";
      quote.warningCodes.push("no-comparable-bin");
      quote.warnings.push("Current BIN listings exist, but none match the unmodified item or level 1 pet policy. Enter a manual override if needed.");
    } else {
      quote.warningCodes.push("no-active-bin");
      quote.warnings.push("No current BIN listings found. Check historical prices elsewhere and enter a manual override.");
    }
  }
  const expiresAt = Math.min(snapshot.lastUpdated + 300000, ...[...quotes.values()].flatMap((quote) => quote.lowestListings.map((listing) => listing.endsAt)));
  return {
    schemaVersion: 1, source: "hypixel-active-bin", sourceUpdatedAt: snapshot.lastUpdated,
    fetchedAt: snapshot.fetchedAt, evaluatedAt: now, expiresAt, totalAuctions: snapshot.totalAuctions, quotes: [...quotes.values()],
  };
}

