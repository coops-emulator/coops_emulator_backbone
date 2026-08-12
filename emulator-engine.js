import { CORE_REGISTRY, getSystemConfig, detectSystemsByExtension, systemsRequiringThreads } from "./core-registry.js";

export const DEFAULT_CDN_PATH = "https://cdn.emulatorjs.org/stable/data/";

export class EmulatorEngine {
  constructor(container, opts = {}) {
    if (!container || container.nodeType !== 1) {
      throw new Error("EmulatorEngine requires a container DOM element (a <div>, not a <canvas>).");
    }
    this.container = container;
    this.pathToData = opts.pathToData || DEFAULT_CDN_PATH;
    this.systemId = null;
    this._booted = false;
    this._loaderInjected = false;
    this._loaderScriptEl = null;

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

  async loadGame(systemId, rom, opts = {}) {
    if (this._booted) {
      throw new Error(
        "loadGame() was already called once on this EmulatorEngine instance. " +
        "EmulatorJS boots via a single loader.js include per page load - see " +
        "this file's header comment. Create a fresh container + EmulatorEngine " +
        "(or reload the page) to load a different game."
      );
    }

    const cfg = getSystemConfig(systemId);

    if (cfg.requiresThreads && typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
      throw new Error(
        `${cfg.label} requires SharedArrayBuffer, which requires this page to be served with ` +
        `Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp ` +
        `response headers (this is a real browser security requirement, not an EmulatorJS quirk). ` +
        `"crossOriginIsolated" is currently false. See README "Cross-origin isolation" section.`
      );
    }

    window.EJS_player = `#${this.container.id}`;
    window.EJS_core = opts.core || cfg.system;
    window.EJS_pathtodata = this.pathToData;

    // EJS_gameUrl must be a string (a URL, or a blob: URL) - confirmed
    // against EmulatorJS's own TypeScript declarations and reference demo
    // (both type it as `string`) plus community docs, which explicitly say
    // to convert a local File to a blob: URL first. A previous version of
    // this method assigned the raw File/Blob directly, which is the actual
    // reason games silently failed to boot: loader.js never throws on this,
    // it just never starts fetching a core, because EJS_gameUrl isn't the
    // string it expects.
    if (rom instanceof Blob) {
      if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = URL.createObjectURL(rom);
      window.EJS_gameUrl = this._objectUrl;
      // EmulatorJS names save states after EJS_gameUrl's path by default,
      // which is meaningless for a blob: URL - set the real filename so
      // save states aren't all named after a random blob id.
      if (rom.name) window.EJS_gameName = rom.name;
    } else {
      window.EJS_gameUrl = rom;
    }

    if (opts.biosUrl) window.EJS_biosUrl = opts.biosUrl;

    this.systemId = systemId;

    const readyPromise = new Promise((resolve) => {
      window.EJS_ready = () => resolve();
    });

    if (!this._loaderInjected) {
      this._loaderInjected = true;
      await this._injectScript(`${this.pathToData}loader.js`);
    }

    await readyPromise;
    this._booted = true;
  }

  _injectScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src} - check pathToData / network / CORS.`));
      document.head.appendChild(s);
      this._loaderScriptEl = s;
    });
  }

  onGameStart(fn) { window.EJS_onGameStart = fn; }
  onSaveState(fn) { window.EJS_onSaveState = fn; }
  onLoadState(fn) { window.EJS_onLoadState = fn; }
  onExit(fn) { window.EJS_onExit = fn; }

  getStateBytes() {
    this._assertBooted();
    return window.EJS_emulator.gameManager.getState();
  }

  loadStateBytes(bytes) {
    this._assertBooted();
    window.EJS_emulator.gameManager.loadState(bytes);
  }

  _assertBooted() {
    if (!this._booted || !window.EJS_emulator) {
      throw new Error("No game is booted yet - call loadGame() and await it first.");
    }
  }

  pause() { this._assertBooted(); window.EJS_emulator.pause?.(); }
  play() { this._assertBooted(); window.EJS_emulator.play?.(); }
  requestFullscreen() { this._assertBooted(); window.EJS_emulator.fullscreen?.(); }

  destroy() {
    if (this._loaderScriptEl?.parentNode) {
      this._loaderScriptEl.parentNode.removeChild(this._loaderScriptEl);
    }
    this._loaderScriptEl = null;
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = null;
    }
    this.container.innerHTML = "";
    this._booted = false;
    this._loaderInjected = false;
  }
}

export { CORE_REGISTRY, getSystemConfig, detectSystemsByExtension, systemsRequiringThreads };
