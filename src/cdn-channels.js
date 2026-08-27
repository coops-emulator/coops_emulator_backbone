// EmulatorJS CDN channel selection - verified per-system overrides.
//
// EmulatorJS publishes three CDN channels (https://emulatorjs.org/docs/cdn):
//   stable  - fully tested; what this library uses everywhere by default
//   latest  - newest wrapper code, but still-stable cores
//   nightly - newest wrapper code AND newest cores, rebuilt daily -
//             EmulatorJS's own docs call this out as potentially unstable
//             ("cores are not inter-changeable between versions... things
//             may break")
//
// PSP is the one documented exception where nightly is worth that risk.
// EmulatorJS's own changelog for the relevant nightly build says
// "Fix hardware rendering for PPSSPP core" and describes PPSSPP as
// "significantly more playable" as a direct result - see
// https://emulatorjs.org/docs/changelog/. That's not taken on faith here:
// ROM Player by Coops (the production app this library's tuning is
// ported from) shipped PSP-only on nightly and confirmed a real
// improvement on the actual live production site (2026-08-27) - reported
// as meaningfully better by a real user on real hardware, with only a
// minor residual audio crackle left over (a separate, smaller issue,
// not yet investigated - if you track that down, it's worth its own
// changelog entry rather than folding into this one).
//
// This is opt-in, not automatic. EmulatorEngine's constructor and
// loadGame() know nothing about this file - `pathToData` is a plain,
// predictable, constructor-time-only property (see index.d.ts's
// `readonly pathToData`, and the tests in emulator-engine.test.mjs that
// assert it immediately after construction, before any systemId is even
// known). Call getPathToData(systemId) yourself and pass the result as
// `pathToData` to the EmulatorEngine constructor if you want this
// behavior - nothing changes for you otherwise, and every other system
// stays on the stable channel regardless.
//
//   import { EmulatorEngine } from "coops_emulator_backbone";
//   import { getPathToData } from "coops_emulator_backbone";
//
//   const engine = new EmulatorEngine(container, {
//     pathToData: getPathToData(systemId),
//   });
//   await engine.loadGame(systemId, rom);

const STABLE_CDN_PATH = "https://cdn.emulatorjs.org/stable/data/";
const NIGHTLY_CDN_PATH = "https://cdn.emulatorjs.org/nightly/data/";

export const CDN_CHANNEL_OVERRIDES = {
  // Verified 2026-08-27 - see file header comment for the full story.
  // Revisit if EmulatorJS ever folds the hardware-rendering fix into
  // `stable` (check https://emulatorjs.org/docs/changelog/) - once that
  // happens this override stops being necessary and PSP can safely move
  // back to stable like every other system.
  psp: NIGHTLY_CDN_PATH,
};

/**
 * Recommended EmulatorJS data path for a given system id. Returns the
 * verified override for systems where one exists (currently just psp),
 * or the stable public CDN for everything else - never returns anything
 * that hasn't been deliberately reviewed and documented above.
 *
 * @param {string} systemId
 * @returns {string}
 */
export function getPathToData(systemId) {
  return CDN_CHANNEL_OVERRIDES[systemId] || STABLE_CDN_PATH;
}
