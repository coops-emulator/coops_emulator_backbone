# Coops Emulator Backbone

A clean, typed, well-tested JavaScript wrapper around [EmulatorJS](https://emulatorjs.org)
for building multi-console browser emulator apps — the same underlying
engine that powers [ROM Player](https://romplayerbycoops.pages.dev). Drop
it into a project, point it at a container element, and boot a real,
playable NES/SNES/GBA/PS1/PSP/etc. core with a small, promise-based API
instead of hand-wiring EmulatorJS's global config yourself.

```js
import { EmulatorEngine } from "coops_emulator_backbone";

const engine = new EmulatorEngine(document.getElementById("game"));
await engine.loadGame("snes", romFile); // File, Blob, or URL string
```

**Status:** boots and plays for real — confirmed in a live Chrome session
(clean network tab, real gameplay, no console errors beyond one harmless
missing-localization-file warning). 57/57 unit tests passing. See
[`docs/CHANGELOG.md`](docs/CHANGELOG.md) for the full history of bugs found
and fixed along the way, if you want the detailed trail.

## Features

- **20+ systems** out of the box — NES, SNES, GB/GBC/GBA, N64, Genesis,
  Sega CD, 32X, Saturn, Game Gear, Master System, PS1, PSP, NDS, Atari
  2600/7800, Lynx, PC Engine, Neo Geo Pocket, WonderSwan, ColecoVision, 3DO,
  C64, and Arcade/FBNeo (including Neo Geo cartridges). See
  [`src/core-registry.js`](src/core-registry.js) — every entry's system
  identifier is checked against EmulatorJS's real, live docs and CDN, and
  entries that couldn't be fully confirmed are marked so rather than shipped
  as silent guesses.
- **Promise-based API** — `await engine.loadGame(...)` instead of juggling
  global `EJS_ready` callbacks yourself.
- **Real save states** — `getStateBytes()` / `loadStateBytes()` wrap
  EmulatorJS's actual documented `gameManager` API and hand you raw bytes to
  persist however your app wants (your own backend, IndexedDB, wherever).
- **Per-system rewind tuning, theming, and raw option passthrough** —
  `loadGame(id, rom, { color, backgroundColor, rewind, defaultOptions })`.
  Rewind defaults to per-system buffer/granularity profiles in
  `src/rewind-profiles.js`, ported directly from
  [ROM Player by Coops](https://romplayerbycoops.pages.dev)'s own live
  production tuning rather than invented from scratch — including PSP's
  profile, which disables rewind entirely rather than tuning it, since its
  full-state (CPU + VRAM + texture cache) snapshot cost outweighs the
  benefit on that core specifically. Override with `{ rewind: { disabled:
  false, ... } }` if you want it back.
- **Actionable errors** — missing BIOS, missing cross-origin-isolation
  headers (PSP), unknown system ids, and a stuck/timed-out boot all throw
  clear, specific errors instead of a silent black screen.
- **TypeScript definitions** included (`src/index.d.ts`), no build step
  required.
- **Deployment configs** for the one real infrastructure gotcha (PSP needs
  `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers) —
  ready-made for Cloudflare Pages, Netlify, nginx, and Express in `deploy/`.

## Quick start

```bash
git clone <this-repo>
cd coops_emulator_backbone
node e2e/serve-with-headers.mjs 8080
```

Open `http://127.0.0.1:8080/example/index.html`, drop in a ROM you own, and
it auto-detects the system and boots. (Opening the HTML file directly with
`file://` won't work — this project uses ES modules, which browsers block
from `file://` for security reasons; you need a real local server, which is
exactly what that one command starts.)

## Install as a library

```js
import { EmulatorEngine } from "./src/index.js";

const engine = new EmulatorEngine(document.getElementById("game"));
await engine.loadGame("nes", romFileOrUrl);

// Later:
const state = engine.getStateBytes();
engine.loadStateBytes(state);
engine.requestFullscreen();
```

`loadGame`'s second argument accepts a URL string, a `File`, or a `Blob`.

**One real limitation, stated plainly:** EmulatorJS boots via a single
`loader.js` include per page load, so `loadGame()` is meant to be called
once per `EmulatorEngine` instance — create a fresh container + instance
(or reload the page) to load a different game. There's no documented public
API for hot-swapping ROMs mid-session.

## PSP needs cross-origin isolation

PSP's only available core build requires `SharedArrayBuffer`, which needs
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` response headers
on your page — a real browser requirement, not specific to this project.
`loadGame("psp", ...)` throws a clear error if those aren't set. Ready-made
header configs for common hosts are in [`deploy/`](deploy/README.md).

## Self-hosting instead of the public CDN

By default this points at EmulatorJS's real public CDN
(`cdn.emulatorjs.org`) — correct and zero-setup. For offline use or to pin
a version, mirror that CDN path into your own `/data/` folder and pass
`new EmulatorEngine(container, { pathToData: "/data/" })`. Full detail in
[`docs/REFERENCE.md`](docs/REFERENCE.md#self-hosting-instead-of-the-public-cdn).

## Tests

```bash
npm test                    # unit tests - no browser needed
npm run test:e2e:install    # one-time: installs a real Chromium
npm run test:e2e            # real browser, real EmulatorJS CDN, real boot
```

CI (`.github/workflows/ci.yml`) runs both on every push across Node
18/20/22.

## License

The wrapper code in this repo (`src/`, `example/`, `deploy/`) is MIT —
yours to use however you like. EmulatorJS and its individual libretro cores
carry their own licenses (mostly GPLv2/v3); if you self-host and
redistribute core files rather than pointing at the CDN, those obligations
apply to you, same as any EmulatorJS/RetroArch deployment.

## Project layout

```
src/          the library (import from here) - emulator-engine.js, core-registry.js, rewind-profiles.js, index.js, index.d.ts
example/      runnable demo (see Quick start above)
test/         dependency-free unit tests
e2e/          real-browser Playwright tests
deploy/       per-platform COOP/COEP header configs (for PSP)
docs/         CHANGELOG.md (bug-fix history) + REFERENCE.md (deeper technical detail)
```
