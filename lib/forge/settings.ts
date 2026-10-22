import { z } from "zod";
import type { Recipe } from "./catalog";

export const settingsSchema = z.object({
  hotm: z.number().int().min(0).max(10),
  peak: z.number().int().min(0).max(10),
  quickForge: z.number().int().min(0).max(20),
  moltenForge: z.boolean(),
  tax: z.number().min(0).max(0.2),
  orderFee: z.number().min(0).max(0.2),
  buyMode: z.enum(["instant", "order"]),
  sellMode: z.enum(["instant", "offer"]),
  collections: z.record(z.string(), z.number().int().min(0).max(20)),
  unlocks: z.array(z.string()),
  prices: z.record(z.string(), z.number().finite().nonnegative()),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  hotm: 2,
  peak: 0,
  quickForge: 0,
  moltenForge: false,
  tax: 0.0125,
  orderFee: 0,
  buyMode: "instant",
  sellMode: "instant",
  collections: {},
  unlocks: [],
  prices: {},
};
export function quickForgeReduction(level: number) {
  return level <= 0
    ? 0
    : Math.min(30, 10 + level * 0.5 + Math.floor(level / 20) * 10) / 100;
}
export function durationSeconds(
  recipe: Recipe,
  settings: Settings,
  molten = settings.moltenForge,
) {
  return recipe.duration === null
    ? null
    : Math.ceil(
        recipe.duration *
          (1 - quickForgeReduction(settings.quickForge) - (molten ? 0.25 : 0)),
      );
}
export function forgeSlots(settings: Settings) {
  return settings.hotm < 2
    ? 0
    : 2 +
        Number(settings.hotm >= 3) +
        Number(settings.hotm >= 4) +
        Number(settings.peak >= 2);
}
export function missingRequirements(
  recipe: Recipe,
  settings: Settings,
): string[] {
  return recipe.requirements.flatMap((req) => {
    if (req.kind === "hotm" && settings.hotm < (req.level ?? 0))
      return [`HOTM ${req.level}`];
    if (
      req.kind === "collection" &&
      (settings.collections[req.collection ?? ""] ?? 0) < (req.level ?? 0)
    )
      return [`${req.collection} ${req.level}`];
    if (req.kind === "manual" && !settings.unlocks.includes(req.key ?? ""))
      return [req.description ?? "Additional unlock"];
    return [];
  });
}
