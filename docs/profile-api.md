# Profile import

`GET /api/forge?player=<IGN-or-UUID>&profile=<optional-profile-ID>` resolves the player, selects a SkyBlock profile, and returns normalized progression, forge jobs, and current mayor information. Material counts are returned only when `craft` is supplied. Hyphenated and compact profile IDs are accepted. Responses are private and uncached. The Hypixel key is sent only in the server's API-Key header; neither full member records nor encoded inventories reach the browser.

The live `ignLance` Kiwi response was checked on 2026-10-22. Its modern profile format uses `skill_tree.experience.mining`, `skill_tree.nodes`, `selected_skill_tree_slot`, `player_data.unlocked_coll_tiers`, `glacite_player_data.fossils_donated`, and `community_upgrades.upgrade_states`. Legacy `mining_core.experience/nodes` and root collection tiers are also supported. Missing data produces conservative values with an availability notice.

- HOTM uses cumulative experience thresholds. Current forge slots follow HOTM tiers, from two at HOTM 2 to seven at HOTM 7; Core of the Mountain does not add another slot. Sources: [HOTM](https://hypixelskyblock.minecraft.wiki/w/Heart_of_the_Mountain), [The Forge](https://hypixelskyblock.minecraft.wiki/w/The_Forge).
- Quick Forge uses the selected mining loadout; a disabled perk contributes no reduction. Other saved loadouts are not combined.
- Collection tiers use reported unlocks first. If absent, available co-op collection contributions are compared with the public resource thresholds in `data/progression.json`.
- Bazaar tax uses claimed Bazaar Flipper upgrades; an in-progress upgrade is excluded.
- Fossil donations and the completed Dulin objective unlock the corresponding catalog recipes.
- Optional `craft=<forge-output-id>` checks only dependencies for that craft; ordinary profile requests do not decode or return inventory. Inventory, ender chest, vault, bags, backpacks, sacks, and available quest crystals contribute recognized material counts. Equipped items and backpack icons are excluded to avoid counting duplicates. Hidden or unreadable containers produce an incomplete-inventory notice. Private island chests are not available from this endpoint.
- Current mayor/minister perks come from the public election resource, cached for one minute. Jerry's rotating mayor is not reported, so no rotation bonus is inferred. Existing forge jobs show a timing range because the current election cannot prove which mayor was active when a job started. Kinetic reductions remain unobservable.

## Response and failures

The response includes `uuid`, `selectedProfileId`, selectable `profiles`, `jobs`, `availability`, `fetchedAt`, `progression`, `environment`, and `inventory`. `inventory` is `null` for ordinary lookups. Missing profile fields are distinguished from a player with no profiles; callers should inspect availability and warnings rather than treating missing data as verified progression.

| HTTP status | Meaning |
| --- | --- |
| 400 | Invalid player, profile, or craft query. |
| 404 | Player/profile not found, or player is not a member of the selected profile. |
| 405 | Unsupported method; only GET is allowed. |
| 429 | Client/application budget exhausted, or Hypixel rate limit reached. |
| 502 | Upstream lookup failed or profile data could not be read. |
| 503 | Server profile key is missing/rejected, or local request protection is unavailable. |

Errors contain a safe `error` message. Username resolution uses Mojang; UUIDs bypass it. Upstream requests have eight-second timeouts. Current election data is cached separately; profile responses use `Cache-Control: private, no-store`.

## Browser state and request behavior

Market preferences and manual unit-price overrides remain editable; progression comes from the selected profile. With optional storage consent, the browser restores account selection and fetches fresh profile data. Owned-material checks are explicit, scoped to the selected craft, and reset when craft or profile changes; there is no editable material-adjustment ledger.

The route has a best-effort ten-origin-request per-IP rolling minute limit within each process. Vercel Firewall supplies deployment-level IP enforcement; there is no strict shared application-wide budget. See [request controls](request-controls.md) for configuration, limitations, and remaining cache work. There is no shared profile cache. Do not publicly cache raw profile/inventory responses.
