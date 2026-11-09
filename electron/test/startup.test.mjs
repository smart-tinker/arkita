import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const main = process.env.SCHEMKA_STARTUP_MAIN || fileURLToPath(new URL('../main.mjs', import.meta.url));
const harness = fileURLToPath(new URL('./helpers/startup-harness.mjs', import.meta.url));
for (const [scenario, description] of [
  ['ready', 'entry evaluation settles before ready, then creates one fully guarded local window'],
  ['launch-file', 'cold association opens one Unicode model window; warm opens preserve it and deduplicate'],
  ['launch-file-dev', 'development argv opens the model without an extra blank window'],
  ['launch-multiple', 'cold launch opens distinct valid files once and reports each invalid file'],
  ['launch-pre-ready', 'pre-ready open-file and second-instance requests retain their paths and cwd'],
  ['launch-during-drain', 'requests arriving during initial reads are drained before any blank fallback'],
  ['launch-invalid', 'an invalid-only launch reports failures and leaves one usable blank window'],
  ['lock-lost', 'single-instance loser quits without scheduling startup'],
  ['assets-fail', 'asset setup rejection is reported and exits nonzero'],
  ['load-fails', 'loadURL rejection is reported and exits nonzero'],
  ['ready-fails', 'readiness rejection is reported and exits nonzero'],
  ['dialog-fails', 'a failed error dialog still reports the failure and exits nonzero'],
]) {
  test(description, () => {
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--unhandled-rejections=strict', harness, main, scenario], {
      encoding: 'utf8', timeout: 10_000,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.ifError(result.error);
    assert.equal(result.signal, null, output);
    assert.equal(result.status, 0, output);
  });
}
