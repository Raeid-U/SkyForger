# Auction pricing API and tooling

```sh
npm run --silent auctions:prices > /tmp/skyforger-bin-prices.json
```

Fetches Hypixel active auctions and writes JSON to stdout; progress/errors go to stderr. No API key or SkyCofl is required. The CLI collects a new snapshot each run. Frontend rankings, recipe details, and planning use the shared pricing functions with an optional auction context.

## Scope

75 non-Bazaar forge outputs. Relic of Power and Secret Railroad Pass are excluded from the auction target set; their recipes remain available to planning. Frontend rankings use the eligible forge-output helper. Bejeweled Collar matches `BEJEWELED_COLLAR`; pets match `PET` plus species, including `TYRANNOSAURUS` for T-Rex.

- Only unclaimed, unexpired BIN listings without a recorded purchase are considered.
- All eight forged pets are Legendary. Level 1 means `0 <= exp < 660`; skins, held items, candy, soulbinding, restrictions, and unknown value-bearing fields exclude a listing.
- Equipment uses a conservative unmodified-item policy. Reforges, enchantments, recombobulation, installed parts, gemstones/unlocked slots, fuel, and other unreviewed attributes are excluded. These are not adjusted down to an estimated base value.
- Lowest BIN is an asking price per unit, using NBT stack count. It is not an average sale price, guaranteed sale, or profit after AH fees.

## Output contract

Each report includes source/fetch/evaluation timestamps, an expiry, and 75 quotes:

| Status | Meaning |
| --- | --- |
| `priced` | At least one comparable listing; `unitPrice` is its lowest per-unit asking price. |
| `no-active-bin` | No matching current BIN listing. Check historical prices elsewhere and enter a manual override. |
| `no-comparable-bin` | Matching listings exist, but none meet the comparison policy. |

Quotes retain active/comparable listing counts, comparable units, the five cheapest comparable listings, exclusion reasons, and warnings for sparse markets. Missing prices are `null`, never zero. `resolveBinPrice` prioritizes an explicit manual override and refuses expired automatic data. Overrides are unit prices.

The report expires no later than five minutes after Hypixel's `lastUpdated`, or when any retained quoted listing expires. Callers must check expiry rather than treating a saved report as permanently current. Ended auctions and historical averages are outside this command's scope; no automatic historical fallback is used.

## Collection integrity

Four concurrent page requests; one full retry on snapshot rollover. Every page must agree on generation, page count, and auction count. Duplicate IDs, incomplete coverage, invalid pages, stale/future timestamps, rate limits, oversized responses, and unreadable active BIN items prevent publishing prices. Rate limits are surfaced without an immediate retry. NBT input/decompression sizes are bounded.

A scheduled GitHub Actions collector publishes normalized reports on the `auction-data` branch. Public requests never start collection. See [request controls](request-controls.md) for publication cadence, deployment configuration, and quota limitations.

Sources: [Hypixel API reference](https://api.hypixel.net/), [item resources](https://api.hypixel.net/v2/resources/skyblock/items), [T-Rex pet level XP](https://hypixelskyblock.minecraft.wiki/w/T-Rex_Pet#Leveling_XP). Investigation artifacts stay in ignored `.agents/reports/auction-pricing/`.

The CLI enforces the process-local upstream budget described in [request controls](request-controls.md). Budget exhaustion can stop a scan before completion; partial snapshots are never published.

## Backend integration

`GET /api/auctions` returns `{ report, refresh: { state, nextRefreshAt } }`, validated by `auctionResponseSchema` in `lib/auctions.ts`. Errors are uncached 429/503 responses with a safe `error`, `code`, and `Retry-After`. The endpoint reads the HTTPS URL in `AUCTION_SNAPSHOT_URL` with bounded size and timeout; it never scans Hypixel auctions. Missing/invalid snapshots fail closed with 503.

Snapshot reads are coalesced per warm instance and cached for one minute. Reports retain their source timestamps and expiry. Expired scheduled reports can be returned as estimates for up to three hours with `refresh-failed` metadata; default shared helpers still reject expired quotes, while the frontend explicitly opts into retained estimates. CDN caching is at most 30 seconds and only while the report remains live. The old on-demand collector service remains available for internal tests/tooling, but is not the route's default provider.

Pass `{ report, now? }` as the optional auction context to shared pricing/planning functions. `marketQuoteDetails` exposes source, reason, warning codes, source timestamps, and underlying listing/exclusion data. Manual overrides have priority. `rankForgeRecipes` excludes the two non-auctionable outputs without removing their planner recipes. Frontend pages consume the endpoint through an independent auction request and the shared pricing context.

AH sale proceeds use the lowest comparable unit asking price, multiplied by output quantity, without Bazaar tax or AH fees. Buy estimates find the cheapest covering subset of the five retained listings and pay for whole stacks; they are conservative sampled estimates, not an exhaustive cheapest-purchase search. If those offers cannot cover the quantity, the price stays unresolved with `insufficient-bin-depth`, even if additional listings exist outside the sample.

Stable warning codes include `sparse-listings`, `no-active-bin`, `no-comparable-bin`, `stale-auction-data`, `insufficient-bin-depth`, `manual-override`, `bin-asking-price`, `whole-listing-purchase`, and `ah-fees-excluded`. Refresh failure is separate response metadata. Neither market outages nor modified-only markets are presented as zero listings.

## Frontend retained estimates

The frontend explicitly passes `allowStaleEstimates: true` in its auction context. It keeps the last snapshot's numeric estimates visible after live expiry and marks them as cached (`cached-auction-estimate`); they are not current executable offers. After three hours from source time, `stale-auction-data` turns the price information control amber and the details dialog warns that prices might be outdated. Bazaar prices use a one-hour age threshold (`stale-bazaar-data`) and likewise remain visible until refreshed. Manual overrides retain priority and are not marked stale by snapshot age.

Default shared-helper callers still reject expired automatic BIN quotes. Collector validation and the five-minute live-price expiry are unchanged. Scheduled publication retains original timestamps and uses the explicit estimate policy described above. Browser snapshots are stored only with the user's optional storage consent; failed refreshes preserve the previous client snapshot. Listing availability, quantities, and profits from a retained estimate are not guaranteed.

After initial loading, market fetches are user-triggered through **Refresh prices**. The auction retry timestamp indicates when another request is allowed; it does not schedule a request or reload the page. Expiry and age warnings update at their thresholds without per-second market polling. Forge countdowns remain local timers.
