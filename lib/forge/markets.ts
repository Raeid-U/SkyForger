import { itemById } from "./catalog";
import type { Settings } from "./settings";

export function itemMarket(itemId: string) {
  return itemById.get(itemId)?.market ?? "unknown";
}
export function matchesMarket(itemId: string, market: Settings["market"]) {
  return market === "both" || itemMarket(itemId) === market;
}

export const excludedFlipOutputs = new Map([
  ["relic-of-power", "Hypixel marks this item as non-auctionable."],
  ["secret-railroad-pass", "This quest item is soulbound."],
]);

export function isFlipOutput(itemId: string) {
  const market = itemMarket(itemId);
  return !excludedFlipOutputs.has(itemId) && (market === "bazaar" || market === "auction");
}
