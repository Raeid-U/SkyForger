import { BAZAAR_OUTDATED_MS, AUCTION_OUTDATED_MS } from "../market-freshness";
import {
  resolveBinPrice,
  type AuctionPricingContext,
  type BinQuote,
} from "../auctions";
import { itemMarket, isFlipOutput } from "./markets";
import type { BazaarSnapshot } from "../bazaar";
import { forgeRecipes, itemById, recipeByOutput, type Recipe } from "./catalog";
import {
  durationSeconds,
  missingRequirements,
  isRecipePlanningAllowed,
  type Settings,
} from "./settings";

function bazaarQuote(
  itemId: string,
  quantity: number,
  side: "buy" | "sell",
  snapshot: BazaarSnapshot | null,
  settings: Settings,
): number | null {
  if (quantity === 0) return 0;
  const override = settings.prices[itemId];
  if (override !== undefined) return override * quantity;
  const item = itemById.get(itemId);
  if (side === "buy" && item?.acquisitionCost !== undefined)
    return item.acquisitionCost * quantity;
  const apiId = item?.apiId;
  const book = apiId ? snapshot?.products[apiId] : undefined;
  if (!book) return null;
  const passive =
    side === "buy"
      ? settings.buyMode === "order"
      : settings.sellMode === "offer";
  const summary =
    side === "buy"
      ? passive
        ? book.sell_summary
        : book.buy_summary
      : passive
        ? book.buy_summary
        : book.sell_summary;
  const sorted = [...summary].sort((a, b) =>
    side === "buy"
      ? passive
        ? b.pricePerUnit - a.pricePerUnit
        : a.pricePerUnit - b.pricePerUnit
      : passive
        ? a.pricePerUnit - b.pricePerUnit
        : b.pricePerUnit - a.pricePerUnit,
  );
  if (!sorted.length) return null;
  if (passive) return sorted[0].pricePerUnit * quantity;
  let remaining = quantity,
    total = 0;
  for (const order of sorted) {
    const fill = Math.min(remaining, order.amount);
    total += fill * order.pricePerUnit;
    remaining -= fill;
    if (!remaining) return total;
  }
  return null;
}

export type MarketPriceQuote = {
  amount: number | null;
  source: "manual" | "bazaar" | "fixed" | "auction" | "unavailable";
  reason: string | null;
  warningCodes: string[];
  auction: BinQuote | null;
  sourceUpdatedAt: number | null;
  expiresAt: number | null;
};

export function marketQuoteDetails(
  itemId: string,
  quantity: number,
  side: "buy" | "sell",
  snapshot: BazaarSnapshot | null,
  settings: Settings,
  auctions?: AuctionPricingContext,
): MarketPriceQuote {
  const item = itemById.get(itemId);
  const auction =
    auctions?.report?.quotes.find((entry) => entry.itemId === itemId) ?? null;
  const base: MarketPriceQuote = {
    amount: null,
    source: "unavailable",
    reason: null,
    warningCodes: [],
    auction,
    sourceUpdatedAt:
      itemMarket(itemId) === "auction"
        ? (auctions?.report?.sourceUpdatedAt ?? null)
        : (snapshot?.lastUpdated ?? null),
    expiresAt:
      itemMarket(itemId) === "auction"
        ? (auctions?.report?.expiresAt ?? null)
        : snapshot
          ? snapshot.lastUpdated + BAZAAR_OUTDATED_MS
          : null,
  };
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new Error("Invalid quote quantity.");
  if (quantity === 0) return { ...base, amount: 0, source: "fixed" };
  const override = settings.prices[itemId];
  if (override !== undefined)
    return {
      ...base,
      amount: override * quantity,
      source: "manual",
      warningCodes: [
        "manual-override",
        ...(itemMarket(itemId) === "auction" ? ["ah-fees-excluded"] : []),
      ],
    };
  if (side === "buy" && item?.acquisitionCost !== undefined)
    return {
      ...base,
      amount: item.acquisitionCost * quantity,
      source: "fixed",
    };
  if (itemMarket(itemId) !== "auction") {
    const amount = bazaarQuote(itemId, quantity, side, snapshot, settings);
    return {
      ...base,
      amount,
      source: amount === null ? "unavailable" : "bazaar",
      reason: amount === null ? "market-unavailable" : null,
      warningCodes:
        snapshot &&
        (auctions?.now ?? Date.now()) - snapshot.lastUpdated >
          BAZAAR_OUTDATED_MS
          ? ["stale-bazaar-data"]
          : [],
    };
  }
  if (!auctions?.report || !auction)
    return { ...base, reason: "no-auction-data" };
  const evaluatedAt = auctions.now ?? Date.now();
  const resolved = resolveBinPrice(
    auctions.report,
    itemId,
    undefined,
    evaluatedAt,
  );
  const retained =
    resolved.source === "stale" &&
    auctions.allowStaleEstimates &&
    evaluatedAt >= auctions.report.expiresAt &&
    evaluatedAt >= auctions.report.sourceUpdatedAt - 30000;
  if (resolved.source === "stale" && !retained)
    return {
      ...base,
      reason: "stale-auction-data",
      warningCodes: ["stale-auction-data"],
    };
  const snapshotWarnings = [
    ...(retained ? ["cached-auction-estimate"] : []),
    ...(evaluatedAt - auctions.report.sourceUpdatedAt > AUCTION_OUTDATED_MS
      ? ["stale-auction-data"]
      : []),
  ];
  const unitPrice = retained ? auction.unitPrice : resolved.unitPrice;
  if (unitPrice === null)
    return {
      ...base,
      reason: auction.status,
      warningCodes: [...auction.warningCodes, ...snapshotWarnings],
    };
  const warningCodes = [
    ...auction.warningCodes,
    ...snapshotWarnings,
    "bin-asking-price",
    "ah-fees-excluded",
  ];
  if (side === "sell")
    return {
      ...base,
      amount: unitPrice * quantity,
      source: "auction",
      warningCodes,
    };
  // BIN stacks cannot be split. Find the cheapest covering subset among the retained offers.
  let costs = new Map<number, number>([[0, 0]]);
  for (const listing of auction.lowestListings) {
    const next = new Map(costs);
    for (const [units, cost] of costs) {
      const covered = Math.min(quantity, units + listing.quantity);
      next.set(
        covered,
        Math.min(next.get(covered) ?? Infinity, cost + listing.totalPrice),
      );
    }
    costs = next;
  }
  const amount = costs.get(quantity) ?? null;
  return {
    ...base,
    amount,
    source: amount === null ? "unavailable" : "auction",
    reason: amount === null ? "insufficient-bin-depth" : null,
    warningCodes: [
      ...warningCodes,
      ...(amount === null
        ? ["insufficient-bin-depth"]
        : ["whole-listing-purchase"]),
    ],
  };
}

export function marketQuote(
  itemId: string,
  quantity: number,
  side: "buy" | "sell",
  snapshot: BazaarSnapshot | null,
  settings: Settings,
  auctions?: AuctionPricingContext,
): number | null {
  return marketQuoteDetails(
    itemId,
    quantity,
    side,
    snapshot,
    settings,
    auctions,
  ).amount;
}

export function materialCost(
  itemId: string,
  quantity: number,
  snapshot: BazaarSnapshot | null,
  settings: Settings,
  path = new Set<string>(),
  auctions?: AuctionPricingContext,
): number | null {
  if (auctions && auctions.now === undefined)
    auctions = { ...auctions, now: Date.now() };
  const buy = marketQuote(
    itemId,
    quantity,
    "buy",
    snapshot,
    settings,
    auctions,
  );
  const recipe = recipeByOutput.get(itemId);
  if (
    !recipe ||
    recipe.method !== "crafting" ||
    !isRecipePlanningAllowed(recipe) ||
    missingRequirements(recipe, settings).length ||
    path.has(itemId)
  )
    return buy;
  const next = new Set(path).add(itemId);
  const batches = Math.ceil(quantity / recipe.quantity);
  const costs = recipe.inputs.map((input) =>
    materialCost(
      input.itemId,
      input.quantity * batches,
      snapshot,
      settings,
      next,
      auctions,
    ),
  );
  const craft = costs.some((value) => value === null)
    ? null
    : recipe.coins * batches +
      costs.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return craft === null ? buy : buy === null ? craft : Math.min(buy, craft);
}

export function rankRecipe(
  recipe: Recipe,
  snapshot: BazaarSnapshot | null,
  settings: Settings,
  auctions?: AuctionPricingContext,
) {
  if (auctions && auctions.now === undefined)
    auctions = { ...auctions, now: Date.now() };
  const inputs = recipe.inputs.map((input) => ({
    ...input,
    cost: materialCost(
      input.itemId,
      input.quantity,
      snapshot,
      settings,
      new Set(),
      auctions,
    ),
    quote: marketQuoteDetails(
      input.itemId,
      input.quantity,
      "buy",
      snapshot,
      settings,
      auctions,
    ),
  }));
  const inputMissing = inputs
    .filter((input) => input.cost === null)
    .map((input) => input.itemId);
  const missing = [...inputMissing];
  const flipEligible = isFlipOutput(recipe.outputId);
  const outputPricing = marketQuoteDetails(
    recipe.outputId,
    recipe.quantity,
    "sell",
    snapshot,
    settings,
    auctions,
  );
  const gross = flipEligible ? outputPricing.amount : null;
  if (gross === null) missing.push(recipe.outputId);
  const cost = inputMissing.length
    ? null
    : recipe.coins + inputs.reduce((sum, input) => sum + (input.cost ?? 0), 0);
  const revenue =
    gross === null
      ? null
      : gross *
        (1 - (itemMarket(recipe.outputId) === "bazaar" ? settings.tax : 0));
  const profit = cost === null || revenue === null ? null : revenue - cost;
  const seconds = durationSeconds(recipe, settings);
  return {
    recipe,
    flipEligible,
    pricing: {
      output: outputPricing,
      inputs,
    },
    cost,
    revenue,
    profit,
    perHour: profit === null || !seconds ? null : (profit * 3600) / seconds,
    seconds,
    missing: [...new Set(missing)],
    locked: missingRequirements(recipe, settings),
  };
}

export function rankForgeRecipes(
  snapshot: BazaarSnapshot | null,
  settings: Settings,
  auctions?: AuctionPricingContext,
) {
  if (auctions && auctions.now === undefined)
    auctions = { ...auctions, now: Date.now() };
  return forgeRecipes
    .filter((recipe) => isFlipOutput(recipe.outputId))
    .map((recipe) => rankRecipe(recipe, snapshot, settings, auctions));
}
