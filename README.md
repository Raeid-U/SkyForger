# SkyForger

Hypixel SkyBlock forge pricing, recipe planning, and account tracking. Next.js, TypeScript, and Vercel functions.

## Development

Node.js 22.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`HYPIXEL_API_KEY` is required only for account tracking. Keep it server-side.

## Pages

- `/` — forge flip rankings, taxes, order strategies, and manual price overrides.
- `/planner` — recursive craft trees, owned materials, shopping lists, and slot schedules.
- `/tracker` — SkyBlock profile selection and estimated forge countdowns.

Settings and owned materials are stored locally. Market books are fetched through `/api/bazaar`; account lookups use `/api/forge`. Missing prices stay unresolved. Order fills and forge completion times are estimates.

The planner assumes free forge slots and immediate material availability. It models Quick Forge and Molten Forge; active-job estimates cannot observe Kinetic reductions. Account username resolution uses Mojang's API; UUIDs bypass that lookup.

## Catalog

`data/forge-catalog.json` contains the in-game-reviewed forge baseline plus gemstone crafting steps. API IDs are matched against Hypixel item resources. Unmatched items use manual pricing.

```sh
npm run catalog:prepare
```

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run test:live
```

## Vercel

Use the Next.js preset and Node.js 22.x. Add `HYPIXEL_API_KEY` to the server environment to enable tracking. Use the default build and output settings.
