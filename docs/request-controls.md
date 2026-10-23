# API request controls

The initial deployment uses Vercel Firewall IP limits and scheduled auction snapshots, without Redis or a homelab dependency. This is not a distributed application-wide quota guarantee.

## Edge rules

Configure native Vercel Firewall rate-limit rules, subject to availability on the chosen plan:

| Path | Suggested limit per client IP |
| --- | --- |
| `/api/forge` | 10 requests/minute |
| `/api/bazaar` | 30 requests/minute |
| `/api/auctions` | 30 requests/minute |

Use blocking/429 behavior rather than a browser challenge for API routes. Verify enforcement and retry behavior on a preview before publishing the link. These dashboard rules are not installed by the repository. If the plan does not support them, do not treat process-local counters as an equivalent replacement.

Application counters provide a second, best-effort limit within each warm process, using the same per-IP limits and uncached 429/Retry-After responses. Vercel identity comes from its platform-controlled `x-vercel-forwarded-for`; elsewhere the socket address is used and forwarding headers are ignored. Missing identities share a bucket. Raw IPs are not logged here; SHA-256 keys are pseudonymous, not anonymous. Memory is bounded and old entries are discarded.

The application additionally limits each process to 240 Hypixel attempts per rolling five minutes, with an auction sublimit of 180. Failures/retries count. These counters reset on cold start and do not coordinate instances: many distinct visitors can still exceed the approved 300-request/five-minute allowance. Upstream 429 responses are handled without automatic profile retries. Use a dedicated application key and monitor actual usage.

## Scheduled auction collection

`.github/workflows/auction-snapshot.yml` runs approximately every ten minutes and supports manual dispatch. GitHub schedules can be delayed; they are not a live-feed SLA. The workflow:

1. Serializes collectors through one concurrency group.
2. Reserves a collection window on an isolated `auction-data` branch before contacting Hypixel. Attempts less than ten minutes apart skip collection, including retries after a failed run.
3. Runs the existing CLI with at most 180 auction-page attempts, four concurrent pages, and one bounded generation-rollover retry. No Hypixel key is needed for active auctions.
4. Publishes only the validated normalized report as `auction-prices.json`; a failed scan leaves the previous report intact. Raw auction inventories are not published.

The ten-minute reservation spacing and five-minute job timeout separate collection runs. Other copies of the CLI and other repositories are not coordinated; avoid running them alongside the publisher against a shared allowance. GitHub Actions must have permission to write this data branch; branch rules may need to permit the workflow. Schedule execution starts only after the workflow reaches the default branch. Keep `auction-data` out of Vercel deployment branches to avoid deployments for data commits.

Set the server-only variable:

```dotenv
AUCTION_SNAPSHOT_URL=https://raw.githubusercontent.com/OWNER/REPO/auction-data/auction-prices.json
```

The repository/data URL must be readable without authentication. A private repository needs another public publication destination; do not expose a GitHub token in the URL. Fetches require HTTPS, reject redirects, have five-second timeouts, and cap report size at 1 MiB. Reports are validated for schema, catalog coverage, and timestamps. Configure a trusted URL, not user input.

`/api/auctions` coalesces snapshot reads per warm instance and caches them for one minute. It never falls back to collecting auctions, including when configuration is missing or publication fails. With no usable snapshot it returns an uncached 503. A last-good snapshot is usable as an estimate for up to three hours; its original expiry is preserved, and expired data is marked `refresh-failed` in the existing response contract. The frontend's retained-estimate policy still applies; expired snapshots are not executable offers. Scheduled snapshots will often be past the five-minute live expiry. This trades freshness for bounded work.

## Launch verification and remaining limitations

Verify a successful publication, the public JSON URL, deployed snapshot reads, all edge rules, and safe failure behavior before launch. This implementation has been tested locally; it does not create hosting rules or activate GitHub Actions remotely.

Profile lookups remain on demand, private/no-store, and key-backed. Bazaar retains CDN caching. There is no shared profile cache, global profile-budget counter, or cross-instance refresh lease. The next step for a strict fail-closed global ceiling is shared state/coordination, not more process-local counters. The previous Redis configuration is removed; missing snapshots still fail closed for auction pricing.
