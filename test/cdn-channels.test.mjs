import { test, describe, assertEquals, assertTrue } from "./harness.mjs";

const { CDN_CHANNEL_OVERRIDES, getPathToData } = await import("../src/cdn-channels.js");

const STABLE = "https://cdn.emulatorjs.org/stable/data/";
const NIGHTLY = "https://cdn.emulatorjs.org/nightly/data/";

describe("cdn-channels.js", () => {
  test("getPathToData returns the verified nightly override for psp", () => {
    assertEquals(getPathToData("psp"), NIGHTLY);
  });

  test("getPathToData falls back to the stable CDN for every other known system", () => {
    for (const id of ["nes", "snes", "gba", "psx", "n64", "gambatte", "genesis"]) {
      assertEquals(getPathToData(id), STABLE, `${id} should stay on stable`);
    }
  });

  test("getPathToData falls back to stable for unknown/future system ids", () => {
    assertEquals(getPathToData("some-future-system"), STABLE);
    assertEquals(getPathToData(undefined), STABLE);
    assertEquals(getPathToData(""), STABLE);
  });

  test("psp's override is a different URL than the stable path (a no-op override would be pointless)", () => {
    assertTrue(getPathToData("psp") !== getPathToData("nes"));
  });

  test("every value in CDN_CHANNEL_OVERRIDES is a well-formed emulatorjs.org data URL", () => {
    for (const [id, url] of Object.entries(CDN_CHANNEL_OVERRIDES)) {
      assertTrue(url.startsWith("https://cdn.emulatorjs.org/"), `${id}: ${url} - wrong host`);
      assertTrue(url.endsWith("/data/"), `${id}: ${url} - should end in /data/`);
    }
  });

  test("CDN_CHANNEL_OVERRIDES only contains psp (documents scope, catches accidental additions)", () => {
    // Not a hard rule against ever adding more - but adding one should be
    // a deliberate, documented, verified decision (see file header
    // comment for what "verified" means here), not an accident. If this
    // test starts failing because you legitimately added a new override,
    // update this test alongside it and make sure the file header comment
    // documents the new entry with the same rigor as the psp one.
    assertEquals(Object.keys(CDN_CHANNEL_OVERRIDES), ["psp"]);
  });
});
