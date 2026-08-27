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

export interface RewindProfile {
  /** Present and true for systems where rewind costs more than it's worth
   *  (currently just psp) - bufferSize/granularity are absent in that case,
   *  not just zero. Check this before reading bufferSize/granularity. */
  disabled?: boolean;
  bufferSize?: number;
  granularity?: number;
}
export const REWIND_PROFILES: Record<string, RewindProfile>;
export function getRewindProfile(systemId: string): RewindProfile;

export interface EmulatorEngineOptions {
  /**
   * Defaults to DEFAULT_CDN_PATH (the real, public EmulatorJS CDN). Point
   * this at a local folder (e.g. "/data/") to self-host - see README
   * "Self-hosting instead of the public CDN" for exactly what that folder
   * needs to contain.
   */
  pathToData?: string;
}

export interface RewindOverride {
  /** Force-enable or force-disable rewind for this call, overriding the
   *  built-in profile's own disabled flag either direction (e.g. pass
   *  `{ disabled: false, bufferSize: 64, granularity: 6 }` to re-enable
   *  rewind for psp, whose built-in profile normally disables it). */
  disabled?: boolean;
  /** Rewind buffer size in MB. */
  bufferSize?: number;
  /** Frames between rewind snapshots - lower is smoother, more memory/CPU cost. */
  granularity?: number;
}

export interface LoadGameOptions {
  /** URL string, File, or Blob. Required if the target system's bios.required is true. */
  biosUrl?: string | File | Blob;
  /** Forces a specific core from SystemConfig.cores instead of EmulatorJS's own default pick. */
  core?: string;
  /** How long to wait for EJS_ready before rejecting. Default 45000. */
  timeoutMs?: number;
  /** Overrides the auto-derived EJS_gameName/EJS_gameID (see EmulatorEngine._deriveGameName). */
  gameName?: string;
  /** Auto-start vs EmulatorJS's own manual start UI. Default true. */
  startOnLoaded?: boolean;
  /** EJS_color - EmulatorJS's accent color theming. */
  color?: string;
  /** EJS_backgroundColor. */
  backgroundColor?: string;
  /**
   * true (default) uses the built-in per-system rewind profile (see
   * rewind-profiles.js, ported from ROM Player by Coops's own production
   * tuning) - note psp's built-in profile disables rewind entirely, not
   * just tunes it; false disables rewind for any system; an object
   * overrides specific fields of the profile for this call only (including
   * `disabled`, to force rewind back on for psp - see RewindOverride).
   */
  rewind?: boolean | RewindOverride;
  /** Merged into EJS_defaultOptions (raw libretro retroarch cfg keys). */
  defaultOptions?: Record<string, string>;
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
