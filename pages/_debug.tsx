import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { items } from "../lib/forge/catalog";

export default function DebugItems() {
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const missing = (id: string, hasImage: boolean) =>
    !hasImage || broken.has(id);
  const missingCount = items.filter((item) =>
    missing(item.id, !!item.image),
  ).length;
  const query = search.trim().toLowerCase();
  const visible = items
    .filter(
      (item) =>
        (!missingOnly || missing(item.id, !!item.image)) &&
        [item.name, item.id, item.apiId ?? "", ...item.aliases].some((value) =>
          value.toLowerCase().includes(query),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Head>
        <title>Item images · SkyForger</title>
      </Head>
      <main className="workspace debug-page">
        <Link href="/">← Forge flips</Link>
        <div className="page-heading">
          <h1>Item images</h1>
          <span className="muted">
            {items.length} items · {missingCount} missing
          </span>
        </div>
        <div className="toolbar">
          <input
            aria-label="Search items"
            placeholder="Search name or ID…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(event) => setMissingOnly(event.target.checked)}
            />
            Missing images only
          </label>
          <span className="muted">{visible.length} shown</span>
        </div>
        <div className="debug-grid">
          {visible.map((item) => {
            const unavailable = missing(item.id, !!item.image);
            return (
              <article
                className={`debug-item${unavailable ? " missing-image" : ""}`}
                key={item.id}
              >
                <img
                  src={unavailable ? "/items/unknown.svg" : item.image!.src}
                  width={64}
                  height={64}
                  alt=""
                  loading="lazy"
                  onError={() => {
                    if (item.image && !broken.has(item.id))
                      setBroken((previous) => new Set(previous).add(item.id));
                  }}
                />
                <strong>{item.name}</strong>
                <span className={unavailable ? "warning" : "muted"}>
                  {broken.has(item.id)
                    ? "Image failed to load"
                    : item.image
                      ? "Image available"
                      : "Missing image"}
                </span>
                <code>{item.id}</code>
                <small>{item.image?.src ?? "No asset assigned"}</small>
                <a
                  href={`https://hypixel-skyblock.fandom.com/wiki/${encodeURIComponent(item.name.replaceAll(" ", "_"))}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Wiki ↗
                </a>
              </article>
            );
          })}
        </div>
        {!visible.length && <p className="empty">No matching items.</p>}
      </main>
    </>
  );
}
