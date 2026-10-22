# Profile import

`GET /api/forge?player=<IGN-or-UUID>&profile=<optional-profile-ID>` resolves the player, selects a SkyBlock profile, and returns normalized progression, material counts, forge jobs, and current mayor information. Hyphenated and compact profile IDs are accepted. Responses are private and uncached. The Hypixel key is sent only in the server's API-Key header; neither full member records nor encoded inventories reach the browser.

The live `ignLance` Kiwi response was checked on 2026-10-22. Its modern profile format uses `skill_tree.experience.mining`, `skill_tree.nodes`, `selected_skill_tree_slot`, `player_data.unlocked_coll_tiers`, `glacite_player_data.fossils_donated`, and `community_upgrades.upgrade_states`. Legacy `mining_core.experience/nodes` and root collection tiers are also supported. Missing data produces conservative values with an availability notice.

- HOTM uses cumulative experience thresholds. Current forge slots follow HOTM tiers, from two at HOTM 2 to seven at HOTM 7; Core of the Mountain does not add another slot. Sources: [HOTM](https://hypixelskyblock.minecraft.wiki/w/Heart_of_the_Mountain), [The Forge](https://hypixelskyblock.minecraft.wiki/w/The_Forge).
- Quick Forge uses the selected mining loadout; a disabled perk contributes no reduction. Other saved loadouts are not combined.
- Collection tiers use reported unlocks first. If absent, available co-op collection contributions are compared with the public resource thresholds in `data/progression.json`.
- Bazaar tax uses claimed Bazaar Flipper upgrades; an in-progress upgrade is excluded.
- Fossil donations and the completed Dulin objective unlock the corresponding catalog recipes.
- Inventory, ender chest, vault, bags, backpacks, sacks, and available quest crystals contribute recognized material counts. Equipped items and backpack icons are excluded to avoid counting duplicates. Hidden or unreadable containers produce an incomplete-inventory notice. Private island chests are not available from this endpoint.
- Current mayor/minister perks come from the public election resource, cached for one minute. Jerry's rotating mayor is not reported, so no rotation bonus is inferred. Existing forge jobs show a timing range because the current election cannot prove which mayor was active when a job started. Kinetic reductions remain unobservable.

Only market preferences and explicit material adjustments are editable. Saved manual progression from earlier versions is discarded; a restored account selection fetches fresh profile data. Material adjustments are scoped to UUID and profile ID.
