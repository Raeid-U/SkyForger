import { z } from "zod";

const integer = z.number().int().nonnegative().safe();
const auctionSchema = z.object({
  uuid: z.string().regex(/^[a-f0-9]{32}$/i),
  bin: z.boolean().optional(),
  claimed: z.boolean().optional(),
  start: integer,
  end: integer,
  starting_bid: integer,
  highest_bid_amount: integer.optional(),
  item_bytes: z.string().min(1),
});
const pageSchema = z.object({
  success: z.literal(true),
  page: integer,
  totalPages: integer.min(1).max(100),
  totalAuctions: integer.max(100000),
  lastUpdated: integer.positive(),
  auctions: z.array(auctionSchema).max(1000),
});
export type RawAuction = z.infer<typeof auctionSchema>;
export type AuctionSnapshot = {
  lastUpdated: number;
  fetchedAt: number;
  totalPages: number;
  totalAuctions: number;
  auctions: RawAuction[];
};
export class AuctionCollectionError extends Error {
  constructor(public readonly code: "upstream" | "rate-limited" | "invalid-data" | "snapshot-changed" | "stale", message: string) {
    super(message);
  }
}

async function readPage(response: Response) {
  const maxBytes = 16 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maxBytes || !response.body)
    throw new AuctionCollectionError("invalid-data", "Auction page is empty or oversized.");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new AuctionCollectionError("invalid-data", "Auction page is oversized.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    return pageSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new AuctionCollectionError("invalid-data", "Hypixel returned an invalid auction page.");
  }
}

export async function collectAuctionSnapshot(options: {
  fetcher?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
} = {}): Promise<AuctionSnapshot> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  options.signal?.throwIfAborted();
  function assertFresh(updatedAt: number, at: number) {
    if (updatedAt > at + 30000 || at - updatedAt > 300000)
      throw new AuctionCollectionError("stale", "Auction snapshot timestamp is stale or in the future.");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal, AbortSignal.timeout(60000),
      ...(options.signal ? [options.signal] : []),
    ]);
    async function page(number: number) {
      let response: Response;
      try {
        response = await fetcher(`https://api.hypixel.net/v2/skyblock/auctions?page=${number}`, {
          signal, cache: "no-store", headers: { Accept: "application/json" },
        });
      } catch {
        throw new AuctionCollectionError("upstream", "Auction request failed or timed out.");
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AuctionCollectionError(response.status === 429 ? "rate-limited" : "upstream",
          response.status === 429 ? "Hypixel rate limit reached; retry later." : `Hypixel auctions returned HTTP ${response.status}.`);
      }
      const parsed = await readPage(response);
      if (parsed.page !== number) throw new AuctionCollectionError("invalid-data", "Hypixel returned the wrong auction page.");
      return parsed;
    }
    try {
      const first = await page(0);
      assertFresh(first.lastUpdated, now());
      const auctions = [...first.auctions];
      let next = 1;
      const workers = Array.from({ length: Math.min(4, first.totalPages - 1) }, async () => {
        try {
          while (next < first.totalPages) {
            signal.throwIfAborted();
            const current = await page(next++);
            if (current.lastUpdated !== first.lastUpdated || current.totalPages !== first.totalPages || current.totalAuctions !== first.totalAuctions)
              throw new AuctionCollectionError("snapshot-changed", "Auction pages changed during collection.");
            auctions.push(...current.auctions);
          }
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          controller.abort(error);
          throw error;
        }
      });
      const results = await Promise.allSettled(workers);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) {
        throw failures[0].reason;
      }
      if (auctions.length !== first.totalAuctions || new Set(auctions.map((auction) => auction.uuid)).size !== auctions.length)
        throw new AuctionCollectionError("snapshot-changed", "Auction snapshot is incomplete or contains duplicate auctions.");
      const fetchedAt = now();
      assertFresh(first.lastUpdated, fetchedAt);
      return { lastUpdated: first.lastUpdated, fetchedAt, totalPages: first.totalPages, totalAuctions: first.totalAuctions, auctions };
    } catch (error) {
      controller.abort();
      if (error instanceof AuctionCollectionError && error.code === "snapshot-changed" && attempt === 0 && !options.signal?.aborted) continue;
      throw error;
    }
  }
  throw new AuctionCollectionError("snapshot-changed", "No coherent auction snapshot was available.");
}
