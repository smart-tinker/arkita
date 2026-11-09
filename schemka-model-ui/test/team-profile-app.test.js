import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './app-test-fixture.js';
import { PREFERENCE_DEFAULTS, PREFERENCES_KEY } from '../src/preferences.js';

test('actual startup applies team presentation defaults without persisting them as personal overrides or changing the model',async t=>{
 const preferences=structuredClone(PREFERENCE_DEFAULTS);preferences.display.diagramFont='Arial';preferences.workspace.paletteMode='compact';
 const h=await setup(t,{readTeamProfile:async()=>({status:'ok',profile:{id:'team.test',name:'Команда',revision:'1',preferences,templates:[]}})});
 assert.ok([...h.$('canvas').querySelectorAll('text')].some(item=>item.style.fontFamily==='Arial'));
 assert.equal(h.window.localStorage.getItem(PREFERENCES_KEY),null);
 h.$('preferences-button').click();assert.match(h.$('preferences-dialog').textContent,/Командный профиль: Команда · 1/);
 assert.equal(h.$('preferences-display-diagramFont').value,'Arial');
});
