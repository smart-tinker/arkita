const MAX_DRAWINGS = 200, motions = new WeakMap();
const selector = '[data-kind][data-id], [data-analysis-kind][data-analysis-id], [data-analysis-edge]';
const identity = item => item.dataset.analysisEdge ? `edge:${item.dataset.analysisSide}:${item.dataset.analysisEdge}` : `${item.dataset.kind ?? item.dataset.analysisKind}:${item.dataset.id ?? item.dataset.analysisId}`;
const position = value => { const result = /^translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)$/.exec(value ?? ''); return result && result.slice(1).map(Number).every(Number.isFinite) ? result.slice(1).map(Number) : null; };
const route = item => item.tagName.toLowerCase() === 'path' ? item.getAttribute('d') : [...item.querySelectorAll('path')].map(path => path.getAttribute('d')).join('|');

/** Only bounded presentation data, never a model snapshot or per-frame store mutation. */
export function capturePreferenceMotion(canvas) {
  const items = canvas.querySelectorAll(selector); if (items.length > MAX_DRAWINGS) return null;
  return new Map([...items].map(item => [identity(item),{transform:item.getAttribute('transform'),route:route(item)}]));
}
export function cancelPreferenceMotion(canvas) {
  for (const animation of motions.get(canvas) ?? []) animation.cancel();
  motions.delete(canvas);
}
export function animatePreferenceMotion(canvas,before,settings,{window = canvas.ownerDocument.defaultView,graph = false} = {}) {
  cancelPreferenceMotion(canvas);
  const behavior = settings.behavior, items = canvas.querySelectorAll(selector);
  if (!before || items.length > MAX_DRAWINGS || !behavior.duration || behavior.motion === 'off' || graph && !behavior.animateGraph || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
  const duration = Math.min(500,Math.max(0,behavior.duration)), animations = [];
  for (const item of items) {
    const previous = before.get(identity(item)); if (!previous || typeof item.animate !== 'function') continue;
    const from = position(previous.transform), to = position(item.getAttribute('transform')); let frames;
    if (from && to && (from[0] !== to[0] || from[1] !== to[1])) frames = [from,to].map(([x,y]) => ({transform:`translate(${x}px, ${y}px)`}));
    else if (previous.route !== route(item)) frames = [{opacity:0.3},{opacity:1}];
    if (frames) animations.push(item.animate(frames,{duration,easing:'ease-out'}));
  }
  if (animations.length) {
    motions.set(canvas,animations);
    for (const animation of animations) animation.finished?.then(() => { if (motions.get(canvas) === animations && animations.every(item => item.playState === 'finished')) motions.delete(canvas); },() => {});
  }
  return animations.length;
}
