# Bazaar API

Checked against the [Hypixel API reference](https://api.hypixel.net/#tag/SkyBlock/paths/~1v2~1skyblock~1bazaar/get)
and a live response on October 22, 2026.

- Endpoint: `GET https://api.hypixel.net/v2/skyblock/bazaar`.
- Public endpoint: no API key or query parameters required.
- Response: `success`, millisecond Unix `lastUpdated`, and a `products` map.
- Each product supplies `product_id`, `buy_summary`, `sell_summary`, and `quick_status`.
- Summary entries contain `amount`, `pricePerUnit`, and `orders`. The reference
  describes each summary as the top 30 orders for that transaction type.
- `buy_summary` supplies instant-buy prices (asks); `sell_summary` supplies
  instant-sell prices (bids). The official cocoa bean example starts at 4.8 coins
  to buy and 4.2 coins to sell. Do not reverse these based on the field names.
- `quick_status` prices are weighted averages of the top 2% of orders by volume.
  They are not guaranteed execution prices. The application intentionally keeps
  the summary books instead; these are still only a partial view of market depth.
- The documented 503 response means data has not yet been populated. Our route
  returns a safe, uncached 502 for upstream failures or invalid response bodies.

`npm run test:live` checks the real public endpoint and validates every returned
product using the same schema as `/api/bazaar`. It is deliberately separate from
the offline unit tests so network failures do not masquerade as code regressions.

## Application route

`GET /api/bazaar` returns the normalized market snapshot used by shared pricing functions. Successful responses use `public, s-maxage=60, stale-while-revalidate=120`; failed responses are uncached 502 errors with an `error` message. Unsupported methods return 405. Upstream requests have an eight-second timeout. CDN caching reduces upstream work when deployed; origin requests have best-effort per-process IP and upstream limits, supplemented by deployment firewall rules described in [request controls](request-controls.md). Application budget exhaustion returns 429; local request-protection failure returns 503. These errors are uncached and include Retry-After.
