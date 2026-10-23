import { collectAuctionSnapshot } from "../lib/server/auctions/collector";
import { buildBinPriceReport } from "../lib/server/auctions/pricing";

async function main() {
  const snapshot = await collectAuctionSnapshot();
  const report = buildBinPriceReport(snapshot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const priced = report.quotes.filter((quote) => quote.status === "priced").length;
  process.stderr.write(`${priced}/${report.quotes.length} eligible outputs priced from ${snapshot.totalAuctions} auctions.\n`);
}
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Auction collection failed."}\n`);
  process.exitCode = 1;
});
