import data from "../../data/forge-catalog.json";

export type Item = { id: string; name: string; apiId: string | null };
export type Requirement = {
  kind: string;
  level?: number;
  collection?: string;
  key?: string;
  description?: string;
};
export type Recipe = {
  id: string;
  outputId: string;
  quantity: number;
  duration: number | null;
  method: string;
  inputs: { itemId: string; quantity: number }[];
  coins: number;
  requirements: Requirement[];
};
export const items: Item[] = data.items;
export const recipes: Recipe[] = data.recipes;
export const itemById = new Map(items.map((item) => [item.id, item]));
export const recipeByOutput = new Map(
  recipes.map((recipe) => [recipe.outputId, recipe]),
);
export const forgeRecipes = recipes.filter(
  (recipe) => recipe.method === "forge",
);
