# SkyForger

A forge companion for Hypixel SkyBlock: compare what to forge, plan a long crafting tree, and keep track of your forge slots.

SkyBlock forging combines live market prices, progression gates, nested recipes, and hours of waiting. SkyForger brings those decisions into one focused workspace instead of spreading them across spreadsheets and calculators. 

Check out our live deployment here: https://skyforger.raeid.ca

## Demo Video


https://github.com/user-attachments/assets/48046587-cc6f-48ff-9d4a-63fb5f8a0e35


[Watch the demo](docs/media/skyforger-demo.webm) · Sample profile and market data.

## The tools

- **Forge flips** — rank recipes by estimated profit per item or per hour, compare Bazaar order strategies, and use current comparable Auction House BIN listings for non-Bazaar items. Price details expose sparse listings, missing data, and manual overrides.
- **Craft planner** — expand a recipe into dependencies, a shopping list, and a forge-slot schedule. An explicit **Check owned materials** action checks available inventory, storage, and sacks only for the selected craft.
- **My Forge** — enter an IGN, select a profile, and see active forge countdowns. Save favourite recipes for a quick ingredient reference.

Profile import supplies HOTM, mining perks, collection unlocks, Bazaar tax, and recipe unlocks. Browser persistence is optional: profile selection, preferences, cached market snapshots, and favourites are saved only with storage consent. Profile selection is shared across the three pages.

## Design choices

The app uses Next.js Pages Router, React, TypeScript, and Zod. API routes keep the Hypixel profile key server-side; market pricing and planning live in shared, testable modules.

- **Market evidence over invented prices.** Bazaar estimates use order-book summaries. Auction estimates use comparable, unmodified BIN listings, with stricter level-one matching for pets. Missing prices remain unresolved; manual overrides are explicit.
- **A maintained catalog.** `data/forge-catalog.json` contains 119 forge recipes, 36 gemstone crafting recipes, item identities, unlocks, and local image references. Validation checks references, dependency cycles, and image consistency before builds.
- **Progression from the account.** Users select an IGN and profile instead of transcribing progression settings. Inventory decoding happens only on request.
- **Visible uncertainty.** Asking prices are not completed sales. Sparse listings, sampled auction depth, cached estimates, and unavailable inventory are surfaced in the interface.

Auction proceeds exclude AH fees. The planner assumes free slots and immediate material availability; active forge timing cannot reconstruct historical mayor eligibility or Kinetic reductions. Market fills and completion times remain estimates.

## Development story

The project grew from recipe research and an initial scaffold into a canonical catalog, shared pricing/planning logic, profile-derived settings, and explicit inventory lookup. A subsequent UI overhaul organized the three workflows; auction snapshot collection and comparable-listing policies then added automatic BIN estimates. Favourites and ingredient references completed the account workflow. Current work focuses on documentation, public-release safeguards, and deployment validation.

## Run locally

Node.js 22 is required.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `HYPIXEL_API_KEY` for profile lookup and tracking. Bazaar and auction pricing do not require a key. Keep the key server-side. Public deployment uses Vercel Firewall IP limits and scheduled auction snapshots; see [request controls](docs/request-controls.md). Set `NEXT_PUBLIC_SITE_URL` to the production origin to enable canonical URLs and absolute social-card links; leave it unset for local or preview builds.

```sh
npm test
npm run typecheck
npm run build
```

The build includes catalog validation. `npm run test:live` runs separate network-dependent checks. `npm run --silent auctions:prices` exports a fresh comparable-BIN report as JSON.

## Reference

- [Demo recording](docs/demo.md)
- [API request controls and quota](docs/request-controls.md)
- [Profile API](docs/profile-api.md)
- [Bazaar API and order-book semantics](docs/bazaar-api.md)
- [Auction matching, caching, and pricing policies](docs/auction-pricing.md)
- [Catalog and image maintenance](docs/catalog.md)
- [Asset attribution and licensing](docs/attribution.md)

## License

Original project code is available under the [MIT License](LICENSE). Third-party game artwork and fonts retain their own rights and terms; see [attribution](docs/attribution.md).

SkyForger is an independent community project and is not affiliated with or endorsed by Hypixel or Mojang.
