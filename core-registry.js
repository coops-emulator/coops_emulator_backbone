/**
 * core-registry.js
 * ---------------------------------------------------------------------------
 * Maps every console this engine supports to the "system" identifier
 * EmulatorJS's own loader.js expects as EJS_core.
 *
 * REWRITTEN FROM THE ORIGINAL VERSION OF THIS FILE. The original mapped each
 * system directly to a raw libretro core binary name (e.g. nes -> "fceumm")
 * and had core-loader.js try to fetch/boot that binary itself. That doesn't
 * match how EmulatorJS actually works: EJS_core takes a *system* identifier
 * (e.g. "nes"), and EmulatorJS's own loader.js internally picks the right
 * core binary, fetches it from the right CDN path, decompresses it, and
 * boots it - see emulator-engine.js's header comment for the full story of
 * why this project now wraps that real loader instead of reimplementing it.
 *
 * System identifiers below were verified against:
 *   - https://emulatorjs.org/docs/systems/ (per-system embed examples)
 *   - https://cdn.emulatorjs.org/stable/data/cores/ (live core file listing)
 *   - https://emulatorjs.org/docs4devs/cores/ (core-to-system mapping table)
 * as of the date this file was written, PLUS a live re-check on 2026-08-12
 * against https://cdn.emulatorjs.org/stable/data/cores/ (confirmed every
 * core file referenced below currently exists, and that "bluemsx" - which
 * appeared in EmulatorJS's changelog historically - no longer exists there,
 * confirming MSX's removal below is still correct) and
 * https://emulatorjs.org/docs/systems/arcade/ (confirmed `EJS_core =
 * "arcade"` directly, including that Neo Geo runs through the same
 * "arcade" system - the two entries below that used to be flagged
 * `verified: false` are now confirmed and marked `verified: true`).
 * EmulatorJS adds/renames systems over time (e.g. "mame2003" was renamed to
 * "mame") - if a system stops working, check those sources before assuming
 * this file is wrong.
 *
 * A `verified: false` entry (none remain as of the 2026-08-12 re-check)
 * would mean the exact identifier string couldn't be confirmed against an
 * official source - double check it against
 * https://emulatorjs.org/docs/systems/ before relying on it. Listing a
 * guess as if it were confirmed would be exactly the kind of unverified
 * claim this rewrite exists to fix.
 */

export const CORE_REGISTRY = {
  nes:          { label: "NES",             system: "nes",         cores: ["nestopia", "fceumm"],       extensions: ["nes", "fds", "unf", "unif"], bios: null, verified: true },
  snes:         { label: "SNES",            system: "snes",        cores: ["snes9x", "bsnes"],           extensions: ["sfc", "smc"],                 bios: null, verified: true },
  gb:           { label: "Game Boy",        system: "gb",          cores: ["gambatte"],                  extensions: ["gb"],                          bios: null, verified: true },
  gbc:          { label: "Game Boy Color",  system: "gbc",         cores: ["gambatte"],                  extensions: ["gbc"],                         bios: null, verified: true },
  gba:          { label: "GBA",             system: "gba",         cores: ["mgba"],                      extensions: ["gba"],                         bios: { required: false, file: "gba_bios.bin" }, verified: true },
  n64:          { label: "N64",             system: "n64",         cores: ["mupen64plus_next", "parallel_n64"], extensions: ["n64", "z64", "v64"],    bios: null, verified: true },
  genesis:      { label: "Genesis",         system: "segaMD",      cores: ["genesis_plus_gx"],           extensions: ["md", "gen", "bin", "smd"],     bios: null, verified: true },
  segaCD:       { label: "Sega CD",         system: "segaCD",      cores: ["genesis_plus_gx"],           extensions: ["cue", "chd", "iso"],           bios: { required: true, files: ["bios_CD_U.bin", "bios_CD_E.bin", "bios_CD_J.bin"] }, verified: true },
  sega32x:      { label: "Sega 32X",        system: "sega32x",     cores: ["picodrive"],                 extensions: ["32x"],                         bios: null, verified: true },
  saturn:       { label: "Saturn",          system: "segaSaturn",  cores: ["yabause"],                   extensions: ["cue", "chd", "iso"],           bios: { required: true, files: ["sega_101.bin", "mpr-17933.bin"] }, verified: true },
  gameGear:     { label: "Game Gear",       system: "segaGG",      cores: ["genesis_plus_gx"],           extensions: ["gg"],                          bios: null, verified: true },
  masterSystem: { label: "Master System",   system: "segaMS",      cores: ["smsplus", "genesis_plus_gx"], extensions: ["sms"],                        bios: null, verified: true },
  psx:          { label: "PS1",             system: "psx",         cores: ["mednafen_psx_hw", "pcsx_rearmed"], extensions: ["cue", "chd", "pbp", "iso"], bios: { required: false, files: ["scph5501.bin", "scph5500.bin", "scph5502.bin"] }, verified: true },
  psp:          { label: "PSP",             system: "psp",         cores: ["ppsspp"],                    extensions: ["iso", "cso", "pbp"],           bios: { required: false, file: "PPSSPP_BIOS.bin" }, verified: true, requiresThreads: true },
  nds:          { label: "NDS",             system: "nds",         cores: ["melonds", "desmume2015"],    extensions: ["nds"],                         bios: { required: false, files: ["bios7.bin", "bios9.bin", "firmware.bin"] }, verified: true },
  atari2600:    { label: "Atari 2600",      system: "atari2600",   cores: ["stella2014"],                extensions: ["a26", "bin"],                  bios: null, verified: true },
  atari7800:    { label: "Atari 7800",      system: "atari7800",   cores: ["prosystem"],                 extensions: ["a78", "bin"],                  bios: null, verified: true },
  lynx:         { label: "Atari Lynx",      system: "lynx",        cores: ["handy"],                     extensions: ["lnx"],                         bios: { required: false, file: "lynxboot.img" }, verified: true },
  pcEngine:     { label: "PC Engine",       system: "pce",         cores: ["mednafen_pce"],              extensions: ["pce", "cue"],                  bios: null, verified: true },
  neoGeoPocket: { label: "Neo Geo Pocket",  system: "ngp",         cores: ["mednafen_ngp"],              extensions: ["ngp", "ngc"],                  bios: null, verified: true },
  wonderswan:   { label: "WonderSwan",      system: "ws",          cores: ["mednafen_wswan"],            extensions: ["ws", "wsc"],                   bios: null, verified: true },
  coleco:       { label: "ColecoVision",    system: "coleco",      cores: ["gearcoleco"],                extensions: ["col"],                         bios: null, verified: true },
  threeDo:      { label: "3DO",             system: "3do",         cores: ["opera"],                     extensions: ["cue", "iso"],                  bios: { required: true, file: "panafz1.bin" }, verified: true },
  c64:          { label: "Commodore 64",    system: "c64",         cores: ["vice_x64sc"],                extensions: ["d64", "prg", "crt"],           bios: null, verified: true },
  arcade:       { label: "Arcade (FBNeo)",  system: "arcade",      cores: ["fbneo"],                     extensions: ["zip"],                         bios: null, verified: true },
  // Neo Geo cartridges specifically run through the arcade/FBNeo system in
  // EmulatorJS rather than having their own EJS_core value - use `arcade`
  // above and a Neo Geo-formatted ROM zip. Listed separately here only so
  // it shows up under its own name in a UI; both entries point at fbneo.
  neogeo:       { label: "Neo Geo",         system: "arcade",      cores: ["fbneo"],                     extensions: ["zip"],                         bios: { required: true, file: "neogeo.zip" }, verified: true },
  // MSX was in the previous version of this registry mapped to a "bluemsx"
  // core. That core does not appear in EmulatorJS's live core listing as of
  // this writing (confirmed against https://cdn.emulatorjs.org/stable/data/cores/)
  // so it's left out entirely rather than shipped as an unverified guess -
  // add it back once you've confirmed EmulatorJS actually supports it.
};

export function getSystemConfig(systemId) {
  const cfg = CORE_REGISTRY[systemId];
  if (!cfg) throw new Error(`Unknown system id "${systemId}". Valid ids: ${Object.keys(CORE_REGISTRY).join(", ")}`);
  return cfg;
}

/** Guess a system id from a ROM's file extension. Ambiguous extensions (cue/bin/iso/zip) return all matches. */
export function detectSystemsByExtension(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  return Object.entries(CORE_REGISTRY)
    .filter(([, cfg]) => cfg.extensions.includes(ext))
    .map(([id]) => id);
}

/** Systems whose default core build requires SharedArrayBuffer (COOP/COEP headers). See README "Cross-origin isolation" section. */
export function systemsRequiringThreads() {
  return Object.entries(CORE_REGISTRY)
    .filter(([, cfg]) => cfg.requiresThreads)
    .map(([id]) => id);
}
