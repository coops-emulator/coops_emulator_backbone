// Minimal dependency-free test harness. No devDependencies required to run
// this project's tests - matches the project's own "no build step, no
// unverified third-party moving parts" ethos.

const tests = [];
let currentSuite = "";

export function describe(name, fn) {
  const prevSuite = currentSuite;
  currentSuite = prevSuite ? `${prevSuite} > ${name}` : name;
  fn();
  currentSuite = prevSuite;
}

export function test(name, fn) {
  tests.push({ name: currentSuite ? `${currentSuite} > ${name}` : name, fn });
}

export function assertEquals(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + " - " : ""}expected ${e} but got ${a}`);
  }
}

export function assertTrue(value, msg) {
  if (!value) throw new Error(msg || `expected truthy value, got ${value}`);
}

export function assertThrows(fn, matcher, msg) {
  let threw = false;
  let error;
  try {
    fn();
  } catch (err) {
    threw = true;
    error = err;
  }
  if (!threw) throw new Error(msg || "expected function to throw, but it did not");
  if (matcher) {
    const matches = typeof matcher === "string" ? error.message.includes(matcher) : matcher.test(error.message);
    if (!matches) {
      throw new Error(`${msg ? msg + " - " : ""}error message "${error.message}" did not match ${matcher}`);
    }
  }
}

export async function assertRejects(promise, matcher, msg) {
  let threw = false;
  let error;
  try {
    await promise;
  } catch (err) {
    threw = true;
    error = err;
  }
  if (!threw) throw new Error(msg || "expected promise to reject, but it resolved");
  if (matcher) {
    const matches = typeof matcher === "string" ? error.message.includes(matcher) : matcher.test(error.message);
    if (!matches) {
      throw new Error(`${msg ? msg + " - " : ""}error message "${error.message}" did not match ${matcher}`);
    }
  }
}

export async function run() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (err) {
      failed++;
      failures.push({ name, err });
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`    ${err.message}`);
    }
  }

  console.log("");
  console.log(`${passed} passed, ${failed} failed, ${tests.length} total`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}
