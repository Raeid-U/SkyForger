import assert from "node:assert/strict";
import { test } from "node:test";
import { readApiResponse } from "../lib/api-response";

test("API errors keep server messages and handle non-JSON edge responses", async () => {
  await assert.rejects(
    readApiResponse(
      Response.json({ error: "Profile not found." }, { status: 404 }),
      "Lookup unavailable.",
    ),
    { message: "Profile not found." },
  );
  await assert.rejects(
    readApiResponse(
      new Response("<h1>Rate limited</h1>", { status: 429 }),
      "Lookup unavailable.",
    ),
    { message: "Too many requests. Please try again shortly." },
  );
  await assert.rejects(
    readApiResponse(
      new Response("<h1>Unavailable</h1>", { status: 503 }),
      "Lookup unavailable.",
    ),
    { message: "Lookup unavailable." },
  );
});

test("malformed successful responses use the fallback without leaking parser details", async () => {
  for (const value of ["not JSON", "null"]) {
    await assert.rejects(
      readApiResponse(new Response(value), "Incomplete response."),
      { message: "Incomplete response." },
    );
  }
  assert.deepEqual(
    await readApiResponse(
      Response.json({ profiles: [] }),
      "Incomplete response.",
    ),
    { profiles: [] },
  );
});
