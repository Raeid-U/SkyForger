import type { BazaarSnapshot } from "../bazaar";
import { itemById, recipeByOutput } from "./catalog";
import { marketQuote } from "./pricing";
import {
  durationSeconds,
  forgeSlots,
  missingRequirements,
  type Settings,
} from "./settings";

export type PlanNode = {
  itemId: string;
  quantity: number;
  owned: number;
  action: "owned" | "buy" | "forge" | "crafting";
  cost: number | null;
  children: PlanNode[];
  batches: number;
};
export type ScheduledJob = {
  itemId: string;
  slot: number;
  start: number;
  finish: number;
};
export function buildPlan(
  itemId: string,
  quantity: number,
  inventory: Record<string, number>,
  settings: Settings,
  snapshot: BazaarSnapshot | null,
  strategy: "forge" | "cheapest" = "forge",
) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100)
    throw new Error("Choose a quantity between 1 and 100.");
  const root = recipeByOutput.get(itemId);
  if (!root) throw new Error("Recipe not found.");
  const locked = missingRequirements(root, settings);
  if (locked.length) throw new Error(`Requires ${locked.join(", ")}.`);
  function expand(
    id: string,
    amount: number,
    stock: Record<string, number>,
    path: Set<string>,
    force = false,
  ): { node: PlanNode; stock: Record<string, number> } {
    if (path.has(id)) throw new Error("Recipe dependency cycle detected.");
    const owned = Math.min(amount, stock[id] ?? 0);
    const nextStock = { ...stock, [id]: (stock[id] ?? 0) - owned };
    const remaining = amount - owned;
    const base: PlanNode = {
      itemId: id,
      quantity: amount,
      owned,
      action: remaining ? "buy" : "owned",
      cost: marketQuote(id, remaining, "buy", snapshot, settings),
      children: [],
      batches: 0,
    };
    if (!remaining) return { node: base, stock: nextStock };
    const recipe = recipeByOutput.get(id);
    if (!recipe || missingRequirements(recipe, settings).length)
      return { node: base, stock: nextStock };
    const batches = Math.ceil(remaining / recipe.quantity);
    let craftStock = { ...nextStock };
    const children = recipe.inputs.map((input) => {
      const result = expand(
        input.itemId,
        input.quantity * batches,
        craftStock,
        new Set(path).add(id),
      );
      craftStock = result.stock;
      return result.node;
    });
    const craftCost = children.some((child) => child.cost === null)
      ? null
      : recipe.coins * batches +
        children.reduce((sum, child) => sum + (child.cost ?? 0), 0);
    if (
      !force &&
      strategy === "cheapest" &&
      base.cost !== null &&
      (craftCost === null || base.cost <= craftCost)
    )
      return { node: base, stock: nextStock };
    return {
      node: {
        ...base,
        action: recipe.method === "crafting" ? "crafting" : "forge",
        cost: craftCost,
        children,
        batches,
      },
      stock: craftStock,
    };
  }
  const { node } = expand(itemId, quantity, inventory, new Set(), true);
  const materials = new Map<string, number>();
  const jobs: ScheduledJob[] = [];
  const slots = Array.from({ length: forgeSlots(settings) }, () => 0);
  let coins = 0;
  function schedule(current: PlanNode): number {
    if (current.action === "buy") {
      materials.set(
        current.itemId,
        (materials.get(current.itemId) ?? 0) + current.quantity - current.owned,
      );
      return 0;
    }
    const dependenciesReady = Math.max(0, ...current.children.map(schedule));
    if (current.action === "owned") return 0;
    const recipe = recipeByOutput.get(current.itemId)!;
    coins += recipe.coins * current.batches;
    if (current.action === "crafting") return dependenciesReady;
    if (!slots.length) throw new Error("No forge slots available.");
    const seconds = durationSeconds(recipe, settings);
    if (seconds === null)
      throw new Error(
        `Unknown duration: ${itemById.get(current.itemId)?.name}.`,
      );
    let ready = dependenciesReady;
    for (let batch = 0; batch < current.batches; batch++) {
      if (jobs.length >= 1000)
        throw new Error("Plan exceeds 1,000 forge jobs. Reduce the quantity.");
      const slot = slots.indexOf(Math.min(...slots));
      const start = Math.max(slots[slot], dependenciesReady),
        finish = start + seconds;
      slots[slot] = finish;
      ready = Math.max(ready, finish);
      jobs.push({ itemId: current.itemId, slot: slot + 1, start, finish });
    }
    return ready;
  }
  const completionSeconds = schedule(node);
  const shopping = [...materials].map(([id, amount]) => ({
    itemId: id,
    quantity: amount,
    cost: marketQuote(id, amount, "buy", snapshot, settings),
  }));
  const cost = shopping.some((material) => material.cost === null)
    ? null
    : coins + shopping.reduce((sum, material) => sum + (material.cost ?? 0), 0);
  return {
    tree: node,
    materials: shopping,
    jobs,
    coins,
    cost,
    completionSeconds,
  };
}
