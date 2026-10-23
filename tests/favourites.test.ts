import { test } from "node:test";
import assert from "node:assert/strict";
import { readFavouriteIds } from "../lib/favourites";
import { forgeRecipes, recipes } from "../lib/forge/catalog";

test("saved favourites ignore malformed, unknown and non-forge recipe IDs while preserving order", () => {
  const first = forgeRecipes[0].id;
  const second = forgeRecipes[1].id;
  const crafting = recipes.find((recipe) => recipe.method === "crafting")!.id;
  assert.deepEqual(
    readFavouriteIds([
      second,
      null,
      {},
      first,
      second,
      "removed-recipe",
      crafting,
      2,
    ]),
    [second, first],
  );
  assert.deepEqual(readFavouriteIds({ recipes: [first] }), []);
  assert.deepEqual(readFavouriteIds(null), []);
});
