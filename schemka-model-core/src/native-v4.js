import { rasterImageSize, svgImageSize } from './asset-images.js';
import { LIMITS, byteLength, fail, record, text } from './json.js';

export const VISUAL_NODE_KINDS = Object.freeze(['note', 'group', 'legend', 'viewReference', 'image']);
export const DRAWING_COLLECTIONS = Object.freeze({ occurrence: 'occurrences', connection: 'connections', visualNode: 'visualNodes', visualConnector: 'visualConnectors' });
export const metadataRows = value => Object.entries(value).map(([key, value]) => ({ key, value }));
export function validatePropertyRows(value) {
  if (!Array.isArray(value)) fail('SCHEMA', 'V4 properties must be ordered key/value rows');
  if (value.length > LIMITS.properties) fail('LIMIT', 'Too many properties');
  for (const row of value) { record(row, ['key', 'value']); text(row.key); text(row.value); }
}
const color = value => typeof value === 'string' && /^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|none|transparent)$/.test(value);
const range = (value, low, high) => Number.isFinite(value) && !Object.is(value, -0) && value >= low && value <= high;
export const STYLE_FIELDS = Object.freeze(['fill', 'fillOpacity', 'gradient', 'stroke', 'strokeWidth', 'strokeDash', 'fontFamily', 'fontSize', 'fontWeight', 'textColor', 'textAlign', 'verticalAlign', 'iconColor', 'iconVisible', 'shape', 'image', 'labelVisible', 'labelOffset', 'labelBackground', 'lineStyle', 'sourceEnding', 'targetEnding', 'strokeFromFill', 'labelTemplate', 'hideWhenNested', 'crossing', 'labelBackgroundMode', 'imageVisible', 'labelAnchor']);
export function validateDrawingStyle(style, line = false, semanticLine = false, visualNode = false) {
  record(style, [], STYLE_FIELDS);
  for (const [key, value] of Object.entries(style)) {
    if (['fill', 'stroke', 'textColor', 'iconColor', 'labelBackground'].includes(key)) {
      if (!color(value)) fail('STYLE', 'Use a hexadecimal drawing color or none');
    } else if (key === 'gradient') {
      record(value, ['color', 'direction']);
      if (!color(value.color) || !['vertical', 'horizontal'].includes(value.direction)) fail('STYLE', 'Invalid fill gradient');
    } else if (key === 'fillOpacity') {
      if (!range(value, 0, 1)) fail('STYLE', 'Opacity must be within 0 and 1');
    } else if (key === 'strokeWidth') {
      if (!range(value, 0, 20)) fail('STYLE', 'Stroke width must be within 0 and 20');
    } else if (key === 'fontSize') {
      if (!range(value, 6, 96)) fail('STYLE', 'Font size must be within 6 and 96');
    } else if (key === 'fontFamily') {
      if (typeof value !== 'string' || !/^[\p{L}\p{N} ,_-]{1,120}$/u.test(value)) fail('STYLE', 'Invalid font family');
    } else if (['iconVisible', 'imageVisible', 'labelVisible', 'strokeFromFill', 'hideWhenNested'].includes(key)) {
      if (typeof value !== 'boolean') fail('STYLE', 'Visibility must be boolean');
    } else if (key === 'labelTemplate') {
      text(value);
    } else if (key === 'labelOffset') {
      record(value, ['x', 'y']);
      for (const n of [value.x, value.y]) if (!range(n, -LIMITS.coordinate, LIMITS.coordinate) || Math.round(n * 10) / 10 !== n) fail('STYLE', 'Invalid label offset');
    } else if (key === 'image') {
      record(value, ['assetId', 'fit', 'position']);
      if (typeof value.assetId !== 'string' || !['contain', 'cover', 'stretch'].includes(value.fit) || !['center', 'top', 'bottom', 'left', 'right'].includes(value.position)) fail('STYLE', 'Invalid drawing image');
    } else {
      const choices = {
        strokeDash: ['solid', 'dash', 'dot'], fontWeight: ['normal', 'bold'], textAlign: ['left', 'center', 'right'], verticalAlign: ['top', 'middle', 'bottom'],
        shape: ['default', 'rectangle', 'rounded', 'ellipse', 'folded', 'actor'], lineStyle: ['direct', 'orthogonal', 'rounded'],
        labelAnchor: ['source', 'middle', 'target'], crossing: ['none', 'jump'], labelBackgroundMode: ['transparent', 'opaque', 'clip'],
        sourceEnding: ['none', 'arrow', 'triangle', 'diamond', 'circle'], targetEnding: ['none', 'arrow', 'triangle', 'diamond', 'circle'],
      };
      if (!choices[key]?.includes(value)) fail('STYLE', `Invalid drawing style ${key}`);
    }
    if (key === 'shape' && value === 'actor' && !visualNode) fail('STYLE', 'Actor shape is a visual card, not a semantic ArchiMate symbol');
    if (key === 'hideWhenNested' && !semanticLine) fail('STYLE', 'Nested-line hiding belongs to a semantic connection');
    if (!line && ['lineStyle', 'sourceEnding', 'targetEnding', 'crossing', 'labelBackgroundMode', 'labelAnchor'].includes(key)) fail('STYLE', 'Line style requires a connector');
    if (line && ['fill', 'fillOpacity', 'gradient', 'iconColor', 'iconVisible', 'shape', 'image', 'imageVisible', 'verticalAlign', 'strokeFromFill'].includes(key)) fail('STYLE', 'Shape style requires a node');
  }
}

const transformNames = ['matrix', 'translate', 'scale', 'rotate', 'skewX', 'skewY'];
function validTransformList(value) {
  let at = 0, found = false;
  while (at < value.length) {
    while (at < value.length && /\s/.test(value[at])) at++;
    if (at === value.length) break;
    const name = transformNames.find(candidate => value.startsWith(`${candidate}(`, at));
    if (!name) return false;
    at += name.length + 1;
    const end = value.indexOf(')', at);
    if (end < 0 || end === at || !/^[0-9eE+.,\s-]+$/.test(value.slice(at, end))) return false;
    at = end + 1;
    found = true;
  }
  return found;
}

// Scan one SVG tag at a time; ambiguous whitespace quantifiers can stall on imported SVG.
function readSvgTag(source, start) {
  const end = source.indexOf('>', start);
  if (end < 0) fail('ASSET_SVG', 'Unsupported SVG element');
  let at = start + 1;
  while (at < end && /\s/.test(source[at])) at++;
  const closing = source[at] === '/';
  if (closing) {
    at++;
    while (at < end && /\s/.test(source[at])) at++;
  }
  const nameStart = at;
  if (!/[A-Za-z]/.test(source[at] ?? '')) fail('ASSET_SVG', 'Unsupported SVG element');
  at++;
  while (at < end && /[A-Za-z0-9]/.test(source[at])) at++;
  for (let i = at; i < end; i++) if (source[i] === '<') fail('ASSET_SVG', 'Unsupported SVG element');
  let attributes = source.slice(at, end);
  const selfClosing = attributes.endsWith('/');
  if (selfClosing) attributes = attributes.slice(0, -1);
  return { end, closing, tag: source.slice(nameStart, at), attributes, selfClosing };
}

// A closed inactive SVG vocabulary works identically at browser, Node and Git boundaries.
// Unsupported SVG is refused rather than rewritten or incompletely sanitized.
export function validateInactiveSvg(source) {
  if (typeof source !== 'string') fail('ASSET_SVG', 'SVG must be text');
  if (source.length > LIMITS.fileBytes || byteLength(source) > LIMITS.fileBytes) fail('LIMIT', 'SVG exceeds the file size limit');
  if (/<!|<\?|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) fail('ASSET_SVG', 'SVG declarations, entities and active content are unsupported');
  const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);
  const numberAttributes = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'viewBox', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'font-size', 'offset', 'stop-opacity']);
  const stack = [], ids = new Set(), references = [];
  let at = 0, roots = 0, tokens = 0;
  const entityText = value => !/&(?!(?:amp|lt|gt|quot|apos);)/.test(value);
  while (at < source.length) {
    if (++tokens > LIMITS.nodes) fail('LIMIT', 'Too many SVG tokens');
    const next = source.indexOf('<', at), content = source.slice(at, next < 0 ? source.length : next);
    if (!entityText(content) || (!stack.length && content.trim()) || (stack.length && !['text', 'tspan'].includes(stack.at(-1)) && content.trim())) fail('ASSET_SVG', 'Invalid SVG text');
    if (next < 0) break;
    const token = readSvgTag(source, next);
    if (!tags.has(token.tag)) fail('ASSET_SVG', 'Unsupported SVG element');
    at = token.end + 1;
    const { closing, tag, attributes, selfClosing } = token;
    if (closing) {
      if (selfClosing || attributes.trim() || stack.pop() !== tag) fail('ASSET_SVG', 'Unbalanced SVG element');
      continue;
    }
    if (!stack.length && (tag !== 'svg' || ++roots !== 1) || stack.length && tag === 'svg') fail('ASSET_SVG', 'Expected one SVG root');
    let rest = attributes;
    const seen = new Set();
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      if (!attr || seen.has(attr[1])) fail('ASSET_SVG', 'Invalid or repeated SVG attribute');
      const key = attr[1], value = attr[2] ?? attr[3]; seen.add(key); rest = rest.slice(attr[0].length);
      if (/[<>]/.test(value) || !entityText(value)) fail('ASSET_SVG', 'Invalid SVG attribute value');
      if (key === 'xmlns') {
        if (tag !== 'svg' || value !== 'http://www.w3.org/2000/svg') fail('ASSET_SVG', 'Invalid SVG namespace');
      } else if (key === 'id') {
        if (!/^[A-Za-z][\w.-]{0,127}$/.test(value) || ids.has(value)) fail('ASSET_SVG', 'Invalid SVG ID');
        ids.add(value);
      } else if (['fill', 'stroke', 'stop-color', 'clip-path'].includes(key)) {
        const reference = /^url\(#([A-Za-z][\w.-]{0,127})\)$/.exec(value);
        if (reference) references.push(reference[1]);
        else if (!color(value) && value !== 'currentColor') fail('ASSET_SVG', 'SVG colors cannot load external resources');
      } else if (numberAttributes.has(key)) {
        if (!/^[0-9eE+.,%\s-]+$/.test(value) || /(?:NaN|Infinity)/.test(value)) fail('ASSET_SVG', 'Invalid SVG number');
      } else if (key === 'd') {
        if (!/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]*$/.test(value)) fail('ASSET_SVG', 'Invalid SVG path');
      } else if (key === 'points') {
        if (!/^[0-9eE+.,\s-]*$/.test(value)) fail('ASSET_SVG', 'Invalid SVG points');
      } else if (['transform', 'gradientTransform'].includes(key)) {
        if (!validTransformList(value)) fail('ASSET_SVG', 'Invalid SVG transform');
      } else {
        const values = { 'font-family': /^[\p{L}\p{N} ,_-]{1,120}$/u, 'font-weight': /^(normal|bold|[1-9]00)$/, 'text-anchor': /^(start|middle|end)$/, 'dominant-baseline': /^(auto|middle|central|hanging)$/, 'stroke-linecap': /^(butt|round|square)$/, 'stroke-linejoin': /^(miter|round|bevel)$/, gradientUnits: /^(objectBoundingBox|userSpaceOnUse)$/ };
        if (!values[key]?.test(value)) fail('ASSET_SVG', `Unsupported SVG attribute: ${key}`);
      }
    }
    if (!selfClosing) { stack.push(tag); if (stack.length > LIMITS.depth) fail('LIMIT', 'SVG nesting exceeds limit'); }
  }
  if (roots !== 1 || stack.length || references.some(id => !ids.has(id))) fail('ASSET_SVG', 'Incomplete SVG or unresolved paint reference');
  return source;
}
export function validateAsset(asset) {
  record(asset, ['id', 'name', 'mediaType', 'encoding', 'data']); text(asset.name);
  if (asset.encoding !== 'base64' || typeof asset.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.data) || !asset.data.length || asset.data.length > LIMITS.fileBytes) fail('ASSET', 'Asset must contain bounded canonical base64');
  let bytes;
  try { const raw = atob(asset.data); if (btoa(raw) !== asset.data) fail('ASSET', 'Noncanonical asset base64'); bytes = Uint8Array.from(raw, char => char.charCodeAt(0)); }
  catch (error) { if (error.code) throw error; fail('ASSET', 'Invalid base64 asset'); }
  if (asset.mediaType === 'image/svg+xml') {
    let source; try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('ASSET_SVG', 'SVG must be UTF-8'); }
    validateInactiveSvg(source);
    return svgImageSize(source);
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mediaType)) fail('ASSET', 'Unsupported embedded image type');
  return rasterImageSize(bytes, asset.mediaType);
}
