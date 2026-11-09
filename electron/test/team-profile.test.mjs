import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import * as fs from 'node:fs/promises';
import { readStartupTeamProfile } from '../team-profile.mjs';
import { serializeTeamProfile } from '../../schemka-model-io/src/team-profile.js';
import { PREFERENCE_DEFAULTS } from '../../schemka-model-io/src/preferences-profile.js';
test('startup reads only a bounded profile beside exact executable/portable root without modifying any files',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'arkita-team-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const executable=path.join(root,'Arkita.exe'),options={executable,portableDirectory:''};
 assert.deepEqual(await readStartupTeamProfile(options),{status:'absent'});
 const file=path.join(root,'arkita-team-profile.json'),text=serializeTeamProfile({id:'team.test',name:'Team',revision:'1',preferences:structuredClone(PREFERENCE_DEFAULTS),templates:[]});
 await fs.writeFile(file,text,{flag:'wx'});const before=await fs.readFile(file);
 const result=await readStartupTeamProfile(options);assert.equal(result.profile.id,'team.test');assert.deepEqual(await fs.readFile(file),before);
 const portable=path.join(root,'portable');await fs.mkdir(portable);assert.deepEqual(await readStartupTeamProfile({...options,portableDirectory:portable}),{status:'absent'});
 await fs.writeFile(path.join(portable,'arkita-team-profile.json'),text,{flag:'wx'});assert.equal((await readStartupTeamProfile({...options,portableDirectory:portable})).profile.id,'team.test');
 await assert.rejects(readStartupTeamProfile({...options,portableDirectory:'relative'}),e=>e.code==='TEAM_PROFILE_PATH');
});
test('startup refuses a profile symlink instead of following an arbitrary file',async t=>{
 if(process.platform==='win32')return t.skip('Requires Windows symlink privilege; fixed-file read is covered separately');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'arkita-team-link-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'other'),'{}');await fs.symlink(path.join(root,'other'),path.join(root,'arkita-team-profile.json'));
 await assert.rejects(readStartupTeamProfile({executable:path.join(root,'Arkita'),portableDirectory:''}));assert.equal(await fs.readFile(path.join(root,'other'),'utf8'),'{}');
});
