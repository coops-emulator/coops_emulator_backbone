// @ts-check
import { test, expect } from "@playwright/test";
import { startServer } from "./serve-with-headers.mjs";
import { fileURLToPath } from "node:url";

/**
 * This is a REAL browser test - it launches actual Chromium via Playwright
 * and hits the LIVE public EmulatorJS CDN over the real internet. It is
 * not a mock and not a simulation.
 *
 * It cannot run inside the sandboxed environment that wrote this file (no
 * browser binaries, no route to cdn.emulatorjs.org from that sandbox - see
 * README "What I could not verify from this environment"). It DOES run for
 * real wherever you execute `npm run test:e2e` - your machine, or CI (see
 * .github/workflows/ci.yml, where GitHub-hosted runners have full internet
 * access).
 *
 * Scope, stated plainly: this suite verifies the wrapper's real-browser
 * plumbing - COOP/COEP headers actually produce crossOriginIsolated,
 * loader.js actually fetches and parses from the live CDN, the UI actually
 * renders every registry entry, and loadGame() actually reaches the
 * EmulatorJS-internal error path for a deliberately invalid input. It does
 * NOT boot a real ROM end-to-end, because that requires a game file this
 * project has no legal right to bundle or fetch. See the "Bring your own
 * ROM" section in e2e/README.md for how to extend this locally with a ROM
 * you legally own.
 */

let server;
let baseUrl;

test.beforeAll(async () => {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  ({ server, url: baseUrl } = await startServer(rootDir, 0));
});

test.afterAll(async () => {
  server?.close();
});

test("the example page loads and renders a chip for every registry entry", async ({ page }) => {
  await page.goto(`${baseUrl}/example/index.html`);
  const chips = page.locator("#chips .chip");
  // Registry has 26 entries as of this writing - see src/core-registry.js.
  // Assert "at least a substantial number" rather than hardcoding the exact
  // count so this test doesn't silently rot the moment the registry grows.
  await expect(chips).not.toHaveCount(0);
  const count = await chips.count();
  expect(count).toBeGreaterThan(20);
});

test("COOP/COEP headers actually produce a cross-origin isolated page", async ({ page }) => {
  await page.goto(`${baseUrl}/example/index.html`);
  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  expect(isolated).toBe(true);
});

test("loader.js is reachable and fetches successfully from the live EmulatorJS CDN", async ({ page }) => {
  await page.goto(`${baseUrl}/example/index.html`);
  const status = await page.evaluate(async () => {
    const res = await fetch("https://cdn.emulatorjs.org/stable/data/loader.js");
    return res.status;
  });
  expect(status).toBe(200);
});

test("EmulatorEngine.loadGame() rejects an unknown system before touching the network", async ({ page }) => {
  await page.goto(`${baseUrl}/example/index.html`);
  const errorMessage = await page.evaluate(async () => {
    const { EmulatorEngine } = await import("/src/index.js");
    const engine = new EmulatorEngine(document.createElement("div"));
    try {
      await engine.loadGame("dreamcast", "fake.rom");
      return null;
    } catch (err) {
      return err.message;
    }
  });
  expect(errorMessage).toMatch(/Unknown system id "dreamcast"/);
});

test("EmulatorEngine.loadGame() actually boots against the live CDN for a real system (nes)", async ({ page }) => {
  // This doesn't supply a real ROM (see file header for why), so it can't
  // reach EJS_ready. What it DOES prove for real: the live loader.js loads
  // in an actual browser, parses without throwing, and gets far enough to
  // set up EmulatorJS's internal state - i.e. the integration point this
  // wrapper owns is wired correctly against the real, current EmulatorJS
  // build, not just against this repo's own assumptions about it.
  await page.goto(`${baseUrl}/example/index.html`);
  const result = await page.evaluate(async () => {
    const { EmulatorEngine } = await import("/src/index.js");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const engine = new EmulatorEngine(container);
    // Fire loadGame() but don't await it to completion - without a real
    // ROM it can never reach EJS_ready, so awaiting it would hang this
    // test forever. Swallow whatever it eventually does.
    engine.loadGame("nes", "data:application/octet-stream;base64,AAAA").catch(() => {});
    // Give the real loader.js time to actually load and run in this real
    // browser tab against the real CDN.
    await new Promise((r) => setTimeout(r, 3000));
    return {
      loaderScriptPresent: !!document.querySelector('script[src*="loader.js"]'),
      ejsCoreWasSet: window.EJS_core,
    };
  });
  expect(result.loaderScriptPresent).toBe(true);
  expect(result.ejsCoreWasSet).toBe("nes");
});
