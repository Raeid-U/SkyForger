import { writeFileSync } from "node:fs";
import { z } from "zod";
import draft from "../data/forge-catalog.draft.json";
import type { Item, Recipe } from "../lib/forge/catalog";

async function main() {
  const response = await fetch(
    "https://api.hypixel.net/v2/resources/skyblock/items",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error(`Item resources: HTTP ${response.status}`);
  const resource = z
    .object({
      success: z.literal(true),
      items: z.array(z.object({ id: z.string(), name: z.string() })),
    })
    .parse(await response.json());
  const normalize = (name: string) =>
    name
      .replace(/§./g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  function apiId(name: string) {
    const matches = resource.items.filter(
      (item) => normalize(item.name) === normalize(name),
    );
    return matches.length === 1 ? matches[0].id : null;
  }
  const items: Item[] = draft.items.map((item) => ({
    id: item.id,
    name: item.name,
    apiId: apiId(item.name),
  }));
  const recipes: Recipe[] = draft.recipes.map((recipe) => ({
    id: recipe.id,
    outputId: recipe.output.itemId,
    quantity: recipe.output.quantity ?? 1,
    duration: recipe.baseDurationSeconds,
    method: recipe.method,
    inputs: recipe.inputs,
    coins: recipe.coinCost,
    requirements: recipe.requirements,
  }));
  const colors = [
    "Ruby",
    "Amber",
    "Jade",
    "Sapphire",
    "Amethyst",
    "Topaz",
    "Jasper",
    "Opal",
    "Aquamarine",
    "Citrine",
    "Onyx",
    "Peridot",
  ];
  for (const color of colors) {
    for (const [tier, previous, level] of [
      ["Flawed", "Rough", 2],
      ["Fine", "Flawed", 5],
      ["Flawless", "Fine", 9],
    ] as const) {
      const ids = [tier, previous].map((quality) => {
        const name = `${quality} ${color} Gemstone`,
          id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        if (!items.some((item) => item.id === id))
          items.push({ id, name, apiId: apiId(name) });
        return id;
      });
      recipes.push({
        id: `craft-${ids[0]}`,
        outputId: ids[0],
        quantity: 1,
        duration: 0,
        method: "crafting",
        inputs: [{ itemId: ids[1], quantity: 80 }],
        coins: 0,
        requirements: [{ kind: "collection", collection: "Gemstone", level }],
      });
    }
  }
  writeFileSync(
    new URL("../data/forge-catalog.json", import.meta.url),
    JSON.stringify({ reviewedOn: "2026-10-22", items, recipes }, null, 2) +
      "\n",
  );
  console.log(
    `${recipes.length} recipes; ${items.filter((item) => item.apiId).length}/${items.length} item IDs matched`,
  );
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Catalog generation failed",
  );
  process.exitCode = 1;
});
