import path from 'node:path';
import { verifyEvidence, sameObservation } from './preserved-write.mjs';

/** Only a live successful transaction supplies this exact inventory; never scan old journals. */
export async function removeCompletedTransaction({ files, directories, guard, io, verify }) {
  await verify();
  for (const file of files) {
    await verifyEvidence(file, guard, io);
    if (file.stat.nlink !== 1n) throw Error('Transaction copy has external links.');
  }
  for (const file of files) {
    await verifyEvidence(file, guard, io);
    await guard.check(path.dirname(file.target));
    if (!sameObservation(file.stat, await io.lstat(file.target, { bigint: true }))) throw Error('Transaction copy changed before cleanup.');
    await io.unlink(file.target);
  }
  // check(), not verify(): the guard also remembers directories already removed below.
  for (const directory of directories) { await guard.check(directory); await io.rmdir(directory); }
}
