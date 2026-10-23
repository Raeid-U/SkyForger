import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import { allowClient, clientIdentity, createMemoryLimiter, hypixelFetch, RequestLimitError } from "../lib/server/request-controls";

test("rolling budget is atomic across lanes, counts concurrency, and recovers without a window-boundary burst", async () => {
  let now = 0;
  const take = createMemoryLimiter(() => now);
  const all = { key: "all", limit: 3, windowMs: 300000 };
  const auction = { key: "auction", limit: 2, windowMs: 300000 };
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => take([all, auction])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  await take([all]); // Denied auction did not spend global capacity.
  now = 299999;
  await assert.rejects(take([all]), (e: RequestLimitError) => e.status === 429 && e.retryAfter === 1);
  now = 300000;
  await take([all, auction]);
});

test("IP limits stop a repeated caller before upstream work and isolate other callers", async () => {
  const request = (ip: string) => ({ headers: {}, socket: { remoteAddress: ip } }) as unknown as NextApiRequest;
  const headers: Record<string, string> = {};
  let status = 200;
  const res = { setHeader: (key: string, value: string) => { headers[key] = value; }, status: (value: number) => { status = value; return res; }, json: () => res } as unknown as NextApiResponse;
  for (let i = 0; i < 10; i++) assert.equal(await allowClient(request("192.0.2.1"), res, "forge"), true);
  assert.equal(await allowClient(request("192.0.2.1"), res, "forge"), false);
  assert.equal(status, 429);
  assert.ok(Number(headers["Retry-After"]) > 0);
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(await allowClient(request("192.0.2.2"), res, "forge"), true);
});

test("local callers cannot change identity by spoofing forwarding headers", () => {
  const req = { headers: { "x-forwarded-for": "192.0.2.8", "x-vercel-forwarded-for": "192.0.2.9" }, socket: { remoteAddress: "127.0.0.1" } } as unknown as NextApiRequest;
  assert.equal(clientIdentity(req), clientIdentity({ ...req, headers: {} } as NextApiRequest));
});

test("upstream wrapper refuses arbitrary hosts before making a request", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected fetch"); });
  await assert.rejects(hypixelFetch("https://example.com"), /Unexpected upstream host/);
  assert.equal(upstream.mock.callCount(), 0);
});
