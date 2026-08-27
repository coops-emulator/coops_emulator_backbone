import { test, describe, assertEquals, assertTrue, assertThrows } from "./harness.mjs";
import {
  CORE_REGISTRY,
  getSystemConfig,
  detectSystemsByExtension,
  systemsRequiringThreads,
} from "../src/core-registry.js";

describe("core-registry", () => {
  test("every entry has the required fields", () => {
    for (const [id, cfg] of Object.entries(CORE_REGISTRY)) {
      assertTrue(typeof cfg.label === "string" && cfg.label.length > 0, `${id}.label`);
      assertTrue(typeof cfg.system === "string" && cfg.system.length > 0, `${id}.system`);
      assertTrue(Array.isArray(cfg.cores) && cfg.cores.length > 0, `${id}.cores`);
      assertTrue(Array.isArray(cfg.extensions) && cfg.extensions.length > 0, `${id}.extensions`);
      assertTrue(typeof cfg.verified === "boolean", `${id}.verified`);
    }
  });

  test("getSystemConfig returns the registry entry for a known id", () => {
    assertEquals(getSystemConfig("nes").system, "nes");
    assertEquals(getSystemConfig("segaCD").system, "segaCD");
  });

  test("getSystemConfig throws a descriptive error for an unknown id", () => {
    assertThrows(() => getSystemConfig("dreamcast"), /Unknown system id "dreamcast"/);
  });

  test("detectSystemsByExtension finds an unambiguous match", () => {
    assertEquals(detectSystemsByExtension("Super Mario World.sfc"), ["snes"]);
    assertEquals(detectSystemsByExtension("game.gba"), ["gba"]);
  });

  test("detectSystemsByExtension returns every match for an ambiguous extension", () => {
    const matches = detectSystemsByExtension("disc.cue");
    assertTrue(matches.includes("segaCD"), "should include segaCD");
    assertTrue(matches.includes("saturn"), "should include saturn");
    assertTrue(matches.includes("psx"), "should include psx");
    assertTrue(matches.includes("pcEngine"), "should include pcEngine");
    assertTrue(matches.includes("threeDo"), "should include threeDo");
  });

  test("detectSystemsByExtension returns an empty array for an unrecognized extension", () => {
    assertEquals(detectSystemsByExtension("readme.txt"), []);
  });

  test("detectSystemsByExtension is case-insensitive", () => {
    assertEquals(detectSystemsByExtension("GAME.SFC"), ["snes"]);
  });

  test("detectSystemsByExtension handles filenames with no extension", () => {
    assertEquals(detectSystemsByExtension("noextension"), []);
  });

  test("systemsRequiringThreads includes psp and only psp", () => {
    const threaded = systemsRequiringThreads();
    assertTrue(threaded.includes("psp"), "psp should require threads");
    for (const id of threaded) {
      assertTrue(CORE_REGISTRY[id].requiresThreads === true, `${id} flagged but requiresThreads isn't true`);
    }
  });

  test("neogeo and arcade both resolve to the fbneo/arcade system and are confirmed verified", () => {
    assertEquals(CORE_REGISTRY.neogeo.system, "arcade");
    assertEquals(CORE_REGISTRY.arcade.system, "arcade");
    assertEquals(CORE_REGISTRY.neogeo.verified, true);
    assertEquals(CORE_REGISTRY.arcade.verified, true);
  });

  test("no registry entry remains unverified as of the 2026-08-12 live re-check", () => {
    const unverified = Object.entries(CORE_REGISTRY).filter(([, cfg]) => !cfg.verified);
    assertEquals(unverified.map(([id]) => id), []);
  });

  test("msx is not present in the registry (removed as unverifiable per README)", () => {
    assertTrue(!("msx" in CORE_REGISTRY), "msx should not be a registry key");
  });
});
