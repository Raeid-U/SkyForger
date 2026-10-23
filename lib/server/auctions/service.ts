import type { AuctionResponse } from "../../auctions";
import { AuctionCollectionError, collectAuctionSnapshot, type AuctionSnapshot } from "./collector";
import { normalizeAuctionSnapshot, summarizeAuctionSnapshot, type NormalizedAuctionSnapshot } from "./pricing";

export class AuctionServiceError extends Error {
  constructor(public readonly code: "rate-limited" | "unavailable", public readonly retryAfter: number) {
    super(code === "rate-limited" ? "Hypixel rate limit reached. Try again shortly." : "Auction prices are unavailable. Try again shortly or use a manual override.");
  }
}

export function createAuctionPriceService(options: {
  collect?: () => Promise<AuctionSnapshot>;
  now?: () => number;
} = {}) {
  const now = options.now ?? Date.now;
  const collect = options.collect ?? collectAuctionSnapshot;
  let cached: NormalizedAuctionSnapshot | null = null;
  let pending: Promise<void> | null = null;
  let nextRefreshAt = 0;
  let failure: AuctionServiceError | null = null;
  return async function getPrices(): Promise<AuctionResponse> {
    let refreshed = false;
    if (pending || now() >= nextRefreshAt) {
      if (!pending) {
        pending = (async () => {
          try {
            const fresh = normalizeAuctionSnapshot(await collect());
            summarizeAuctionSnapshot(fresh, now());
            cached = fresh;
            failure = null;
            nextRefreshAt = now() + 60000;
          } catch (error) {
            failure = new AuctionServiceError(error instanceof AuctionCollectionError && error.code === "rate-limited" ? "rate-limited" : "unavailable", 30);
            nextRefreshAt = now() + 30000;
          }
        })();
      }
      await pending;
      pending = null;
      refreshed = true;
    }
    if (cached && now() < cached.lastUpdated + 300000 && now() >= cached.lastUpdated - 30000) {
      return { report: summarizeAuctionSnapshot(cached, now()), refresh: { state: failure ? "refresh-failed" : refreshed ? "fresh" : "cached", nextRefreshAt } };
    }
    throw failure ?? new AuctionServiceError("unavailable", Math.max(1, Math.ceil((nextRefreshAt - now()) / 1000)));
  };
}

export const getAuctionPrices = createAuctionPriceService();
