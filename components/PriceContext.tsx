import { useState } from "react";
import type { MarketPriceQuote } from "../lib/forge/pricing";
import { itemMarket } from "../lib/forge/markets";
import { itemById } from "../lib/forge/catalog";
import { Modal } from "./Modal";
import { coins, ManualPrice, useWorkspace } from "./Workspace";

type Entry = { itemId: string; quote: MarketPriceQuote };
export function priceSummary(quote: MarketPriceQuote): string {
  if (quote.source === "manual") return "Manual override";
  switch (quote.reason) {
    case "no-active-bin":
      return "No BIN listings";
    case "no-comparable-bin":
      return "No comparable listings";
    case "insufficient-bin-depth":
      return "Insufficient quantity";
    case "no-auction-data":
      return "Prices unavailable";
    case "stale-auction-data":
      return "Quote expired";
  }
  if (quote.warningCodes.includes("sparse-listings")) return "Limited listings";
  return quote.source === "auction"
    ? "BIN estimate"
    : quote.amount === null
      ? "Price unavailable"
      : "";
}
const explanations: Record<string, string> = {
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
function QuoteDetails({ itemId, quote }: Entry) {
  const { settings, update } = useWorkspace();
  const manual = quote.source === "manual";
  const name = itemById.get(itemId)?.name ?? itemId;
  const auction = itemMarket(itemId) === "auction";
  return (
    <section className="quote-section">
      <h3>{name}</h3>
      <dl className="quote-facts">
        <div>
          <dt>Price source</dt>
          <dd>
            {manual
              ? "Manual override"
              : quote.source === "auction"
                ? "Hypixel active BIN"
                : quote.source === "bazaar"
                  ? "Bazaar"
                  : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Quoted total</dt>
          <dd>{coins(quote.amount)} coins</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{priceSummary(quote) || "Available"}</dd>
        </div>
        {auction && quote.auction && (
          <>
            <div>
              <dt>Comparable listings</dt>
              <dd>
                {quote.auction.comparableListings} /{" "}
                {quote.auction.activeListings} active
              </dd>
            </div>
            <div>
              <dt>Comparable units</dt>
              <dd>{quote.auction.comparableUnits}</dd>
            </div>
            <div>
              <dt>Offers sampled</dt>
              <dd>{quote.auction.lowestListings.length} (up to 5)</dd>
            </div>
          </>
        )}
        {quote.sourceUpdatedAt !== null && (
          <div>
            <dt>{manual ? "Snapshot updated" : "Source updated"}</dt>
            <dd>
              {new Date(quote.sourceUpdatedAt).toLocaleString([], {
                timeZoneName: "short",
              })}
            </dd>
          </div>
        )}
        {quote.expiresAt !== null && (
          <div>
            <dt>{manual ? "Automatic quote expires" : "Quote expires"}</dt>
            <dd>
              {new Date(quote.expiresAt).toLocaleString([], {
                timeZoneName: "short",
              })}
            </dd>
          </div>
        )}
      </dl>
      {quote.reason && (
        <p className="warning">
          {explanations[quote.reason] ??
            "Price unavailable. Enter a manual override if needed."}
        </p>
      )}
      {!manual && quote.warningCodes.includes("sparse-listings") && (
        <p className="warning">
          Only {quote.auction?.comparableListings} comparable BIN listing(s).
          This price may be inflated and may not reflect a realizable sale
          price.
        </p>
      )}
      {quote.warningCodes.includes("whole-listing-purchase") && (
        <p className="muted">Purchase estimate pays for whole BIN stacks.</p>
      )}
      {auction && <p className="muted">AH fees excluded.</p>}
      <label className="override-control">
        Manual unit price
        <ManualPrice itemId={itemId} />
      </label>
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
    </section>
  );
}
export function PriceContext({
  itemId,
  quote,
  related = [],
}: Entry & { related?: Entry[] }) {
  const [open, setOpen] = useState(false);
  const relevant = related.filter(
    (entry) =>
      itemMarket(entry.itemId) === "auction" ||
      entry.quote.source === "manual" ||
      entry.quote.reason,
  );
  const auction =
    itemMarket(itemId) === "auction" ||
    relevant.some((entry) => itemMarket(entry.itemId) === "auction");
  if (
    !auction &&
    quote.source !== "manual" &&
    quote.amount !== null &&
    !relevant.length
  )
    return null;
  const inputWarning = relevant.some(
    (entry) =>
      entry.quote.reason ||
      entry.quote.warningCodes.includes("sparse-listings"),
  );
  return (
    <div className="price-context">
      <span className="muted">
        {priceSummary(quote) ||
          (inputWarning ? "Ingredient price warning" : "Price context")}
        {inputWarning && priceSummary(quote) ? " · Check ingredients" : ""}
      </span>
      <button
        className="text-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {auction ? "Auction details" : "Price details"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={auction ? "Auction details" : "Price details"}
      >
        <QuoteDetails itemId={itemId} quote={quote} />
        {relevant.length > 0 && <h3>Ingredient pricing</h3>}
        {relevant.map((entry) => (
          <QuoteDetails key={entry.itemId} {...entry} />
        ))}
        {auction && (
          <>
            <h3>Estimate assumptions</h3>
            <AuctionAssumptions />
          </>
        )}
      </Modal>
    </div>
  );
}
export function AuctionAssumptions() {
  return (
    <dl className="quote-facts auction-assumptions">
      <div>
        <dt>Sale estimate</dt>
        <dd>
          Current BIN asking price, not completed-sale history. AH fees
          excluded; buyers and instant fills are not guaranteed.
        </dd>
      </div>
      <div>
        <dt>Purchase estimate</dt>
        <dd>
          Whole BIN stacks from up to five retained offers; not an exhaustive
          market search.
        </dd>
      </div>
      <div>
        <dt>Pets</dt>
        <dd>Legendary level 1 (below 660 XP), without held items or skins.</dd>
      </div>
      <div>
        <dt>Equipment</dt>
        <dd>
          Unmodified items only. Modified listings are excluded, not adjusted to
          an invented base value.
        </dd>
      </div>
    </dl>
  );
}
