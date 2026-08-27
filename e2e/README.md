# e2e tests (real browser, real CDN)

```
npm install
npm run test:e2e:install   # downloads a real Chromium binary via Playwright
npm run test:e2e           # runs e2e/smoke.spec.mjs in that real browser
```

This is a genuine Playwright suite. It launches actual Chromium, serves
this repo locally with real COOP/COEP headers (`e2e/serve-with-headers.mjs`),
and hits the **live, public** `cdn.emulatorjs.org` over the real internet —
not a mock, not a simulation.

## Why I couldn't run this myself when I built it

I tried, in the same sandboxed environment that wrote this code, and got a
real error, not a policy refusal:

```
Error: Download failed: server returned code 403
body 'Host not in allowlist: cdn.playwright.dev.
Add this host to your network egress settings to allow access.'
```

That sandbox's network egress is allowlisted to package registries
(npm, PyPI, crates.io, GitHub) and nothing else — it can't reach
`cdn.playwright.dev` to download a browser binary, and separately can't
reach `cdn.emulatorjs.org` either. Neither restriction is something more
effort on my part gets around; it's a property of that environment, not of
this test suite.

## Where this actually runs for real

- **Your machine** — `npm run test:e2e:install && npm run test:e2e` after
  cloning, same as any other Playwright project.
- **GitHub Actions** — `.github/workflows/ci.yml` runs it automatically on
  every push, on GitHub-hosted runners, which have normal internet access.
  That job is doing a real browser test against the real CDN every time it
  runs — check the Actions tab on your repo after pushing this.

## What `smoke.spec.mjs` actually proves, and what it doesn't

Proves, for real, in a real browser:
- The example page renders a chip for every registry entry.
- The COOP/COEP headers this project ships actually produce
  `window.crossOriginIsolated === true`.
- `loader.js` is reachable and returns `200` from the live CDN right now.
- `loadGame()` rejects an unknown system before any network call.
- `loadGame("nes", ...)` actually injects and runs the real, current
  `loader.js` from the live CDN in a real tab, and `EJS_core` gets set
  correctly — i.e. the integration point this wrapper owns is wired
  correctly against EmulatorJS's *current* build, not just against this
  repo's assumptions about it.

Does **not** prove:
- That a specific ROM boots, renders a frame, and is playable end to end.
  That requires a real game file. This project has no legal right to
  bundle or fetch one on your behalf, so the suite deliberately stops
  short of that.

## Bring your own ROM (optional, local only)

If you own a ROM legally and want the closest possible test to "it actually
plays," add a test like this locally — don't commit the ROM file to the
repo:

```js
test("boots and plays a real ROM I own", async ({ page }) => {
  await page.goto(`${baseUrl}/example/index.html`);
  await page.setInputFiles("#romInput", "/absolute/path/to/your.nes");
  await expect(page.locator("#status")).toHaveText(/Running/, { timeout: 20_000 });
});
```

`example/index.html`'s `#romInput` file input already wires straight into
`EmulatorEngine.loadGame()` — see `example/index.html` for exactly how.
