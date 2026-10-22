import { itemMarket } from "./markets";
import type { BazaarSnapshot } from "../bazaar";
import { itemById, recipeByOutput, type Recipe } from "./catalog";
import {
  durationSeconds,
  missingRequirements,
  type Settings,
} from "./settings";

export function marketQuote(
  itemId: string,
  quantity: number,
  side: "buy" | "sell",
  snapshot: BazaarSnapshot | null,
  settings: Settings,
): number | null {
  if (quantity === 0) return 0;
  const override = settings.prices[itemId];
  if (override !== undefined) return override * quantity;
  const apiId = itemById.get(itemId)?.apiId;
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

export function materialCost(
  itemId: string,
  quantity: number,
  snapshot: BazaarSnapshot | null,
  settings: Settings,
  path = new Set<string>(),
): number | null {
  const buy = marketQuote(itemId, quantity, "buy", snapshot, settings);
  const recipe = recipeByOutput.get(itemId);
  if (
    !recipe ||
    recipe.method !== "crafting" ||
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
) {
  const inputMissing = recipe.inputs
    .filter(
      (input) =>
        materialCost(input.itemId, input.quantity, snapshot, settings) === null,
    )
    .map((input) => input.itemId);
  const missing = [...inputMissing];
  const gross = marketQuote(
    recipe.outputId,
    recipe.quantity,
    "sell",
    snapshot,
    settings,
  );
  if (gross === null) missing.push(recipe.outputId);
  const cost = inputMissing.length
    ? null
    : recipe.coins +
      recipe.inputs.reduce(
        (sum, input) =>
          sum +
          (materialCost(input.itemId, input.quantity, snapshot, settings) ?? 0),
        0,
      );
  const revenue =
    gross === null
      ? null
      : gross *
        (1 - (itemMarket(recipe.outputId) === "bazaar" ? settings.tax : 0));
  const profit = cost === null || revenue === null ? null : revenue - cost;
  const seconds = durationSeconds(recipe, settings);
  return {
    recipe,
    cost,
    revenue,
    profit,
    perHour: profit === null || !seconds ? null : (profit * 3600) / seconds,
    seconds,
    missing: [...new Set(missing)],
    locked: missingRequirements(recipe, settings),
  };
}
