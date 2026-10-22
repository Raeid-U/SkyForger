import { ItemIcon } from "../components/ItemIcon";
import Link from "next/link";
import { useState } from "react";
import {
  Workspace,
  coins,
  duration,
  useWorkspace,
} from "../components/Workspace";
import { forgeRecipes, itemById } from "../lib/forge/catalog";
import { itemMarket, matchesMarket } from "../lib/forge/markets";
import type { Settings } from "../lib/forge/settings";
import { rankRecipe } from "../lib/forge/pricing";

export default function Flips() {
  const { settings, snapshot, update, account } = useWorkspace();
  const [search, setSearch] = useState("");
  const [eligible, setEligible] = useState(true);
  const [sort, setSort] = useState<"perHour" | "profit" | "category">(
    "perHour",
  );
  const rows = forgeRecipes
    .map((recipe) => rankRecipe(recipe, snapshot, settings))
    .filter(
      (row) =>
        matchesMarket(row.recipe.outputId, settings.market) &&
        (!eligible || !account?.progression || !row.locked.length) &&
        itemById
          .get(row.recipe.outputId)!
          .name.toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === "category")
        return (
          a.recipe.category.localeCompare(b.recipe.category) ||
          itemById
            .get(a.recipe.outputId)!
            .name.localeCompare(itemById.get(b.recipe.outputId)!.name)
        );
      return (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity);
    });
  return (
    <Workspace title="Forge flips">
      <div className="toolbar">
        <input
          aria-label="Search recipes"
          placeholder="Search recipes…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Sort recipes"
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
        >
          <option value="perHour">Profit / hour</option>
          <option value="profit">Profit / item</option>
          <option value="category">Category</option>
        </select>
        <select
          aria-label="Market"
          value={settings.market}
          onChange={(event) =>
            update({ market: event.target.value as Settings["market"] })
          }
        >
          <option value="both">Both markets</option>
          <option value="bazaar">Bazaar</option>
          <option value="auction">Auction House</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            disabled={!account?.progression}
            checked={eligible && !!account?.progression}
            onChange={(event) => setEligible(event.target.checked)}
          />{" "}
          Unlocked only
        </label>
        <span className="muted">
          {rows.filter((row) => row.profit !== null).length} priced /{" "}
          {rows.length} recipes
        </span>
      </div>
      {(settings.buyMode === "order" || settings.sellMode === "offer") && (
        <p className="notice">
          Order prices assume a fill at the current best price.
        </p>
      )}
      {settings.market !== "bazaar" && (
        <p className="notice">
          Auction House estimates use manual prices in settings and exclude AH
          fees.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Recipe</th>
              <th className="category-cell">Category</th>
              <th>Cost</th>
              <th>Sale proceeds</th>
              <th>Profit</th>
              <th>Profit / hour</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.recipe.id}>
                <td>
                  <Link href={`/planner?item=${row.recipe.outputId}`}>
                    <span className="item-name">
                      <ItemIcon itemId={row.recipe.outputId} />
                      {itemById.get(row.recipe.outputId)!.name}
                    </span>
                  </Link>
                  {row.locked.length > 0 && (
                    <small className="warning">{row.locked.join(" · ")}</small>
                  )}
                  {row.missing.length > 0 && (
                    <small className="muted">
                      {itemMarket(row.recipe.outputId) === "auction" &&
                      settings.prices[row.recipe.outputId] === undefined
                        ? "Set sale price in settings"
                        : "Missing ingredient price, sale price or market depth"}
                    </small>
                  )}
                </td>
                <td className="category-cell">{row.recipe.category}</td>
                <td>{coins(row.cost)}</td>
                <td>{coins(row.revenue)}</td>
                <td
                  className={
                    row.profit === null
                      ? ""
                      : row.profit >= 0
                        ? "positive"
                        : "negative"
                  }
                >
                  {coins(row.profit)}
                </td>
                <td
                  className={
                    row.perHour !== null && row.perHour >= 0 ? "positive" : ""
                  }
                >
                  {coins(row.perHour)}
                </td>
                <td>{duration(row.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty">
            No matching recipes. Adjust your search or player settings.
          </p>
        )}
      </div>
    </Workspace>
  );
}
