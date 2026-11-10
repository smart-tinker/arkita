import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {PREFERENCE_DEFAULTS} from '../src/preferences.js';
import {capturePreferenceMotion,animatePreferenceMotion,cancelPreferenceMotion} from '../src/preferences-motion.js';

function fixture(t) {
 const dom=new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"><g data-kind="occurrence" data-id="a" transform="translate(10 20)"></g><g data-kind="visualConnector" data-id="b"><path d="M 0 0 L 10 20"/></g><g data-analysis-kind="element" data-analysis-id="c" transform="translate(1 2)"></g></svg>');t.after(()=>dom.window.close());const {window}=dom,canvas=window.document.querySelector('svg'),calls=[];window.matchMedia=()=>({matches:false});
 for(const item of canvas.children)item.animate=(frames,options)=>{const animation={cancelled:0,cancel(){this.cancelled++;}};calls.push({item,frames,options,animation});return animation;};return {window,canvas,calls,settings:structuredClone(PREFERENCE_DEFAULTS)};
}
test('bounded motion paints node and graph moves plus route changes without modifying final geometry; a new render cancels previous animations',t=>{
 const h=fixture(t),before=capturePreferenceMotion(h.canvas);h.canvas.children[0].setAttribute('transform','translate(50 60)');h.canvas.children[1].querySelector('path').setAttribute('d','M 0 0 L 30 40');h.canvas.children[2].setAttribute('transform','translate(4 5)');const final=h.canvas.outerHTML;
 assert.equal(animatePreferenceMotion(h.canvas,before,h.settings,{window:h.window}),3);assert.deepEqual(h.calls[0].frames,[{transform:'translate(10px, 20px)'},{transform:'translate(50px, 60px)'}]);assert.deepEqual(h.calls[1].frames,[{opacity:0.3},{opacity:1}]);assert.equal(h.calls[0].options.duration,160);assert.equal(h.canvas.outerHTML,final);
 assert.equal(animatePreferenceMotion(h.canvas,capturePreferenceMotion(h.canvas),h.settings,{window:h.window}),0);assert.ok(h.calls.every(call=>call.animation.cancelled===1));cancelPreferenceMotion(h.canvas);assert.ok(h.calls.every(call=>call.animation.cancelled===1));
});
test('reduced motion, disabled graph animations, zero duration and oversized views bypass all animation',t=>{
 const h=fixture(t),before=capturePreferenceMotion(h.canvas);h.canvas.children[0].setAttribute('transform','translate(50 60)');h.window.matchMedia=()=>({matches:true});assert.equal(animatePreferenceMotion(h.canvas,before,h.settings,{window:h.window}),0);
 h.window.matchMedia=()=>({matches:false});h.settings.behavior.animateGraph=false;assert.equal(animatePreferenceMotion(h.canvas,before,h.settings,{window:h.window,graph:true}),0);h.settings.behavior.duration=0;assert.equal(animatePreferenceMotion(h.canvas,before,h.settings,{window:h.window}),0);h.settings.behavior.duration=160;h.settings.behavior.motion='off';assert.equal(animatePreferenceMotion(h.canvas,before,h.settings,{window:h.window}),0);
 h.settings.behavior.motion='on';for(let i=0;i<201;i++){const item=h.window.document.createElementNS('http://www.w3.org/2000/svg','g');item.dataset.kind='occurrence';item.dataset.id=String(i);h.canvas.append(item);}assert.equal(capturePreferenceMotion(h.canvas),null);assert.equal(animatePreferenceMotion(h.canvas,before,h.settings,{window:h.window}),0);assert.equal(h.calls.length,0);
});
