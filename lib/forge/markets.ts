import bazaarItems from "../../data/bazaar-item-ids.json";
import type { Settings } from "./settings";

const bazaar = new Set(bazaarItems);
export function itemMarket(itemId: string): "bazaar" | "auction" {
  return bazaar.has(itemId) ? "bazaar" : "auction";
}
export function matchesMarket(itemId: string, market: Settings["market"]) {
  return market === "both" || itemMarket(itemId) === market;
}
