import { forgeRecipes } from "./forge/catalog";

const recipeIds = new Set(forgeRecipes.map((recipe) => recipe.id));

// Browser data may come from an older catalog or have been edited manually.
export function readFavouriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string => typeof id === "string" && recipeIds.has(id),
      ),
    ),
  ];
}
