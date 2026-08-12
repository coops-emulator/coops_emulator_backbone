# Coops Emulator Backbone

A thin, correct wrapper around **EmulatorJS's real loader.js and EJS_\* API** —
the same underlying engine your ROM Player app uses. This version wraps
EmulatorJS's actual public contract instead of reimplementing a competing
(and, in the previous version of this repo, incorrect) Emscripten module
loader from scratch.

## This is a rewrite — here's exactly what was wrong and why

I reviewed the original version of this repo by checking its claims against
the *live* EmulatorJS CDN and official docs rather than trusting its own
comments. Three things in it would not have worked if you'd run `npm install`
and tried to boot a game:

1. **`fetch-cores.js` downloaded from a URL that doesn't serve these
   files.** It used `raw.githubusercontent.com/EmulatorJS/EmulatorJS/main/data/cores`.
   I fetched that path and it doesn't resolve — `data/cores` is a *local
   build output folder* per EmulatorJS's own build docs, not something
   committed to the git repo. The real, confirmed-live distribution point is
   `https://cdn.emulatorjs.org/stable/data/cores/`.
2. **The file-format assumption was wrong.** `core-loader.js` expected each
   core as a `<core>.js` + `<core>.wasm` pair with a guessable global Module
   factory. I checked the real CDN directory listing — every core actually
   ships as one bundled `<core>-wasm.data` file, meant to be loaded through
   EmulatorJS's own `loader.js`/`emulator.js`, not a generic script tag.
3. **Save states used synthetic keyboard hotkeys (F2/F4) as a stand-in for a
   real API.** There is a real, documented one:
   `EJS_emulator.gameManager.getState()` / `.loadState(bytes)`.

This version fixes all three by not reimplementing that layer at all — it
configures the real `EJS_*` globals and lets EmulatorJS's own loader.js do
what it already does correctly.

## What changed, file by file

- **`src/core-registry.js`** — rewritten to map each system to EmulatorJS's
  real `EJS_core` *system* identifier (e.g. `"nes"`, `"segaCD"`,
  `"segaSaturn"`) instead of a raw libretro core binary name. Verified
  against `emulatorjs.org/docs/systems/`, the live CDN listing, and
  `emulatorjs.org/docs4devs/cores/`. Two entries (Neo Geo, and the
  "arcade" catch-all) originally shipped as `verified: false` because I
  couldn't reach the live docs to confirm them from the sandboxed
  environment that wrote the first version of this file. **Update
  (2026-08-12):** I got live access and checked
  `emulatorjs.org/docs/systems/arcade/` directly — it confirms
  `EJS_core = "arcade"` and that Neo Geo runs through that same system.
  Both are now `verified: true`, and every entry in the registry is
  currently confirmed. `verified: false` remains the honest fallback for
  any entry I can't reach a live source for in the future — check
  `emulatorjs.org/docs/systems/` yourself before trusting one if you see
  it.
  **MSX was removed entirely**: the original mapped it to a `bluemsx` core
  that doesn't appear in EmulatorJS's live core listing (re-confirmed
  absent as of the 2026-08-12 check too). Shipping it as a guess would be
  the exact mistake this rewrite exists to fix.
- **`src/emulator-engine.js`** — replaces `core-loader.js` +
  `emulator-engine.js`. Sets the real `EJS_player`/`EJS_core`/`EJS_gameUrl`/
  `EJS_pathtodata` globals, injects the real `loader.js`, and wraps the real
  save-state API and lifecycle hooks (`EJS_ready`, `EJS_onGameStart`, etc.).
- **`core-loader.js` and `fetch-cores.js` are removed.** There's nothing
  correct left for them to do — EmulatorJS's own loader.js already resolves,
  fetches, decompresses, and boots the right core for you.
- **`input-manager.js` is removed.** EmulatorJS handles keyboard + Gamepad
  API input internally; the original's approach (dispatching synthetic
  keyboard events at "the core's canvas") didn't match how EmulatorJS
  actually owns input — there's no separate core canvas to target. Use the
  real `EJS_defaultControls` / `EJS_VirtualGamepadSettings` config options
  (see `emulatorjs.org/docs/options/`) to customize bindings instead.
- **`storage.js` is removed** for save states specifically — EmulatorJS
  already persists those to IndexedDB itself when `"save-state-location"` is
  `"browser"`. `getStateBytes()`/`loadStateBytes()` below hand you the raw
  bytes if you want to persist them yourself (e.g. to your own backend);
  build your own storage layer for that if you need it, since what "yours"
  should look like depends on your app.

## Project layout

```
src/               the library itself (import from here)
  emulator-engine.js
  core-registry.js
  index.js          re-exports both, matches package.json "main"
  index.d.ts         hand-written TypeScript definitions, matches package.json "types"
example/
  index.html         the runnable demo from "Quick start" below
test/                dependency-free unit test suite - see "Tests" below
e2e/                 real-browser end-to-end tests (Playwright) - see "End-to-end tests" below
.github/workflows/   CI config - runs both suites on every push
deploy/              per-platform COOP/COEP header configs - see "Cross-origin isolation" below
```

## Quick start

```html
<div id="game"></div>
<script type="module">
  import { EmulatorEngine } from "./src/index.js";

  const engine = new EmulatorEngine(document.getElementById("game"));
  await engine.loadGame("nes", "path/or/blob/to/game.nes");
</script>
```

`loadGame`'s second argument accepts a URL string, a `File`, or a `Blob` —
all three are things EmulatorJS's real `EJS_gameUrl` supports directly.

**Important, stated plainly:** EmulatorJS boots via a single `loader.js`
include per page load. This wrapper mirrors that — `loadGame()` is meant to
be called once per `EmulatorEngine` instance. I could not find a documented,
reliable public API for hot-swapping to a different ROM without a page
reload, so this doesn't claim to support that.

## Save states (the real API)

```js
const bytes = engine.getStateBytes(); // Uint8Array — persist however you like
// ...later...
engine.loadStateBytes(bytes);
```

## Tearing down

```js
engine.destroy();
```

This removes the injected `loader.js` `<script>` tag and clears the
container's contents — the two things this wrapper actually owns. It does
**not** claim to fully reset EmulatorJS's internal state (audio contexts,
window-level listeners, etc.) — I found no documented API for that, and
`loadGame()` still refuses a second call on the same instance even after
`destroy()`, for the same "boots once per page load" reason described
above. Use it to tidy up the DOM before discarding the page/instance, not
to safely reboot a new game into the same page — create a fresh container
and `EmulatorEngine` instance for that (or reload the page).

## Cross-origin isolation (required for PSP)

PSP's only available EmulatorJS core build (`ppsspp-thread-wasm.data`)
requires `SharedArrayBuffer`, which browsers only expose on pages served
with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

This is a real browser security requirement (not specific to EmulatorJS or
this engine) — without those headers, `loadGame("psp", ...)` throws a clear
error rather than silently failing. Most static hosts (GitHub Pages,
Cloudflare Pages default config) don't set these by default; check your
host's docs for how to add response headers if you need PSP support.

Ready-made configs for four common setups are in `deploy/` — Cloudflare
Pages, Netlify, nginx, and Express. See `deploy/README.md` for which one to
use and what I could and couldn't verify about them.

## Self-hosting instead of the public CDN

By default this engine points `EJS_pathtodata` at
`https://cdn.emulatorjs.org/stable/data/` — EmulatorJS's real, live,
public CDN. That's genuinely correct and requires no setup.

If you want to self-host instead (offline use, avoiding a third-party
runtime dependency, pinning an exact version), you need to mirror the
**actual** contents of that CDN path — `loader.js`, `emulator.min.js` and
its other core JS files, and every `<core>-wasm.data` file you plan to
support — into your own `/data/` folder, then pass
`new EmulatorEngine(container, { pathToData: "/data/" })`. I have not
shipped an automated fetch script for this in this rewrite: the original
`fetch-cores.js`'s core mistake was confidently automating a download from
a URL I hadn't verified actually worked. I'd rather you mirror the real CDN
folder yourself (`wget -r` / `rsync` against a path you can literally open
in a browser and check) than have me ship another script making the same
kind of unverified claim about a URL again. Happy to build that script with
you if you want — I'd just want to verify each path against the live CDN
first, the way I did for the paths already in this file.

**License note:** most libretro cores are GPLv2/v3. If you mirror and
commit core files into your own repo (rather than pointing at the CDN),
that carries GPL source-availability obligations — same as EmulatorJS/
RetroArch ship under. This engine's own code is yours to license however
you like.

## TypeScript

`src/index.d.ts` is hand-written (there's no build step in this project —
see above) and kept in sync manually against `core-registry.js` and
`emulator-engine.js`. `package.json`'s `"types"` field points at it, so
`import { EmulatorEngine } from "coops_emulator_backbone"` gets editor
completion and type-checking with no extra setup. If you edit either
source file's public shape, update `src/index.d.ts` to match — nothing
enforces that automatically.

## Tests

```
npm test
```

Runs `test/run.mjs` — a small dependency-free test suite (no test
framework installed; see `test/harness.mjs`), covering:

- **`core-registry.js`** — pure logic, no browser needed: every entry has
  the required shape, extension detection (including ambiguous extensions
  like `.cue` and case-insensitivity), unknown-id errors, and the
  thread-requirement flag.
- **`emulator-engine.js`**'s own guard logic — constructor validation,
  the single-boot-per-instance guard, the PSP/`crossOriginIsolated` check,
  the globals `loadGame()` sets, the save-state passthrough calling the
  real documented `gameManager` API, and `destroy()` — using a minimal
  DOM/`window` mock (`test/dom-mock.mjs`) built just for this, **not** a
  real browser and **not** a simulation of EmulatorJS itself.

**What this test suite does and does not prove:** it proves this wrapper's
own logic — validation, error messages, which globals it sets, which
methods it calls — behaves as documented. It cannot prove a ROM actually
boots and runs correctly in a browser against the live EmulatorJS CDN,
because that requires a real browser and real network access.

## End-to-end tests (real browser, real CDN)

```
npm install
npm run test:e2e:install
npm run test:e2e
```

A real Playwright suite (`e2e/smoke.spec.mjs`) — actual Chromium, actual
`cdn.emulatorjs.org` over the real internet. This is the test that closes
the gap the unit tests above can't: it proves the live, current EmulatorJS
build actually loads and wires up correctly against this wrapper, right
now, not just that this wrapper's own code is internally consistent.

I could not run this myself from the sandboxed environment that wrote this
project — I tried, and got a concrete network error, not a shortcut I
skipped. Full details, exactly what it does and doesn't prove, and how to
extend it with a ROM you legally own, are in `e2e/README.md`.

## Continuous integration

`.github/workflows/ci.yml` runs the unit test suite on every push across
Node 18/20/22, and separately runs the real-browser e2e suite against the
live CDN on GitHub-hosted runners — which, unlike my sandbox, have normal
internet access. Push this repo to GitHub and check the Actions tab to see
it actually run.

## What I could not verify from this environment

I don't have network access to `cdn.emulatorjs.org` from my sandboxed
execution environment, and I'm not going to drive a live browser session
that has your other personal/school tabs and accounts open in it. Everything
above was checked via web search and direct fetches of public documentation
and the CDN's own directory listing — not by actually booting a game
end-to-end in a browser. Please do one real smoke test (`example/index.html`
served over `http`, pick NES, drop in a ROM) before relying on this for
anything real. If something doesn't match what's documented here, the CDN
listing or `emulatorjs.org/docs` are more current than this file — Emulator JS
updates independently of this wrapper.
