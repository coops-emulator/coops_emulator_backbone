# Reference

Deeper technical detail that didn't need to be in the front-door README.
See also [`CHANGELOG.md`](CHANGELOG.md) for the history of bugs found and
fixed, and `src/index.d.ts` for the full typed API surface.

---

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
Cross-Origin-Embedder-Policy: credentialless
```

`credentialless`, not `require-corp` — `require-corp` requires every
cross-origin resource on the page to send back its own
`Cross-Origin-Resource-Policy` header, which `cdn.emulatorjs.org` does not
do; this was confirmed the hard way in production (see `deploy/README.md`
"Why credentialless, not require-corp" for the full story). `credentialless`
gives you the same `crossOriginIsolated === true` PSP needs without that
failure mode.

This is a real browser security requirement (not specific to EmulatorJS or
this engine) — without those headers, `loadGame("psp", ...)` throws a clear
error rather than silently failing. Most static hosts (GitHub Pages,
Cloudflare Pages default config) don't set these by default; check your
host's docs for how to add response headers if you need PSP support.

Ready-made configs for four common setups are in `deploy/` — Cloudflare
Pages, Netlify, nginx, and Express. See `deploy/README.md` for which one to
use and the full credentialless-vs-require-corp reasoning.

## PSP's CDN channel (optional, verified 2026-08-27)

Separate from the header requirement above: PSP specifically runs better on
EmulatorJS's `nightly` CDN channel (`https://cdn.emulatorjs.org/nightly/data/`)
than the `stable` channel (`https://cdn.emulatorjs.org/stable/data/`) this
engine uses everywhere by default.

**Why:** EmulatorJS's own changelog for the relevant nightly build says
"Fix hardware rendering for PPSSPP core" and describes PPSSPP as
"significantly more playable" as a direct result
(https://emulatorjs.org/docs/changelog/). That claim was independently
confirmed, not just taken on faith: ROM Player by Coops (the production app
this engine's tuning is ported from) shipped PSP-only on `nightly` and a
real user on real hardware (a MacBook Pro, not a low-power device) reported
a meaningful improvement on the actual live production site — "much
better," in their words, with only a minor residual audio crackle left
over. That crackle is a separate, smaller, not-yet-investigated issue; it
does not undo the overall improvement.

**How:** `getPathToData(systemId)` returns the verified override for a
system id if one exists (currently just `psp`), or the stable CDN path
otherwise:

```js
import { EmulatorEngine, getPathToData } from "coops_emulator_backbone";

const engine = new EmulatorEngine(container, {
  pathToData: getPathToData(systemId),
});
await engine.loadGame(systemId, rom);
```

**This is opt-in, not automatic**, and deliberately so: `pathToData` is
resolved once, at construction, before `loadGame()` even knows which system
is about to load (see `EmulatorEngineOptions.pathToData` and the tests in
`emulator-engine.test.mjs` that assert this immediately after construction)
— there was no way to make this "automatically smart per system" without
either breaking that existing, tested contract, or restructuring when
`pathToData` gets resolved. A small standalone helper that you opt into
explicitly was the design that didn't require compromising anything already
working. See `src/cdn-channels.js` for the full reasoning and exact URLs.

**The real risk, stated plainly:** `nightly` updates daily and EmulatorJS's
own release notes call it explicitly unstable ("cores are not
inter-changeable between versions... things may break"). This override
exists for PSP specifically because that trade-off has already been made
and verified for that one system — it is not a general recommendation to
run everything on nightly.

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

## Verification status

Everything in this file up to the sections above was written before a live
browser test happened. It has since actually been run in a real Chrome
session: clean network tab (every request `200` except one harmless missing
localization file), `EJS_ready` firing correctly, and — after fixing the
`EJS_gameName`/`EJS_startOnLoaded` gaps documented in `CHANGELOG.md` — a
real game (Zelda: A Link to the Past on the SNES core) actually playing.
That's stronger evidence than anything I could produce from a sandboxed
environment with no access to `cdn.emulatorjs.org`, and it supersedes the
more hedged language that was originally here. The unit test suite
(`npm test`) and the Playwright e2e suite (`npm run test:e2e`) still exist
to catch regressions going forward - a live test today doesn't prove
tomorrow's EmulatorJS update won't change something, which is exactly what
automated tests are for.
