import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Catalog } from "../../lib/forge/schema";

export function imageSize(bytes: Buffer) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (
    bytes.length >= 10 &&
    ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
  )
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  throw new Error("Expected a PNG or GIF image");
}

export function checkAssets(catalog: Catalog, root = process.cwd()) {
  const used = new Set(["unknown.svg"]);
  for (const item of catalog.items) {
    if (!item.image) continue;
    const size = imageSize(
      readFileSync(resolve(root, "public", item.image.src.slice(1))),
    );
    if (size.width !== item.image.width || size.height !== item.image.height)
      throw new Error(`Image dimensions do not match catalog: ${item.id}`);
    used.add(item.image.src.split("/").at(-1)!);
  }
  readFileSync(resolve(root, "public/items/unknown.svg"));
  for (const file of readdirSync(resolve(root, "public/items")))
    if (!used.has(file)) throw new Error(`Unreferenced image: ${file}`);
}
