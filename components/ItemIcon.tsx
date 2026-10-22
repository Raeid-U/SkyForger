import { useState } from "react";
import { itemById } from "../lib/forge/catalog";

export function ItemIcon({ itemId }: { itemId: string }) {
  const [failedSrc, setFailedSrc] = useState("");
  const image = itemById.get(itemId)?.image;
  const src = image?.src ?? "/items/unknown.svg";
  return (
    <img
      key={src}
      className="item-icon"
      src={failedSrc === src ? "/items/unknown.svg" : src}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      onError={() => setFailedSrc(src)}
    />
  );
}
