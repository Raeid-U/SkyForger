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
    ["GET", { player: uuid, craft: "not-a-recipe" }, 400],
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

test("IGN lookup accepts hyphenated profile IDs and returns derived settings without raw member data", async (t) => {
  const old = process.env.HYPIXEL_API_KEY;
  process.env.HYPIXEL_API_KEY = "test-server-secret";
  t.after(() => {
    if (old === undefined) delete process.env.HYPIXEL_API_KEY;
    else process.env.HYPIXEL_API_KEY = old;
  });
  const profileId = "abcdef01-2345-6789-abcd-ef0123456789";
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.mojang.com")) {
        assert.equal(
          (options?.headers as Record<string, string> | undefined)?.["API-Key"],
          undefined,
        );
        return new Response(JSON.stringify({ id: uuid, name: "ExampleIGN" }));
      }
      if (url.includes("resources/skyblock/election"))
        return new Response(
          JSON.stringify({
            success: true,
            mayor: { name: "Cole", perks: [{ name: "Molten Forge" }] },
          }),
        );
      assert.equal(
        (options?.headers as Record<string, string>)["API-Key"],
        "test-server-secret",
      );
      return new Response(
        JSON.stringify({
          success: true,
          profiles: [
            {
              profile_id: profileId,
              cute_name: "Kiwi",
              members: {
                [uuid]: {
                  skill_tree: {
                    experience: { mining: 347000 },
                    nodes: { mining: { forge_time: 20 } },
                  },
                  player_data: {
                    unlocked_coll_tiers: ["GEMSTONE_COLLECTION_11"],
                  },
                  inventory: { sacks_counts: { REFINED_MITHRIL: 4 } },
                  private_marker: "do-not-expose-raw-member-data",
                },
              },
            },
          ],
        }),
      );
    },
  );
  const { result, res } = response();
  await handler(
    {
      method: "GET",
      query: { player: "ExampleIGN", profile: profileId },
    } as unknown as NextApiRequest,
    res,
  );
  assert.equal(result.code, 200);
  const body = result.body as {
    progression: { settings: { hotm: number } };
    inventory: { items: Record<string, number> };
    environment: { moltenForge: boolean };
  };
  assert.equal(body.progression.settings.hotm, 7);
  assert.equal(body.inventory, null);
  const checked = response();
  await handler({ method: "GET", query: { player: uuid, profile: profileId, craft: "refined-mithril" } } as unknown as NextApiRequest, checked.res);
  assert.equal(checked.result.code, 200);
  assert.deepEqual((checked.result.body as typeof body).inventory.items, {});
  assert.equal(body.environment.moltenForge, true);
  assert.ok(!JSON.stringify(result.body).includes("test-server-secret"));
  assert.ok(
    !JSON.stringify(result.body).includes("do-not-expose-raw-member-data"),
  );
});

test("profile lookup reports rate limits and rejected keys without exposing upstream details", async (t) => {
  const old = process.env.HYPIXEL_API_KEY;
  process.env.HYPIXEL_API_KEY = "test-server-secret";
  t.after(() => {
    if (old === undefined) delete process.env.HYPIXEL_API_KEY;
    else process.env.HYPIXEL_API_KEY = old;
  });
  for (const [upstream, expected] of [
    [429, 429],
    [403, 503],
    [500, 502],
  ]) {
    const mock = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response("private-upstream-detail", { status: upstream }),
    );
    const { result, res } = response();
    await handler(
      { method: "GET", query: { player: uuid } } as unknown as NextApiRequest,
      res,
    );
    assert.equal(result.code, expected);
    assert.ok(!JSON.stringify(result.body).includes("private-upstream-detail"));
    mock.mock.restore();
  }
});
