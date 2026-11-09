import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(args,cwd=root)=>{const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit',env:{...process.env,SCHEMKA_MERMAID_BASELINE:root,SCHEMKA_MERMAID_RUNTIME:path.join(root,'vendor/mermaid.tiny.js')}});if(r.status!==0)process.exit(r.status??1);};
// Bound file workers so independent DOM harnesses cannot exhaust the test host.
const testArgs=['--test','--test-concurrency=2'];
run(['scripts/build-platform.mjs']);
run([...testArgs,'tests/*.test.cjs']);
for(const pkg of ['schemka-model-core','schemka-model-io','schemka-model-profiles','schemka-model-ui','schemka-site-shell','schemka-catalog'])run([...testArgs,'test/*.test.js'],path.join(root,pkg));
run([...testArgs,'platform/*.test.mjs']);
run([...testArgs,'electron/test/*.test.mjs']);
