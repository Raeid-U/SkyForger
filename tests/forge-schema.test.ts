import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import draft from "../data/forge-catalog.draft.json";
import { activeForgeJobSchema, catalogSchema, isHistoricallyEligible, recipeSchema, timingContextSchema } from "../lib/schemas/forge";

const catalog = catalogSchema.parse(draft);
const byName = (name: string) => {
  const item = catalog.items.find((item) => item.name === name);
  const recipe = catalog.recipes.find((recipe) => recipe.output.itemId === item?.id);
  assert.ok(recipe, `Missing ${name}`);
  return recipe;
};

test("migration preserves all source entries and fingerprints the untouched report", () => {
  assert.equal(catalog.recipes.length, 119);
  assert.equal(catalog.source.sha256, createHash("sha256").update(readFileSync("data/skyblock_forge_baseline.json")).digest("hex"));
  assert.equal(catalog.recipes.filter((recipe) => recipe.provenance.sourceStatus === "legacy_partial_audit").length, 18);
});

test("January cutoff excludes all four February releases", () => {
  assert.deepEqual(catalog.recipes.filter((recipe) => recipe.chronology.assessment === "post-cutoff").map((recipe) => catalog.items.find((item) => item.id === recipe.output.itemId)?.name).sort(), ["Glacite Lantern", "Mithril Lantern", "Titanium Lantern", "Will-o'-wisp"].sort());
  for (const name of ["Glacite Lantern", "Mithril Lantern", "Titanium Lantern", "Will-o'-wisp"]) {
    assert.equal(byName(name).chronology.introducedOn, "2026-02-24");
    assert.equal(isHistoricallyEligible(byName(name), "2026-01-19"), false);
  }
});

test("existing item histories do not automatically certify current recipe versions", () => {
  assert.equal(byName("Refined Mithril").chronology.assessment, "unknown");
  assert.equal(isHistoricallyEligible(byName("Refined Mithril"), "2026-01-19"), false);
  assert.ok(catalog.items.every((item) => item.hypixelItemId === null && item.bazaarProductId === null));
});

test("coin fees remain separate from purchasable material nodes", () => {
  const drill = byName("Divan's Drill");
  assert.equal(drill.coinCost, 50000000);
  assert.equal(drill.inputs.length, 2);
  assert.equal(catalog.items.some((item) => item.name === "Coins"), false);
});

test("manual fossil requirements survive normalization", () => {
  const unlocks = byName("Ankylosaurus").requirements.filter((requirement) => requirement.kind === "manual");
  assert.equal(unlocks[0].description, "Donate Clubbed Fossil to Dr. Stone");
});

test("catalog rejects dangling references and duplicate identities", () => {
  const missing = structuredClone(catalog);
  missing.recipes[0].inputs[0].itemId = "does-not-exist";
  assert.equal(catalogSchema.safeParse(missing).success, false);
  const duplicate = structuredClone(catalog);
  duplicate.items.push(duplicate.items[0]);
  assert.equal(catalogSchema.safeParse(duplicate).success, false);
});

test("version boundaries are inclusive at start and exclusive at end", () => {
  const recipe = structuredClone(byName("Refined Mithril"));
  recipe.chronology = { ...recipe.chronology, assessment: "historically-verified", validFrom: "2026-01-01", validUntilExclusive: "2026-02-01" };
  assert.equal(isHistoricallyEligible(recipe, "2026-01-01"), true);
  assert.equal(isHistoricallyEligible(recipe, "2026-02-01"), false);
  recipe.chronology.validUntilExclusive = "2025-12-31";
  assert.equal(recipeSchema.safeParse(recipe).success, false);
});

test("historical approval requires evidence and cannot predate release", () => {
  const recipe = structuredClone(byName("Mithril Lantern"));
  recipe.chronology.assessment = "historically-verified";
  recipe.chronology.validFrom = "2026-01-01";
  assert.equal(recipeSchema.safeParse(recipe).success, false);
  recipe.chronology.validFrom = "2026-02-24";
  recipe.chronology.evidence = [];
  assert.equal(recipeSchema.safeParse(recipe).success, false);
});

const context = { quickForgeReduction: 0.2, moltenForgeAtStart: "unknown", moltenForgeReduction: 0.25, stacking: "unknown", evidence: [] };
test("timing inputs preserve unknown start-time mayor eligibility", () => {
  assert.equal(timingContextSchema.parse(context).moltenForgeAtStart, "unknown");
  assert.equal(timingContextSchema.safeParse({ ...context, stacking: "additive", moltenForgeAtStart: "active", quickForgeReduction: 0.8 }).success, false);
});

test("unknown API item IDs and completion times remain valid tracker observations", () => {
  const job = activeForgeJobSchema.parse({ slot: 0, apiItemId: "NEW_ITEM_NOT_IN_CATALOG", recipeVersionId: null, startedAt: "2026-01-19T10:30:00Z", observedAt: "2026-01-19T11:00:00Z", timingContext: context, completion: { estimatedReadyAt: null, apiReadyAt: null, confidence: "unknown", unmodeledEffects: ["Gemstone Gauntlet Kinetic reductions"] } });
  assert.equal(job.completion.confidence, "unknown");
  assert.equal(activeForgeJobSchema.safeParse({ ...job, completion: { ...job.completion, confidence: "api-reported" } }).success, false);
});
