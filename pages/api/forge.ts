import { allowClient, hypixelFetch, RequestLimitError } from "../../lib/server/request-controls";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { extractInventory } from "../../lib/server/inventory";
import { currentEnvironment } from "../../lib/forge/profile";
import { normalizeProfiles } from "../../lib/forge/tracker";

import { defaultSettings } from "../../lib/forge/settings";
import { forgeRecipes } from "../../lib/forge/catalog";
import { craftMaterialIds } from "../../lib/forge/planner";

const querySchema = z.object({
  player: z
    .string()
    .regex(
      /^(?:[a-zA-Z0-9_]{3,16}|[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/,
    ),
  craft: z.string().refine((id) => forgeRecipes.some((recipe) => recipe.outputId === id)).optional(),
  profile: z
    .string()
    .regex(
      /^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/,
    )
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
      .json({ error: "Profile lookup is not configured on this server." });
  if (!(await allowClient(req, res, "forge"))) return;
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
    const response = await hypixelFetch(
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
    const payload = await response.json();
    const result = normalizeProfiles(payload, uuid, query.data.profile);
    if (result.progression) {
      result.environment = await currentEnvironment(hypixelFetch);
      const selected = payload.profiles.find(
        (profile: { profile_id: string }) =>
          profile.profile_id === result.selectedProfileId,
      );
      if (query.data.craft) {
        result.inventory = extractInventory(
          selected.members[uuid],
          craftMaterialIds(query.data.craft, { ...defaultSettings, ...result.progression.settings }),
        );
      }
    }
    return res.status(200).json(result);
  } catch (cause) {
    if (cause instanceof RequestLimitError) {
      res.setHeader("Retry-After", String(cause.retryAfter));
      return res.status(cause.status).json({ error: cause.message });
    }
    if (
      cause instanceof Error &&
      [
        "Profile not found.",
        "Player is not a member of this profile.",
      ].includes(cause.message)
    )
      return res.status(404).json({ error: cause.message });
    return res
      .status(502)
      .json({ error: "Could not read profile data. Try again shortly." });
  }
}
