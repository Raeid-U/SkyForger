import assert from "node:assert/strict";
import { test } from "node:test";
import type { BazaarSnapshot } from "../lib/bazaar";
import { itemById, recipes, recipeByOutput } from "../lib/forge/catalog";
import { marketQuote, materialCost, rankRecipe } from "../lib/forge/pricing";
import { buildPlan } from "../lib/forge/planner";
import {
  defaultSettings,
  durationSeconds,
  forgeSlots,
  quickForgeReduction,
  settingsSchema,
  missingRequirements,
  type Settings,
} from "../lib/forge/settings";
import { itemMarket, matchesMarket } from "../lib/forge/markets";
import { normalizeProfiles } from "../lib/forge/tracker";

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...defaultSettings,
    hotm: 10,
    peak: 2,
    collections: { Gemstone: 10, Tungsten: 10, Umber: 10, Glacite: 10 },
    ...overrides,
  };
}
function snapshot(id = "refined-mithril"): BazaarSnapshot {
  const product_id = itemById.get(id)!.apiId!;
  return {
    success: true,
    lastUpdated: 1700000000000,
    products: {
      [product_id]: {
        product_id,
        buy_summary: [
          { amount: 2, pricePerUnit: 10, orders: 1 },
          { amount: 3, pricePerUnit: 12, orders: 1 },
        ],
        sell_summary: [
          { amount: 2, pricePerUnit: 8, orders: 1 },
          { amount: 3, pricePerUnit: 6, orders: 1 },
        ],
      },
    },
  };
}

test("instant quotes walk the correct order-book side and reject insufficient depth", () => {
  assert.equal(
    marketQuote("refined-mithril", 3, "buy", snapshot(), settings()),
    32,
  );
  assert.equal(
    marketQuote("refined-mithril", 3, "sell", snapshot(), settings()),
    22,
  );
  assert.equal(
    marketQuote("refined-mithril", 6, "buy", snapshot(), settings()),
    null,
  );
});
test("passive orders use matching best prices without pretending they are filled", () => {
  const value = settings({ buyMode: "order", sellMode: "offer" });
  assert.equal(
    marketQuote("refined-mithril", 100, "buy", snapshot(), value),
    800,
  );
  assert.equal(
    marketQuote("refined-mithril", 100, "sell", snapshot(), value),
    1000,
  );
});
test("missing prices remain unknown and explicit manual zero is preserved", () => {
  assert.equal(
    marketQuote("missing-material", 1, "buy", null, settings()),
    null,
  );
  assert.equal(
    marketQuote(
      "missing-material",
      1,
      "buy",
      null,
      settings({ prices: { "missing-material": 0 } }),
    ),
    0,
  );
});
test("gemstone crafting is cheaper only when the shared collection is unlocked", () => {
  const prices = { "flawless-ruby-gemstone": 100, "fine-ruby-gemstone": 1 };
  assert.equal(
    materialCost(
      "flawless-ruby-gemstone",
      2,
      null,
      settings({ prices, collections: { Gemstone: 9 } }),
    ),
    160,
  );
  assert.equal(
    materialCost(
      "flawless-ruby-gemstone",
      2,
      null,
      settings({ prices, collections: { Gemstone: 8 } }),
    ),
    200,
  );
});
test("Bazaar sales tax is applied once with no offer placement fee", () => {
  const recipe = recipeByOutput.get("refined-mithril")!;
  const row = rankRecipe(
    recipe,
    null,
    settings({
      prices: { "enchanted-mithril": 1, "refined-mithril": 1000 },
      tax: 0.01,
      sellMode: "offer",
    }),
  );
  assert.equal(row.cost, 160);
  assert.equal(row.revenue, 990);
  assert.equal(row.profit, 830);
  assert.equal(row.perHour, 830 / 6);
});
test("known ingredient cost is displayed even when output has no price", () => {
  const row = rankRecipe(
    recipeByOutput.get("refined-mithril")!,
    null,
    settings({ prices: { "enchanted-mithril": 1 } }),
  );
  assert.equal(row.cost, 160);
  assert.equal(row.profit, null);
});
test("Quick Forge has its level-20 jump and reductions stack additively", () => {
  assert.equal(quickForgeReduction(0), 0);
  assert.equal(quickForgeReduction(1), 0.105);
  assert.equal(quickForgeReduction(19), 0.195);
  assert.equal(quickForgeReduction(20), 0.3);
  assert.equal(
    durationSeconds(
      { ...recipeByOutput.get("refined-mithril")!, duration: 100 },
      settings({ quickForge: 20, moltenForge: true }),
    ),
    45,
  );
});
test("forge slots follow current HOTM tiers and cap at seven", () => {
  assert.equal(forgeSlots(settings({ hotm: 1, peak: 0 })), 0);
  assert.equal(forgeSlots(settings({ hotm: 2, peak: 0 })), 2);
  assert.equal(forgeSlots(settings({ hotm: 4, peak: 0 })), 4);
  assert.equal(forgeSlots(settings({ hotm: 4, peak: 2 })), 4);
  assert.equal(forgeSlots(settings({ hotm: 7 })), 7);
  assert.equal(forgeSlots(settings({ hotm: 10 })), 7);
});
test("owned inventory is allocated once across shared recipe branches", () => {
  const owned = { "golden-plate": 1 };
  const plan = buildPlan(
    "mithril-plated-drill-engine",
    1,
    owned,
    settings(),
    null,
  );
  const nodes: {
    owned: number;
    itemId: string;
    children: (typeof plan.tree)[];
  }[] = [];
  const visit = (node: typeof plan.tree) => {
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(plan.tree);
  assert.equal(
    nodes
      .filter((node) => node.itemId === "golden-plate")
      .reduce((sum, node) => sum + node.owned, 0),
    1,
  );
  assert.equal(
    nodes.filter((node) => node.itemId === "golden-plate").length,
    2,
  );
  assert.deepEqual(owned, { "golden-plate": 1 });
});
test("slot schedules never overlap and parent jobs follow their prerequisites", () => {
  const plan = buildPlan(
    "mithril-plate",
    1,
    {},
    settings({ hotm: 3, peak: 0 }),
    null,
  );
  assert.ok(plan.jobs.every((job) => job.slot >= 1 && job.slot <= 3));
  for (const slot of [1, 2, 3]) {
    const jobs = plan.jobs
      .filter((job) => job.slot === slot)
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < jobs.length; index++)
      assert.ok(jobs[index].start >= jobs[index - 1].finish);
  }
  const final = plan.jobs.find((job) => job.itemId === "mithril-plate")!;
  assert.ok(
    plan.jobs
      .filter((job) => job !== final)
      .every((job) => job.finish <= final.start),
  );
  assert.equal(plan.completionSeconds, final.finish);
});
test("cheapest dependencies buy intermediate items without consuming their materials", () => {
  const plan = buildPlan(
    "mithril-plate",
    1,
    { "enchanted-mithril": 1 },
    settings({ prices: { "refined-mithril": 1, "enchanted-mithril": 10 } }),
    null,
    "cheapest",
  );
  assert.equal(
    plan.tree.children.find((child) => child.itemId === "refined-mithril")
      ?.action,
    "buy",
  );
  assert.ok(
    !plan.materials.some((material) => material.itemId === "enchanted-mithril"),
  );
});
test("planner rejects locked targets and invalid quantities", () => {
  assert.throws(
    () => buildPlan("mithril-plate", 1, {}, settings({ hotm: 2 }), null),
    /HOTM/,
  );
  for (const amount of [0, -1, 1.5, 101])
    assert.throws(() =>
      buildPlan("mithril-plate", amount, {}, settings(), null),
    );
});
test("application catalog has valid references, unique API mappings, and no cycles", () => {
  const apiIds = [...itemById.values()]
    .map((item) => item.apiId)
    .filter(Boolean);
  assert.equal(new Set(apiIds).size, apiIds.length);
  for (const recipe of recipes) {
    assert.ok(itemById.has(recipe.outputId));
    for (const input of recipe.inputs) assert.ok(itemById.has(input.itemId));
    function visit(id: string, path: Set<string>) {
      assert.ok(!path.has(id), `Cycle: ${id}`);
      recipeByOutput
        .get(id)
        ?.inputs.forEach((input) => visit(input.itemId, new Set(path).add(id)));
    }
    visit(recipe.outputId, new Set());
  }
});

const uuid = "12345678901234567890123456789012";
const profile = {
  profile_id: "abcdef0123456789abcdef0123456789",
  cute_name: "Apple",
  selected: true,
  members: { [uuid]: {} },
};
test("tracker distinguishes absent data, empty slots, and no profiles", () => {
  assert.equal(
    normalizeProfiles({ success: true, profiles: null }, uuid).availability,
    "no-profiles",
  );
  assert.equal(
    normalizeProfiles({ success: true, profiles: [profile] }, uuid)
      .availability,
    "missing-data",
  );
  const empty = {
    ...profile,
    members: { [uuid]: { forge: { forge_processes: { forge_1: {} } } } },
  };
  assert.equal(
    normalizeProfiles({ success: true, profiles: [empty] }, uuid).availability,
    "available",
  );
});
test("tracker retains unknown items, validates timestamps, and selects explicit profiles", () => {
  const payload = {
    success: true,
    profiles: [
      {
        ...profile,
        members: {
          [uuid]: {
            forge: {
              forge_processes: {
                forge_1: {
                  "0": {
                    id: "REFINED_MITHRIL",
                    startTime: 1700000000000,
                    slot: 0,
                  },
                  "1": {
                    id: "UNMAPPED_ITEM",
                    startTime: 1700000001000,
                    slot: 1,
                  },
                },
              },
            },
          },
        },
      },
    ],
  };
  const result = normalizeProfiles(payload, uuid, profile.profile_id);
  assert.equal(result.jobs[0].itemId, "refined-mithril");
  assert.equal(result.jobs[1].baseDuration, null);
  payload.profiles[0].members[uuid].forge.forge_processes.forge_1[
    "0"
  ].startTime = 1700000000;
  assert.throws(() => normalizeProfiles(payload, uuid));
  assert.throws(() =>
    normalizeProfiles({ success: true, profiles: [profile] }, uuid, "missing"),
  );
});

test("both markets include the four HOTM-gated metal recipes", () => {
  for (const id of [
    "tungsten-plate",
    "umber-plate",
    "refined-tungsten",
    "refined-umber",
  ]) {
    const recipe = recipeByOutput.get(id)!;
    assert.equal(recipe.method, "forge");
    assert.equal(itemMarket(id), "bazaar");
    assert.equal(matchesMarket(id, "both"), true);
    assert.equal(matchesMarket(id, "bazaar"), true);
    assert.equal(matchesMarket(id, "auction"), false);
    assert.ok(missingRequirements(recipe, defaultSettings).length);
    assert.deepEqual(missingRequirements(recipe, settings()), []);
  }
});
test("AH outputs require manual pricing and do not incur Bazaar sales tax", () => {
  const recipe = recipeByOutput.get("mithril-drill-sx-r226")!;
  assert.equal(itemMarket(recipe.outputId), "auction");
  assert.equal(matchesMarket(recipe.outputId, "auction"), true);
  assert.equal(matchesMarket(recipe.outputId, "bazaar"), false);
  assert.equal(rankRecipe(recipe, null, settings()).revenue, null);
  assert.equal(
    rankRecipe(recipe, null, settings({ prices: { [recipe.outputId]: 1000 } }))
      .revenue,
    1000,
  );
});
test("persisted settings migrate market preference and discard the old placement fee", () => {
  const { market, ...previous } = defaultSettings;
  const parsed = settingsSchema.parse({ ...previous, orderFee: 0.02 });
  assert.equal(parsed.market, "both");
  assert.equal("orderFee" in parsed, false);
});

test("quest gemstone crystals cost zero without zeroing tradeable crystals", () => {
  const value = settings();
  const perfects = recipes.filter(
    (recipe) => recipe.category === "Perfect Gemstones",
  );
  assert.equal(perfects.length, 12);
  for (const recipe of perfects) {
    const crystal = recipe.inputs.find((input) =>
      input.itemId.endsWith("-crystal"),
    )!;
    assert.equal(marketQuote(crystal.itemId, 3, "buy", null, value), 0);
    assert.equal(marketQuote(crystal.itemId, 1, "sell", null, value), null);
    const prices = Object.fromEntries(
      recipe.inputs
        .filter((input) => input !== crystal)
        .map((input) => [input.itemId, 100]),
    );
    const row = rankRecipe(recipe, null, settings({ prices }));
    assert.equal(row.cost, 500);
    assert.ok(!row.missing.includes(crystal.itemId));
  }
  assert.equal(marketQuote("power-crystal", 1, "buy", null, value), null);
  assert.equal(marketQuote("gleaming-crystal", 1, "buy", null, value), null);
  assert.equal(
    marketQuote(
      "ruby-crystal",
      2,
      "buy",
      null,
      settings({ prices: { "ruby-crystal": 25 } }),
    ),
    50,
  );
});
test("perfect gemstone plans retain quest crystals at zero cost", () => {
  const plan = buildPlan(
    "perfect-ruby-gemstone",
    1,
    {},
    settings({ prices: { "flawless-ruby-gemstone": 100 } }),
    null,
    "cheapest",
  );
  assert.equal(plan.cost, 500);
  assert.deepEqual(
    plan.materials.map(({ itemId, quantity, cost }) => ({ itemId, quantity, cost })).find((material) => material.itemId === "ruby-crystal"),
    { itemId: "ruby-crystal", quantity: 1, cost: 0 },
  );
});

test("Fine is the gemstone floor even with cheap Rough and Flawed prices", () => {
  const value = settings({
    prices: {
      "rough-ruby-gemstone": 0.1,
      "flawed-ruby-gemstone": 0.1,
      "fine-ruby-gemstone": 100,
      "flawless-ruby-gemstone": 10000,
    },
  });
  assert.equal(materialCost("fine-ruby-gemstone", 2, null, value), 200);
  assert.equal(materialCost("flawless-ruby-gemstone", 1, null, value), 8000);
  const plan = buildPlan("perfect-ruby-gemstone", 1, {}, value, null);
  assert.equal(plan.cost, 40000);
  assert.deepEqual(
    plan.materials.map(({ itemId, quantity, cost }) => ({ itemId, quantity, cost })).sort((a, b) => a.itemId.localeCompare(b.itemId)),
    [
      { itemId: "fine-ruby-gemstone", quantity: 400, cost: 40000 },
      { itemId: "ruby-crystal", quantity: 1, cost: 0 },
    ],
  );
});
test("unpriced Fine gemstones stay unresolved rather than using lower tiers or owned Flawed", () => {
  const value = settings({
    prices: { "rough-ruby-gemstone": 0.1, "flawed-ruby-gemstone": 0.1 },
  });
  assert.equal(materialCost("fine-ruby-gemstone", 1, null, value), null);
  for (const strategy of ["forge", "cheapest"] as const) {
    const plan = buildPlan(
      "perfect-ruby-gemstone",
      1,
      { "flawed-ruby-gemstone": 1000000, "fine-ruby-gemstone": 100 },
      value,
      null,
      strategy,
    );
    assert.equal(plan.cost, null);
    assert.deepEqual(
      plan.materials.map(({ itemId, quantity, cost }) => ({ itemId, quantity, cost })).find(
        (material) => material.itemId === "fine-ruby-gemstone",
      ),
      { itemId: "fine-ruby-gemstone", quantity: 300, cost: null },
    );
    assert.ok(
      !plan.materials.some((material) =>
        /^(flawed|rough)-/.test(material.itemId),
      ),
    );
  }
});

test("craft material scope includes partial dependencies but excludes finished targets and rough gemstones", async () => {
  const { craftMaterialIds } = await import("../lib/forge/planner");
  const { extractInventory } = await import("../lib/server/inventory");
  const scope = craftMaterialIds("perfect-ruby-gemstone", settings());
  assert.ok(scope.has("flawless-ruby-gemstone"));
  assert.ok(scope.has("fine-ruby-gemstone"));
  assert.ok(!scope.has("flawed-ruby-gemstone"));
  assert.ok(!scope.has("rough-ruby-gemstone"));
  assert.ok(!scope.has("perfect-ruby-gemstone"));
  assert.ok(!scope.has("refined-mithril"));
  const stock = extractInventory({ inventory: { sacks_counts: {
    FLAWLESS_RUBY_GEM: 2, FINE_RUBY_GEM: 10, ROUGH_RUBY_GEM: 1000,
    REFINED_MITHRIL: 4, PERFECT_RUBY_GEM: 1,
  } } }, scope);
  assert.deepEqual(stock.items, { "flawless-ruby-gemstone": 2, "fine-ruby-gemstone": 10 });
  const full = buildPlan("perfect-ruby-gemstone", 1, {}, settings(), null);
  const partial = buildPlan("perfect-ruby-gemstone", 1, stock.items, settings(), null);
  assert.ok(partial.materials.find((item) => item.itemId === "fine-ruby-gemstone")!.quantity < full.materials.find((item) => item.itemId === "fine-ruby-gemstone")!.quantity);
});
