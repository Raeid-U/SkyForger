import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";

export class RequestLimitError extends Error {
  constructor(public readonly status: 429 | 503, public readonly retryAfter: number) {
    super(status === 429 ? "Request limit reached. Please try again shortly." : "Request protection is unavailable. Please try again shortly.");
  }
}

export type Limit = { key: string; limit: number; windowMs: number };
export function createMemoryLimiter(now = Date.now) {
  const entries = new Map<string, number[]>();
  return async (limits: Limit[]) => {
    const at = now();
    // Bound retained client identities and discard expired entries.
    for (const [key, times] of entries) {
      if (times[times.length - 1] <= at - 300000) entries.delete(key);
    }
    if (entries.size > 10000) throw new RequestLimitError(503, 30);
    const active = limits.map((rule) => ({ rule, times: (entries.get(rule.key) ?? []).filter((time) => time > at - rule.windowMs) }));
    const blocked = active.filter(({ rule, times }) => times.length >= rule.limit);
    if (blocked.length) throw new RequestLimitError(429, Math.max(...blocked.map(({ rule, times }) => Math.max(1, Math.ceil((times[0] + rule.windowMs - at) / 1000)))));
    for (const { rule, times } of active) entries.set(rule.key, [...times, at]);
  };
}

// Best-effort protection within one process; Vercel Firewall supplies edge IP limits.
const localLimit = createMemoryLimiter();
export const consumeLimits = localLimit;

export function clientIdentity(req: NextApiRequest) {
  // Vercel overwrites this header. Outside Vercel, forwarded headers are untrusted.
  const forwarded = req.headers?.["x-vercel-forwarded-for"];
  const address = process.env.VERCEL === "1" && typeof forwarded === "string"
    ? forwarded.trim() : req.socket?.remoteAddress ?? "unknown";
  return createHash("sha256").update(isIP(address) ? address : "unknown").digest("hex");
}
export async function allowClient(req: NextApiRequest, res: NextApiResponse, route: "forge" | "bazaar" | "auctions") {
  try {
    await consumeLimits([{ key: `ip:${route}:${clientIdentity(req)}`, limit: route === "forge" ? 10 : 30, windowMs: 60000 }]);
    return true;
  } catch (error) {
    const failure = error instanceof RequestLimitError ? error : new RequestLimitError(503, 30);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Retry-After", String(failure.retryAfter));
    res.status(failure.status).json({ error: failure.message, code: failure.status === 429 ? "rate-limited" : "unavailable" });
    return false;
  }
}

export async function hypixelFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://api.hypixel.net") throw new Error("Unexpected upstream host");
  const limits: Limit[] = [{ key: "upstream:all", limit: 240, windowMs: 300000 }];
  if (url.pathname === "/v2/skyblock/auctions") limits.push({ key: "upstream:auctions", limit: 180, windowMs: 300000 });
  await consumeLimits(limits);
  return fetch(input, init);
}
