/**
 * Hand-written type definitions for coops_emulator_backbone.
 *
 * There's no build step in this project (see README), so these are
 * maintained by hand against src/core-registry.js and
 * src/emulator-engine.js. If you change either of those files' public
 * shape, update this file to match - nothing checks it automatically.
 */

export interface BiosRequirement {
  required: boolean;
  file?: string;
  files?: string[];
}

export interface SystemConfig {
  label: string;
  /** The EJS_core system identifier EmulatorJS's loader.js expects. */
  system: string;
  /** Libretro cores EmulatorJS may pick for this system (informational). */
  cores: string[];
  extensions: string[];
  bios: BiosRequirement | null;
  /**
   * false means the exact identifier could not be confirmed against
   * https://emulatorjs.org/docs/systems/ - see README and core-registry.js.
   */
  verified: boolean;
  /** true only for systems whose default core build requires SharedArrayBuffer (e.g. PSP). */
  requiresThreads?: boolean;
}

export type SystemId =
  | "nes" | "snes" | "gb" | "gbc" | "gba" | "n64"
  | "genesis" | "segaCD" | "sega32x" | "saturn" | "gameGear" | "masterSystem"
  | "psx" | "psp" | "nds"
  | "atari2600" | "atari7800" | "lynx"
  | "pcEngine" | "neoGeoPocket" | "wonderswan" | "coleco" | "threeDo" | "c64"
  | "arcade" | "neogeo";

export const CORE_REGISTRY: Record<SystemId, SystemConfig>;

/** Throws if systemId isn't a key in CORE_REGISTRY. */
export function getSystemConfig(systemId: SystemId | string): SystemConfig;

/** Ambiguous extensions (cue/bin/iso/zip) return every matching system id. */
export function detectSystemsByExtension(filename: string): SystemId[];

/** System ids whose default core build requires SharedArrayBuffer / COOP+COEP headers. */
export function systemsRequiringThreads(): SystemId[];

export const DEFAULT_CDN_PATH: string;

export interface EmulatorEngineOptions {
  /**
   * Defaults to DEFAULT_CDN_PATH (the real, public EmulatorJS CDN). Point
   * this at a local folder (e.g. "/data/") to self-host - see README
   * "Self-hosting instead of the public CDN" for exactly what that folder
   * needs to contain.
   */
  pathToData?: string;
}

export interface LoadGameOptions {
  /** Overrides the BIOS file config's default, if the system needs one. */
  biosUrl?: string;
  /** Forces a specific core from SystemConfig.cores instead of EmulatorJS's own default pick. */
  core?: string;
  /**
   * Defaults to true. EmulatorJS's own documented default is false, which
   * makes it wait at a "Start Game" screen and do nothing further - no
   * core fetch, no error - until a person clicks it. loadGame() defaults
   * this to true so it actually boots automatically; pass false to restore
   * EmulatorJS's own click-to-start screen instead.
   */
  startOnLoaded?: boolean;
}

export interface SystemListEntry {
  id: SystemId;
  label: string;
  verified: boolean;
}

export declare class EmulatorEngine {
  /**
   * @param container An empty DOM element EmulatorJS will fill with its
   *   own canvas, controls, and virtual gamepad. Must be an Element (a
   *   <div>), not a <canvas> - throws otherwise.
   */
  constructor(container: HTMLElement, opts?: EmulatorEngineOptions);

  readonly container: HTMLElement;
  readonly pathToData: string;
  readonly systemId: SystemId | null;

  static listSystems(): SystemListEntry[];
  static detectSystem(filename: string): SystemId[];

  /**
   * Boots EmulatorJS's real loader.js against a ROM. Can only be called
   * once per instance - EmulatorJS boots via a single loader.js include
   * per page load (see emulator-engine.js header comment). Throws if
   * called a second time, or if the system requires SharedArrayBuffer
   * and the page isn't cross-origin isolated (see README "Cross-origin
   * isolation" for PSP).
   */
  loadGame(systemId: SystemId | string, rom: string | Blob | File, opts?: LoadGameOptions): Promise<void>;

  onGameStart(fn: () => void): void;
  onSaveState(fn: (...args: unknown[]) => void): void;
  onLoadState(fn: (...args: unknown[]) => void): void;
  onExit(fn: () => void): void;

  /** Raw save-state bytes from EJS_emulator.gameManager.getState(). Throws if no game is booted. */
  getStateBytes(): Uint8Array;
  /** Loads bytes previously returned by getStateBytes(). Throws if no game is booted. */
  loadStateBytes(bytes: Uint8Array): void;

  /** Best-effort passthrough to EJS_emulator.pause(), if EmulatorJS exposes it. Throws if no game is booted. */
  pause(): void;
  /** Best-effort passthrough to EJS_emulator.play(), if EmulatorJS exposes it. Throws if no game is booted. */
  play(): void;
  /** Best-effort passthrough to EJS_emulator.fullscreen(), if EmulatorJS exposes it. Throws if no game is booted. */
  requestFullscreen(): void;

  /**
   * Tears down what this wrapper owns (container contents + injected
   * script tag) only. Does NOT claim to fully reset EmulatorJS's internal
   * state - see the JSDoc on this method in emulator-engine.js.
   */
  destroy(): void;
}
