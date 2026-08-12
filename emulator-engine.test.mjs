import { test, describe, assertEquals, assertTrue, assertThrows, assertRejects } from "./harness.mjs";
import { installDomMocks, resetDomMocks, makeElement } from "./dom-mock.mjs";

installDomMocks();
const { EmulatorEngine, DEFAULT_CDN_PATH } = await import("../src/emulator-engine.js");

function freshContainer(id) {
  const el = makeElement("div");
  el.id = id || "";
  return el;
}

describe("EmulatorEngine constructor", () => {
  test("throws if given no container", () => {
    assertThrows(() => new EmulatorEngine(null), /requires a container DOM element/);
  });

  test("throws if given a non-element (e.g. a plain object standing in for a canvas)", () => {
    assertThrows(() => new EmulatorEngine({ nodeType: undefined }), /requires a container DOM element/);
  });

  test("accepts a valid element and defaults pathToData to the real public CDN", () => {
    const engine = new EmulatorEngine(freshContainer());
    assertEquals(engine.pathToData, DEFAULT_CDN_PATH);
  });

  test("assigns a generated id to a container with no id", () => {
    const c = freshContainer();
    new EmulatorEngine(c);
    assertTrue(c.id.startsWith("emu-forge-player-"), `unexpected id: ${c.id}`);
  });

  test("preserves an existing container id", () => {
    const c = freshContainer("my-game-div");
    new EmulatorEngine(c);
    assertEquals(c.id, "my-game-div");
  });

  test("respects a custom pathToData option", () => {
    const engine = new EmulatorEngine(freshContainer(), { pathToData: "/data/" });
    assertEquals(engine.pathToData, "/data/");
  });
});

describe("EmulatorEngine.listSystems / detectSystem", () => {
  test("listSystems returns id/label/verified for every registry entry", () => {
    const list = EmulatorEngine.listSystems();
    assertTrue(list.length > 20, "expected a substantial system list");
    const nes = list.find((s) => s.id === "nes");
    assertEquals(nes.label, "NES");
    assertEquals(nes.verified, true);
  });

  test("detectSystem delegates to the registry's extension detection", () => {
    assertEquals(EmulatorEngine.detectSystem("game.gba"), ["gba"]);
  });
});

describe("EmulatorEngine.loadGame guards", () => {
  test("rejects an unknown system id before touching the network", async () => {
    const engine = new EmulatorEngine(freshContainer());
    await assertRejects(engine.loadGame("dreamcast", "game.rom"), /Unknown system id/);
  });

  test("rejects PSP when crossOriginIsolated is explicitly false", async () => {
    globalThis.crossOriginIsolated = false;
    const engine = new EmulatorEngine(freshContainer());
    await assertRejects(engine.loadGame("psp", "game.iso"), /Cross-Origin-Opener-Policy/);
    delete globalThis.crossOriginIsolated;
  });

  test("does not block PSP when crossOriginIsolated is undefined (unknown, not known-false)", async () => {
    // In this mock, crossOriginIsolated is undefined by default - the guard
    // only fires when the value is known to be false, matching real
    // browsers that always define this global (true or false), so an
    // "undefined" case only happens in non-browser test environments.
    const engine = new EmulatorEngine(freshContainer());
    globalThis.EJS_ready = undefined;
    const promise = engine.loadGame("psp", "game.iso");
    // Manually resolve the simulated EJS_ready callback the mock's script
    // load doesn't know to call, since real EmulatorJS - not this mock -
    // is what would normally call it.
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await promise;
    assertEquals(engine.systemId, "psp");
  });

  test("second loadGame() call on the same instance throws (single boot per page load)", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const p1 = engine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p1;
    await assertRejects(engine.loadGame("snes", "other.sfc"), /already called once/i);
  });

  test("loadGame sets the documented EJS_* globals", async () => {
    resetDomMocks();
    installDomMocks();
    const container = freshContainer("test-player");
    const engine = new EmulatorEngine(container);
    const p = engine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_player, "#test-player");
    assertEquals(globalThis.EJS_core, "nes");
    assertEquals(globalThis.EJS_gameUrl, "mario.nes");
    assertEquals(globalThis.EJS_pathtodata, DEFAULT_CDN_PATH);
  });

  test("loadGame defaults EJS_startOnLoaded to true - EmulatorJS's own default is false, which silently waits at a Start Game screen forever (see README/emulator-engine.js comment)", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_startOnLoaded, true);
  });

  test("opts.startOnLoaded: false restores EmulatorJS's own click-to-start default", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "mario.nes", { startOnLoaded: false });
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_startOnLoaded, false);
  });

  test("opts.core overrides the registry's default system core selection", async () => {
    const container = freshContainer();
    const engine = new EmulatorEngine(container);
    const p = engine.loadGame("nes", "mario.nes", { core: "fceumm" });
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_core, "fceumm");
  });
});

describe("EmulatorEngine.loadGame File/Blob handling", () => {
  // Regression coverage for a real bug: EJS_gameUrl was previously assigned
  // the raw File/Blob object directly. EmulatorJS's own TypeScript
  // declarations and reference demo type EJS_gameUrl as `string` - passing
  // an object silently breaks the boot sequence (loader.js never throws,
  // it just never fetches a core). Confirmed via live EmulatorJS sources,
  // not assumed - see emulator-engine.js's comment at the fix site.

  test("a File/Blob rom is converted to a blob: URL string, not passed through as an object", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const file = new File(["fake rom bytes"], "mario.nes", { type: "application/octet-stream" });
    const p = engine.loadGame("nes", file);
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;

    assertTrue(typeof globalThis.EJS_gameUrl === "string", `EJS_gameUrl should be a string, got ${typeof globalThis.EJS_gameUrl}`);
    assertTrue(globalThis.EJS_gameUrl.startsWith("blob:"), `expected a blob: URL, got "${globalThis.EJS_gameUrl}"`);
  });

  test("a File's name is preserved as EJS_gameName so save states aren't named after a random blob id", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const file = new File(["fake rom bytes"], "Mortal Kombat (World).md");
    const p = engine.loadGame("genesis", file);
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;

    assertEquals(globalThis.EJS_gameName, "Mortal Kombat (World).md");
  });

  test("a plain string rom (URL) still passes through unchanged - not everyone loads local files", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "https://example.com/mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;

    assertEquals(globalThis.EJS_gameUrl, "https://example.com/mario.nes");
  });

  test("destroy() revokes the created object URL instead of leaking it", async () => {
    const revoked = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => revoked.push(url);
    try {
      const engine = new EmulatorEngine(freshContainer());
      const file = new File(["fake rom bytes"], "mario.nes");
      const p = engine.loadGame("nes", file);
      queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
      await p;
      const createdUrl = globalThis.EJS_gameUrl;

      engine.destroy();

      assertEquals(revoked, [createdUrl]);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });
});

describe("EmulatorEngine state-dependent methods before boot", () => {
  test("getStateBytes throws before loadGame has resolved", () => {
    const engine = new EmulatorEngine(freshContainer());
    assertThrows(() => engine.getStateBytes(), /No game is booted yet/);
  });

  test("loadStateBytes throws before loadGame has resolved", () => {
    const engine = new EmulatorEngine(freshContainer());
    assertThrows(() => engine.loadStateBytes(new Uint8Array()), /No game is booted yet/);
  });

  test("pause/play/requestFullscreen all throw before loadGame has resolved", () => {
    const engine = new EmulatorEngine(freshContainer());
    assertThrows(() => engine.pause(), /No game is booted yet/);
    assertThrows(() => engine.play(), /No game is booted yet/);
    assertThrows(() => engine.requestFullscreen(), /No game is booted yet/);
  });
});

describe("EmulatorEngine save state API after boot", () => {
  test("getStateBytes/loadStateBytes call the real documented gameManager API", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;

    let gotBytes = null;
    globalThis.EJS_emulator = {
      gameManager: {
        getState: () => new Uint8Array([1, 2, 3]),
        loadState: (bytes) => { gotBytes = bytes; },
      },
    };

    const state = engine.getStateBytes();
    assertEquals(Array.from(state), [1, 2, 3]);

    engine.loadStateBytes(state);
    assertEquals(Array.from(gotBytes), [1, 2, 3]);
  });
});

describe("EmulatorEngine.destroy()", () => {
  test("removes the injected loader script and clears the container, without throwing", async () => {
    const container = freshContainer();
    const engine = new EmulatorEngine(container);
    const p = engine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;

    container.innerHTML = "<canvas></canvas>"; // simulate EmulatorJS having filled the container
    engine.destroy();

    assertEquals(container.innerHTML, "");
  });

  test("is safe to call even if loadGame() was never called", () => {
    const engine = new EmulatorEngine(freshContainer());
    engine.destroy(); // should not throw
  });
});
