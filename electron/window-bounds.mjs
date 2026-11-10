/** Shared main-process geometry: never restore a window outside the current work areas. */
export function visibleWindowBounds(bounds, displays, options = {}) {
  const { width: defaultWidth = 1280, height: defaultHeight = 850, minWidth = 760, minHeight = 540, maxWidth = 100000, maxHeight = 100000 } = options;
  if (bounds && ['x', 'y', 'width', 'height'].some(key => !Number.isInteger(bounds[key]) || Math.abs(bounds[key]) > 100000)) bounds = null;
  const fallback = displays[0]?.workArea || { x: 0, y: 0, width: 1280, height: 850 };
  const screen = displays.find(display => bounds && bounds.x < display.workArea.x + display.workArea.width && bounds.x + bounds.width > display.workArea.x && bounds.y < display.workArea.y + display.workArea.height && bounds.y + bounds.height > display.workArea.y)?.workArea || fallback;
  const width = Math.min(screen.width, Math.max(minWidth, Math.min(maxWidth, bounds?.width || defaultWidth))), height = Math.min(screen.height, Math.max(minHeight, Math.min(maxHeight, bounds?.height || defaultHeight)));
  return { x: Math.max(screen.x, Math.min(screen.x + screen.width - width, bounds?.x ?? screen.x + Math.floor((screen.width - width) / 2))), y: Math.max(screen.y, Math.min(screen.y + screen.height - height, bounds?.y ?? screen.y + Math.floor((screen.height - height) / 2))), width, height };
}
export function watchWindowBounds(window, save, initial) {
  let last = initial, timer = null;
  const flush = () => { timer = null; void save(last).catch(() => {}); };
  const update = () => { if (window.isDestroyed()) return; last = window.getNormalBounds(); clearTimeout(timer); timer = setTimeout(flush, 250); };
  window.on('resize', update); window.on('move', update);
  window.once('closed', () => { clearTimeout(timer); flush(); });
}
