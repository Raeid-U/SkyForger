import { gunzipSync } from "node:zlib";
import { parseUncompressed, simplify } from "prismarine-nbt";
import { itemByApiId, itemById } from "../forge/catalog";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function extractInventory(raw: unknown, allowed?: ReadonlySet<string>) {
  const member = record(raw),
    inventory = record(member.inventory);
  const items: Record<string, number> = {};
  const warnings: string[] = [];
  function add(apiId: unknown, amount: unknown) {
    if (
      typeof apiId !== "string" ||
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    )
      return;
    const item = itemByApiId.get(apiId);
    if (item && (!allowed || allowed.has(item.id))) items[item.id] = (items[item.id] ?? 0) + amount;
  }
  for (const [id, count] of Object.entries(record(inventory.sacks_counts)))
    add(id, count);
  const containers = [
    inventory.inv_contents,
    inventory.ender_chest_contents,
    inventory.personal_vault_contents,
    ...Object.values(record(inventory.bag_contents)),
    ...Object.values(record(inventory.backpack_contents)),
  ];
  let decoded = 0;
  for (const container of containers) {
    const encoded = record(container).data;
    if (typeof encoded !== "string" || !encoded) continue;
    try {
      if (encoded.length > 4 * 1024 * 1024)
        throw new Error("Container too large");
      const bytes = Buffer.from(encoded, "base64");
      const buffer =
        bytes[0] === 0x1f && bytes[1] === 0x8b
          ? gunzipSync(bytes, { maxOutputLength: 8 * 1024 * 1024 })
          : bytes;
      const parsed: unknown = simplify(parseUncompressed(buffer, "big"));
      const contents = record(parsed).i;
      if (!Array.isArray(contents)) throw new Error("Invalid inventory");
      for (const stack of contents) {
        const item = record(stack);
        add(record(record(item.tag).ExtraAttributes).id, item.Count);
      }
      decoded++;
    } catch {
      warnings.push(
        "A storage container could not be imported; material counts may be incomplete.",
      );
    }
  }
  if (!decoded)
    warnings.push(
      "Inventory storage is unavailable; only reported sacks and quest crystals are imported.",
    );
  for (const [key, value] of Object.entries(
    record(record(member.mining_core).crystals),
  )) {
    const id = key.replaceAll("_", "-");
    if (
      record(value).state === "FOUND" &&
      (!allowed || allowed.has(id)) &&
      itemById.get(id)?.market === "untradeable"
    )
      items[id] = 1;
  }
  return { items, warnings: [...new Set(warnings)] };
}
