import { z } from "zod";
import { itemByApiId, recipeByOutput } from "./catalog";

const profileSchema = z.object({
  profile_id: z.string(),
  cute_name: z.string().optional(),
  selected: z.boolean().optional(),
  members: z.record(z.string(), z.unknown()),
});
const payloadSchema = z.object({
  success: z.literal(true),
  profiles: z.array(profileSchema).nullable(),
});
const processSchema = z.object({
  id: z.string(),
  startTime: z.number().int().min(1000000000000),
  slot: z.number().int().min(0),
});
export type TrackedJob = {
  slot: number;
  apiItemId: string;
  itemId: string | null;
  startedAt: number;
  baseDuration: number | null;
};
export type TrackerResult = {
  uuid: string;
  selectedProfileId: string | null;
  profiles: { id: string; name: string }[];
  jobs: TrackedJob[];
  availability: "available" | "missing-data" | "no-profiles";
  fetchedAt: number;
};

export function normalizeProfiles(
  value: unknown,
  uuid: string,
  profileId?: string,
): TrackerResult {
  const payload = payloadSchema.parse(value);
  const profiles = payload.profiles ?? [];
  const result: TrackerResult = {
    uuid,
    selectedProfileId: null,
    profiles: profiles.map((profile) => ({
      id: profile.profile_id,
      name: profile.cute_name ?? profile.profile_id,
    })),
    jobs: [],
    availability: "no-profiles",
    fetchedAt: Date.now(),
  };
  if (!profiles.length) return result;
  const selected = profileId
    ? profiles.find((profile) => profile.profile_id === profileId)
    : (profiles.find((profile) => profile.selected) ?? profiles[0]);
  if (!selected) throw new Error("Profile not found.");
  result.selectedProfileId = selected.profile_id;
  const member = z
    .object({
      forge: z
        .object({
          forge_processes: z
            .object({ forge_1: z.unknown().optional() })
            .optional(),
        })
        .optional(),
    })
    .parse(selected.members[uuid] ?? {});
  const raw = member.forge?.forge_processes?.forge_1;
  if (raw === undefined || raw === null)
    return { ...result, availability: "missing-data" };
  const processes = z
    .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
    .parse(raw);
  const jobs = Object.entries(processes)
    .filter(([, process]) => process !== null)
    .map(([slot, process]) => {
      const candidate = z
        .object({
          id: z.string(),
          startTime: z.number(),
          slot: z.number().optional(),
        })
        .parse(process);
      const parsed = processSchema.parse({
        ...candidate,
        slot: candidate.slot ?? Number(slot),
      });
      const item = itemByApiId.get(parsed.id);
      return {
        slot: parsed.slot,
        apiItemId: parsed.id,
        itemId: item?.id ?? null,
        startedAt: parsed.startTime,
        baseDuration: item
          ? (recipeByOutput.get(item.id)?.duration ?? null)
          : null,
      };
    });
  return { ...result, availability: "available", jobs };
}
