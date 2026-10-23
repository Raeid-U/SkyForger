# SkyForger

Hypixel SkyBlock forge pricing, recipe planning, and account tracking. Next.js, TypeScript, and Vercel functions.

## Development

Node.js 22.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`HYPIXEL_API_KEY` enables profile lookup and account tracking. Keep it server-side.

## Pages

- `/` — forge flip rankings, taxes, order strategies, and manual price overrides.
- `/planner` — recursive craft trees, owned materials, shopping lists, and slot schedules.
- `/tracker` — SkyBlock profile selection and estimated forge countdowns.

Enter an IGN and select a profile on any page. HOTM, mining perks, collection unlocks, Bazaar tax, fossil donations, and forge jobs are imported through `/api/forge`. The selected profile is shared across pages and restored on reload. Market choices are stored locally. The planner checks inventory, storage, and sacks only when you click “Check owned materials,” and uses only dependencies for the selected craft. Checks reset when the craft or profile changes.

Market books are fetched through `/api/bazaar`. Missing prices stay unresolved. Order fills and forge completion times are estimates.

The planner assumes free forge slots and immediate material availability. It models Quick Forge and the reported current Molten Forge perk. Active-job estimates cannot observe historical mayor eligibility or Kinetic reductions. Account username resolution uses Mojang's API; UUIDs bypass that lookup.

## Catalog

`data/forge-catalog.json` is the canonical database for 119 forge recipes, 36 gemstone crafting recipes, item identities, markets, and local image references. Edit it directly; `npm run catalog:check` validates it offline and runs before production builds. See [catalog maintenance](docs/catalog.md).

Item images are served from `public/items/`. Missing images use a shared fallback. Auction House prices remain manual estimates and exclude AH fees.

## Internal auction tooling

`npm run --silent auctions:prices` exports current comparable BIN quotes without an API key. `/api/auctions` serves cached reports; shared pricing/planning functions accept them as an optional context. Frontend wiring is deferred. See [auction pricing](docs/auction-pricing.md).

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run test:live
```

## Vercel

Use the Next.js preset and Node.js 22.x. Add `HYPIXEL_API_KEY` to the server environment to enable profile lookup. Use the default build and output settings.
