import Link from "next/link";
import { useState } from "react";
import {
  Workspace,
  ManualPrice,
  coins,
  duration,
  useWorkspace,
} from "../components/Workspace";
import { forgeRecipes, itemById } from "../lib/forge/catalog";
import { rankRecipe } from "../lib/forge/pricing";

export default function Flips() {
  const { settings, snapshot } = useWorkspace();
  const [search, setSearch] = useState("");
  const [eligible, setEligible] = useState(true);
  const [sort, setSort] = useState<"perHour" | "profit">("perHour");
  const rows = forgeRecipes
    .map((recipe) => rankRecipe(recipe, snapshot, settings))
    .filter(
      (row) =>
        (!eligible || !row.locked.length) &&
        itemById
          .get(row.recipe.outputId)!
          .name.toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));
  const missing = [...new Set(rows.flatMap((row) => row.missing))];
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
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={eligible}
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Cost</th>
              <th>Net sale</th>
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
                    {itemById.get(row.recipe.outputId)!.name}
                  </Link>
                  {row.locked.length > 0 && (
                    <small className="warning">{row.locked.join(" · ")}</small>
                  )}
                  {row.missing.length > 0 && (
                    <small className="muted">
                      Missing price or order-book depth
                    </small>
                  )}
                </td>
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
      {missing.length > 0 && (
        <details className="panel">
          <summary>
            Manual prices{" "}
            <span className="muted">{missing.length} unresolved items</span>
          </summary>
          <div className="price-grid">
            {missing.map((id) => (
              <label key={id}>
                {itemById.get(id)?.name}
                <ManualPrice itemId={id} />
              </label>
            ))}
          </div>
        </details>
      )}
      {Object.keys(settings.prices).length > 0 && (
        <details className="panel">
          <summary>Price overrides</summary>
          <div className="price-grid">
            {Object.keys(settings.prices).map((id) => (
              <label key={id}>
                {itemById.get(id)?.name}
                <ManualPrice itemId={id} />
              </label>
            ))}
          </div>
        </details>
      )}
    </Workspace>
  );
}
