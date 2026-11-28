/** A saved view override changes effective routing only; individual styles and raw bends remain intact. */
export function applyViewRouter(view) {
  if (view?.view.router !== 'orthogonal') return view;
  // The flag belongs to this display projection; the native connection record is untouched.
  const lines = items => items.map(item => ({ ...item, style: { ...item.style, lineStyle: 'orthogonal' }, orthogonalAttachment: true }));
  return { ...view, connections: lines(view.connections), visualConnectors: lines(view.visualConnectors) };
}
