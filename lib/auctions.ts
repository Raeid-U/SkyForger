import { z } from "zod";

const count = z.number().int().nonnegative().safe();
const price = z.number().finite().nonnegative();
export const binPriceReportSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("hypixel-active-bin"),
  sourceUpdatedAt: count,
  fetchedAt: count,
  evaluatedAt: count,
  expiresAt: count,
  totalAuctions: count,
  quotes: z.array(z.object({
    itemId: z.string(), name: z.string(),
    status: z.enum(["priced", "no-active-bin", "no-comparable-bin"]),
    unitPrice: price.nullable(),
    activeListings: count, comparableListings: count, comparableUnits: count,
    lowestListings: z.array(z.object({ auctionId: z.string(), quantity: count.positive(), totalPrice: price, unitPrice: price, endsAt: count })).max(5),
    excludedVariants: z.record(z.string(), count),
    warningCodes: z.array(z.enum(["sparse-listings", "no-active-bin", "no-comparable-bin"])),
    warnings: z.array(z.string()),
  })).max(100),
});
export type BinPriceReport = z.infer<typeof binPriceReportSchema>;
export type BinQuote = BinPriceReport["quotes"][number];
export type BinListing = BinQuote["lowestListings"][number];
export const auctionResponseSchema = z.object({
  report: binPriceReportSchema,
  refresh: z.object({ state: z.enum(["fresh", "cached", "refresh-failed"]), nextRefreshAt: count }),
});
export type AuctionResponse = z.infer<typeof auctionResponseSchema>;
export type AuctionPricingContext = { report: BinPriceReport | null; now?: number };

export function resolveBinPrice(report: BinPriceReport, itemId: string, override?: number, now = Date.now()) {
  const quote = report.quotes.find((entry) => entry.itemId === itemId);
  if (!quote) throw new Error("Item is not an eligible auction flip output.");
  if (override !== undefined) {
    if (!Number.isFinite(override) || override < 0) throw new Error("Invalid manual unit price.");
    return { unitPrice: override, source: "manual" as const, quote };
  }
  if (now >= report.expiresAt || now < report.sourceUpdatedAt - 30000)
    return { unitPrice: null, source: "stale" as const, quote };
  return { unitPrice: quote.unitPrice, source: "hypixel-active-bin" as const, quote };
}
