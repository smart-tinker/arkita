import { rasterImageSize,svgImageSize } from '../../schemka-model-core/src/asset-images.js';
/** Inspect the already validated bounded resource, without decoding it in the renderer. */
export function imageDimensions(asset,window){
 if(!asset)return null;const bytes=Uint8Array.from(window.atob(asset.data),char=>char.charCodeAt(0));return asset.mediaType==='image/svg+xml'?svgImageSize(new TextDecoder('utf-8',{fatal:true}).decode(bytes)):rasterImageSize(bytes,asset.mediaType);
}
export function proportionateBounds(bounds,dimensions,changed='width'){
 const result={...bounds};if(!dimensions)return result;const ratio=dimensions.width/dimensions.height;if(changed==='height')result.width=Math.round(bounds.height*ratio*10)/10;else result.height=Math.round(bounds.width/ratio*10)/10;return result;
}
