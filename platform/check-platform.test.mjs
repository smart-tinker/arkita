import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const checker = new URL('../scripts/check-platform.mjs', import.meta.url).href;
for (const [name, outcome, expected, diagnostic] of [
  ['successful child', { status: 0 }, 0, /JavaScript files passed syntax checks/],
  ['syntax failure', { status: 7 }, 7, null],
  ['child killed by signal', { status: null, signal: 'SIGTERM' }, 1, /SIGTERM/],
  ['child could not start', { status: null, error: { message: 'spawn EAGAIN' } }, 1, /EAGAIN/],
]) {
  test(`syntax gate handles ${name}`, () => {
    // Inject the operating-system outcome without actually exhausting process slots.
    const script = `import cp from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      cp.spawnSync = () => (${JSON.stringify(outcome)});
      syncBuiltinESMExports();
      await import(${JSON.stringify(checker)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, expected, result.stdout + result.stderr);
    if (diagnostic) assert.match(result.stdout + result.stderr, diagnostic);
    if (expected) assert.doesNotMatch(result.stdout, /passed syntax checks/);
  });
}
