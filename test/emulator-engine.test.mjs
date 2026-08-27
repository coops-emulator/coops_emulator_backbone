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

  test("the crossOriginIsolated error recommends credentialless, not require-corp", async () => {
    // Regression test: an earlier version of this message (and every config
    // in deploy/) recommended require-corp, which silently breaks fetches
    // to cdn.emulatorjs.org in production (see deploy/README.md "Why
    // credentialless, not require-corp"). Locking this in so it can't
    // quietly drift back.
    globalThis.crossOriginIsolated = false;
    const engine = new EmulatorEngine(freshContainer());
    try {
      await engine.loadGame("psp", "game.iso");
      throw new Error("expected loadGame to reject");
    } catch (err) {
      assertTrue(err.message.includes("credentialless"), "error message should mention credentialless");
      assertTrue(!err.message.includes("require-corp"), "error message should NOT recommend require-corp");
    } finally {
      delete globalThis.crossOriginIsolated;
    }
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

  test("recommended pattern: getPathToData(systemId) passed as pathToData actually reaches EJS_pathtodata", async () => {
    // Integration test, not just a unit test on cdn-channels.js in
    // isolation - this proves the two pieces actually wire together the
    // way the docs/README tell consumers to use them, using the exact
    // pattern ROM Player by Coops uses in production.
    resetDomMocks();
    installDomMocks();
    const { getPathToData } = await import("../src/cdn-channels.js");

    const pspContainer = freshContainer("psp-player");
    const pspEngine = new EmulatorEngine(pspContainer, { pathToData: getPathToData("psp") });
    assertEquals(pspEngine.pathToData, "https://cdn.emulatorjs.org/nightly/data/");
    const p1 = pspEngine.loadGame("psp", "game.iso");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p1;
    assertEquals(globalThis.EJS_pathtodata, "https://cdn.emulatorjs.org/nightly/data/");

    resetDomMocks();
    installDomMocks();
    const nesContainer = freshContainer("nes-player");
    const nesEngine = new EmulatorEngine(nesContainer, { pathToData: getPathToData("nes") });
    assertEquals(nesEngine.pathToData, DEFAULT_CDN_PATH);
    const p2 = nesEngine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p2;
    assertEquals(globalThis.EJS_pathtodata, DEFAULT_CDN_PATH);
  });

  test("opts.core overrides the registry's default system core selection", async () => {
    const container = freshContainer();
    const engine = new EmulatorEngine(container);
    const p = engine.loadGame("nes", "mario.nes", { core: "fceumm" });
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_core, "fceumm");
  });

  test("rejects when a required BIOS wasn't provided, naming the actual required file", async () => {
    const engine = new EmulatorEngine(freshContainer());
    await assertRejects(engine.loadGame("segaCD", "game.cue"), /BIOS/);
    await assertRejects(engine.loadGame("segaCD", "game.cue"), /bios_CD_U\.bin/);
  });

  // Regression test for the real bug a user hit: games not loading at all.
  // Root cause was EJS_gameUrl being set to a raw File object instead of a
  // real URL. Fixed via URL.createObjectURL() in EmulatorEngine._toUrl().
  test("converts a File/Blob rom into a real object URL, not the raw object itself", async () => {
    resetDomMocks();
    const { createdObjectUrls } = installDomMocks();
    const container = freshContainer();
    const engine = new EmulatorEngine(container);
    const fakeFile = new Blob(["fake rom bytes"]);
    const p = engine.loadGame("nes", fakeFile);
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertTrue(typeof globalThis.EJS_gameUrl === "string", "EJS_gameUrl must end up as a string URL");
    assertEquals(globalThis.EJS_gameUrl, createdObjectUrls[0]);
    resetDomMocks();
    installDomMocks();
  });

  test("throws a clear error if rom is neither a string nor a File/Blob", async () => {
    const engine = new EmulatorEngine(freshContainer());
    await assertRejects(engine.loadGame("nes", { not: "valid" }), /URL string, File, or Blob/);
  });

  // Regression test for a second real bug found the same session: PSP
  // silently never got EJS_threads set, which EmulatorJS's own docs
  // (emulatorjs.org/docs/systems/psp/) show as required.
  test("sets EJS_threads=true for PSP, matching EmulatorJS's own documented PSP example", async () => {
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("psp", "game.iso");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_threads, true);
  });

  test("does not set EJS_threads for a system that doesn't need it", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "mario.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_threads, undefined);
  });

  // Regression test for a third real gap found from a live console log: a
  // blob: URL (what File/Blob roms become via _toUrl) carries no filename,
  // so without this, EmulatorJS logged "gameId (EJS_gameID) is not set."
  // Fix matches EmulatorJS's own official demo pattern of setting
  // EJS_gameName alongside EJS_gameUrl.
  test("derives EJS_gameName/EJS_gameID from a File's real filename", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    const fakeFile = new File(["fake rom bytes"], "Super Mario Bros.nes");
    const p = engine.loadGame("nes", fakeFile);
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_gameName, "Super Mario Bros.nes");
    assertEquals(globalThis.EJS_gameID, "Super Mario Bros.nes");
  });

  test("derives EJS_gameName from the last path segment of a URL string rom", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "https://example.com/roms/Zelda.nes");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_gameName, "Zelda.nes");
  });

  test("opts.gameName overrides the derived name when provided explicitly", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("nes", "mario.nes", { gameName: "Custom Name" });
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_gameName, "Custom Name");
  });

  // Regression test for a real "boots successfully but shows a black
  // screen and never actually plays" report - confirmed root cause was a
  // missing EJS_startOnLoaded, verified against EmulatorJS's own official
  // demo source which sets it explicitly.
  test("sets EJS_startOnLoaded=true by default, matching EmulatorJS's own official demo", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("snes", "zelda.sfc");
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_startOnLoaded, true);
  });

  test("opts.startOnLoaded lets a caller opt back out to a manual start UI", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    const p = engine.loadGame("snes", "zelda.sfc", { startOnLoaded: false });
    queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
    await p;
    assertEquals(globalThis.EJS_startOnLoaded, false);
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
