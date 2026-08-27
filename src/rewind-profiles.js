/**
 * rewind-profiles.js
 * ---------------------------------------------------------------------------
 * Per-system rewind buffer/granularity tuning. Ported directly from ROM
 * Player by Coops's own live `launch()` function (index.html) rather than
 * invented here - that's a real, working production app with actual users,
 * so its tuning numbers are proven, not guessed.
 *
 * Why this varies per system: EmulatorJS's rewind works by periodically
 * snapshotting full save states into an in-memory ring buffer. Save-state
 * size varies enormously by system - a PS1 state is a few MB, an NES state
 * is a few hundred KB - so a single fixed buffer size/granularity either
 * wastes memory on simple systems or barely covers a few seconds on
 * complex ones. These profiles size each system's buffer to its actual
 * state size instead.
 */

// bufferSize is in MB (EJS_rewindGranularity + rewind_buffer_size retroarch
// option), granularity is frames between snapshots (lower = smoother
// rewind, more memory/CPU cost per second of rewind coverage).
export const REWIND_PROFILES = {
  psx:  { bufferSize: 512, granularity: 4 }, // large states, coarser snapshots
  n64:  { bufferSize: 256, granularity: 3 },
  gba:  { bufferSize: 256, granularity: 1 }, // tiny states, fine-grained
  snes: { bufferSize: 256, granularity: 1 },
  nes:  { bufferSize: 128, granularity: 1 },
  gb:   { bufferSize: 128, granularity: 1 },
  gbc:  { bufferSize: 128, granularity: 1 },
  genesis: { bufferSize: 128, granularity: 1 },
  // PSP: rewind is disabled outright, not tuned down like everything else
  // here. Rewind works by serializing the core's FULL state - CPU + ALL of
  // VRAM + the texture cache - into the ring buffer every `granularity`
  // frames. ppsspp is a threaded, WASM, no-native-JIT 3D core - already the
  // heaviest thing this wrapper boots - so that periodic full-state
  // snapshot lands as a recurring hitch on top of the emulation itself:
  // stutter and audio-crackle, not just an evenly slow game. Verified by
  // actually shipping this exact change in ROM Player by Coops (the
  // production app this wrapper's tuning is ported from) and confirming
  // via the in-game experience that disabling it removes the periodic
  // hitch. See emulator-engine.js's loadGame() for how `disabled` is
  // honored - it fully skips reserving/writing the rewind buffer rather
  // than just shrinking it.
  psp: { disabled: true },
  default: { bufferSize: 128, granularity: 2 },
};

export function getRewindProfile(systemId) {
  return REWIND_PROFILES[systemId] || REWIND_PROFILES.default;
}
