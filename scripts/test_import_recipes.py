import unittest

from import_recipes import convert, extract


class ImportTests(unittest.TestCase):
    def row(self, **overrides):
        return dict(Name="Example\n(12M)", Hotm="5\n+ Gemstone 10",
                    Duration="0.5", MaterialsName="25000 x Coins\n5 x Flawless Ruby Gemstone\n", **overrides)

    def test_discards_snapshot_profit_and_preserves_cost_and_unlocks(self):
        result = convert(self.row())
        self.assertEqual(result["name"], "Example")
        self.assertEqual(result["durationSeconds"], 1800)
        self.assertEqual(result["collectionRequirement"], {"name": "Gemstone", "level": 10})
        self.assertEqual(result["ingredients"][0], {"name": "Coins", "quantity": 25000, "kind": "coins"})
        self.assertEqual(result["verification"], "pending")

    def test_seconds_and_crafting_are_distinct(self):
        row = self.row()
        row["Duration"] = "30 secs"
        self.assertEqual(convert(row)["durationSeconds"], 30)
        row["Duration"] = "Crafting"
        result = convert(row)
        self.assertEqual((result["method"], result["durationSeconds"]), ("crafting", 0))

    def test_bad_ingredient_is_rejected(self):
        row = self.row()
        row["MaterialsName"] = "unknown quantity"
        with self.assertRaises(ValueError):
            convert(row)

    def test_empty_source_is_rejected(self):
        with self.assertRaises(ValueError):
            extract("<table></table>")


if __name__ == "__main__":
    unittest.main()
