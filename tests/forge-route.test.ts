import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../pages/api/forge";

function response() {
  const result = {
    code: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  const res = {
    setHeader(name: string, value: string) {
      result.headers[name] = value;
      return this;
    },
    status(code: number) {
      result.code = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as NextApiResponse;
  return { result, res };
}
const uuid = "12345678901234567890123456789012";
test("tracker rejects invalid input and non-GET requests", async () => {
  for (const [method, query, code] of [
    ["POST", {}, 405],
    ["GET", { player: "bad/input" }, 400],
  ] as const) {
    const { result, res } = response();
    await handler({ method, query } as NextApiRequest, res);
    assert.equal(result.code, code);
    assert.equal(result.headers["Cache-Control"], "private, no-store");
  }
});
test("tracker without a server key never calls upstream", async (t) => {
  const old = process.env.HYPIXEL_API_KEY;
  delete process.env.HYPIXEL_API_KEY;
  t.after(() => {
    if (old === undefined) delete process.env.HYPIXEL_API_KEY;
    else process.env.HYPIXEL_API_KEY = old;
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected fetch");
  });
  const { result, res } = response();
  await handler(
    { method: "GET", query: { player: uuid } } as unknown as NextApiRequest,
    res,
  );
  assert.equal(result.code, 503);
  assert.equal(fetch.mock.callCount(), 0);
});
test("tracker key stays in the server header and out of the URL and response", async (t) => {
  const old = process.env.HYPIXEL_API_KEY;
  process.env.HYPIXEL_API_KEY = "test-server-secret";
  t.after(() => {
    if (old === undefined) delete process.env.HYPIXEL_API_KEY;
    else process.env.HYPIXEL_API_KEY = old;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit) => {
      assert.ok(!String(input).includes("test-server-secret"));
      assert.equal(
        (options?.headers as Record<string, string>)["API-Key"],
        "test-server-secret",
      );
      return new Response(JSON.stringify({ success: true, profiles: [] }));
    },
  );
  const { result, res } = response();
  await handler(
    { method: "GET", query: { player: uuid } } as unknown as NextApiRequest,
    res,
  );
  assert.equal(result.code, 200);
  assert.ok(!JSON.stringify(result.body).includes("test-server-secret"));
});
