import { allowClient, hypixelFetch, RequestLimitError } from "../../lib/server/request-controls";
import type { NextApiRequest, NextApiResponse } from "next";
import { parseBazaar } from "../../lib/bazaar";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await allowClient(req, res, "bazaar"))) return;
  try {
    const upstream = await hypixelFetch("https://api.hypixel.net/v2/skyblock/bazaar", {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`);
    const snapshot = parseBazaar(await upstream.json());
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(snapshot);
  } catch (error) {
    if (error instanceof RequestLimitError) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Retry-After", String(error.retryAfter));
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Bazaar fetch failed:", error instanceof Error ? error.message : "Unknown error");
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Bazaar prices are unavailable. Please try again shortly." });
  }
}
