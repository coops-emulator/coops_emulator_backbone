import { run } from "./harness.mjs";

console.log("core-registry.js");
await import("./core-registry.test.mjs");

console.log("");
console.log("emulator-engine.js (DOM-mocked, not a real browser - see test/dom-mock.mjs)");
await import("./emulator-engine.test.mjs");

console.log("");
console.log("rewind-profiles.js + theming/rewind/defaultOptions options");
await import("./rewind-and-theming.test.mjs");

console.log("");
console.log("cdn-channels.js");
await import("./cdn-channels.test.mjs");

console.log("");
await run();
