import { gunzipSync } from "node:zlib";
import { parseUncompressed, simplify } from "prismarine-nbt";
import { z } from "zod";

const recordSchema = z.record(z.string(), z.unknown());
const petSchema = z.object({
  type: z.string().min(1),
  tier: z.string().min(1),
  exp: z.number().finite().nonnegative(),
  heldItem: z.string().nullish(),
  skin: z.string().nullish(),
  candyUsed: z.number().int().nonnegative().optional(),
  petSoulbound: z.boolean().optional(),
  noMove: z.boolean().optional(),
  hideRightClick: z.boolean().optional(),
  extraData: recordSchema.optional(),
}).passthrough();

export function decodeAuctionItem(encoded: string) {
  if (!encoded || encoded.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
    throw new Error("Invalid auction item encoding.");
  const bytes = Buffer.from(encoded, "base64");
  const buffer = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes, { maxOutputLength: 8 * 1024 * 1024 })
    : bytes;
  const data = simplify(parseUncompressed(buffer, "big"));
  const stack = z.object({ i: z.array(z.object({
    Count: z.number().int().positive().max(127),
    tag: z.object({ ExtraAttributes: recordSchema }),
  })).length(1) }).parse(data).i[0];
  const attributes = stack.tag.ExtraAttributes;
  const apiId = z.string().min(1).parse(attributes.id);
  const pet = apiId === "PET"
    ? petSchema.parse(JSON.parse(z.string().parse(attributes.petInfo)))
    : null;
  return { apiId, count: stack.Count, attributes, pet };
}

export type AuctionItem = ReturnType<typeof decodeAuctionItem>;

// Metadata only: anything outside these fields requires explicit review before pricing.
const neutralAttributes = new Set(["id", "uuid", "timestamp", "originTag", "spawnedFor", "petInfo"]);
const neutralPetFields = new Set(["type", "tier", "exp", "active", "heldItem", "skin", "candyUsed", "uuid", "uniqueId", "hideInfo", "hideRightClick", "noMove", "petSoulbound", "heldItemUuid", "extraData"]);

export function nonComparableReasons(item: AuctionItem): string[] {
  const reasons: string[] = [];
  if (item.pet) {
    if (item.count !== 1) reasons.push("invalid-pet-stack");
    if (item.pet.tier !== "LEGENDARY") reasons.push("pet-rarity");
    // All eight forged pets are Legendary; level 2 starts at 660 cumulative XP.
    if (item.pet.exp >= 660) reasons.push("pet-above-level-1");
    if (item.pet.heldItem) reasons.push("pet-held-item");
    if (item.pet.skin) reasons.push("pet-skin");
    if ((item.pet.candyUsed ?? 0) > 0) reasons.push("pet-candy");
    if (item.pet.petSoulbound) reasons.push("pet-soulbound");
    if (item.pet.noMove) reasons.push("pet-restricted");
    if (item.pet.extraData && Object.keys(item.pet.extraData).length) reasons.push("unreviewed-pet-extra-data");
    for (const key of Object.keys(item.pet))
      if (!neutralPetFields.has(key)) reasons.push(`unreviewed-pet-field:${key}`);
  }
  for (const [key, value] of Object.entries(item.attributes)) {
    if (neutralAttributes.has(key)) continue;
    // Zero counters and empty upgrade collections do not add value.
    if (value === 0 || value === false || value === "" || value === null) continue;
    if (typeof value === "object" && Object.keys(value).length === 0) continue;
    reasons.push(`modified-or-unreviewed:${key}`);
  }
  return reasons;
}
