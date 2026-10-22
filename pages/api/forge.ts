import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { normalizeProfiles } from "../../lib/forge/tracker";

const querySchema = z.object({
  player: z
    .string()
    .regex(
      /^(?:[a-zA-Z0-9_]{3,16}|[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/,
    ),
  profile: z
    .string()
    .regex(/^[a-fA-F0-9]{32}$/)
    .optional(),
});
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const query = querySchema.safeParse(req.query);
  if (!query.success)
    return res
      .status(400)
      .json({ error: "Enter a valid Minecraft username or UUID." });
  const key = process.env.HYPIXEL_API_KEY;
  if (!key)
    return res
      .status(503)
      .json({ error: "Account tracking is not configured on this server." });
  try {
    let uuid = query.data.player.replaceAll("-", "").toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(uuid)) {
      const response = await fetch(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(query.data.player)}`,
        { signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      if (response.status === 404 || response.status === 204)
        return res.status(404).json({ error: "Minecraft username not found." });
      if (!response.ok)
        return res
          .status(502)
          .json({ error: "Username lookup unavailable. Try a UUID instead." });
      uuid = z
        .object({ id: z.string().regex(/^[a-fA-F0-9]{32}$/) })
        .parse(await response.json())
        .id.toLowerCase();
    }
    const response = await fetch(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
      {
        headers: { "API-Key": key, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (response.status === 429)
      return res
        .status(429)
        .json({ error: "Hypixel rate limit reached. Try again shortly." });
    if (response.status === 403)
      return res
        .status(503)
        .json({ error: "The server's Hypixel API key was rejected." });
    if (!response.ok)
      return res
        .status(502)
        .json({ error: "Hypixel profiles are unavailable." });
    return res
      .status(200)
      .json(normalizeProfiles(await response.json(), uuid, query.data.profile));
  } catch {
    return res
      .status(502)
      .json({ error: "Could not read forge data. Try again shortly." });
  }
}
