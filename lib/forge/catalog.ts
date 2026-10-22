import data from "../../data/forge-catalog.json";
import { catalogSchema } from "./schema";

export type { Item, Recipe, Requirement } from "./schema";
export const catalog = catalogSchema.parse(data);
export const { items, recipes } = catalog;
export const itemById = new Map(items.map((item) => [item.id, item]));
export const itemByApiId = new Map(
  items.flatMap((item) =>
    [...(item.apiId ? [item.apiId] : []), ...item.aliases].map(
      (identity) => [identity, item] as const,
    ),
  ),
);
export const recipeByOutput = new Map(
  recipes.map((recipe) => [recipe.outputId, recipe]),
);
export const forgeRecipes = recipes.filter(
  (recipe) => recipe.method === "forge",
);
