import { gzipSync } from "node:zlib";
import { writeUncompressed, type NBT } from "prismarine-nbt";
import type { RawAuction, AuctionSnapshot } from "../../lib/server/auctions/collector";

export const now = 1800000000000;
export function encoded(apiId = "MITHRIL_NECKLACE", count = 1, extra: Record<string, string | number> = {}) {
  const attributes = Object.fromEntries(Object.entries({ id: apiId, ...extra }).map(([key, value]) => [key, typeof value === "string" ? { type: "string", value } : { type: "int", value }]));
  const nbt = {
    name: "", type: "compound", value: { i: { type: "list", value: { type: "compound", value: [{
      Count: { type: "byte", value: count },
      tag: { type: "compound", value: { ExtraAttributes: { type: "compound", value: attributes } } },
    }] } } },
  } as NBT;
  return gzipSync(writeUncompressed(nbt)).toString("base64");
}
export function auction(index: number, overrides: Partial<RawAuction> = {}): RawAuction {
  return { uuid: index.toString(16).padStart(32, "0"), bin: true, start: now - 100000, end: now + 100000,
    starting_bid: 100, item_bytes: encoded(), ...overrides };
}
export function snapshot(auctions: RawAuction[]): AuctionSnapshot {
  return { lastUpdated: now - 1000, fetchedAt: now, totalPages: 1, totalAuctions: auctions.length, auctions };
}
