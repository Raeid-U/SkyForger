import { binPriceReportSchema, type AuctionResponse } from "../../auctions";
import { AuctionServiceError } from "./service";
import { auctionTargets } from "./targets";

export function createPublishedAuctionService(options: {
  url?: () => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
} = {}) {
  const now = options.now ?? Date.now;
  const fetcher = options.fetcher ?? fetch;
  let cached: AuctionResponse | null = null;
  let pending: Promise<AuctionResponse> | null = null;
  let nextReadAt = 0;
  function result(value: AuctionResponse): AuctionResponse {
    if (now() - value.report.sourceUpdatedAt > 10800000)
      throw new AuctionServiceError("unavailable", 60);
    return { report: value.report, refresh: { state: now() >= value.report.expiresAt ? "refresh-failed" : "cached", nextRefreshAt: nextReadAt } };
  }
  return async function getPublished(): Promise<AuctionResponse> {
    if (now() < nextReadAt) {
      if (cached) return result(cached);
      throw new AuctionServiceError("unavailable", 60);
    }
    if (pending) return pending;
    pending = (async () => {
      try {
        const location = (options.url ?? (() => process.env.AUCTION_SNAPSHOT_URL))();
        if (!location || new URL(location).protocol !== "https:") throw new Error("Missing HTTPS snapshot URL");
        const response = await fetcher(location, { signal: AbortSignal.timeout(5000), cache: "no-store", redirect: "error" });
        if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 1048576) throw new Error("Snapshot unavailable");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 1048576) throw new Error("Oversized snapshot");
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const report = binPriceReportSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        const ids = new Set(report.quotes.map((quote) => quote.itemId));
        if (report.sourceUpdatedAt > now() + 30000 || report.fetchedAt < report.sourceUpdatedAt || report.fetchedAt > now() + 30000 || report.expiresAt > report.sourceUpdatedAt + 300000 || report.expiresAt < report.sourceUpdatedAt || ids.size !== auctionTargets.length || report.quotes.length !== ids.size || auctionTargets.some((target) => !ids.has(target.itemId))) throw new Error("Invalid snapshot generation");
        if (cached && report.sourceUpdatedAt < cached.report.sourceUpdatedAt) throw new Error("Older snapshot generation");
        const candidate = { report, refresh: { state: "cached" as const, nextRefreshAt: now() + 60000 } };
        result(candidate);
        cached = candidate;
      } catch {
        // A publication outage must never trigger an on-demand Hypixel scan.
      }
      nextReadAt = now() + 60000;
      if (!cached) throw new AuctionServiceError("unavailable", 60);
      return result(cached);
    })();
    try { return await pending; } finally { pending = null; }
  };
}

export const getPublishedAuctionPrices = createPublishedAuctionService();
