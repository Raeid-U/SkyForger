import { z } from "zod";
import rules from "../../data/progression.json";
import { recipes } from "./catalog";
import { settingsSchema } from "./settings";

export const progressionSchema = z.object({
  settings: settingsSchema.pick({
    hotm: true,
    peak: true,
    quickForge: true,
    tax: true,
    collections: true,
    unlocks: true,
  }),
  warnings: z.array(z.string()),
});
export type Progression = z.infer<typeof progressionSchema>;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const integer = (value: unknown, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.floor(value)))
    : 0;

export function extractProgression(
  profile: Record<string, unknown>,
  uuid: string,
): Progression {
  const members = record(profile.members),
    member = record(members[uuid]);
  const tree = record(member.skill_tree),
    legacy = record(member.mining_core);
  const experience = record(tree.experience).mining ?? legacy.experience;
  const warnings: string[] = [];
  const hotm =
    typeof experience === "number" && Number.isFinite(experience)
      ? rules.hotmCumulativeXp.filter((threshold) => experience >= threshold)
          .length
      : 0;
  if (typeof experience !== "number")
    warnings.push("Mining progression is unavailable for this profile.");
  const selectedSlot = integer(record(tree.selected_skill_tree_slot).mining, 4);
  const nodeSets = record(tree.nodes);
  const nodes = record(
    nodeSets[selectedSlot === 0 ? "mining" : `mining_${selectedSlot + 1}`] ??
      legacy.nodes,
  );
  if (!Object.keys(nodes).length && hotm >= 2)
    warnings.push(
      "Mining perks are unavailable; forge times use no Quick Forge reduction.",
    );
  const quickForge =
    nodes.toggle_forge_time === false || nodes.toggle_quick_forge === false
      ? 0
      : integer(nodes.forge_time ?? nodes.quick_forge, 20);
  const peak = integer(nodes.core_of_the_mountain ?? nodes.special_0, 10);
  const player = record(member.player_data);
  const unlocked = player.unlocked_coll_tiers ?? member.unlocked_coll_tiers;
  const collections: Record<string, number> = {};
  if (Array.isArray(unlocked)) {
    for (const [name, definition] of Object.entries(rules.collections)) {
      collections[name] = Math.max(
        0,
        ...unlocked.flatMap((value) => {
          if (
            typeof value !== "string" ||
            !value.startsWith(`${definition.apiId}_`)
          )
            return [];
          const level = Number(value.slice(definition.apiId.length + 1));
          return Number.isInteger(level) && level > 0 && level <= 20
            ? [level]
            : [];
        }),
      );
    }
  } else {
    const available = Object.values(members).map((value) =>
      record(record(value).collection),
    );
    if (!available.some((collection) => Object.keys(collection).length))
      warnings.push(
        "Collection data is unavailable; collection-gated recipes stay locked.",
      );
    for (const [name, definition] of Object.entries(rules.collections)) {
      const amount = available.reduce(
        (sum, collection) =>
          sum +
          (typeof collection[definition.apiId] === "number"
            ? (collection[definition.apiId] as number)
            : 0),
        0,
      );
      collections[name] =
        definition.tiers.filter((tier) => amount >= tier.amount).at(-1)
          ?.level ?? 0;
    }
  }
  const donations = record(member.glacite_player_data).fossils_donated;
  const fossils = new Set(
    Array.isArray(donations)
      ? donations.filter((value): value is string => typeof value === "string")
      : [],
  );
  const objectives = record(member.objectives);
  const unlocks = [
    ...new Set(
      recipes.flatMap((recipe) =>
        recipe.requirements.flatMap((req) => {
          if (req.kind !== "manual") return [];
          const fossil = /^Donate (.+) Fossil to Dr\. Stone$/.exec(
            req.description,
          );
          if (
            fossil &&
            fossils.has(fossil[1].toUpperCase().replaceAll(" ", "_"))
          )
            return [req.key];
          if (
            req.key === "secret-railroad-pass-unlock-1" &&
            record(objectives.talk_to_dulin_1).status === "COMPLETE"
          )
            return [req.key];
          return [];
        }),
      ),
    ),
  ];
  const upgrades = record(profile.community_upgrades).upgrade_states;
  const flipper = Math.max(
    0,
    ...(Array.isArray(upgrades)
      ? upgrades.flatMap((value) => {
          const upgrade = record(value);
          return upgrade.upgrade === "bazaar_flipper" &&
            typeof upgrade.claimed_by === "string" &&
            upgrade.claimed_by.length > 0
            ? [integer(upgrade.tier, 2)]
            : [];
        })
      : []),
  );
  return progressionSchema.parse({
    settings: {
      hotm,
      peak,
      quickForge,
      tax: [0.0125, 0.01125, 0.01][flipper],
      collections,
      unlocks,
    },
    warnings,
  });
}

export const environmentSchema = z.object({
  mayor: z.string().nullable(),
  moltenForge: z.boolean(),
  warnings: z.array(z.string()),
});
export type Environment = z.infer<typeof environmentSchema>;
export function extractEnvironment(value: unknown): Environment {
  const data = z
    .object({
      success: z.literal(true),
      mayor: z
        .object({
          name: z.string(),
          perks: z.array(z.object({ name: z.string() })),
        })
        .passthrough(),
    })
    .passthrough()
    .parse(value);
  const officials = [
    data.mayor,
    record(data.minister),
    record(data.mayor.minister),
  ];
  const moltenForge = officials.some(
    (official) =>
      Array.isArray(official.perks) &&
      official.perks.some(
        (perk: unknown) => record(perk).name === "Molten Forge",
      ),
  );
  return {
    mayor: data.mayor.name,
    moltenForge,
    warnings:
      data.mayor.name === "Jerry"
        ? [
            "Jerry's rotating mayor perks are not reported; planned jobs assume no Molten Forge bonus.",
          ]
        : [],
  };
}
let environmentCache: { expires: number; value: Environment } | null = null;
export async function currentEnvironment(fetcher: typeof fetch = fetch): Promise<Environment> {
  if (environmentCache && environmentCache.expires > Date.now())
    return environmentCache.value;
  try {
    const response = await fetcher(
      "https://api.hypixel.net/v2/resources/skyblock/election",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) throw new Error("Election unavailable");
    const value = extractEnvironment(await response.json());
    environmentCache = { expires: Date.now() + 60000, value };
    return value;
  } catch {
    return {
      mayor: null,
      moltenForge: false,
      warnings: [
        "Mayor data is unavailable; planned jobs assume no Molten Forge bonus.",
      ],
    };
  }
}

export const inventoryResultSchema = z.object({
  items: z.record(z.string(), z.number().int().nonnegative()),
  warnings: z.array(z.string()),
});
