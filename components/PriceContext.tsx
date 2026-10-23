import { useState } from "react";
import type { MarketPriceQuote } from "../lib/forge/pricing";
import { itemMarket } from "../lib/forge/markets";
import { ManualPrice, useWorkspace } from "./Workspace";

export function priceSummary(quote: MarketPriceQuote): string {
  if (quote.source === "manual") return "Manual price override";
  switch (quote.reason) {
    case "no-active-bin":
      return "No current BIN listings";
    case "no-comparable-bin":
      return "No comparable BIN listings";
    case "insufficient-bin-depth":
      return "Insufficient sampled BIN quantity";
    case "no-auction-data":
      return "Auction prices unavailable";
    case "stale-auction-data":
      return "Auction prices expired";
  }
  if (quote.warningCodes.includes("sparse-listings"))
    return `Only ${quote.auction?.comparableListings ?? 0} comparable BIN listing(s)`;
  return quote.source === "auction"
    ? "BIN asking price · AH fees excluded"
    : quote.amount === null
      ? "Price unavailable"
      : "";
}

export function PriceContext({
  itemId,
  quote,
}: {
  itemId: string;
  quote: MarketPriceQuote;
}) {
  const { settings, update } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const auction = itemMarket(itemId) === "auction";
  const manual = quote.source === "manual";
  if (!auction && !manual && quote.amount !== null) return null;
  const explanation: Record<string, string> = {
    "no-active-bin":
      "No current BIN listings found. Check historical prices elsewhere and enter a manual override.",
    "no-comparable-bin":
      "BIN listings exist, but none match an unmodified item or level 1 pet. Enter a manual override if needed.",
    "insufficient-bin-depth":
      "The sampled BIN listings cannot cover this quantity. More listings may exist outside the sample. Check current listings or enter a manual override.",
    "no-auction-data":
      "Auction prices are temporarily unavailable. Retry later or enter a manual override.",
    "stale-auction-data":
      "Auction price data has expired. Refresh prices or enter a manual override.",
  };
  return (
    <div className="price-context">
      <p
        className={
          quote.reason ||
          (!manual && quote.warningCodes.includes("sparse-listings"))
            ? "warning"
            : "muted"
        }
      >
        {explanation[quote.reason ?? ""] ?? priceSummary(quote)}
        {!manual &&
          quote.warningCodes.includes("sparse-listings") &&
          " · This price may be inflated and may not reflect a realizable sale price."}
      </p>
      {auction && !manual && quote.sourceUpdatedAt !== null && (
        <small className="muted">
          Source{" "}
          {new Date(quote.sourceUpdatedAt).toLocaleString([], {
            timeZoneName: "short",
          })}
          {quote.expiresAt !== null &&
            ` · Expires ${new Date(quote.expiresAt).toLocaleTimeString([], { timeZoneName: "short" })}`}
        </small>
      )}
      {quote.warningCodes.includes("whole-listing-purchase") && (
        <p className="muted">Buy estimate pays for whole BIN stacks.</p>
      )}
      {auction && !manual && quote.auction && (
        <details>
          <summary>Listing coverage</summary>
          <p>
            {quote.auction.comparableListings} comparable /{" "}
            {quote.auction.activeListings} active BIN listings ·{" "}
            {quote.auction.comparableUnits} comparable units. Purchase estimates
            sample at most five offers.
          </p>
          {Object.keys(quote.auction.excludedVariants).length > 0 && (
            <p>
              Excluded modified or non-comparable listings:{" "}
              {Object.values(quote.auction.excludedVariants).reduce(
                (sum, count) => sum + count,
                0,
              )}
              .
            </p>
          )}
        </details>
      )}
      <div className="price-actions">
        <button
          className="text-button"
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          {manual ? "Edit override" : "Set manual price"}
        </button>
        {manual && (
          <button
            className="text-button"
            onClick={() => {
              const prices = { ...settings.prices };
              delete prices[itemId];
              update({ prices });
            }}
          >
            Reset override
          </button>
        )}
      </div>
      {editing && <ManualPrice itemId={itemId} />}
    </div>
  );
}

export function AuctionAssumptions() {
  return (
    <p className="notice">
      Auction estimates use current BIN asking prices, not completed-sale
      history; AH fees are excluded. Pets must be Legendary level 1 (below 660
      XP), without held items or skins. Equipment must be unmodified; modified
      listings are excluded rather than adjusted to a base value. Buy estimates
      pay for whole BIN stacks. Sale estimates do not guarantee buyers or
      instant fills.
    </p>
  );
}
