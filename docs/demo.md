# Demo recording

The README video is recorded with Playwright at 1440 × 1000 using sample profile and market responses. Captions, the cursor, and the Sample Data banner exist only in the recording browser. The script opts into storage in its isolated context, and intercepts API requests so it needs no Hypixel key or published auction snapshot.

With the app running locally:

```sh
npx playwright install chromium
npm run demo:record
```

`DEMO_BASE_URL` defaults to `http://localhost:3000`. Output goes to ignored `.demo-output/`: a WebM, screenshots, caption timestamps, and the before/after materials comparison. `DEMO_OUTPUT_DIR` changes the destination; `DEMO_BROWSER_PATH` optionally selects an existing Chromium installation.

The recording covers flip estimates, auction uncertainty, profile integration, crafting dependencies, an explicit owned-material check, the remaining shopping list, scheduling, and My Forge. Assertions verify the materials list changes, exactly one inventory lookup occurs, and no browser runtime errors are reported. Fixtures live in `scripts/demo/fixtures/`; they are demonstration data, not current prices or real account progression.

After reviewing a recording, update the README assets:

```sh
cp .demo-output/skyforger-demo.webm docs/media/skyforger-demo.webm
cp .demo-output/skyforger-demo-remaining.png docs/media/demo-poster.png
```

The linked poster works in GitHub Markdown without relying on embedded HTML video support. The WebM can be played or downloaded; a hosted player can replace the link later.
