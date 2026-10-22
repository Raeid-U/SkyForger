import { catalog, forgeRecipes } from "../lib/forge/catalog";
import { checkAssets } from "./lib/assets";

checkAssets(catalog);
console.log(
  `${forgeRecipes.length} forge recipes, ${catalog.recipes.length - forgeRecipes.length} crafting recipes, ${catalog.items.length} items, ${catalog.items.filter((item) => item.image).length} local images. Catalog valid.`,
);
