import { z } from "zod";

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const apiId = z.string().regex(/^[A-Z0-9_]+$/);
const level = z.number().int().min(0).max(20);
const requirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hotm"), level: level.max(10) }).strict(),
  z
    .object({
      kind: z.literal("collection"),
      collection: z.string().min(1),
      level,
    })
    .strict(),
  z
    .object({
      kind: z.literal("manual"),
      key: id,
      description: z.string().min(1),
    })
    .strict(),
]);
const itemSchema = z
  .object({
    id,
    name: z.string().min(1),
    apiId: apiId.nullable(),
    aliases: z.array(apiId),
    market: z.enum(["bazaar", "auction", "untradeable", "unknown"]),
    image: z
      .object({
        src: z.string().regex(/^\/items\/[a-z0-9-]+\.(png|gif)$/),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        source: id,
        url: z.url().optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const recipeSchema = z
  .object({
    id,
    outputId: id,
    quantity: z.number().int().positive(),
    duration: z.number().int().nonnegative().nullable(),
    method: z.enum(["forge", "crafting"]),
    inputs: z
      .array(
        z
          .object({ itemId: id, quantity: z.number().int().positive() })
          .strict(),
      )
      .min(1),
    coins: z.number().finite().nonnegative(),
    requirements: z.array(requirementSchema),
    source: id,
  })
  .strict();

export const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewedOn: z.iso.date(),
    sources: z
      .array(
        z
          .object({
            id,
            description: z.string().min(1),
            url: z.url().optional(),
          })
          .strict(),
      )
      .min(1),
    items: z.array(itemSchema).min(1),
    recipes: z.array(recipeSchema).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    function unique(values: string[], label: string) {
      if (new Set(values).size !== values.length) fail(`Duplicate ${label}`);
    }
    unique(
      catalog.sources.map((source) => source.id),
      "source IDs",
    );
    unique(
      catalog.items.map((item) => item.id),
      "item IDs",
    );
    unique(
      catalog.recipes.map((recipe) => recipe.id),
      "recipe IDs",
    );
    unique(
      catalog.recipes.map((recipe) => recipe.outputId),
      "recipe outputs",
    );
    const items = new Set(catalog.items.map((item) => item.id));
    const sources = new Set(catalog.sources.map((source) => source.id));
    const identities = new Map<string, string>();
    for (const item of catalog.items) {
      unique(item.aliases, `aliases for ${item.id}`);
      for (const identity of [
        ...(item.apiId ? [item.apiId] : []),
        ...item.aliases,
      ]) {
        if (identities.has(identity) && identities.get(identity) !== item.id)
          fail(`Ambiguous item identity: ${identity}`);
        identities.set(identity, item.id);
      }
      if (item.market === "bazaar" && !item.apiId)
        fail(`Bazaar item needs API ID: ${item.id}`);
      if (item.image && !sources.has(item.image.source))
        fail(`Unknown image source: ${item.id}`);
    }
    const byOutput = new Map(
      catalog.recipes.map((recipe) => [recipe.outputId, recipe]),
    );
    for (const recipe of catalog.recipes) {
      if (!items.has(recipe.outputId))
        fail(`Unknown recipe output: ${recipe.outputId}`);
      if (!sources.has(recipe.source))
        fail(`Unknown recipe source: ${recipe.id}`);
      unique(
        recipe.inputs.map((input) => input.itemId),
        `ingredients for ${recipe.id}`,
      );
      for (const input of recipe.inputs)
        if (!items.has(input.itemId))
          fail(`Unknown ingredient: ${input.itemId}`);
      if (
        recipe.method === "forge" &&
        (recipe.duration === null || recipe.duration === 0)
      )
        fail(`Forge duration must be positive: ${recipe.id}`);
      if (recipe.method === "crafting" && recipe.duration !== 0)
        fail(`Crafting duration must be zero: ${recipe.id}`);
    }
    const visiting = new Set<string>(),
      visited = new Set<string>();
    function visit(itemId: string) {
      if (visiting.has(itemId)) {
        fail(`Recipe dependency cycle: ${itemId}`);
        return;
      }
      if (visited.has(itemId)) return;
      visiting.add(itemId);
      for (const input of byOutput.get(itemId)?.inputs ?? [])
        visit(input.itemId);
      visiting.delete(itemId);
      visited.add(itemId);
    }
    for (const recipe of catalog.recipes) visit(recipe.outputId);
  });

export type Catalog = z.infer<typeof catalogSchema>;
export type Item = Catalog["items"][number];
export type Recipe = Catalog["recipes"][number];
export type Requirement = Recipe["requirements"][number];
