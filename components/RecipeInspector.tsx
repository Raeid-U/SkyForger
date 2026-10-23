import { PriceContext, AuctionAssumptions } from "./PriceContext";
import Link from "next/link";
import { Modal } from "./Modal";
import { ItemIcon } from "./ItemIcon";
import { coins, duration, useWorkspace } from "./Workspace";
import { itemById, type Recipe } from "../lib/forge/catalog";
import { materialCost, rankRecipe } from "../lib/forge/pricing";
import { itemMarket } from "../lib/forge/markets";

export function RecipeInspector({
  recipe,
  onClose,
}: {
  recipe: Recipe | null;
  onClose: () => void;
}) {
  const { snapshot, settings, account, auctions } = useWorkspace();
  const row = recipe
    ? rankRecipe(recipe, snapshot, settings, auctions.context)
    : null;
  return (
    <Modal open={!!recipe} title="Recipe details" onClose={onClose}>
      {recipe && row && (
        <>
          <p className="eyebrow">
            {recipe.category} ·{" "}
            {itemMarket(recipe.outputId) === "auction"
              ? "Auction House"
              : itemMarket(recipe.outputId)}
          </p>
          <h3 className="inspector-title">
            <ItemIcon itemId={recipe.outputId} />
            {itemById.get(recipe.outputId)?.name}
          </h3>
          <p className="muted">
            Produces {recipe.quantity} · Forge time{" "}
            <span className="number">{duration(row.seconds)}</span>
          </p>
          <p className={row.missing.length ? "warning" : "muted"}>
            {row.missing.length
              ? "Unpriced · missing a price or sufficient market depth"
              : "Priced with current market assumptions"}
          </p>
          {!account?.progression && (
            <p className="notice">
              Connect a profile to check your unlocks and apply Quick Forge.
            </p>
          )}
          <PriceContext itemId={recipe.outputId} quote={row.pricing.output} />
          <h3>Unlock requirements</h3>
          {recipe.requirements.length ? (
            <ul className="requirement-list">
              {recipe.requirements.map((requirement, index) => (
                <li key={index}>
                  {requirement.kind === "hotm"
                    ? `HOTM ${requirement.level}`
                    : requirement.kind === "collection"
                      ? `${requirement.collection} ${requirement.level}`
                      : requirement.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No additional unlock requirements listed.</p>
          )}
          {account?.progression && (
            <p className={row.locked.length ? "warning" : "positive"}>
              {row.locked.length
                ? `Locked · ${row.locked.join(" · ")}`
                : "Unlocked for this profile"}
            </p>
          )}
          <h3>Ingredients</h3>
          <ul className="ingredient-list">
            {recipe.inputs.map((input) => (
              <li key={input.itemId}>
                <div>
                  <span className="item-name">
                    <ItemIcon itemId={input.itemId} />
                    {itemById.get(input.itemId)?.name}
                  </span>
                  <small className="muted">× {coins(input.quantity)}</small>
                  <PriceContext
                    itemId={input.itemId}
                    quote={
                      row.pricing.inputs.find(
                        (entry) => entry.itemId === input.itemId,
                      )!.quote
                    }
                  />
                </div>
                <span className="number">
                  {coins(
                    materialCost(
                      input.itemId,
                      input.quantity,
                      snapshot,
                      settings,
                      new Set(),
                      auctions.context,
                    ),
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="notice">
            Ingredient costs use the current buy strategy, including eligible
            gemstone crafting when cheaper.
          </p>
          <dl className="financial-breakdown">
            <div>
              <dt>Fixed forge fee</dt>
              <dd>{coins(recipe.coins)}</dd>
            </div>
            <div>
              <dt>Total cost</dt>
              <dd>{coins(row.cost)}</dd>
            </div>
            <div>
              <dt>Sale proceeds</dt>
              <dd>{coins(row.revenue)}</dd>
            </div>
            <div>
              <dt>Profit / item</dt>
              <dd
                className={
                  row.profit !== null && row.profit < 0
                    ? "negative"
                    : "positive"
                }
              >
                {coins(row.profit)}
              </dd>
            </div>
            <div>
              <dt>Theoretical profit / hour</dt>
              <dd
                className={
                  row.perHour !== null && row.perHour < 0
                    ? "negative"
                    : "positive"
                }
              >
                {coins(row.perHour)}
              </dd>
            </div>
          </dl>
          <p className="notice">
            Coins shown per recipe batch. Hourly throughput assumes immediate
            restarts, available materials, and market fills.
          </p>
          <p className="muted">
            {settings.buyMode === "order" ? "Buy order" : "Instant buy"} →{" "}
            {settings.sellMode === "offer" ? "Sell offer" : "Instant sell"}
            {itemMarket(recipe.outputId) === "bazaar"
              ? ` · ${Number((settings.tax * 100).toFixed(3))}% Bazaar tax`
              : ""}
          </p>
          <AuctionAssumptions />
          {(settings.buyMode === "order" || settings.sellMode === "offer") && (
            <p className="notice">
              Orders assume a fill at the current best price; fill times are not
              predicted.
            </p>
          )}
          <Link
            className="primary planner-link"
            href={`/planner?item=${recipe.outputId}`}
          >
            Open in Craft planner <span aria-hidden="true">↗</span>
          </Link>
        </>
      )}
    </Modal>
  );
}
