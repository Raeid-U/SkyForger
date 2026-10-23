# Internal auction pricing

```sh
npm run --silent auctions:prices > /tmp/skyforger-bin-prices.json
```

Fetches Hypixel active auctions and writes JSON to stdout; progress/errors go to stderr. No API key or SkyCofl is required. The CLI collects a new snapshot each run. UI wiring is deferred; shared pricing functions now accept an optional auction context.

## Scope

75 non-Bazaar forge outputs. Relic of Power and Secret Railroad Pass are excluded from the auction target set; their recipes remain available to planning. Existing UI rankings are unchanged pending integration. Bejeweled Collar matches `BEJEWELED_COLLAR`; pets match `PET` plus species, including `TYRANNOSAURUS` for T-Rex.

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

No polling or scheduled collector is installed. The backend endpoint shares refreshes within a warm instance as described below.

Sources: [Hypixel API reference](https://api.hypixel.net/), [item resources](https://api.hypixel.net/v2/resources/skyblock/items), [T-Rex pet level XP](https://hypixelskyblock.minecraft.wiki/w/T-Rex_Pet#Leveling_XP). Investigation artifacts stay in ignored `.agents/reports/auction-pricing/`.

## Backend integration

`GET /api/auctions` returns `{ report, refresh: { state, nextRefreshAt } }`, validated by `auctionResponseSchema` in `lib/auctions.ts`. Errors are uncached 429/503 responses with a safe `error`, `code`, and `Retry-After`. The endpoint has a 180-second execution budget for bounded snapshot retries.

The service coalesces concurrent requests and refreshes once per minute per warm function instance. It caches only normalized target listings, re-evaluates expiry on each request, and backs off 30 seconds on errors. A failed refresh may serve last-good data only within the five-minute source-age limit, marked `refresh-failed`. CDN caching is at most 30 seconds, bounded by report expiry/next refresh; no stale-while-revalidate is used. This is not a distributed lock: separate cold instances may each collect a snapshot. A large deployment should add shared persistence/locking before increasing traffic. No hosted scheduler or durable cache is installed.

Pass `{ report, now? }` as the optional auction context to shared pricing/planning functions. `marketQuoteDetails` exposes source, reason, warning codes, source timestamps, and underlying listing/exclusion data. Manual overrides have priority. `rankForgeRecipes` excludes the two non-auctionable outputs without removing their planner recipes. Existing pages have not been connected to the endpoint.

AH sale proceeds use the lowest comparable unit asking price, multiplied by output quantity, without Bazaar tax or AH fees. Buy estimates find the cheapest covering subset of the five retained listings and pay for whole stacks; they are conservative sampled estimates, not an exhaustive cheapest-purchase search. If those offers cannot cover the quantity, the price stays unresolved with `insufficient-bin-depth`, even if additional listings exist outside the sample.

Stable warning codes include `sparse-listings`, `no-active-bin`, `no-comparable-bin`, `stale-auction-data`, `insufficient-bin-depth`, `manual-override`, `bin-asking-price`, `whole-listing-purchase`, and `ah-fees-excluded`. Refresh failure is separate response metadata. Neither market outages nor modified-only markets are presented as zero listings.
