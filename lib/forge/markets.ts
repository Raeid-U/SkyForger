import { itemById } from "./catalog";
import type { Settings } from "./settings";

export function itemMarket(itemId: string) {
  return itemById.get(itemId)?.market ?? "unknown";
}
export function matchesMarket(itemId: string, market: Settings["market"]) {
  return market === "both" || itemMarket(itemId) === market;
}
