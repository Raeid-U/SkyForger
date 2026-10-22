# Recipe source audit

## Status

Official verification is pending. On October 22, 2026, access to the official wiki
was restored, but both The Forge page and the MediaWiki API redirected to Hypixel's
[July 21, 2026 closure announcement](https://hypixel.net/threads/end-of-the-official-hypixel-wiki-july-2026.6112020/).
The announcement states that the official wiki has closed. HTTP 200 from that
redirect is not recipe verification. No entry is verified, and completeness has
not been established. The community snapshot must not feed production calculations yet.

Fandom's article HTML returns a Cloudflare challenge, but its MediaWiki API works.
Use its API to read community sources; do not treat them as official verification.
Archived official pages may be useful for historical comparisons but cannot
establish current game rules. No additional domain approval is required for the
current Fandom-based audit.

## Initial Fandom comparison

Retrieved October 22, 2026 using `action=parse&prop=wikitext&format=json` at
`https://hypixel-skyblock.fandom.com/api.php`, pages `The Forge` (page ID 76696)
and `The Forge/Table` (page ID 100610). These are initial discrepancy findings,
not a completed row-by-row verification or a production-ready catalog.

| Entry | Supplied snapshot | Fandom table |
|---|---|---|
| Bejeweled Handle | 30 minutes | 30 seconds |
| Perfect Opal | 5 Flawless Opal | Also requires 1 Opal Crystal |
| Mithril Drill SX-R326 | 5 SX-R226, 1 Golden Plate, 2 Mithril Plate | 1 SX-R226, 5 Golden Plate, 1 Mithril Plate |
| Mithril Plate | 25,600 Iron Ingots | 1 Enchanted Iron Block instead of raw iron |
| Drill Engine | Includes Refined Diamond and raw iron | Listed as Drill Motor; 1 Enchanted Iron Block, 3 Enchanted Redstone Block, 1 Golden Plate, 10 Treasurite |
| Perfect Plate | Missing | 1 Umber Plate, 1 Tungsten Plate, 1 Mithril Plate; 30 minutes; HOTM 10 |

The Fandom table contains 114 Slot rows versus 67 forge entries in the snapshot;
aliases, renamed items, and duplicates still need reconciliation before treating
that difference as a count of missing recipes. Some Fandom requirements explicitly
contain `InfoNeeded`, so the table alone cannot establish every unlock.

The main Forge page says forge slots also depend on Peak of the Mountain level 2,
not just HOTM. It describes a separate Cole Molten Forge reduction and dynamic
Quick Forge timing. These mechanics need explicit player settings and further
verification before scheduling is implemented.

## Supplied snapshot

`table.html` contains 81 entries: 67 marked with forge durations and 14 marked
`Crafting`. The latter are Fine and Flawless gemstone recipes, not forge jobs.
Original community URL, capture date, and any active source-site settings are unknown.
The generated catalog includes a SHA-256 fingerprint for reproducibility.

The importer preserves ingredient quantities, coin fees, HOTM levels, additional
collection requirements, and source durations. It excludes prices, profits, auction
counts, and rankings. These are market snapshot data rather than recipe definitions.
Names remain display names; they are not assumed to be Hypixel API item IDs.

## Official cross-check checklist

Start with https://wiki.hypixel.net/The_Forge and follow each item's official page.
For every recipe record the exact page URL, verification date, output quantity,
ingredients, base duration, HOTM and collection requirements, and crafting method.
Compare the official forge list with the imported list in both directions to find
missing and obsolete entries. Verify live API IDs separately against Hypixel item
resources and Bazaar products; do not infer IDs solely by replacing spaces.

Specific concerns to resolve:

- Duration settings are unknown. Check base durations independently and apply
  Quick Forge only at calculation time.
- Drill upgrades show 30 seconds. Confirm these values and whether Quick Forge
  applies, before ranking them by profit per hour.
- Mithril Plate and Drill Engine list 25,600 Iron Ingots; DR-X555 lists 51,200.
  The community site's “cheapest variant” column may expand actual recipe inputs.
  Preserve exact official inputs separately from optional acquisition paths.
- Mithril Drill SX-R326 lists five SX-R226 drills. Verify this quantity directly.
- Coin fees occur in Gemstone Chamber, the forge travel scroll, Divan's Drill,
  and Ammonite. Model them as fixed coins, not Bazaar products.
- Crystals and other nonmarket inputs need acquisition requirements. A missing
  market price must never silently become zero cost.
- The table includes eight Perfect gemstone recipes but only seven Fine and
  seven Flawless recipes. Check the full current gemstone catalog and all
  lower-tier crafting steps required for recursive planning.
- Confirm whether collection unlocks use the shared Gemstone collection;
  do not assume there is a separate collection for each gemstone color.
- Check HOTM forge-slot unlocks, Quick Forge reductions, and Bazaar fees against
  their own official pages. These settings are not verified by this table.

Keep the source HTML until verification and provenance records are complete.
Only move verified entries into the application catalog.

## Reproduce

```sh
python3 scripts/import_recipes.py
python3 -m unittest discover -s scripts -p 'test_*.py'
```
