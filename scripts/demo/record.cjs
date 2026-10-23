const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const out = path.resolve(root, process.env.DEMO_OUTPUT_DIR || ".demo-output");
fs.mkdirSync(out, { recursive: true });
const baseUrl = process.env.DEMO_BASE_URL || "http://localhost:3000";
const mode = "skyforger-demo";
const speed = Number(process.env.DEMO_SPEED || 1);
(async () => {
  const browser = await chromium.launch(
    process.env.DEMO_BROWSER_PATH
      ? { executablePath: process.env.DEMO_BROWSER_PATH }
      : {},
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    recordVideo: { dir: out + "/raw", size: { width: 1440, height: 1000 } },
    reducedMotion: "no-preference",
  });
  const now = Date.now();
  const bz = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/bazaar.json")),
  );
  bz.lastUpdated = now;
  // Deliberate sample prices, never advertised as current market observations.
  for (const [id, buy, sell] of [
    ["ENCHANTED_MITHRIL", 1200, 1100],
    ["REFINED_MITHRIL", 700000, 650000],
  ]) {
    if (bz.products[id]) {
      bz.products[id].buy_summary = [
        { pricePerUnit: buy, amount: 100000, orders: 20 },
      ];
      bz.products[id].sell_summary = [
        { pricePerUnit: sell, amount: 100000, orders: 20 },
      ];
    }
  }
  const ah = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/auctions.json")),
  );
  Object.assign(ah.report, {
    sourceUpdatedAt: now,
    fetchedAt: now,
    evaluatedAt: now,
    expiresAt: now + 120000,
  });
  ah.refresh = { state: "cached", nextRefreshAt: now + 60000 };
  for (const q of ah.report.quotes)
    for (const l of q.lowestListings) l.endsAt = now + 3600000;
  const profile = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/profile.json")),
  );
  profile.fetchedAt = now;
  profile.progression.settings.quickForge = 20;
  profile.progression.warnings = [];
  profile.jobs[0].startedAt = now - 3600000;
  let materialRequests = 0;
  await context.route("**/api/**", (route) => route.abort());
  await context.route("**/api/bazaar", (r) => r.fulfill({ json: bz }));
  await context.route("**/api/auctions", (r) => r.fulfill({ json: ah }));
  await context.route("**/api/forge?*", (r) => {
    const craft = new URL(r.request().url()).searchParams.get("craft");
    if (craft) materialRequests++;
    return r.fulfill({
      json: {
        ...profile,
        inventory: craft
          ? {
              items: {
                "enchanted-mithril": 160,
                "refined-mithril": 3,
                "enchanted-titanium": 8,
              },
              warnings: [],
            }
          : null,
      },
    });
  });
  await context.addInitScript(() => {
    localStorage.setItem("skyforger:storage-consent:v1", "allow");
    localStorage.setItem("skyforger:type-mode", JSON.stringify("standard"));
    window.addEventListener("DOMContentLoaded", () => {
      const layer = document.createElement("div");
      layer.popover = "manual";
      layer.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;padding:0;margin:0;border:0;background:transparent;pointer-events:none;overflow:visible";
      document.body.append(layer);
      layer.showPopover();
      new MutationObserver((records) => {
        if (
          records.some((record) => record.target instanceof HTMLDialogElement)
        ) {
          layer.hidePopover();
          layer.showPopover();
        }
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ["open"],
      });
      const label = document.createElement("div");
      label.id = "demo-label";
      label.textContent = "SAMPLE DATA";
      label.style.cssText =
        "position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:2147483647;background:#242820;color:#c9dd80;border:1px solid #606c44;border-radius:5px;padding:7px 10px;font:11px Arial;letter-spacing:1px;pointer-events:none";
      layer.append(label);
      const caption = document.createElement("div");
      caption.id = "demo-caption";
      caption.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:max-content;max-width:85vw;z-index:2147483647;background:rgba(18,20,18,.96);border:1px solid #4d5739;border-radius:12px;padding:15px 23px;color:#f0f1e9;font:20px/1.4 Arial;letter-spacing:.1px;box-shadow:0 8px 40px #0008;pointer-events:none;opacity:0;transition:opacity 220ms ease,translate 280ms ease;translate:0 8px";
      layer.append(caption);
      const cursor = document.createElement("div");
      cursor.id = "demo-cursor";
      cursor.style.cssText =
        "position:fixed;left:0;top:0;width:19px;height:25px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 1px 2px #0009)";
      cursor.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19 25"><path d="M2 1.5v19l4.5-4.5 4 7 3-1.8-4-7h6.8Z" fill="white" stroke="#18191a" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      layer.append(cursor);
      document.addEventListener("mousemove", (e) => {
        cursor.style.left = e.clientX - 2 + "px";
        cursor.style.top = e.clientY - 2 + "px";
      });
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(8000);
  const video = page.video();
  const chapters = [];
  async function pause(ms = 3000) {
    await page.waitForTimeout(ms * speed);
  }
  async function caption(text, ms = 2200) {
    await page.evaluate(() => {
      const el = document.getElementById("demo-caption");
      el.style.opacity = "0";
      el.style.translate = "0 8px";
    });
    await pause(230);
    await page.evaluate((t) => {
      const el = document.getElementById("demo-caption");
      el.textContent = t;
      el.style.opacity = "1";
      el.style.translate = "0 0";
    }, text);
    chapters.push({ text, url: page.url(), at: Date.now() });
    console.log(text);
    await pause(ms);
  }
  let mouse = { x: 650, y: 180 };
  async function move(x, y) {
    const start = { ...mouse },
      dx = x - start.x,
      dy = y - start.y;
    const count = 24,
      duration = Math.min(650, Math.max(270, Math.hypot(dx, dy) * 0.65));
    for (let i = 1; i <= count; i++) {
      const t = i / count,
        e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const arc =
        Math.sin(Math.PI * e) * Math.min(32, Math.hypot(dx, dy) * 0.07);
      await page.mouse.move(start.x + dx * e, start.y + dy * e + arc);
      await pause(duration / count);
    }
    mouse = { x, y };
  }
  async function scrollTo(locator, align = 180) {
    await locator.waitFor({ state: "visible" });
    await locator.evaluate(
      async (el, { align, speed }) => {
        const start = window.scrollY,
          target = Math.max(
            0,
            Math.min(
              document.documentElement.scrollHeight - innerHeight,
              start + el.getBoundingClientRect().top - align,
            ),
          );
        if (Math.abs(target - start) < 2) return;
        const duration = 550 * speed,
          at = performance.now();
        await new Promise((resolve) => {
          function tick(now) {
            const t = Math.min(1, (now - at) / duration),
              e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            window.scrollTo(0, start + (target - start) * e);
            if (t < 1) requestAnimationFrame(tick);
            else resolve();
          }
          requestAnimationFrame(tick);
        });
      },
      { align, speed },
    );
    await pause(180);
  }
  async function click(locator) {
    await locator.waitFor({ state: "visible" });
    let box = await locator.boundingBox();
    if (box && (box.y < 60 || box.y + box.height > 880)) {
      await scrollTo(locator);
      box = await locator.boundingBox();
    }
    if (!box) throw new Error("Click target missing");
    const x = box.x + box.width * 0.48,
      y = box.y + box.height * 0.53;
    await move(x, y);
    await pause(110);
    await page.mouse.click(x, y);
    await pause(230);
  }
  try {
    await page.goto(baseUrl);
    await expect(page.locator("tbody tr")).toHaveCount(117);
    await page.mouse.move(650, 180);
    await page
      .getByRole("combobox", { name: "Sort recipes" })
      .selectOption("category");
    await caption("Your forge, without the spreadsheet.", 2000);
    await click(page.getByRole("searchbox", { name: "Search recipes" }));
    await page
      .getByRole("searchbox", { name: "Search recipes" })
      .pressSequentially("Refined Mithril", { delay: 60 * speed });
    await page
      .getByRole("combobox", { name: "Sort recipes" })
      .selectOption("perHour");
    await caption("Compare profit per item or per hour.", 2200);
    await click(
      page.getByRole("button", { name: "Refined Mithril", exact: true }),
    );
    await expect(
      page.getByRole("heading", { name: "Recipe details", exact: true }),
    ).toBeVisible();
    await caption("See what goes into each estimate.", 2000);
    await click(
      page.getByRole("button", {
        name: "Add Refined Mithril to favourites",
        exact: true,
      }),
    );
    await page.keyboard.press("Escape");
    await pause(250);
    await page
      .getByRole("searchbox", { name: "Search recipes" })
      .fill("Tungsten Regulator");
    const auctionDetails = page.getByRole("button", {
      name: /auction details for Tungsten Regulator/i,
    });
    await click(auctionDetails.first());
    await caption("Bazaar and BIN pricing, with uncertainty made clear.", 2400);
    await page.screenshot({ path: out + "/" + mode + "-auction.png" });
    await page.keyboard.press("Escape");
    await click(
      page.getByRole("button", { name: "Connect profile", exact: true }),
    );
    await caption("Integrates with your existing SkyBlock profile.", 1500);
    await click(
      page.getByRole("textbox", { name: "Minecraft username or UUID" }),
    );
    await page
      .getByRole("textbox", { name: "Minecraft username or UUID" })
      .pressSequentially("DemoPlayer", { delay: 70 * speed });
    await click(
      page.getByRole("button", { name: "Load account", exact: true }),
    );
    await expect(
      page.getByRole("combobox", { name: "SkyBlock profile" }),
    ).toBeVisible();
    await pause(1800);
    await page.keyboard.press("Escape");
    await click(page.getByRole("link", { name: "Craft planner", exact: true }));
    await expect(
      page.getByRole("heading", { name: "Craft tree", exact: true }),
    ).toBeVisible();
    await page
      .locator(".planner-controls select")
      .first()
      .selectOption("mithril-plate");
    await caption("Turn a crafting tree into a plan.", 3000);
    const before = {
      stats: await page.locator(".stats").innerText(),
      shopping: await page.locator(".planner-grid").innerText(),
    };
    await page.screenshot({ path: out + "/" + mode + "-before.png" });
    await click(
      page.getByRole("button", { name: "Check owned materials", exact: true }),
    );
    await expect(
      page.getByRole("button", { name: "Ignore owned materials", exact: true }),
    ).toBeVisible();
    await click(page.locator(".owned-materials summary"));
    await expect(page.locator(".owned-materials details")).toHaveAttribute(
      "open",
      "",
    );
    await caption("Use what you already have.", 3500);
    await page.screenshot({ path: out + "/" + mode + "-owned.png" });
    await scrollTo(page.locator(".planner-grid"), 110);
    await caption("See exactly what’s left to buy or gather.", 5000);
    const after = {
      stats: await page.locator(".stats").innerText(),
      shopping: await page.locator(".planner-grid").innerText(),
    };
    if (before.shopping === after.shopping)
      throw new Error("Owned materials did not change shopping list");
    fs.writeFileSync(
      out + "/" + mode + "-material-diff.json",
      JSON.stringify({ before, after }, null, 2),
    );
    await page.screenshot({ path: out + "/" + mode + "-remaining.png" });
    const schedule = page.getByRole("heading", { name: /schedule/i });
    if (await schedule.count()) {
      await scrollTo(schedule.first(), 170);
      await caption("Plan the work across your forge slots.", 2200);
    }
    await scrollTo(page.locator("header"), 0);
    await click(page.getByRole("link", { name: "My forge", exact: true }));
    await expect(page.locator(".forge-countdown")).toBeVisible();
    await caption("Track your forge. Keep favourites close.", 3500);
    await page.screenshot({ path: out + "/" + mode + "-tracker.png" });
    await caption("SkyForger · Compare. Plan. Forge.", 2400);
    await page.screenshot({ path: out + "/" + mode + "-poster.png" });
    if (errors.length)
      throw new Error("Browser runtime errors: " + errors.join("; "));
    if (materialRequests !== 1)
      throw new Error("Expected one explicit material lookup");
    fs.writeFileSync(
      out + "/" + mode + "-chapters.json",
      JSON.stringify(
        { sampleData: true, materialRequests, runtimeErrors: errors, chapters },
        null,
        2,
      ),
    );
  } catch (error) {
    await page
      .screenshot({ path: out + "/" + mode + "-error.png" })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
    await video.saveAs(out + "/" + mode + ".webm");
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
