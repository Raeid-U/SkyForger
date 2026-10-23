import {
  PriceContext,
  AuctionAssumptions,
  isStalePrice,
} from "../components/PriceContext";
import { FavouriteStar } from "../components/FavouriteToggle";
import { ItemIcon } from "../components/ItemIcon";
import { RecipeInspector } from "../components/RecipeInspector";
import { useState } from "react";
import {
  Workspace,
  coins,
  duration,
  useWorkspace,
} from "../components/Workspace";
import { forgeRecipes, itemById } from "../lib/forge/catalog";
import { itemMarket, matchesMarket } from "../lib/forge/markets";
import { rankForgeRecipes } from "../lib/forge/pricing";

export default function Flips() {
  const {
    settings,
    snapshot,
    update,
    account,
    auctions,
    sort,
    setSort,
    favouriteIds,
  } = useWorkspace();
  const [search, setSearch] = useState("");
  const [eligible, setEligible] = useState(true);
  const [inspected, setInspected] = useState<string | null>(null);
  const rows = rankForgeRecipes(snapshot, settings, auctions.context)
    .filter(
      (row) =>
        matchesMarket(row.recipe.outputId, settings.market) &&
        (!eligible || !account?.progression || !row.locked.length) &&
        itemById
          .get(row.recipe.outputId)!
          .name.toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "category"
        ? a.recipe.category.localeCompare(b.recipe.category) ||
          itemById
            .get(a.recipe.outputId)!
            .name.localeCompare(itemById.get(b.recipe.outputId)!.name)
        : (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity),
    );
  const metric = sort === "profit" ? "profit" : "perHour";
  const hasFilters =
    search !== "" ||
    settings.market !== "both" ||
    (!!account?.progression && !eligible);
  const reset = () => {
    setSearch("");
    setEligible(true);
    update({ market: "both" });
  };
  return (
    <Workspace title="Forge flips">
      <div className="toolbar flips-toolbar" aria-label="Recipe filters">
        <label className="search-control">
          <span className="sr-only">Search recipes</span>
          <input
            type="search"
            placeholder="Search recipes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="control-label" aria-hidden="true">
            Rank by
          </span>
          <select
            aria-label="Sort recipes"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="perHour">Profit / hour</option>
            <option value="profit">Profit / item</option>
            <option value="category">Category</option>
          </select>
        </label>
        <div className="market-filter" role="group" aria-label="Market">
          <span className="control-label" aria-hidden="true">
            |
          </span>
          {(
            [
              ["both", "All"],
              ["bazaar", "Bazaar"],
              ["auction", "Auction House"],
            ] as const
          ).map(([market, label]) => (
            <button
              key={market}
              aria-pressed={settings.market === market}
              onClick={() => update({ market })}
            >
              {label}
            </button>
          ))}
          <span className="control-label" aria-hidden="true">
            |
          </span>
        </div>
        <label className="check">
          <input
            type="checkbox"
            disabled={!account?.progression}
            checked={eligible && !!account?.progression}
            onChange={(event) => setEligible(event.target.checked)}
          />
          Unlocked only
        </label>
        <span className="control-label" aria-hidden="true">
          |
        </span>
        {hasFilters && (
          <button className="text-button" onClick={reset}>
            Reset filters
          </button>
        )}
        <span className="muted result-count" role="status">
          {rows.filter((row) => row.profit !== null).length} priced{" "}
          <span aria-hidden="true">/</span> {rows.length} recipes
        </span>
      </div>
      <details className="pricing-notes">
        <summary>Pricing assumptions & hourly throughput</summary>
        <p>
          Profit per hour is theoretical per-slot throughput: immediate
          restarts, available materials, and market fills are assumed. Order
          prices assume a fill at the current best price. Auction House
          estimates use current BIN asking prices or saved manual overrides.
        </p>
        <AuctionAssumptions />
      </details>
      <div className="table-wrap flips-table-wrap">
        <table className={`flips-table metric-${metric}`}>
          <caption className="sr-only">
            Forge recipes, ranked by{" "}
            {sort === "perHour"
              ? "profit per hour"
              : sort === "profit"
                ? "profit per item"
                : "category"}
            . Open a recipe to inspect costs and unlocks.
          </caption>
          <thead>
            <tr>
              <th scope="col">Recipe</th>
              <th scope="col" className="category-cell">
                Category
              </th>
              <th scope="col" className="secondary-column">
                Cost
              </th>
              <th scope="col" className="secondary-column">
                Sale proceeds
              </th>
              <th
                scope="col"
                className={`profit-column ${metric === "profit" ? "selected-metric" : "secondary-metric"}`}
                aria-sort={sort === "profit" ? "descending" : undefined}
              >
                Profit / item
              </th>
              <th
                scope="col"
                className={`hour-column ${metric === "perHour" ? "selected-metric" : "secondary-metric"}`}
                aria-sort={sort === "perHour" ? "descending" : undefined}
              >
                Profit / hour
              </th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name = itemById.get(row.recipe.outputId)!.name;
              const hasPriceContext =
                itemMarket(row.recipe.outputId) === "auction" ||
                row.pricing.inputs.some(
                  (input) =>
                    itemMarket(input.itemId) === "auction" ||
                    input.quote.source === "manual" ||
                    input.quote.reason ||
                    isStalePrice(input.quote),
                ) ||
                row.pricing.output.source === "manual" ||
                isStalePrice(row.pricing.output);
              const status =
                !hasPriceContext && row.missing.length ? "Unpriced" : null;
              return (
                <tr
                  key={row.recipe.id}
                  className="recipe-row"
                  onClick={(event) => {
                    if (
                      !(event.target as HTMLElement).closest(
                        "button, a, dialog",
                      )
                    ) {
                      event.currentTarget.querySelector("button")?.focus();
                      setInspected(row.recipe.id);
                    }
                  }}
                >
                  <td>
                    <button
                      className="recipe-button"
                      onClick={() => setInspected(row.recipe.id)}
                      aria-haspopup="dialog"
                    >
                      <ItemIcon itemId={row.recipe.outputId} />
                      <span className="recipe-label">
                        <span className="recipe-name">
                          {name}
                          {favouriteIds.includes(row.recipe.id) && (
                            <span className="favourite-marker">
                              <FavouriteStar filled />
                              <span className="sr-only"> · Favourite</span>
                            </span>
                          )}
                        </span>
                        {(status ||
                          (account?.progression && row.locked.length > 0)) && (
                          <small className={status ? "muted" : "warning"}>
                            {[
                              status,
                              account?.progression && row.locked.length
                                ? "Locked"
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </span>
                    </button>
                    {hasPriceContext && (
                      <PriceContext
                        itemId={row.recipe.outputId}
                        quote={row.pricing.output}
                        related={row.pricing.inputs.map((input) => ({
                          itemId: input.itemId,
                          quote: input.quote,
                        }))}
                      />
                    )}
                  </td>
                  <td className="category-cell">{row.recipe.category}</td>
                  <td className="secondary-column">{coins(row.cost)}</td>
                  <td className="secondary-column">{coins(row.revenue)}</td>
                  <td
                    className={`profit-column ${metric === "profit" ? "selected-metric" : "secondary-metric"} ${row.profit !== null && row.profit < 0 ? "negative" : row.profit !== null ? "positive" : ""}`}
                  >
                    {coins(row.profit)}
                  </td>
                  <td
                    className={`hour-column ${metric === "perHour" ? "selected-metric" : "secondary-metric"} ${row.perHour !== null && row.perHour < 0 ? "negative" : row.perHour !== null ? "positive" : ""}`}
                  >
                    {coins(row.perHour)}
                  </td>
                  <td>{duration(row.seconds)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <p>No matching recipes. Try a different search or market.</p>
            <button onClick={reset}>Reset filters</button>
          </div>
        )}
      </div>
      <RecipeInspector
        recipe={forgeRecipes.find((recipe) => recipe.id === inspected) ?? null}
        onClose={() => setInspected(null)}
      />
    </Workspace>
  );
}
