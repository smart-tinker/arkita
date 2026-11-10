/** Original local box silhouette shared by SVG and connection clipping.
 * The six-vertex convex outline stays inside the stored bounds. Its three
 * interior separators suggest front/top/right faces; they are not contours.
 * Omitted x/y makes the same geometry usable in a translated SVG group.
 */
export function box3dGeometry({ x = 0, y = 0, width, height }) {
  const depth = Math.min(width / 6, height / 6, 10);
  const outline = [
    { x, y: y + depth }, { x: x + depth, y },
    { x: x + width, y }, { x: x + width, y: y + height - depth },
    { x: x + width - depth, y: y + height }, { x, y: y + height },
  ];
  const junction = { x: x + width - depth, y: y + depth };
  return { depth, outline, separators: [
    [outline[0], junction], [junction, outline[2]], [junction, outline[4]],
  ] };
}

/** Closed, application-owned contour tokens. Polygon vertices are the actual
 * painted outline, not an approximation of a separately rendered curve.
 * Ellipses remain analytic and are rendered with the returned SVG ellipse.
 * Omitted x/y supports the same geometry in a translated SVG group.
 */
export function nodeContourGeometry({ x = 0, y = 0, width, height }, token) {
  if (token === 'ellipse') return { ellipse: {
    cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: height / 2,
  } };
  let points;
  if (token === 'octagon') {
    const cut = Math.min(width / 5, height / 5, 12);
    points = [[cut, 0], [width - cut, 0], [width, cut], [width, height - cut],
      [width - cut, height], [cut, height], [0, height - cut], [0, cut]];
  } else if (token === 'folder') {
    points = [[0, 0], [.4 * width, 0], [.4 * width, .2 * height],
      [width, .2 * height], [width, height], [0, height]];
  } else if (token === 'cloud') {
    points = Array.from({ length: 96 }, (_, index) => {
      // Exact cardinal vertices avoid tiny trigonometric overshoots at bounds.
      const angle = index * Math.PI / 48, r = .9 + .1 * Math.cos(8 * angle);
      const cardinal = index % 24 === 0 ? [[1, 0], [0, 1], [-1, 0], [0, -1]][index / 24] : null;
      const [cos, sin] = cardinal || [Math.cos(angle), Math.sin(angle)];
      return [width * (.5 + .5 * r * cos), height * (.5 + .5 * r * sin)];
    });
  } else if (token === 'wavy') {
    points = [[0, 0], [width, 0], ...Array.from({ length: 49 }, (_, index) => {
      const sample = 48 - index, wave = sample === 0 || sample === 24 || sample === 48 ? 0 : Math.sin(sample * Math.PI / 24);
      return [width * (sample / 48), height * (.9 + .1 * wave)];
    })];
  } else return null;
  return { outline: points.map(([px, py]) => ({ x: x + px, y: y + py })) };
}
