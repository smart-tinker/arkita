import { validateAsset } from '../../schemka-model-core/src/native-v4.js';
const NS = 'http://www.w3.org/2000/svg';
const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
export const SVG_EXPORT_LIMIT = 16 * 1024 * 1024;
const tags = new Set(['svg', 'g', 'defs', 'marker', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'tspan', 'title', 'desc', 'image', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);
const geometryAttributes = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'points', 'transform', 'viewBox', 'preserveAspectRatio', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'overflow', 'textLength', 'lengthAdjust', 'offset', 'gradientUnits', 'gradientTransform']);
const presentation = ['fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'paint-order', 'vector-effect', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'text-decoration', 'display', 'stop-color', 'stop-opacity'];
const attributes = new Set([...geometryAttributes, ...presentation, 'xmlns', 'id', 'role', 'aria-labelledby', 'marker-start', 'marker-end', 'href', 'clip-path']);
const xmlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF\uD800-\uDFFF]/u;
const validBox = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width >= 0 && box.height >= 0;

/** Closed static SVG profile, also checked in main before the native picker. */
export function assertSvgExport(text) {
  const fail = () => { throw Error('Недопустимый статический SVG. Экспортируйте представление заново.'); };
  if (typeof text !== 'string' || !text.startsWith(HEADER) || text.length > SVG_EXPORT_LIMIT || xmlCharacters.test(text) || new TextEncoder().encode(text).length > SVG_EXPORT_LIMIT) fail();
  const source = text.slice(HEADER.length), lexer = /<[^<>]*>|[^<]+/y;
  const stack = [], ids = new Set(), references = []; let roots = 0;
  function decode(value) {
    const decoded = value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, code) => {
      if (code[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code] ?? entity;
      const point = Number.parseInt(code.slice(code[1]?.toLowerCase() === 'x' ? 2 : 1), code[1]?.toLowerCase() === 'x' ? 16 : 10);
      if (!Number.isFinite(point) || point > 0x10ffff) fail();
      return String.fromCodePoint(point);
    });
    if (/&(?!(?:#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);)/.test(value) || xmlCharacters.test(decoded)) fail();
    return decoded;
  }
  for (let offset = 0; offset < source.length;) {
    lexer.lastIndex = offset;
    const match = lexer.exec(source); if (!match) fail();
    const token = match[0]; offset = lexer.lastIndex;
    if (!token.startsWith('<')) { if (!stack.length && token.trim() || token.includes(']]>')) fail(); decode(token); continue; }
    const close = token.match(/^<\/([a-zA-Z]+)>$/);
    if (close) { if (stack.pop() !== close[1]) fail(); continue; }
    const start = token.match(/^<([a-zA-Z]+)((?:\s+[a-zA-Z][a-zA-Z0-9-]*="[^"<>]*")*)\s*(\/?)>$/);
    if (!start || !tags.has(start[1]) || !stack.length && (start[1] !== 'svg' || ++roots !== 1) || stack.length && start[1] === 'svg' || stack.length > 32) fail();
    const seen = new Set(); let namespace = false;
    for (const match of start[2].matchAll(/\s+([a-zA-Z][a-zA-Z0-9-]*)="([^"<>]*)"/g)) {
      const name = match[1], value = decode(match[2]);
      if (!attributes.has(name) || seen.has(name)) fail(); seen.add(name);
      if (name === 'xmlns') { if (start[1] !== 'svg' || value !== NS) fail(); namespace = true; }
      else if (name === 'clip-rule' && !['nonzero','evenodd'].includes(value)) fail();
      else if (name === 'id') { if (!/^(?:notation-canvas-[a-z0-9-]+|svg-title|svg-description)$/.test(value) || ids.has(value)) fail(); ids.add(value); }
      else if (name === 'href') {
        const asset = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(value);
        if (start[1] !== 'image' || !asset) fail();
        try { validateAsset({ id: 'export', name: '', mediaType: asset[1], encoding: 'base64', data: asset[2] }); } catch { fail(); }
      } else if (['marker-start', 'marker-end', 'fill', 'stroke', 'clip-path'].includes(name) && value.startsWith('url(')) {
        const reference = value.match(/^url\(#(notation-canvas-[a-z0-9-]+)\)$/); if (!reference) fail(); references.push(reference[1]);
      } else if (/url\s*\(|var\s*\(|[\\@]/i.test(value)) fail();
    }
    if (start[1] === 'svg' && !namespace) fail();
    if (!start[3]) stack.push(start[1]);
  }
  if (roots !== 1 || stack.length || references.some(id => !ids.has(id))) fail();
  return text;
}

export const svgExportProfile = Object.freeze({ NS, HEADER, tags: Object.freeze([...tags]), attributes: Object.freeze([...attributes]), presentation: Object.freeze([...presentation]) });
