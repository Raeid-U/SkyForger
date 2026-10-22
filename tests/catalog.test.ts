import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  catalog,
  itemByApiId,
  itemById,
  recipeByOutput,
} from "../lib/forge/catalog";
import { catalogSchema } from "../lib/forge/schema";
import { checkAssets, imageSize } from "../scripts/lib/assets";
import { normalizeProfiles } from "../lib/forge/tracker";

function changed(mutate: (value: typeof catalog) => void) {
  const value = structuredClone(catalog);
  mutate(value);
  return catalogSchema.safeParse(value).success;
}

test("canonical catalog covers forge dependencies, coin costs and unlocks", () => {
  assert.equal(
    catalog.recipes.filter((recipe) => recipe.method === "forge").length,
    119,
  );
  assert.equal(
    catalog.recipes.filter((recipe) => recipe.method === "crafting").length,
    36,
  );
  assert.equal(recipeByOutput.get("divan-s-drill")!.coins, 50_000_000);
  assert.equal(recipeByOutput.get("gemstone-chamber")!.coins, 25_000);
  assert.equal(itemById.has("coins"), false);
  assert.ok(
    recipeByOutput
      .get("ankylosaurus")!
      .requirements.some(
        (req) =>
          req.kind === "manual" && req.description.includes("Clubbed Fossil"),
      ),
  );
  for (const id of [
    "tungsten-plate",
    "umber-plate",
    "refined-tungsten",
    "refined-umber",
    "gemstone-mixture",
    "glacite-amalgamation",
  ])
    assert.ok(recipeByOutput.has(id));
});

test("older catalog imports retain reviewed forge durations", () => {
  assert.equal(
    recipeByOutput.get("ruby-polished-drill-engine")!.duration,
    72_000,
  );
  assert.equal(
    recipeByOutput.get("amber-polished-drill-engine")!.duration,
    180_000,
  );
  assert.equal(
    recipeByOutput.get("perfectly-cut-fuel-tank")!.duration,
    180_000,
  );
});

test("catalog rejects ambiguous identities, duplicate outputs and dangling references", () => {
  assert.equal(
    changed((value) => {
      value.items.push(value.items[0]);
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.items[1].apiId = value.items[0].apiId;
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.items[1].aliases.push(value.items[0].apiId!);
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.recipes[1].outputId = value.recipes[0].outputId;
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.recipes[0].inputs[0].itemId = "missing-material";
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.recipes[0].source = "missing-source";
    }),
    false,
  );
});

test("catalog rejects dependency cycles, invalid unlocks and asset paths", () => {
  assert.equal(
    changed((value) => {
      value.recipes[0].inputs[0].itemId = value.recipes[0].outputId;
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.recipes[0].duration = 0;
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.recipes[0].requirements = [{ kind: "hotm", level: 11 }];
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.items.find((item) => item.image)!.image!.src =
        "/items/../private.png";
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.items.find((item) => item.image)!.image!.source = "missing-source";
    }),
    false,
  );
});

test("API IDs and legacy aliases resolve to the same item without changing stable IDs", () => {
  assert.equal(
    itemByApiId.get("TITANIUM_DRILL_4")?.id,
    "titanium-drill-dr-x655",
  );
  assert.equal(
    itemByApiId.get("TITANIUM_DRILL_DR_X655")?.id,
    "titanium-drill-dr-x655",
  );
  assert.equal(itemByApiId.get("AMMONITE_PET")?.id, "ammonite");
  assert.equal(itemByApiId.get("DRILL_ENGINE")?.id, "drill-motor");
  const uuid = "12345678901234567890123456789012";
  const result = normalizeProfiles(
    {
      success: true,
      profiles: [
        {
          profile_id: "test",
          members: {
            [uuid]: {
              forge: {
                forge_processes: {
                  forge_1: {
                    "1": {
                      id: "AMMONITE_PET",
                      slot: 1,
                      startTime: 1700000000000,
                    },
                    "3": {
                      id: "TITANIUM_DRILL_4",
                      slot: 3,
                      startTime: 1700000000000,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    uuid,
  );
  assert.deepEqual(
    result.jobs.map((job) => [job.slot, job.itemId]),
    [
      [1, "ammonite"],
      [3, "titanium-drill-dr-x655"],
    ],
  );
});

test("local asset references match files and dimensions, and unknown imagery stays explicit", () => {
  checkAssets(catalog);
  assert.equal(catalog.items.filter((item) => item.image).length, 231);
  assert.equal(
    itemById.get("titanium-drill-dr-x655")!.image!.src,
    "/items/titanium-drill-dr-x655.gif",
  );
  assert.equal(
    itemById.get("rough-ruby-gemstone")!.image!.src,
    "/items/rough-ruby-gemstone.png",
  );
  assert.equal(
    changed((value) => {
      value.items[0].image = null;
    }),
    true,
  );
  assert.throws(
    () => imageSize(Buffer.from("<html>Forbidden</html>")),
    /PNG or GIF/,
  );
});

test("asset check rejects incorrect dimensions and orphan files", () => {
  const value = structuredClone(catalog);
  value.items.find((item) => item.image)!.image!.width += 1;
  assert.throws(() => checkAssets(value), /dimensions/);
  const root = mkdtempSync(join(tmpdir(), "skyforger-assets-"));
  try {
    mkdirSync(join(root, "public/items"), { recursive: true });
    writeFileSync(join(root, "public/items/unknown.svg"), "<svg />");
    writeFileSync(join(root, "public/items/orphan.png"), "unused");
    assert.throws(
      () => checkAssets({ ...catalog, items: [] }, root),
      /Unreferenced image/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every recipe has a category including dependency recipes absent from the import", () => {
  assert.ok(
    catalog.recipes.every((recipe) => recipe.category.trim().length > 0),
  );
  for (const [id, category] of [
    ["refined-mithril", "Refining"],
    ["perfect-ruby-gemstone", "Perfect Gemstones"],
    ["ammonite", "Pets / Pet Items"],
    ["tungsten-plate", "Refining"],
    ["drill-motor", "Drill Upgrades/Parts"],
  ])
    assert.equal(recipeByOutput.get(id)?.category, category);
  assert.equal(
    changed((value) => {
      value.recipes[0].category = "";
    }),
    false,
  );
  assert.equal(
    changed((value) => {
      value.items[0].acquisitionCost = -1;
    }),
    false,
  );
});
