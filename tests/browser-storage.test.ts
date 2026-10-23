import { test } from "node:test";
import assert from "node:assert/strict";
import {
  browserKeys,
  chooseStorage,
  readBrowserValue,
  storageConsent,
  writeBrowserValue,
} from "../lib/browser-storage";

test("optional browser persistence requires permission and revocation clears only application data", () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    assert.equal(storageConsent(), null);
    writeBrowserValue(browserKeys.sort, "profit");
    assert.equal(values.size, 0);
    values.set(browserKeys.account, JSON.stringify({ player: "legacy" }));
    assert.equal(readBrowserValue(browserKeys.account), null);
    chooseStorage("allow");
    writeBrowserValue(browserKeys.sort, "perHour");
    assert.equal(readBrowserValue(browserKeys.sort), "perHour");
    values.set(browserKeys.bazaar, "corrupt");
    assert.equal(readBrowserValue(browserKeys.bazaar), null);
    values.set("unrelated", "preserve");
    chooseStorage("decline");
    assert.equal(storageConsent(), "decline");
    for (const key of Object.values(browserKeys))
      assert.equal(values.has(key), false);
    assert.equal(values.get("unrelated"), "preserve");
    writeBrowserValue(browserKeys.sort, "profit");
    assert.equal(values.has(browserKeys.sort), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("unavailable browser storage does not prevent using the app", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("Storage denied");
    },
  });
  try {
    assert.equal(storageConsent(), null);
    assert.equal(readBrowserValue(browserKeys.sort), null);
    assert.doesNotThrow(() => chooseStorage("decline"));
    assert.doesNotThrow(() => writeBrowserValue(browserKeys.sort, "profit"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
