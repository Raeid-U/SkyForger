import { z } from "zod";

const id = z.string().min(1);
const integer = z.number().int().nonnegative();
const date = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const reduction = z.number().min(0).max(1);

export const evidenceSchema = z.object({
  url: z.url(),
  retrievedOn: date,
  revisionId: integer.nullable(),
  note: z.string(),
}).strict();

export const itemSchema = z.object({
  id,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  // Internal IDs are not Hypixel IDs. Resolve these against actual API resources.
  hypixelItemId: id.nullable(),
  bazaarProductId: id.nullable(),
  market: z.enum(["unknown", "bazaar", "auction", "nonmarket"]),
}).strict();

export const requirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hotm"), level: integer.max(10) }).strict(),
  z.object({ kind: z.literal("collection"), collection: id, level: integer.positive() }).strict(),
  z.object({ kind: z.literal("manual"), key: id, description: z.string().min(1) }).strict(),
]);

export const chronologySchema = z.object({
  // Source retrieval date is never substituted for a game release date.
  introducedOn: date.nullable(),
  validFrom: date.nullable(),
  validUntilExclusive: date.nullable(),
  assessment: z.enum(["unknown", "post-cutoff", "historically-verified"]),
  evidence: z.array(evidenceSchema),
}).strict().superRefine((value, context) => {
  if (value.validFrom && value.validUntilExclusive && value.validFrom >= value.validUntilExclusive) {
    context.addIssue({ code: "custom", message: "Recipe validity range must be increasing" });
  }
  if (value.introducedOn && value.validFrom && value.validFrom < value.introducedOn) {
    context.addIssue({ code: "custom", message: "Recipe cannot take effect before its public introduction" });
  }
  if (value.assessment === "historically-verified" && (!value.validFrom || !value.evidence.length)) {
    context.addIssue({ code: "custom", message: "Historical verification requires dated recipe-version evidence" });
  }
});

export const recipeSchema = z.object({
  id,
  versionId: id,
  output: z.object({ itemId: id, quantity: integer.positive().nullable() }).strict(),
  category: z.string(),
  method: z.enum(["forge", "crafting"]),
  baseDurationSeconds: integer.nullable(),
  timing: z.object({
    quickForgeEligible: z.boolean().nullable(),
    moltenForgeEligible: z.boolean().nullable(),
  }).strict(),
  requirements: z.array(requirementSchema),
  inputs: z.array(z.object({ itemId: id, quantity: integer.positive() }).strict()).min(1),
  coinCost: integer,
  provenance: z.object({
    sourceStatus: z.enum(["wiki_checked", "wiki_audited", "legacy_partial_audit", "partial_wiki"]),
    fieldAudit: z.object({
      ingredients: z.enum(["pending", "verified"]),
      duration: z.enum(["pending", "verified"]),
      requirements: z.enum(["pending", "verified"]),
      outputQuantity: z.enum(["pending", "verified"]),
    }).strict(),
    evidence: z.array(evidenceSchema).min(1),
    notes: z.array(z.string()),
  }).strict(),
  chronology: chronologySchema,
}).strict().superRefine((value, context) => {
  if (value.method === "forge" && value.baseDurationSeconds === 0) {
    context.addIssue({ code: "custom", message: "Forge duration must be positive or unknown" });
  }
  if (value.method === "crafting" && value.baseDurationSeconds !== 0) {
    context.addIssue({ code: "custom", message: "Crafting recipes must have zero forge duration" });
  }
});

export const catalogSchema = z.object({
  schemaVersion: z.literal(3),
  status: z.literal("draft"),
  importedOn: date,
  historicalCutoff: date,
  source: z.object({ file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), generatedOn: date }).strict(),
  items: z.array(itemSchema),
  recipes: z.array(recipeSchema),
}).strict().superRefine((value, context) => {
  const items = new Set(value.items.map((item) => item.id));
  if (items.size !== value.items.length) context.addIssue({ code: "custom", message: "Duplicate item ID" });
  const versions = new Set(value.recipes.map((recipe) => recipe.versionId));
  if (versions.size !== value.recipes.length) context.addIssue({ code: "custom", message: "Duplicate recipe version ID" });
  for (const recipe of value.recipes) {
    if (recipe.chronology.assessment === "post-cutoff" && (!recipe.chronology.introducedOn || recipe.chronology.introducedOn <= value.historicalCutoff)) {
      context.addIssue({ code: "custom", message: `Invalid post-cutoff assessment: ${recipe.id}` });
    }
    for (const itemId of [recipe.output.itemId, ...recipe.inputs.map((input) => input.itemId)]) {
      if (!items.has(itemId)) context.addIssue({ code: "custom", message: `Unknown item reference: ${itemId}` });
    }
  }
});

export const playerSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  hotmLevel: integer.max(10),
  peakOfTheMountainLevel: integer,
  quickForge: z.object({ enabled: z.boolean(), level: integer.nullable(), reduction: reduction.nullable() }).strict(),
  collections: z.record(id, integer),
  manualUnlocks: z.array(id),
  bazaarSalesTax: reduction,
}).strict();

// Planning inputs are separate from an observed active job. An active mayor now
// does not prove that Molten Forge was active when an existing job started.
export const timingContextSchema = z.object({
  quickForgeReduction: reduction.nullable(),
  moltenForgeAtStart: z.enum(["active", "inactive", "unknown"]),
  moltenForgeReduction: reduction.nullable(),
  stacking: z.enum(["additive", "multiplicative", "unknown"]),
  evidence: z.array(evidenceSchema),
}).strict().superRefine((value, context) => {
  if (value.stacking === "additive" && value.quickForgeReduction !== null && value.moltenForgeAtStart === "active" && value.moltenForgeReduction !== null && value.quickForgeReduction + value.moltenForgeReduction >= 1) {
    context.addIssue({ code: "custom", message: "Combined reductions must leave a positive forge duration" });
  }
});

export const activeForgeJobSchema = z.object({
  slot: integer,
  apiItemId: id,
  recipeVersionId: id.nullable(),
  startedAt: instant,
  observedAt: instant,
  timingContext: timingContextSchema,
  // null means unknown, never ready. An API slot may have no catalog match.
  completion: z.object({
    estimatedReadyAt: instant.nullable(),
    apiReadyAt: instant.nullable(),
    confidence: z.enum(["api-reported", "estimated", "unknown"]),
    unmodeledEffects: z.array(z.string()),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.completion.confidence === "api-reported" && value.completion.apiReadyAt === null) context.addIssue({ code: "custom", message: "API-reported confidence requires an API completion time" });
  if (value.completion.confidence === "estimated" && value.completion.estimatedReadyAt === null) context.addIssue({ code: "custom", message: "Estimated confidence requires an estimated completion time" });
});

// Normalized application response, not a claim about undocumented Hypixel fields.
export const forgeTrackerSchema = z.object({
  uuid: id,
  username: z.string().min(1),
  selectedProfileId: id.nullable(),
  fetchedAt: instant,
  availability: z.enum(["available", "no-profiles", "api-disabled", "missing-data", "upstream-error"]),
  profiles: z.array(z.object({ id, name: z.string(), selected: z.boolean() }).strict()),
  jobs: z.array(activeForgeJobSchema),
}).strict();

export type ForgeCatalog = z.infer<typeof catalogSchema>;
export type ForgeRecipe = z.infer<typeof recipeSchema>;
export type ActiveForgeJob = z.infer<typeof activeForgeJobSchema>;

export function isHistoricallyEligible(recipe: ForgeRecipe, asOf: string): boolean {
  if (recipe.chronology.assessment !== "historically-verified" || !recipe.chronology.validFrom) return false;
  return (!recipe.chronology.introducedOn || recipe.chronology.introducedOn <= asOf)
    && recipe.chronology.validFrom <= asOf
    && (!recipe.chronology.validUntilExclusive || asOf < recipe.chronology.validUntilExclusive);
}
