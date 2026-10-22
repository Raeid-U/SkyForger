import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { catalogSchema, recipeSchema, type ForgeCatalog } from "../lib/schemas/forge";

const baselinePath = new URL("../data/skyblock_forge_baseline.json", import.meta.url);
const bytes = readFileSync(baselinePath);
const sourceRecipe = z.object({
  name: z.string().min(1), method: z.literal("forge"), durationSeconds: z.number().int().positive().nullable(),
  hotmLevel: z.number().int().min(0).max(10).nullable(),
  collectionRequirement: z.object({ name: z.string(), level: z.number().int().positive() }).nullable(),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.number().int().positive(), kind: z.enum(["item", "coins"]) })),
  verification: recipeSchema.shape.provenance.shape.sourceStatus,
  sourceUrl: z.url(), category: z.string(), verificationNotes: z.string().optional(),
  additionalRequirements: z.array(z.string()).optional(),
});
const baseline = z.object({ generatedOn: z.iso.date(), recipeCount: z.number().int(), recipes: z.array(sourceRecipe) }).parse(JSON.parse(bytes.toString()));
if (baseline.recipeCount !== baseline.recipes.length) throw new Error("Reported recipe count does not match source");
const audit = JSON.parse(readFileSync(new URL("../data/provenance/forge-history-audit.json", import.meta.url), "utf8")) as {
  historicalCutoff: string;
  recipes: { recipeName: string; url: string; revisionId: number | null; retrievedOn: string; introducedOn: string | null; identityWarning: string | null }[];
};
const cutoff = z.iso.date().parse(process.argv[2] ?? audit.historicalCutoff);
const items = new Map<string, ForgeCatalog["items"][number]>();
function itemId(name: string): string {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const existing = items.get(id);
  if (existing && existing.name !== name) throw new Error(`Internal ID collision: ${name}`);
  if (!existing) items.set(id, { id, name, aliases: [], hypixelItemId: null, bazaarProductId: null, market: "unknown" });
  return id;
}
const recipes = baseline.recipes.map((entry): ForgeCatalog["recipes"][number] => {
  const history = audit.recipes.find((row) => row.recipeName === entry.name);
  if (!history) throw new Error(`Missing chronology audit: ${entry.name}`);
  const id = itemId(entry.name);
  const requirements: ForgeCatalog["recipes"][number]["requirements"] = [];
  if (entry.hotmLevel !== null) requirements.push({ kind: "hotm", level: entry.hotmLevel });
  if (entry.collectionRequirement) requirements.push({ kind: "collection", collection: entry.collectionRequirement.name, level: entry.collectionRequirement.level });
  for (const [index, description] of (entry.additionalRequirements ?? []).entries()) requirements.push({ kind: "manual", key: `${id}-unlock-${index + 1}`, description });
  return {
    id, versionId: `${id}-baseline-${baseline.generatedOn}`,
    output: { itemId: id, quantity: null },
    category: entry.category, method: entry.method, baseDurationSeconds: entry.durationSeconds,
    timing: { quickForgeEligible: null, moltenForgeEligible: null }, requirements,
    inputs: entry.ingredients.filter((input) => input.kind === "item").map((input) => ({ itemId: itemId(input.name), quantity: input.quantity })),
    coinCost: entry.ingredients.filter((input) => input.kind === "coins").reduce((sum, input) => sum + input.quantity, 0),
    provenance: {
      sourceStatus: entry.verification,
      fieldAudit: { ingredients: "pending", duration: "pending", requirements: "pending", outputQuantity: "pending" },
      evidence: [{ url: entry.sourceUrl, retrievedOn: baseline.generatedOn, revisionId: null, note: "Imported user-supplied report; verification label preserved, not independently upgraded." }],
      notes: [entry.verificationNotes, history.identityWarning, entry.hotmLevel === null ? "HOTM requirement unknown" : null, "Source does not explicitly declare output quantity or per-recipe modifier eligibility."].filter((note): note is string => Boolean(note)),
    },
    chronology: {
      introducedOn: history.introducedOn, validFrom: null, validUntilExclusive: null,
      assessment: history.introducedOn && history.introducedOn > cutoff ? "post-cutoff" : "unknown",
      evidence: [{ url: history.url, retrievedOn: history.retrievedOn, revisionId: history.revisionId, note: history.introducedOn ? "Release history: alpha 2026-02-18; public release 2026-02-24. This does not verify subsequent recipe versions." : "Current history reviewed; exact historical recipe validity remains unverified." }],
    },
  };
});
const catalog = catalogSchema.parse({
  schemaVersion: 3, status: "draft", importedOn: new Date().toISOString().slice(0, 10), historicalCutoff: cutoff,
  source: { file: "data/skyblock_forge_baseline.json", sha256: createHash("sha256").update(bytes).digest("hex"), generatedOn: baseline.generatedOn },
  items: [...items.values()].sort((a, b) => a.id.localeCompare(b.id)), recipes,
});
writeFileSync(new URL("../data/forge-catalog.draft.json", import.meta.url), JSON.stringify(catalog, null, 2) + "\n");
writeFileSync(new URL("../data/forge-catalog.schema.json", import.meta.url), JSON.stringify(z.toJSONSchema(catalogSchema), null, 2) + "\n");
console.log(`Validated ${catalog.recipes.length} draft recipes and ${catalog.items.length} items. ${recipes.filter((recipe) => recipe.chronology.assessment === "post-cutoff").length} recipes postdate ${cutoff}.`);
