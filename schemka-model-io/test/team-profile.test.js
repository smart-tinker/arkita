import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../schemka-model-core/src/index.js';
import { PREFERENCE_DEFAULTS } from '../src/preferences-profile.js';
import { createTemplate } from '../src/templates.js';
import { serializeTeamProfile, readTeamProfile } from '../src/team-profile.js';

test('team profile roundtrip preserves palette/settings/templates while rejecting unknown fields, duplicate templates and executable additions', () => {
  const template=createTemplate(createProject('Shared template'));
  const profile={id:'team.architecture',name:'Архитектура',revision:'2026-10',preferences:structuredClone(PREFERENCE_DEFAULTS),templates:[template]};
  profile.preferences.workspace.paletteMode='compact';profile.preferences.defaults.width=260;
  const before=structuredClone(profile),text=serializeTeamProfile(profile);
  assert.deepEqual(readTeamProfile(text),profile);assert.deepEqual(profile,before);
  assert.throws(()=>readTeamProfile(text.replace('"version":1','"version":2')),e=>e.code==='TEAM_PROFILE_VERSION');
  assert.throws(()=>readTeamProfile(JSON.stringify({...JSON.parse(text),script:'fetch("https://example.com")'})));
  assert.throws(()=>serializeTeamProfile({...profile,templates:[template,template]}),e=>e.code==='TEAM_PROFILE');
  assert.throws(()=>readTeamProfile(new Uint8Array([255])));
});
