# SkyForger

A planned Next.js companion for Hypixel SkyBlock forge profitability and recipe
planning. The two tabs will share player settings, verified recipes, and market
calculations.

## Run locally

Requires Node.js 22. Python is only used for offline recipe import tooling and is
not part of the app or API runtime.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The Next.js Pages Router serves the SPA and TypeScript
API routes. `pages/api/bazaar.ts` maps to `/api/bazaar`; `pages/api/health.ts` maps
to `/api/health`. The Bazaar endpoint is public and requires no API key. The app
does not require a separate API service, database, or Python process.

## Deploy to Vercel

Import this repository into Vercel, select the Next.js framework preset, and use
Node.js 22.x. Keep the default build command (`npm run build`) and framework-managed
output directory. No environment variables are needed for this milestone. API
routes run as Vercel functions; this app must not be exported as a static site.

The Bazaar route validates upstream JSON, uses an eight-second request timeout,
and caches successful responses at the CDN for 60 seconds with 120 seconds of
stale-while-revalidate. The upstream market timestamp is returned unchanged.
Failed requests return HTTP 502 and are not cached. Full books are retained for
future depth-aware calculations; summary averages are not treated as trade quotes.

## Validation

```sh
npm test
npm run typecheck
npm run build
```

## Current milestone

Deployable two-tab dashboard foundation with an on-demand Bazaar snapshot check.
Profit calculations, player settings, and recipe planning are not implemented yet.
The official wiki now redirects to its closure announcement. Recipe verification
needs alternative sources; the imported catalog is not production data. See
[the audit](docs/recipe-audit.md).

## Implementation sequence

1. Verify recipes, unlocks, forge slots, Quick Forge, and Bazaar fee rules.
2. Scaffold Next.js, TypeScript, and the two-tab dashboard.
3. Add locally persisted player settings: HOTM, forge slots, Quick Forge,
   collection unlocks, and Bazaar tax presets (pending official verification).
4. Integrate validated and cached Bazaar snapshots through a Route Handler.
5. Calculate acquisition costs, sale proceeds, net profit, and profit per hour.
6. Expand recipe dependencies, compare buying against crafting, and plan forge
   jobs across available slots with manual inventory and missing-price handling.
7. Validate calculations, improve accessibility and responsive layouts, and
   document the deployment and architecture.

Commit author: `Raeid-U <raeidus15@gmail.com>`.
