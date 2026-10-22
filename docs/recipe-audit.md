# Recipe source audit

## Status

Official verification is pending. The official wiki request returned HTTP 403:
`Approval required for wiki.hypixel.net:443.` No entry is verified, and completeness
has not been established. The community snapshot must not feed production calculations yet.

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
