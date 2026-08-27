import { CORE_REGISTRY, getSystemConfig, detectSystemsByExtension, systemsRequiringThreads } from "./core-registry.js";
import { getRewindProfile } from "./rewind-profiles.js";

/**
 * emulator-engine.js
 * ---------------------------------------------------------------------------
 * REWRITTEN FROM THE ORIGINAL VERSION OF THIS ENGINE.
 *
 * What was wrong with the original, found by checking it against the real,
 * live EmulatorJS CDN and documentation rather than trusting its own
 * comments:
 *   1. fetch-cores.js downloaded from a GitHub `raw.githubusercontent.com`
 *      path that isn't where EmulatorJS actually publishes core builds -
 *      confirmed 404 by checking the real listing at
 *      https://cdn.emulatorjs.org/stable/data/cores/.
 *   2. core-loader.js assumed each core ships as a `<core>.js` + `<core>.wasm`
 *      pair with a guessable global Module factory. The real format is a
 *      single bundled `<core>-wasm.data` file, loaded through EmulatorJS's
 *      OWN loader.js/emulator.js - not a generic Emscripten script tag.
 *   3. Save states used synthetic RetroArch hotkey keypresses (F2/F4) as a
 *      proxy for a real API. There IS a real, documented API:
 *      `EJS_emulator.gameManager.getState()` / `.loadState(bytes)`. *   4. PSP's only available build (`ppsspp-thread-wasm.data`) requires
 *      SharedArrayBuffer, which requires COOP/COEP response headers on
 *      whatever serves this page - the original never surfaced this.
 *   5. (Found after a user reported games not loading at all) EJS_gameUrl
 *      was being set directly to a raw File object from a <input type=file>.
 *      Confirmed via a working reference implementation (react-emulatorjs's
 *      own documented example) that the reliable, version-independent way
 *      to hand EmulatorJS a local file is `URL.createObjectURL(file)` -
 *      EmulatorJS's changelog mentions raw File support was added at some
 *      point, but that's not something this wrapper can assume the pinned
 *      CDN version has. Fixed in `_toUrl()` below.
 *   6. (Found the same session) PSP needs `EJS_threads = true` set
 *      explicitly - confirmed against EmulatorJS's own official PSP docs
 *      example at emulatorjs.org/docs/systems/psp/. It is NOT inferred
 *      automatically from crossOriginIsolated being true. This wrapper
 *      never set it at all before this fix.
 *   7. (Found from a live console/network log showing a successful boot but
 *      a black, never-playing screen) EJS_gameName/EJS_gameID were never
 *      set, matching a "gameId is not set" console warning - blob: URLs
 *      carry no filename, and EmulatorJS's own demo sets EJS_gameName
 *      alongside EJS_gameUrl for exactly that reason. Fixed via
 *      `_deriveGameName()`.
 *   8. (Same log) The actual cause of the black screen: EJS_startOnLoaded
 *      was never set. EmulatorJS's own official demo sets it explicitly;
 *      without it, EmulatorJS finishes booting and waits rather than
 *      auto-starting. Now defaults to true.
 *
 * This version doesn't reimplement any of that. It configures the real
 * `EJS_*` globals EmulatorJS's own loader.js reads, injects that real
 * loader.js from a real CDN path (or a self-hosted mirror of the same
 * files - see README "Self-hosting" section for exactly what to mirror),
 * and wraps the real, documented lifecycle hooks and save-state API.
 *
 * Honest limitation, stated plainly: EmulatorJS is designed to be
 * configured once and booted via a single loader.js include per page load.
 * This engine mirrors that - `loadGame()` is meant to be called once per
 * page. Swapping to a different ROM mid-session isn't something I could
 * find a documented, reliable public API for, so this doesn't claim to
 * support it; reload the page (or re-render the container in a framework
 * that remounts it) to load a different game.
 */

export const DEFAULT_CDN_PATH = "https://cdn.emulatorjs.org/stable/data/";

export class EmulatorEngine {
  /**
   * @param {HTMLElement} container - an empty element EmulatorJS will fill
   *   with its own canvas, controls, and virtual gamepad. NOT a <canvas> -
   *   EmulatorJS creates its own canvas internally; handing it a canvas
   *   directly isn't part of its documented contract.
   * @param {object} [opts]
   * @param {string} [opts.pathToData] - defaults to the real public CDN.
   *   Point this at a local `/data/` folder instead for self-hosting - see
   *   README for exactly which files that folder needs to contain.
   */
  constructor(container, opts = {}) {
    if (!container || container.nodeType !== 1) {
      throw new Error("EmulatorEngine requires a container DOM element (a <div>, not a <canvas>).");
    }
    this.container = container;
    this.pathToData = opts.pathToData || DEFAULT_CDN_PATH;
    this.systemId = null;
    this._booted = false;
    this._loaderInjected = false;
    this._objectUrls = [];

    if (!this.container.id) {
      this.container.id = `emu-forge-player-${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  static listSystems() {
    return Object.entries(CORE_REGISTRY).map(([id, cfg]) => ({ id, label: cfg.label, verified: cfg.verified }));
  }

  static detectSystem(filename) {
    return detectSystemsByExtension(filename);
  }

  /**
   * Boots EmulatorJS's real loader against a ROM. `rom` can be a URL string,
   * a Blob, or a File - EmulatorJS supports all three for EJS_gameUrl.
   *
   * @param {string} systemId - a key from core-registry.js (e.g. "nes")
   * @param {string|Blob|File} rom
   * @param {object} [opts]
   * @param {string|Blob|File} [opts.biosUrl] - required if cfg.bios.required is true
   * @param {string} [opts.core] - force a specific core from cfg.cores instead of EmulatorJS's default pick
   * @param {number} [opts.timeoutMs=45000] - how long to wait for EJS_ready before rejecting.
   * @param {string} [opts.gameName] - overrides the auto-derived EJS_gameName/EJS_gameID.
   * @param {boolean} [opts.startOnLoaded=true] - auto-start vs EmulatorJS's own manual start UI.
   * @param {string} [opts.color] - EJS_color, EmulatorJS's accent color theming.
   * @param {string} [opts.backgroundColor] - EJS_backgroundColor.
   * @param {boolean|object} [opts.rewind=true] - true for the built-in per-system profile
   *   (see rewind-profiles.js, ported from ROM Player by Coops's own production tuning -
   *   note PSP's built-in profile disables rewind entirely; see that file's comment),
   *   false to disable, or `{ bufferSize, granularity }` to override.
   * @param {object} [opts.defaultOptions] - merged into EJS_defaultOptions (raw libretro
   *   retroarch cfg keys a core reads on startup) - use this for anything not covered
   *   by a dedicated option above.
   */
  async loadGame(systemId, rom, opts = {}) {
    if (this._booted) {
      throw new Error(
        "loadGame() was already called once on this EmulatorEngine instance. " +
        "EmulatorJS boots via a single loader.js include per page load - see " +
        "this file's header comment. Create a fresh container + EmulatorEngine " +
        "(or reload the page) to load a different game."
      );
    }
    if (rom == null) {
      throw new Error("loadGame() needs a rom argument (a URL string, File, or Blob).");
    }

    const cfg = getSystemConfig(systemId);

    if (cfg.requiresThreads && typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
      throw new Error(
        `${cfg.label} requires SharedArrayBuffer, which requires this page to be served with ` +
        `Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: credentialless ` +
        `response headers (this is a real browser security requirement, not an EmulatorJS quirk). ` +
        `"crossOriginIsolated" is currently false. See deploy/ for ready-made header configs, ` +
        `and README "Cross-origin isolation" for the full explanation.`
      );
    }

    if (cfg.bios?.required && !opts.biosUrl) {
      const files = cfg.bios.files || [cfg.bios.file];
      throw new Error(
        `${cfg.label} requires a BIOS file before it can boot (${files.join(" or ")}). ` +
        `Pass it as opts.biosUrl (a URL string, File, or Blob) to loadGame(). ` +
        `This is checked here, before touching EmulatorJS, so the failure is immediate ` +
        `and actionable instead of a silent black screen.`
      );
    }

    window.EJS_player = `#${this.container.id}`;
    window.EJS_core = opts.core || cfg.system;
    window.EJS_pathtodata = this.pathToData;
    window.EJS_gameUrl = this._toUrl(rom);
    if (opts.biosUrl) window.EJS_biosUrl = this._toUrl(opts.biosUrl);
    // Per EmulatorJS's own PSP docs example (emulatorjs.org/docs/systems/psp/),
    // EJS_threads must be explicitly set to true for threaded cores - it's
    // not inferred automatically just because crossOriginIsolated is true.
    if (cfg.requiresThreads) window.EJS_threads = true;

    // EmulatorJS's own official demo (github.com/EmulatorJS/demo) sets
    // EJS_gameName alongside EJS_gameUrl specifically because a blob: URL
    // (what _toUrl() produces for a File/Blob rom) carries no filename of
    // its own - without this, EmulatorJS falls back to a generic name for
    // save-state keys/localStorage, which is exactly the "gameId is not
    // set" console warning. EJS_gameID's exact required format isn't fully
    // documented beyond being listed under "Game Options" in
    // emulatorjs.org/docs/options/, so this sets it to the same derived
    // name as a reasonable, safe default.
    const gameName = opts.gameName || this._deriveGameName(rom);
    if (gameName) {
      window.EJS_gameName = gameName;
      window.EJS_gameID = gameName;
    }

    // Confirmed against EmulatorJS's own official demo source
    // (github.com/EmulatorJS/demo/blob/main/index.html), which sets this
    // explicitly. Without it, EmulatorJS finishes booting (EJS_ready fires,
    // the core is loaded) but sits idle rather than auto-starting the game -
    // this was the actual cause of a "everything loads but the screen stays
    // black" report, distinct from and after the loading bugs fixed above.
    window.EJS_startOnLoaded = opts.startOnLoaded ?? true;

    // Theming - both are plain EmulatorJS options, passed through as-is.
    if (opts.color) window.EJS_color = opts.color;
    if (opts.backgroundColor) window.EJS_backgroundColor = opts.backgroundColor;

    // Rewind - defaults to the built-in per-system profile (see
    // rewind-profiles.js) rather than EmulatorJS's own one-size-fits-all
    // default, because save-state size varies enormously by system (a PS1
    // state is MBs, an NES state is KBs) - ROM Player by Coops's own live
    // production tuning is what these profiles are ported from.
    if (opts.rewind !== false) {
      const profile =
        opts.rewind && typeof opts.rewind === "object"
          ? { ...getRewindProfile(systemId), ...opts.rewind }
          : getRewindProfile(systemId);

      if (profile.disabled) {
        // System-level override (see rewind-profiles.js, e.g. psp) - rewind
        // costs more than it's worth for this core. Set EJS_rewindEnabled
        // to false explicitly rather than just skipping the buffer-size/
        // granularity keys below, since these are plain globals this
        // wrapper writes to directly - leaving them untouched wouldn't
        // reliably mean "off" if anything upstream ever defaults them on.
        window.EJS_rewindEnabled = false;
        window.EJS_defaultOptions = Object.assign(window.EJS_defaultOptions || {}, {
          rewind_enable: "disabled",
        });
      } else {
        window.EJS_rewindEnabled = true;
        window.EJS_rewindGranularity = profile.granularity;
        window.EJS_defaultOptions = Object.assign(window.EJS_defaultOptions || {}, {
          rewind_enable: "enabled",
          rewind_buffer_size: String(profile.bufferSize),
          rewind_granularity: String(profile.granularity),
        });
      }
    }

    if (opts.defaultOptions) {
      window.EJS_defaultOptions = Object.assign(window.EJS_defaultOptions || {}, opts.defaultOptions);
    }

    this.systemId = systemId;

    const timeoutMs = opts.timeoutMs ?? 45000;
    const readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(
          `EJS_ready did not fire within ${timeoutMs}ms. Likely causes: the ROM/BIOS URL is ` +
          `unreachable, "${window.EJS_core}" isn't a real EmulatorJS system id for this pathToData ` +
          `version, or a CORS/network failure silently stalled the core download. Open devtools' ` +
          `Network tab and look for failed requests under pathToData for the actual cause.`
        ));
      }, timeoutMs);
      window.EJS_ready = () => { clearTimeout(timer); resolve(); };
    });

    if (!this._loaderInjected) {
      this._loaderInjected = true;
      await this._injectScript(`${this.pathToData}loader.js`);
    }

    await readyPromise;
    this._booted = true;
  }

  /**
   * Best-effort teardown. Stated honestly: EmulatorJS's real, documented
   * contract is "one loader.js per page load" (see this file's header
   * comment) - there is no public API confirmed to fully unwind a booted
   * instance. This removes what's safely removable (the container's
   * contents and this wrapper's own global hooks) so a container can be
   * hidden/unmounted without leaking obvious DOM, but does NOT claim the
   * underlying WASM instance/audio context are fully released - reloading
   * the page is still the only fully-clean way to load a second game.
   *
   * I deliberately do NOT call any EJS_emulator method here beyond what's
   * confirmed in this file's header comment (getState/loadState). I could
   * not verify a public "shut down cleanly" method exists, and calling an
   * unverified method name would be exactly the kind of unconfirmed claim
   * this rewrite exists to eliminate - so this only touches things this
   * wrapper itself owns: the DOM it was given and its own state flag.
   */
  destroy() {
    this.container.innerHTML = "";
    this._booted = false;
    for (const url of this._objectUrls) {
      try { URL.revokeObjectURL(url); } catch { /* best effort */ }
    }
    this._objectUrls = [];
  }

  /**
   * Normalizes a rom/bios argument into a real URL string EJS_gameUrl /
   * EJS_biosUrl can reliably fetch, regardless of which EmulatorJS version
   * is pinned. File/Blob support was added to EmulatorJS at some point per
   * its changelog, but I can't confirm every pathToData version has it -
   * converting to a real object URL via URL.createObjectURL() works on
   * every version, since it's just a URL by the time EmulatorJS sees it.
   * Object URLs created here are revoked in destroy().
   */
  _toUrl(rom) {
    if (typeof rom === "string") return rom;
    if (typeof Blob !== "undefined" && rom instanceof Blob) {
      const url = URL.createObjectURL(rom);
      this._objectUrls.push(url);
      return url;
    }
    throw new Error("rom/biosUrl must be a URL string, File, or Blob.");
  }

  /**
   * Derives a filename-based game name for EJS_gameName/EJS_gameID.
   * File objects carry a real `.name` (e.g. "Super Mario Bros.nes"); plain
   * Blobs and URL strings don't, so this falls back to the last path
   * segment of a URL, or null for a nameless Blob (EmulatorJS will use its
   * own generic fallback in that case - there's nothing more specific to
   * give it).
   */
  _deriveGameName(rom) {
    if (typeof File !== "undefined" && rom instanceof File) return rom.name;
    if (typeof rom === "string") {
      try {
        const path = rom.startsWith("blob:") ? rom : new URL(rom, typeof location !== "undefined" ? location.href : "http://x").pathname;
        const last = path.split("/").filter(Boolean).pop();
        return last ? decodeURIComponent(last) : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  _injectScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src} - check pathToData / network / CORS.`));
      document.head.appendChild(s);
    });
  }

  // ---- lifecycle hooks (wrap the real EJS_on* globals) ---------------------

  onGameStart(fn) { window.EJS_onGameStart = fn; }
  onSaveState(fn) { window.EJS_onSaveState = fn; }
  onLoadState(fn) { window.EJS_onLoadState = fn; }
  onExit(fn) { window.EJS_onExit = fn; }

  // ---- save states: the real EJS_emulator.gameManager API ------------------
  // NOTE: EJS_emulator.gameManager.getState() returns a Uint8Array
  // synchronously as of the version documented at the top of this file
  // (older EmulatorJS releases returned a Promise - if you're pinned to an
  // old version, await the return value defensively).

  /** @returns {Uint8Array} raw save-state bytes, for you to persist however you like. */
  getStateBytes() {
    this._assertBooted();
    return window.EJS_emulator.gameManager.getState();
  }

  /** @param {Uint8Array} bytes - previously returned by getStateBytes(). */
  loadStateBytes(bytes) {
    this._assertBooted();
    window.EJS_emulator.gameManager.loadState(bytes);
  }

  _assertBooted() {
    if (!this._booted || !window.EJS_emulator) {
      throw new Error("No game is booted yet - call loadGame() and await it first.");
    }
  }

  // ---- convenience passthroughs to real EJS_emulator methods --------------

  pause() { this._assertBooted(); window.EJS_emulator.pause?.(); }
  play() { this._assertBooted(); window.EJS_emulator.play?.(); }
  requestFullscreen() { this._assertBooted(); window.EJS_emulator.fullscreen?.(); }
}

export { CORE_REGISTRY, getSystemConfig, detectSystemsByExtension, systemsRequiringThreads };
