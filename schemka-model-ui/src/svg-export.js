import { assertSvgExport, SVG_EXPORT_LIMIT, svgExportProfile } from '../../schemka-model-io/src/svg-export-profile.js';
export { assertSvgExport, SVG_EXPORT_LIMIT };
const { NS, HEADER, presentation } = svgExportProfile;
const tags = new Set(svgExportProfile.tags), attributes = new Set(svgExportProfile.attributes);
const transient = '.hit,.junction-hit,.view-anchor,.connection-layout-handles,.layout-handle,.smart-link-preview,.inline-editor,.selection-anchor-outline,.selection-marquee';
const stateClasses = ['selected', 'selection-anchor', 'dragging', 'layout-edit-label'];
const number = value => Number.isFinite(value) ? Number(value.toFixed(4)) : 0;
const validBox = box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width >= 0 && box.height >= 0;


function element(document, tag, values = {}, text) {
  const result = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(values)) result.setAttribute(key, String(value));
  if (text !== undefined) result.textContent = text;
  return result;
}

/** Snapshot the actual visible projection and its laid-out text; never render a second notation. */
export function exportViewSvg({ canvas, bounds, title = '' }) {
  if (!canvas?.isConnected || !validBox(bounds) || bounds.width <= 0 || bounds.height <= 0) throw Error('Нет готового представления для SVG.');
  const document = canvas.ownerDocument, window = document.defaultView;
  const rootStyle = window.getComputedStyle(document.documentElement);
  const bodyStyle = window.getComputedStyle(document.body);
  const clone = canvas.cloneNode(false);
  clone.removeAttribute('style'); clone.removeAttribute('tabindex'); clone.setAttribute('aria-hidden', 'true');
  // Keep #canvas while resolving the existing stylesheet. The detached snapshot never receives focus.
  clone.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;width:900px;height:640px;';
  for (const child of canvas.children) if (child.localName === 'defs' || child.matches('g.node[data-kind="occurrence"],g.connection[data-kind="connection"],g.node[data-kind="visualNode"],g.connection[data-kind="visualConnector"]')) clone.append(child.cloneNode(true));
  for (const child of [...clone.querySelectorAll('*')]) {
    if (!tags.has(child.localName) || child.matches(transient)) { child.remove(); continue; }
    child.classList.remove(...stateClasses);
    const inlineStyle = presentation.map(property => [property, child.style?.getPropertyValue(property), child.style?.getPropertyPriority(property)]);
    child.removeAttribute('style');
    for (const [property, value, priority] of inlineStyle) if (value && (!/url\s*\(|[\\@]/i.test(value) || /^url\(["']?#notation-canvas-[a-z0-9-]+["']?\)$/.test(value))) child.style.setProperty(property, value, priority);
    for (const attribute of [...child.attributes]) if (!attributes.has(attribute.name) && !['class', 'style'].includes(attribute.name) && !attribute.name.startsWith('data-')) child.removeAttribute(attribute.name);
  }
  const rectangles = [{ ...bounds }];
  const resolve = (value, style) => {
    for (let step = 0; value.includes('var(') && step < 8; step++) value = value.replace(/var\((--[a-z0-9-]+)\)/gi, (_match, name) => style.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim());
    const localPaint = /^url\(["']?#(notation-canvas-[a-z0-9-]+)["']?\)$/.exec(value);
    if (localPaint) return `url(#${localPaint[1]})`;
    if (!value || /var\s*\(|url\s*\(|[\\@]/i.test(value)) throw Error('Не удалось определить оформление SVG. Повторите экспорт после отображения вида.');
    return value;
  };
  const background = resolve(canvas.style.backgroundColor || rootStyle.getPropertyValue('--canvas').trim(), rootStyle);
  const font = bodyStyle.fontFamily || '"Segoe UI", system-ui, sans-serif';
  document.body.append(clone);
  try {
    for (const child of clone.querySelectorAll('*')) {
      if (!clone.contains(child)) continue;
      if (child.localName === 'title' || child.localName === 'desc') continue;
      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') { child.remove(); continue; }
      for (const property of presentation) {
        let value = style.getPropertyValue(property).trim() || child.getAttribute(property);
        if (!value && property === 'font-family') value = font;
        if (value) child.setAttribute(property, resolve(value, style));
      }
      // SVG shadows are decorative CSS, not model geometry; the static export keeps crisp contours.
      if (child.localName === 'text' || child.localName === 'tspan') {
        const x = Number(child.getAttribute('x') || 0), y = Number(child.getAttribute('y') || 0);
        const size = Number.parseFloat(child.getAttribute('font-size')) || 16;
        const content = [...child.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('');
        const width = Array.from(content).length * size * 2 + 8;
        const anchor = child.getAttribute('text-anchor');
        const offset = child.closest('g.node')?.getAttribute('transform')?.match(/^translate\(([-+\d.e]+)[ ,]+([-+\d.e]+)\)$/i);
        const ox = offset ? Number(offset[1]) : 0, oy = offset ? Number(offset[2]) : 0;
        // The model geometry fallback covers paths. Text outside a node needs a separate conservative box.
        const fallback = { x: ox + x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0), y: oy + y - size * 1.5, width, height: size * 2 };
        let measured = false;
        try {
          const box = child.getBBox();
          if (validBox(box) && box.width > 0 && box.height > 0) {
            child.setAttribute('textLength', number(box.width)); child.setAttribute('lengthAdjust', 'spacingAndGlyphs');
            rectangles.push({ x: ox + box.x - 8, y: oy + box.y - 8, width: box.width + 16, height: box.height + 16 });
            measured = true;
          }
        } catch { /* DOM-only environments and unavailable fonts retain the conservative text extent. */ }
        if (!measured) rectangles.push(fallback);
      }
    }
    for (const child of clone.querySelectorAll('*')) {
      child.removeAttribute('class');
      for (const attribute of [...child.attributes]) if (!attributes.has(attribute.name)) child.removeAttribute(attribute.name);
    }
    const left = Math.floor(Math.min(...rectangles.map(box => box.x)) - 20), top = Math.floor(Math.min(...rectangles.map(box => box.y)) - 20);
    const right = Math.ceil(Math.max(...rectangles.map(box => box.x + box.width)) + 20), bottom = Math.ceil(Math.max(...rectangles.map(box => box.y + box.height)) + 20);
    const result = element(document, 'svg', { viewBox: `${left} ${top} ${right - left} ${bottom - top}`, width: right - left, height: bottom - top, role: 'img', 'aria-labelledby': 'svg-title svg-description', 'font-family': font });
    result.append(element(document, 'title', { id: 'svg-title' }, title || '(без названия)'),
      element(document, 'desc', { id: 'svg-description' }, 'Arkita · снимок текущего представления. Шрифты локальные; строки и размеры текста зафиксированы. Сетка, тени и инструменты редактора не экспортируются.'),
      element(document, 'rect', { x: left, y: top, width: right - left, height: bottom - top, fill: background }));
    result.append(...clone.childNodes);
    return assertSvgExport(HEADER + new window.XMLSerializer().serializeToString(result));
  } finally { clone.remove(); }
}
