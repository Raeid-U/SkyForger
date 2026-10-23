import { AuctionCollectionError, collectAuctionSnapshot } from "../lib/server/auctions/collector";
import { buildBinPriceReport } from "../lib/server/auctions/pricing";

async function main() {
  process.stderr.write("Collecting active BIN listings (up to 180 page attempts).\n");
  const snapshot = await collectAuctionSnapshot({
    onProgress: ({ attempt, page, totalPages }) => {
      if (page === 0 || page % 10 === 0 || page === totalPages - 1)
        process.stderr.write(`Attempt ${attempt}/2: read page ${page + 1}/${totalPages}.\n`);
    },
  });
  const report = buildBinPriceReport(snapshot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const priced = report.quotes.filter((quote) => quote.status === "priced").length;
  process.stderr.write(`${priced}/${report.quotes.length} eligible outputs priced from ${snapshot.totalAuctions} auctions.\n`);
}
main().catch((error: unknown) => {
  const code = error instanceof AuctionCollectionError ? `[${error.code}] ` : "";
  process.stderr.write(`${code}${error instanceof Error ? error.message : "Auction collection failed."}\n`);
  process.exitCode = 1;
});
