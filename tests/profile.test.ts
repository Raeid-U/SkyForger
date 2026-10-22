import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { writeUncompressed, type NBT } from "prismarine-nbt";
import { extractProgression, extractEnvironment } from "../lib/forge/profile";
import { extractInventory } from "../lib/server/inventory";
import {
  defaultSettings,
  preferencesSchema,
  forgeSlots,
} from "../lib/forge/settings";
import { normalizeProfiles, trackerResultSchema } from "../lib/forge/tracker";

const uuid = "12345678901234567890123456789012";
function profile() {
  return {
    profile_id: "abcdef01-2345-6789-abcd-ef0123456789",
    cute_name: "Kiwi",
    selected: true,
    community_upgrades: {
      upgrade_states: [
        { upgrade: "bazaar_flipper", tier: 1, claimed_by: uuid },
      ],
    },
    members: {
      [uuid]: {
        skill_tree: {
          experience: { mining: 1247000 },
          selected_skill_tree_slot: { mining: 1 },
          nodes: {
            mining: { forge_time: 20 },
            mining_2: {
              core_of_the_mountain: 10,
              forge_time: 10,
              toggle_forge_time: true,
            },
          },
        },
        player_data: {
          unlocked_coll_tiers: [
            "GEMSTONE_COLLECTION_-1",
            "GEMSTONE_COLLECTION_11",
            "TUNGSTEN_9",
            "UMBER_6",
            "GLACITE_8",
            "HARD_STONE_7",
          ],
        },
        glacite_player_data: { fossils_donated: ["CLUBBED", "FOOTPRINT"] },
        objectives: { talk_to_dulin_1: { status: "COMPLETE" } },
        forge: {
          forge_processes: {
            forge_1: {
              "1": {
                id: "GLACITE_AMALGAMATION",
                slot: 1,
                startTime: 1700000000000,
              },
            },
          },
        },
      },
    },
  };
}

test("modern profile maps the selected loadout, collection tiers, fossils, tax and forge jobs", () => {
  const p = profile();
  const result = normalizeProfiles(
    { success: true, profiles: [p] },
    uuid,
    p.profile_id.replaceAll("-", ""),
  );
  trackerResultSchema.parse(result);
  const progress = result.progression!;
  assert.equal(progress.settings.hotm, 10);
  assert.equal(progress.settings.peak, 10);
  assert.equal(progress.settings.quickForge, 10);
  assert.equal(progress.settings.tax, 0.01125);
  assert.equal(forgeSlots({ ...defaultSettings, ...progress.settings }), 7);
  assert.deepEqual(progress.settings.collections, {
    Gemstone: 11,
    Tungsten: 9,
    Umber: 6,
    Glacite: 8,
    "Hard Stone": 7,
  });
  assert.deepEqual(progress.settings.unlocks.sort(), [
    "ankylosaurus-unlock-1",
    "secret-railroad-pass-unlock-1",
    "t-rex-unlock-1",
  ]);
  assert.equal(result.jobs[0].slot, 1);
  assert.equal(result.jobs[0].itemId, "glacite-amalgamation");
});

test("disabled Quick Forge is not taken from another loadout", () => {
  const p = profile();
  p.members[uuid].skill_tree.nodes.mining_2.toggle_forge_time = false;
  assert.equal(extractProgression(p, uuid).settings.quickForge, 0);
});

test("legacy profiles use legacy mining fields and co-op collection contributions", () => {
  const result = extractProgression(
    {
      members: {
        [uuid]: {
          mining_core: {
            experience: 347000,
            nodes: { forge_time: 20, special_0: 2 },
          },
          collection: { GEMSTONE_COLLECTION: 24999 },
        },
        coop: { collection: { GEMSTONE_COLLECTION: 1 } },
      },
    },
    uuid,
  );
  assert.equal(result.settings.hotm, 7);
  assert.equal(result.settings.quickForge, 20);
  assert.equal(result.settings.peak, 2);
  assert.ok(result.settings.collections.Gemstone >= 5);
});

test("community tax ignores in-progress upgrades and reaches the second tier only when claimed", () => {
  const p = profile();
  p.community_upgrades.upgrade_states.push({
    upgrade: "bazaar_flipper",
    tier: 2,
    claimed_by: "",
  });
  assert.equal(extractProgression(p, uuid).settings.tax, 0.01125);
  p.community_upgrades.upgrade_states[1].claimed_by = uuid;
  assert.equal(extractProgression(p, uuid).settings.tax, 0.01);
});

test("missing progression is marked unavailable without inventing unlocks", () => {
  const result = extractProgression({ members: { [uuid]: {} } }, uuid);
  assert.equal(result.settings.hotm, 0);
  assert.deepEqual(result.settings.unlocks, []);
  assert.ok(
    result.warnings.some((warning) => warning.includes("Mining progression")),
  );
  assert.ok(
    result.warnings.some((warning) => warning.includes("Collection data")),
  );
  assert.throws(
    () =>
      normalizeProfiles(
        { success: true, profiles: [{ profile_id: "missing", members: {} }] },
        uuid,
      ),
    /not a member/,
  );
});

test("stored manual progression is discarded while market choices are kept", () => {
  const prefs = preferencesSchema.parse({
    ...defaultSettings,
    hotm: 10,
    quickForge: 20,
    tax: 0,
    prices: { "refined-mithril": 12 },
  });
  assert.deepEqual(Object.keys(prefs).sort(), [
    "buyMode",
    "market",
    "prices",
    "sellMode",
  ]);
  assert.equal(prefs.prices["refined-mithril"], 12);
});

test("only active mayor or minister perks enable Molten Forge", () => {
  assert.equal(
    extractEnvironment({
      success: true,
      mayor: { name: "Cole", perks: [{ name: "Molten Forge" }] },
    }).moltenForge,
    true,
  );
  assert.equal(
    extractEnvironment({
      success: true,
      mayor: {
        name: "Diana",
        perks: [],
        minister: { name: "Cole", perks: [{ name: "Molten Forge" }] },
      },
    }).moltenForge,
    true,
  );
  const result = extractEnvironment({
    success: true,
    mayor: { name: "Jerry", perks: [] },
    current: {
      candidates: [{ name: "Cole", perks: [{ name: "Molten Forge" }] }],
    },
  });
  assert.equal(result.moltenForge, false);
  assert.ok(result.warnings.length > 0);
});

function container(id: string, count: number) {
  const data: NBT = {
    name: "",
    type: "compound",
    value: {
      i: {
        type: "list",
        value: {
          type: "compound",
          value: [
            {
              Count: { type: "byte", value: count },
              tag: {
                type: "compound",
                value: {
                  ExtraAttributes: {
                    type: "compound",
                    value: { id: { type: "string", value: id } },
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
  return { data: gzipSync(writeUncompressed(data)).toString("base64") };
}

test("inventory combines stacks, sacks and available quest crystals without counting backpack icons", () => {
  const result = extractInventory({
    inventory: {
      inv_contents: container("ENCHANTED_MITHRIL", 16),
      sacks_counts: { ENCHANTED_MITHRIL: 20, UNKNOWN_ITEM: 999 },
      backpack_contents: { "0": container("ENCHANTED_MITHRIL", 3) },
      backpack_icons: { "0": container("ENCHANTED_MITHRIL", 64) },
    },
    mining_core: {
      crystals: {
        ruby_crystal: { state: "FOUND" },
        jade_crystal: { state: "PLACED" },
      },
    },
  });
  assert.deepEqual(result.items, {
    "enchanted-mithril": 39,
    "ruby-crystal": 1,
  });
  assert.deepEqual(result.warnings, []);
});

test("unreadable inventory does not discard available sacks or pretend storage is complete", () => {
  const result = extractInventory({
    inventory: {
      sacks_counts: { ENCHANTED_MITHRIL: 20 },
      inv_contents: { data: "invalid" },
    },
  });
  assert.equal(result.items["enchanted-mithril"], 20);
  assert.ok(result.warnings.length > 0);
});
