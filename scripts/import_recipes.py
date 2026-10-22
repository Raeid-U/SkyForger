"""Extract candidate recipes, never prices, from the supplied community snapshot."""

import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


class RecipeTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.field = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "tr" and re.fullmatch(r"forge\d+Row", attrs.get("id", "")):
            self.row = {}
        if tag == "td" and self.row is not None:
            match = re.fullmatch(r"forge\d+(Name|Hotm|Duration|MaterialsName)", attrs.get("id", ""))
            self.field = match[1] if match else None
            if self.field:
                self.row[self.field] = ""
        if tag == "br" and self.field:
            self.row[self.field] += "\n"

    def handle_data(self, data):
        if self.field:
            self.row[self.field] += data

    def handle_endtag(self, tag):
        if tag == "td":
            self.field = None
        if tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def convert(row):
    name = row["Name"].splitlines()[0].strip()
    requirement = row["Hotm"].strip()
    match = re.fullmatch(r"(\d+)(?:\s*\+\s*(.*?)\s+(\d+))?", requirement)
    if not match:
        raise ValueError(f"Unrecognized requirements for {name}: {requirement}")
    duration = row["Duration"].strip()
    if duration == "Crafting":
        method, seconds = "crafting", 0
    else:
        method = "forge"
        seconds = float(duration.removesuffix(" secs")) * (1 if duration.endswith(" secs") else 3600)
        if seconds <= 0 or not seconds.is_integer():
            raise ValueError(f"Invalid duration for {name}: {duration}")
        seconds = int(seconds)
    ingredients = []
    for line in row["MaterialsName"].splitlines():
        if not line.strip():
            continue
        material = re.fullmatch(r"\s*([1-9]\d*) x (.+?)\s*", line)
        if not material:
            raise ValueError(f"Unrecognized ingredient for {name}: {line}")
        ingredients.append({"name": material[2], "quantity": int(material[1]),
                            "kind": "coins" if material[2] == "Coins" else "item"})
    if not ingredients:
        raise ValueError(f"No ingredients for {name}")
    return {
        "name": name,
        "method": method,
        "durationSeconds": seconds,
        "hotmLevel": int(match[1]),
        "collectionRequirement": {"name": match[2], "level": int(match[3])} if match[2] else None,
        "ingredients": ingredients,
        "verification": "pending",
        "sourceRequirements": requirement,
        "sourceDuration": duration,
    }


def extract(html):
    parser = RecipeTable()
    parser.feed(html)
    recipes = sorted((convert(row) for row in parser.rows), key=lambda r: r["name"])
    if not recipes or len({r["name"] for r in recipes}) != len(recipes):
        raise ValueError("Expected a nonempty catalog with unique recipe names")
    return recipes


if __name__ == "__main__":
    source = (ROOT / "table.html").read_bytes()
    catalog = {
        "schemaVersion": 1,
        "source": {"file": "table.html", "sha256": hashlib.sha256(source).hexdigest(),
                   "origin": "User-supplied community snapshot; original URL and capture date unknown"},
        "status": "unverified; excluded from production calculations",
        "recipes": extract(source.decode("utf-8")),
    }
    destination = ROOT / "data/community-recipes.json"
    destination.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"Extracted {len(catalog['recipes'])} candidate recipes to {destination}")
