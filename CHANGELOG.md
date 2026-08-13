# Changelog / debugging history

This file is the honest, detailed record of every real bug found in this
project and exactly how each one was confirmed and fixed — moved out of
README.md so the README can be a normal product front door instead of a
running debug log. Kept here in full because it's genuine evidence of how
thoroughly this wrapper has actually been checked, which is worth more than
a plain "v2.0.0 - bug fixes" changelog entry would be.

---

## Feature parity pass: rewind, theming, defaultOptions

Not a bug fix - a deliberate feature addition, noted here because of how
it came about. When asked to make ROM Player by Coops "run on" this
wrapper, reading ROM Player's actual live `index.html` (`launch()`
function) showed its own hand-rolled EmulatorJS integration was *already
more advanced* than this wrapper: it already had `EJS_gameName` and
`EJS_startOnLoaded` (which this wrapper had separately arrived at via its
own bug-fixing), but also things this wrapper didn't have at all —
per-system rewind buffer/granularity tuning, `EJS_color`/
`EJS_backgroundColor` theming, and `EJS_defaultOptions` passthrough for raw
libretro core options.

Swapping ROM Player onto this wrapper as originally asked would have been
a regression for a live app with paying subscribers, for no real benefit.
The useful direction was the reverse: port ROM Player's proven, live,
production-tested config into the wrapper (`src/rewind-profiles.js`,
plus new `loadGame()` options), so *future* projects built on this wrapper
get that tuning for free. ROM Player's own `index.html` was never touched.

---

## Update: fixed the "games don't load at all" report

After the write-up below was already in place, a real test against the
actual reported symptom ("hardly works at all, doesn't load games") turned
up two more concrete bugs, now fixed with regression tests in
`test/emulator-engine.test.mjs`:

4. **`EJS_gameUrl` was being set directly to the raw `File` object** from a
   file `<input>`. Confirmed against a working reference implementation
   (the `react-emulatorjs` wrapper's own documented example converts via
   `URL.createObjectURL(file)` first, not a raw File) that this is the
   reliable, version-independent way to hand EmulatorJS a local file —
   EmulatorJS's changelog does mention raw File support being added at some
   point, but that's not something this wrapper can assume every pinned CDN
   version has. Fixed in `EmulatorEngine._toUrl()`.
5. **PSP never got `EJS_threads = true` set.** Confirmed against
   EmulatorJS's own official PSP docs example
   (`emulatorjs.org/docs/systems/psp/`) that this flag is required
   explicitly — it is *not* inferred automatically just because
   `crossOriginIsolated` is true. This wrapper never set it at all before
   this fix, so PSP could stall waiting on an opt-in prompt that never got
   shown.

If you pulled this repo before both of these were fixed, that's almost
certainly why nothing loaded — pull again.

## Update 2: fixed "boots fine but shows a black screen and never plays"

A live console/network log from a real test (Chrome devtools, screenshots
of the actual run) showed something better than "broken": every request
succeeded (`loader.js`, `emulator.min.js`, the core itself, all `200`), and
`EJS_ready` genuinely fired — confirmed by the status text only appearing
after `loadGame()` resolves. So the loading bugs above were real fixes. But
the game never actually started, staying on a black canvas. Two more gaps,
found by comparing against EmulatorJS's own official demo source line by
line rather than guessing:

6. **`EJS_gameName`/`EJS_gameID` were never set**, causing a console warning
   (`gameId (EJS_gameID) is not set`). Root cause: a blob: URL (what
   `_toUrl()` produces for a File/Blob rom) carries no filename of its own.
   EmulatorJS's own demo sets `EJS_gameName` alongside `EJS_gameUrl`
   specifically for this reason. Fixed via `EmulatorEngine._deriveGameName()`,
   which pulls the real name from `File.name` or the URL's last path segment.
7. **The actual cause of the black screen: `EJS_startOnLoaded` was never
   set.** Confirmed EmulatorJS's own demo sets `EJS_startOnLoaded = true`
   explicitly. Without it, EmulatorJS finishes booting and then waits rather
   than auto-starting — which matches "loads successfully, shows nothing"
   exactly. Now defaults to `true`; pass `{ startOnLoaded: false }` to
   `loadGame()` if you want EmulatorJS's own manual start UI instead.

Also fixed in this pass: the example page no longer requires clicking a
system chip before choosing a ROM — it auto-detects and boots immediately
when a file extension unambiguously matches one system.

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
