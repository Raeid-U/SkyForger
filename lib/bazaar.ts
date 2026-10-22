import { z } from "zod";

const price = z.number().finite().nonnegative();
const order = z.object({ amount: z.number().finite().positive(), pricePerUnit: price, orders: z.number().int().nonnegative() });
const product = z.object({
  product_id: z.string(),
  buy_summary: z.array(order),
  sell_summary: z.array(order),
});

export const bazaarSchema = z.object({
  success: z.literal(true),
  lastUpdated: z.number().int().positive(),
  products: z.record(z.string(), product),
});

export type BazaarSnapshot = z.infer<typeof bazaarSchema>;

// Hypixel names these from the instant transaction's perspective:
// instant buying consumes buy_summary; instant selling consumes sell_summary.
// quick_status prices average the top 2% of orders by volume, not executable quotes.
export function parseBazaar(value: unknown): BazaarSnapshot {
  return bazaarSchema.parse(value);
}
