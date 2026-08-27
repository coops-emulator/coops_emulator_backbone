import { test, describe, assertEquals, assertTrue } from "./harness.mjs";
import { installDomMocks, resetDomMocks, makeElement } from "./dom-mock.mjs";
import { REWIND_PROFILES, getRewindProfile } from "../src/rewind-profiles.js";

installDomMocks();
const { EmulatorEngine } = await import("../src/emulator-engine.js");

function freshContainer() {
  return makeElement("div");
}

async function boot(engine, systemId, rom, opts) {
  const p = engine.loadGame(systemId, rom, opts);
  queueMicrotask(() => globalThis.EJS_ready && globalThis.EJS_ready());
  await p;
}

describe("rewind-profiles.js", () => {
  test("getRewindProfile returns a system-specific profile when one exists", () => {
    const profile = getRewindProfile("psx");
    assertEquals(profile.bufferSize, 512);
    assertEquals(profile.granularity, 4);
  });

  test("getRewindProfile falls back to the default profile for an unlisted system", () => {
    const profile = getRewindProfile("some-future-system");
    assertEquals(profile, REWIND_PROFILES.default);
  });

  test("every profile has either both required numeric fields, or is explicitly disabled", () => {
    for (const [id, profile] of Object.entries(REWIND_PROFILES)) {
      if (profile.disabled) {
        assertEquals(profile.disabled, true, `${id}.disabled`);
        continue;
      }
      assertTrue(typeof profile.bufferSize === "number", `${id}.bufferSize`);
      assertTrue(typeof profile.granularity === "number", `${id}.granularity`);
    }
  });

  test("psp's built-in profile disables rewind entirely", () => {
    const profile = getRewindProfile("psp");
    assertEquals(profile.disabled, true);
  });
});

describe("EmulatorEngine theming options", () => {
  test("sets EJS_color and EJS_backgroundColor when provided", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "nes", "mario.nes", { color: "#7c6af7", backgroundColor: "#000000" });
    assertEquals(globalThis.EJS_color, "#7c6af7");
    assertEquals(globalThis.EJS_backgroundColor, "#000000");
  });

  test("leaves EJS_color/EJS_backgroundColor unset when not provided", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "nes", "mario.nes");
    assertEquals(globalThis.EJS_color, undefined);
    assertEquals(globalThis.EJS_backgroundColor, undefined);
  });
});

describe("EmulatorEngine rewind options", () => {
  test("enables rewind with the correct per-system profile by default", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "psx", "game.cue", { biosUrl: "bios.bin" });
    assertEquals(globalThis.EJS_rewindEnabled, true);
    assertEquals(globalThis.EJS_rewindGranularity, 4);
    assertEquals(globalThis.EJS_defaultOptions.rewind_buffer_size, "512");
    assertEquals(globalThis.EJS_defaultOptions.rewind_granularity, "4");
  });

  test("uses the default profile for a system with no specific tuning", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "atari2600", "game.a26");
    assertEquals(globalThis.EJS_rewindGranularity, REWIND_PROFILES.default.granularity);
  });

  test("opts.rewind === false disables rewind entirely", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "nes", "mario.nes", { rewind: false });
    assertEquals(globalThis.EJS_rewindEnabled, undefined);
    assertEquals(globalThis.EJS_defaultOptions?.rewind_enable, undefined);
  });

  test("opts.rewind as an object overrides specific fields of the built-in profile", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "nes", "mario.nes", { rewind: { bufferSize: 999 } });
    // granularity should still come from the nes profile (1) since only bufferSize was overridden
    assertEquals(globalThis.EJS_rewindGranularity, 1);
    assertEquals(globalThis.EJS_defaultOptions.rewind_buffer_size, "999");
  });

  test("psp's built-in disabled profile actually turns rewind off when booted", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "psp", "game.iso");
    assertEquals(globalThis.EJS_rewindEnabled, false);
    assertEquals(globalThis.EJS_defaultOptions.rewind_enable, "disabled");
    // and it must not also carry stale buffer/granularity keys from some
    // other system's boot on the same page
    assertEquals(globalThis.EJS_defaultOptions.rewind_buffer_size, undefined);
  });

  test("an explicit opts.rewind object can still force rewind back on for psp", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "psp", "game.iso", { rewind: { disabled: false, bufferSize: 64, granularity: 6 } });
    assertEquals(globalThis.EJS_rewindEnabled, true);
    assertEquals(globalThis.EJS_defaultOptions.rewind_enable, "enabled");
    assertEquals(globalThis.EJS_defaultOptions.rewind_buffer_size, "64");
  });
});

describe("EmulatorEngine.defaultOptions passthrough", () => {
  test("merges opts.defaultOptions into EJS_defaultOptions alongside rewind keys", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "nes", "mario.nes", { defaultOptions: { "some_core_option": "value" } });
    assertEquals(globalThis.EJS_defaultOptions.some_core_option, "value");
    assertEquals(globalThis.EJS_defaultOptions.rewind_enable, "enabled"); // rewind defaults still applied too
  });

  test("defaultOptions works even with rewind disabled", async () => {
    resetDomMocks();
    installDomMocks();
    const engine = new EmulatorEngine(freshContainer());
    await boot(engine, "nes", "mario.nes", { rewind: false, defaultOptions: { foo: "bar" } });
    assertEquals(globalThis.EJS_defaultOptions.foo, "bar");
    assertEquals(globalThis.EJS_defaultOptions.rewind_enable, undefined);
  });
});
