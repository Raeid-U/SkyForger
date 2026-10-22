# SkyForger

A planned Next.js companion for Hypixel SkyBlock forge profitability and recipe
planning. The two tabs will share player settings, verified recipes, and market
calculations.

## Current milestone

Community recipe import and audit preparation. No application has been scaffolded
yet. Official wiki verification is pending network access; the candidate catalog is
not production data. See [the audit](docs/recipe-audit.md).

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
