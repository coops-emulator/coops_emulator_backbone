// A deliberately tiny DOM/global mock. This does NOT simulate EmulatorJS or
// a real browser - it exists only to exercise EmulatorEngine's own guard
// logic (validation, error messages, single-boot enforcement) in Node,
// where there is no real `window`/`document`. Actually booting a game
// requires a real browser and the live EmulatorJS CDN - see README "What I
// could not verify from this environment".

export function makeElement(tag) {
  return {
    tagName: tag,
    nodeType: 1,
    id: "",
    parentNode: null,
    _innerHTML: "",
    set innerHTML(v) { this._innerHTML = v; },
    get innerHTML() { return this._innerHTML; },
    _src: null,
    onload: null,
    onerror: null,
    set src(v) {
      this._src = v;
      // Simulate an async script load on the next microtask so callers can
      // await loadGame() the same way they would in a real browser.
      queueMicrotask(() => this.onload && this.onload());
    },
    get src() { return this._src; },
  };
}

export function installDomMocks() {
  const appended = [];
  const head = {
    appendChild(el) {
      el.parentNode = head;
      appended.push(el);
      return el;
    },
    removeChild(el) {
      el.parentNode = null;
      const i = appended.indexOf(el);
      if (i >= 0) appended.splice(i, 1);
      return el;
    },
  };

  globalThis.document = {
    createElement: (tag) => makeElement(tag),
    head,
  };
  globalThis.window = globalThis;

  return { appended, head };
}

export function resetDomMocks() {
  delete globalThis.document;
  delete globalThis.crossOriginIsolated;
  // Clear any EJS_* globals a test may have set on window/globalThis.
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith("EJS_")) delete globalThis[key];
  }
}
