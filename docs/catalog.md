# Catalog and item images

`data/forge-catalog.json` is the maintained application database. Edit it directly; no import pipeline or network call is needed to build the app. `lib/forge/schema.ts` validates identities, recipe references, unlocks, sources, and dependency cycles.

- `id`: stable application key used by saved prices, inventory, and planner URLs.
- `apiId`: verified Hypixel resource/Bazaar ID, or `null` when unresolved.
- `aliases`: identifiers from the previous edition, accepted for forge job lookup. An alias does not certify a Bazaar product ID.
- `market`: `bazaar`, `auction`, `untradeable`, or `unknown`. Bazaar membership was checked against the public API on 2026-10-22. Forge outputs absent from Bazaar are currently treated as AH items; auctionability still needs a separate audit.
- `acquisitionCost`: optional per-unit buy/gather cost. The 12 quest gemstone crystals default to zero; explicit price overrides take precedence. They remain required materials in the planner.
- Recipe `category`: the display and sorting group, imported from the updated recipe list. Dependency recipes absent from that list are grouped as Refining or Drill Upgrades/Parts.
- `image`: local asset path, original dimensions, and source reference, or `null` for the shared fallback.
- Recipe durations are base seconds. Coin costs are separate from ingredient quantities. Requirements use HOTM, collection levels, or explicit unlocks.

Planning and cost comparisons stop at Fine gemstones. Flawless gemstones may be crafted from Fine when unlocked; Rough and Flawed recipes remain reference data and are excluded from expansion.

The database retains all 119 in-game-reviewed forge recipes and 36 gemstone crafting steps. The previous edition's 109 recipes add item aliases but do not overwrite reviewed recipe values. Original research and the comparison are preserved in ignored `.agents/reports/catalog-consolidation/` with dates intact.

## Assets

193 images supplied with the previous edition are served from `public/items/`, named by stable application ID. Original download URLs were not supplied; their source is recorded as `legacy-assets`. Six GIFs retain their animation. Game artwork belongs to its respective owners; inclusion does not imply an original-art license.

38 additional items currently use `public/items/unknown.svg`. To add an image, place a PNG or GIF in `public/items/`, then set the item's `image` metadata and cite a catalog source. For downloaded files, record the exact URL. Do not rename an application item to match an asset filename or infer an API ID from that filename.

`components/ItemIcon.tsx` displays catalog imagery across rankings, recipe trees, shopping lists, schedules, and forge tracking. It uses a fallback for unresolved assets or load failures.

```sh
npm run catalog:check
```

This offline check also runs before production builds. It rejects missing or orphaned images and mismatched image dimensions.

`/_debug` shows all catalog items, image paths, missing or broken images, and wiki links.
