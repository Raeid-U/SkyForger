import Link from "next/link";
import { useState } from "react";
import { forgeRecipes, itemById } from "../lib/forge/catalog";
import { itemMarket } from "../lib/forge/markets";
import { rankRecipe } from "../lib/forge/pricing";
import { coins, duration, MarketStatus, useWorkspace } from "./Workspace";
import { ItemIcon } from "./ItemIcon";
import { FavouriteToggle, FavouriteStar } from "./FavouriteToggle";
import { RecipeInspector } from "./RecipeInspector";
import { PriceContext } from "./PriceContext";
import { Modal } from "./Modal";

export function Favourites() {
  const {
    favouriteIds,
    consent,
    setStorageOpen,
    settings,
    snapshot,
    auctions,
    account,
  } = useWorkspace();
  const [inspected, setInspected] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const savedRecipes = favouriteIds.flatMap((id) => {
    const recipe = forgeRecipes.find((recipe) => recipe.id === id);
    return recipe ? [recipe] : [];
  });
  return (
    <section
      id="favourites"
      className="favourites-section"
      aria-labelledby="favourites-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="favourites-heading">
            <FavouriteStar filled /> Favourites{" "}
            <span className="muted favourites-count">
              {savedRecipes.length || ""}
            </span>
            <button
              className="favourites-help text-button"
              aria-label="About favourites and profit calculations"
              aria-haspopup="dialog"
              onClick={() => setShowHelp(true)}
            >
              <span aria-hidden="true">(?)</span>
            </button>
          </h2>
        </div>
      </div>
      <Modal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        title="About favourites"
      >
        <p>Your saved recipes, ready for the next free slot.</p>
        <p>
          Profit per item is estimated sale proceeds minus ingredient costs and
          the forge fee, divided by the batch output. Uses your buy/sell
          settings, manual prices and cheaper eligible ingredient crafting.
        </p>
        <p>Bazaar tax is deducted; auction fees are excluded.</p>
        <p>
          Ingredient prices are market totals for one forge batch, before any
          crafting savings.
        </p>
        <Link
          className="inline-link"
          href="/"
          onClick={() => setShowHelp(false)}
        >
          Browse recipes <span aria-hidden="true">↗</span>
        </Link>
      </Modal>
      {consent !== "allow" ? (
        <div className="favourites-empty">
          <p>
            Save the recipes you keep coming back to. Enable browser storage,
            then star a recipe in Forge flips.
          </p>
          <button className="text-button" onClick={() => setStorageOpen(true)}>
            Enable favourites
          </button>
        </div>
      ) : !savedRecipes.length ? (
        <div className="favourites-empty">
          <p>
            No favourites yet. Open a recipe in Forge flips and select{" "}
            <span className="favourite-hint">Add to favourites</span>.
          </p>
        </div>
      ) : (
        <>
          <MarketStatus />
          {!account?.progression && (
            <p className="muted favourites-progression">
              Connect a profile to check unlocks and apply Quick Forge.
            </p>
          )}
          <ul className="favourites-list" aria-label="Favourite recipes">
            {savedRecipes.map((recipe) => {
              const row = rankRecipe(
                recipe,
                snapshot,
                settings,
                auctions.context,
              );
              const name =
                itemById.get(recipe.outputId)?.name ?? recipe.outputId;
              return (
                <li key={recipe.id} className="favourite-row">
                  <FavouriteToggle recipe={recipe} compact />
                  <div className="favourite-identity">
                    <button
                      className="favourite-recipe"
                      onClick={() => setInspected(recipe.id)}
                      aria-haspopup="dialog"
                    >
                      <ItemIcon itemId={recipe.outputId} />
                      <span>{name}</span>
                    </button>
                    <div className="favourite-meta muted">
                      {itemMarket(recipe.outputId) === "auction"
                        ? "Auction House"
                        : "Bazaar"}{" "}
                      · {duration(row.seconds)}
                      {account?.progression && (
                        <span className={row.locked.length ? "warning" : ""}>
                          {" "}
                          ·{" "}
                          {row.locked.length
                            ? `Locked · ${row.locked.join(" · ")}`
                            : "Unlocked"}
                        </span>
                      )}
                    </div>
                    <PriceContext
                      itemId={recipe.outputId}
                      quote={row.pricing.output}
                      related={row.pricing.inputs.map((input) => ({
                        itemId: input.itemId,
                        quote: input.quote,
                      }))}
                    />
                  </div>
                  <div className="favourite-ingredients">
                    <small className="muted">Ingredients / batch</small>
                    <ul aria-label={`${name} ingredient costs`}>
                      {row.pricing.inputs.map((input) => (
                        <li key={input.itemId}>
                          <span>
                            {coins(input.quantity)} ×{" "}
                            {itemById.get(input.itemId)?.name ?? input.itemId}
                            <small className="muted">
                              {input.quote.source === "manual"
                                ? "Manual"
                                : input.quote.source === "fixed"
                                  ? "Fixed"
                                  : itemMarket(input.itemId) === "auction"
                                    ? "AH"
                                    : "BZ"}
                            </small>
                          </span>
                          <span className="number">
                            {coins(input.quote.amount)}{" "}
                            <small className="muted">coins</small>
                          </span>
                        </li>
                      ))}
                      {recipe.coins > 0 && (
                        <li>
                          <span className="muted">Forge fee</span>
                          <span className="number">
                            {coins(recipe.coins)}{" "}
                            <small className="muted">coins</small>
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="favourite-profit">
                    <small className="muted">Estimated profit / item</small>
                    <strong
                      className={`number ${row.profit === null ? "muted" : row.profit < 0 ? "negative" : "positive"}`}
                    >
                      {coins(
                        row.profit === null
                          ? null
                          : row.profit / recipe.quantity,
                      )}{" "}
                      <small>coins</small>
                    </strong>
                    <Link
                      className="inline-link"
                      href={`/planner?item=${recipe.outputId}`}
                    >
                      Plan craft <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <RecipeInspector
        recipe={forgeRecipes.find((recipe) => recipe.id === inspected) ?? null}
        onClose={() => setInspected(null)}
      />
    </section>
  );
}
