import { fail } from './json.js';

export const ASSET_LIMITS = Object.freeze({ dimension: 8192, pixels: 16 * 1024 * 1024, totalPixels: 64 * 1024 * 1024 });
export function checkedImageSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > ASSET_LIMITS.dimension || height > ASSET_LIMITS.dimension || width * height > ASSET_LIMITS.pixels) fail('ASSET_DIMENSIONS', 'Image exceeds 8192 pixels per side or 16 megapixels');
  return { width, height };
}
const invalid = () => fail('ASSET', 'Incomplete or malformed embedded image header');
// Header contracts: W3C PNG IHDR; ITU-T T.81 SOF; Google WebP RIFF/VP8/VP8L/VP8X.
export function rasterImageSize(bytes, mediaType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at, length) => String.fromCharCode(...bytes.slice(at, at + length));
  const u16 = at => view.getUint16(at), u32 = (at, little = false) => view.getUint32(at, little);
  let width, height;
  if (mediaType === 'image/png') {
    if (bytes.length < 45 || ascii(1, 3) !== 'PNG' || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, at) => bytes[at] === byte) || u32(8) !== 13 || ascii(12, 4) !== 'IHDR') invalid();
    width = u32(16); height = u32(20);
    const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) invalid();
    let at = 8, data = false, end = false;
    while (at < bytes.length) {
      if (at + 12 > bytes.length) invalid();
      const size = u32(at), type = ascii(at + 4, 4);
      if (at + size + 12 > bytes.length || !/^[A-Za-z]{4}$/.test(type) || at !== 8 && type === 'IHDR' || ['acTL', 'fcTL', 'fdAT'].includes(type)) invalid();
      if (type === 'IDAT') data = true;
      at += size + 12;
      if (type === 'IEND') { if (size || at !== bytes.length) invalid(); end = true; break; }
    }
    if (!data || !end) invalid();
  } else if (mediaType === 'image/jpeg') {
    if (bytes.length < 15 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) invalid();
    let at = 2, found = false, scan = false;
    while (at < bytes.length - 2) {
      if (bytes[at++] !== 255) invalid();
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda) {
        if (!found || at + 3 > bytes.length || ![1, 3, 4].includes(bytes[at + 2]) || u16(at) !== 6 + 2 * bytes[at + 2] || at + u16(at) > bytes.length - 2) invalid();
        scan = true; break;
      }
      if ([0, 0xd8, 0xd9].includes(marker) || at + 2 > bytes.length) invalid();
      const size = u16(at); if (size < 2 || at + size > bytes.length) invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (found || size < 11 || bytes[at + 2] !== 8 || ![1, 3, 4].includes(bytes[at + 7]) || size !== 8 + 3 * bytes[at + 7]) invalid();
        height = u16(at + 3); width = u16(at + 5); found = true;
      } else if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) invalid();
      at += size;
    }
    if (!found || !scan) invalid();
  } else if (mediaType === 'image/webp') {
    if (bytes.length < 26 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP' || u32(4, true) !== bytes.length - 8) invalid();
    let at = 12, canvas = null, image = null;
    const u24 = at => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
    while (at < bytes.length) {
      if (at + 8 > bytes.length) invalid();
      const type = ascii(at, 4), size = u32(at + 4, true), start = at + 8;
      if (start + size + (size % 2) > bytes.length) invalid();
      if (type === 'VP8X') {
        if (at !== 12 || canvas || size !== 10 || bytes[start] & 0xc3 || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalid();
        canvas = checkedImageSize(u24(start + 4) + 1, u24(start + 7) + 1);
      } else if (type === 'VP8 ') {
        if (image || size < 10 || bytes[start] & 1 || ascii(start + 3, 3) !== '\x9d\x01\x2a') invalid();
        image = checkedImageSize(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      } else if (type === 'VP8L') {
        if (image || size < 5 || bytes[start] !== 0x2f) invalid();
        const packed = u32(start + 1, true); if (packed >>> 29) invalid();
        image = checkedImageSize((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
      } else if (['ANIM', 'ANMF'].includes(type)) invalid();
      if (size % 2 && bytes[start + size] !== 0) invalid();
      at = start + size + (size % 2);
    }
    if (!image || canvas && (image.width !== canvas.width || image.height !== canvas.height)) invalid();
    ({ width, height } = image);
  } else invalid();
  return checkedImageSize(width, height);
}
export function svgImageSize(source) {
  const root = /^\s*<svg\b([^<>]*)>/.exec(source);
  if (!root) fail('ASSET_SVG', 'Expected an SVG root');
  const attributes = new Map();
  for (const match of root[1].matchAll(/([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attributes.set(match[1], match[2] ?? match[3]);
  const numeric = key => {
    if (!attributes.has(key)) return null;
    const value = attributes.get(key);
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/.test(value)) fail('ASSET_DIMENSIONS', 'SVG dimensions must be explicit finite positive pixels');
    return Number(value.replace(/px$/, ''));
  };
  const viewBox = attributes.has('viewBox') ? attributes.get('viewBox').trim().split(/[\s,]+/).map(Number) : null;
  if (viewBox && (viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value)) || viewBox.slice(0, 2).some(value => Math.abs(value) > 1000000))) fail('ASSET_DIMENSIONS', 'Invalid SVG viewBox');
  if (viewBox) checkedImageSize(viewBox[2], viewBox[3]);
  return checkedImageSize(numeric('width') ?? viewBox?.[2] ?? 300, numeric('height') ?? viewBox?.[3] ?? 150);
}
