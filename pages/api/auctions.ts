import type { NextApiRequest, NextApiResponse } from "next";
import type { AuctionResponse } from "../../lib/auctions";
import { AuctionServiceError, getAuctionPrices } from "../../lib/server/auctions/service";

export const config = { maxDuration: 180 };

export function createAuctionHandler(getPrices: () => Promise<AuctionResponse> = getAuctionPrices, now: () => number = Date.now) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const result = await getPrices();
      const ttl = Math.max(0, Math.min(30, Math.floor((result.report.expiresAt - now()) / 1000), Math.floor((result.refresh.nextRefreshAt - now()) / 1000)));
      if (ttl > 0) res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${ttl}, must-revalidate`);
      return res.status(200).json(result);
    } catch (error) {
      const failure = error instanceof AuctionServiceError ? error : new AuctionServiceError("unavailable", 30);
      res.setHeader("Retry-After", String(failure.retryAfter));
      return res.status(failure.code === "rate-limited" ? 429 : 503).json({ error: failure.message, code: failure.code });
    }
  };
}

export default createAuctionHandler();
