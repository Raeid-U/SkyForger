import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../pages/api/bazaar";

function response() {
  const result = { code: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) { result.headers[name] = value; return this; },
    status(code: number) { result.code = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  } as unknown as NextApiResponse;
  return { result, res };
}

test("POST returns 405 without calling Hypixel", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected fetch"); });
  const { result, res } = response();
  await handler({ method: "POST" } as NextApiRequest, res);
  assert.equal(result.code, 405);
  assert.equal(result.headers.Allow, "GET");
  assert.equal(upstream.mock.callCount(), 0);
});

test("validated market snapshots receive CDN caching headers", async (t) => {
  const snapshot = { success: true, lastUpdated: 1700000000000, products: {} };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(snapshot)));
  const { result, res } = response();
  await handler({ method: "GET" } as NextApiRequest, res);
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, snapshot);
  assert.match(result.headers["Cache-Control"], /s-maxage=60/);
});

test("upstream failures and malformed snapshots produce uncached 502 errors", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const upstream of [new Response("Unavailable", { status: 503 }), new Response('{"success":false}')]) {
    t.mock.method(globalThis, "fetch", async () => upstream);
    const { result, res } = response();
    await handler({ method: "GET" } as NextApiRequest, res);
    assert.equal(result.code, 502);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.deepEqual(result.body, { error: "Bazaar prices are unavailable. Please try again shortly." });
  }
});

test("network timeout returns an uncached failure", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => { throw new DOMException("Timed out", "TimeoutError"); });
  const { result, res } = response();
  await handler({ method: "GET" } as NextApiRequest, res);
  assert.equal(result.code, 502);
  assert.equal(result.headers["Cache-Control"], "no-store");
});
