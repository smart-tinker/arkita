import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterDimensions, rasterizeViewSvg } from '../src/raster-export.js';
const svg = (width, height) => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="-20 -10 ${width} ${height}"><text x="0" y="0">Кириллица</text></svg>`;
test('PNG scale gives explicit whole pixel dimensions and rejects unsafe or excessive input before decoding', () => {
  assert.deepEqual(rasterDimensions(svg(100.5, 50.5), 2), { width: 201, height: 101 }); assert.throws(() => rasterDimensions(svg(10000, 10000), 1)); assert.throws(() => rasterDimensions(svg(200, 200), 5)); assert.throws(() => rasterDimensions('<svg onload="bad()"/>'));
});
test('cancelled PNG export never asks a renderer to decode or allocate canvas', async () => {
  const controller = new AbortController(); controller.abort(); await assert.rejects(rasterizeViewSvg(svg(100, 100), { signal: controller.signal }), { code: 'EXPORT_CANCELLED' });
});

function renderer(){let decoded=0,allocated=0;const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:callback=>callback(new Blob(['png']))},window={setTimeout,clearTimeout,btoa:value=>Buffer.from(value,'binary').toString('base64'),Image:class{constructor(){decoded++;}set src(value){this.value=value;if(value)queueMicrotask(()=>this.onload?.());}}},document={fonts:{ready:Promise.resolve()},createElement(){allocated++;return canvas;}};return {window,document,canvas,get decoded(){return decoded;},get allocated(){return allocated;}};}
test('font readiness and a stalled PNG encoder are cancellable and release their canvas without false completion',async()=>{
 const waiting=renderer(),fonts=new AbortController();waiting.document.fonts.ready=new Promise(()=>{});const first=rasterizeViewSvg(svg(100,100),{...waiting,signal:fonts.signal});fonts.abort();await assert.rejects(first,{code:'EXPORT_CANCELLED'});assert.equal(waiting.decoded,0);assert.equal(waiting.allocated,0);
 const encoding=renderer(),controller=new AbortController();let callback;encoding.canvas.toBlob=value=>callback=value;const result=rasterizeViewSvg(svg(100,100),{...encoding,signal:controller.signal});await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof callback,'function');controller.abort();await assert.rejects(result,{code:'EXPORT_CANCELLED'});assert.equal(encoding.canvas.width,0);assert.equal(encoding.canvas.height,0);callback(new Blob(['late']));
});
test('font readiness has a finite timeout, and oversized PNG blobs are refused before arrayBuffer allocation',async()=>{
 const waiting=renderer();waiting.document.fonts.ready=new Promise(()=>{});waiting.window.setTimeout=callback=>{queueMicrotask(callback);return 1;};waiting.window.clearTimeout=()=>{};await assert.rejects(rasterizeViewSvg(svg(100,100),waiting),/Шрифты не загрузились за 15 секунд/);assert.equal(waiting.allocated,0);
 const large=renderer();let read=false;large.canvas.toBlob=callback=>callback({size:64*1024*1024+1,arrayBuffer(){read=true;throw Error('must not allocate');}});await assert.rejects(rasterizeViewSvg(svg(100,100),large),/64 MiB/);assert.equal(read,false);assert.equal(large.canvas.width,0);
});
