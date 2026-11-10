# Connection presentation

Native V4 connection and visual-connector styles may select `crossing: none|jump`
and `labelBackgroundMode: transparent|opaque|clip`. An omitted mode preserves the
previous appearance, including an explicit `labelBackground` color. These fields
do not change relationship semantics, endpoints, anchors or saved bendpoints.

Jumps use the displayed route, including the current stored-geometry switch.
When both lines request a jump, the higher typed drawing ID receives the bridge.
Shared ends and anchor positions remain real connections. Hit paths and handles
retain their original geometry. Preview decorations do not accumulate.

Transparent labels have no halo. Opaque labels use the selected color or canvas
background. Clip labels remove line ink beneath their measured rectangle while
retaining underlying shapes/background. Overlapping rectangles are unioned before
an even-odd clip path is created. The editor, static SVG, PNG and print share that
rendered result; only the safe `nonzero` and `evenodd` clip-rule values are allowed.

Intersection decoration has a budget of 100,000 sampled points and 1,000,000
segment comparisons per render. Exceeding it keeps the original strokes, sets
`canvas.dataset.connectionDecorationWarning` and an accessible SVG description;
the model and hit routes remain exact. Views without jumps skip intersection work.
This source behavior is distinct from packaged Windows visual acceptance.
