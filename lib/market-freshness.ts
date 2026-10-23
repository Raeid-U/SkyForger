// Display age thresholds. Retained snapshots remain estimates until refreshed.
export const BAZAAR_OUTDATED_MS = 60 * 60 * 1000;
export const AUCTION_OUTDATED_MS = 3 * 60 * 60 * 1000;

export function nextMarketChangeAt(
  now: number,
  auctionExpiresAt?: number,
  auctionUpdatedAt?: number,
  bazaarUpdatedAt?: number,
): number | null {
  const deadlines = [
    auctionExpiresAt,
    auctionUpdatedAt === undefined
      ? undefined
      : auctionUpdatedAt + AUCTION_OUTDATED_MS + 1,
    bazaarUpdatedAt === undefined
      ? undefined
      : bazaarUpdatedAt + BAZAAR_OUTDATED_MS + 1,
  ].filter((value): value is number => value !== undefined && value > now);
  return deadlines.length ? Math.min(...deadlines) : null;
}
