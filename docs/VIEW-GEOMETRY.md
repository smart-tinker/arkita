# Native v2 routes and drawing anchors

## Evidence and scope

Connection waypoints and label positions use the shared coordinate system of their view's canvas. The v2 core preserves ordered bend/anchor routePoints, finite coordinates on a 0.1-unit grid, and a nullable labelPosition.

That plan does **not** specify polyline versus Bézier interpolation or a text baseline/center/top-left anchor. The behavior below is an explicit, application-owned rendering interpretation, not an ArchiMate rule.

## Saved geometry display

The checkbox **Показывать сохранённые маршруты и подписи** enables display of optional stored bends and label positions for the currently opened project. On application startup and after a successful file replacement, it is enabled when any semantic or visual connection in the model has saved route points or a label position; otherwise it is off. Failed or cancelled imports retain the existing choice. Switching this option never changes the project, undo/redo history, dirty baseline, saved file, profile, or browser storage.

When the option is off, ordinary unanchored connections retain automatic routing. Stored anchors and connection-kind endpoint attachments are always honored; turning off optional bends cannot disconnect a relationship. Reopening a file restores the display of its saved bends and labels. Protected inline/dialog drafts and active drags must finish or be cancelled before switching.

## Interpretation

- Coordinates are absolute within the view, as established by the historical plan.
- Ordered bend route points are intermediate **polyline vertices**, not curve control points. Anchors are owned, persisted waypoints; source and target are typed ViewEndpoints referring to occurrences or exact host-connection anchors.
- The displayed ends are clipped to the actual local contours: rectangles and rounded rectangles, plus original local Box3D, junction circles and the other current contours. Endpoint-hidden portions are clipped, and consecutive identical points need no duplicate zero-length display segment; display/clipping alone never removes, reorders or rewrites stored points.
- labelPosition specifies the SVG text's horizontal middle anchor and vertical baseline. This anchor is a local rendering choice. `null` keeps automatic label placement; a non-null label position also applies when the bendpoint list is empty.
- Unanchored connections without displayed bends retain automatic routing. A degenerate unanchored manual route may fall back and must be reported without changing source data. Hosted or referenced anchors pin a polyline even when optional stored bends are hidden; they cannot be skipped by automatic fallback.
- Moving an occurrence updates that occurrence only. Saved absolute route vertices and label coordinates do not move with it. No obstacle avoidance, automatic route simplification, semantic inference, or semantic route correction is introduced.

Repeated points, self-loops, overlapping figures and points inside endpoint figures are legal stored inputs. Rendering must remain finite and deterministic, preserve visible point order, and avoid claiming exact manual-route display when a fallback is used. Fit includes the displayed route and explicit label placement.

## File validation

The current native model preserves stored coordinates exactly. Unsupported model identities or structures are rejected transactionally; no historical conversion or projection adapter is bundled. Mermaid remains an approximate text export and does not reproduce these coordinates.

Regression acceptance covers empty/repeated/inside-node points, directed/reversed connections, self-loops, overlaps, label-only coordinates, clipping, fit, view switches, drag previews/cancellation, undo/redo, toggle interruption guards, failed imports, successful-import saved-geometry detection, and exact file roundtrips. Browser visual/pointer QA remains separate from numerical geometry and jsdom tests; see [VALIDATION.md](VALIDATION.md).

## Explicit layout editing

Canonical v2 replaces old bendpoints and occurrence-only fields with typed ViewEndpoints and ordered bend/anchor routePoints. Editing remains in the same absolute coordinate system. There is no v1 reader or converter. Select a connection, enable **Показывать сохранённые маршруты и подписи**, then choose **Редактировать геометрию**. Selection, the checkbox and the edit-mode toggle do not write the model. An explicit point/label drag, point insertion/deletion or reset is the edit boundary.

With optional saved geometry OFF, a pinned connection offers an **anchor-only** editor. Ordinary bends are hidden and cannot be selected or changed; label drag/nudge and bend/label reset/insertion paths are disabled. The label handle is aligned with the actually displayed automatic label rather than hidden saved `labelPosition`. Moving an anchor changes that anchor only; hidden bends and the raw saved label position survive, including Cancel and no-op actions. Enable saved geometry to edit ordinary bends or label placement.

- With saved geometry ON, bend handles and the inspector point selector refer to **original routePoints array indices**. Hidden and repeated vertices remain independently selectable. The renderer's clipped/deduplicated path is never copied back into the file.
- **Добавить после выбранной** arms one canvas click. Its snapped point is inserted after the selected original array index; **Перед первой точкой** inserts at the beginning. The selected position is explicit, not inferred from the clipped path. Inserting the first point stores only the chosen point, never an approximation of the automatic curve.
- Dragging a point changes only that point. Dragging a label writes its horizontal middle / vertical baseline anchor. A click or movement below the screen-pixel drag threshold does not materialize a previously automatic (`null`) label position.
- With a bend or label handle focused, arrow keys move that handle by 10 canvas units; Shift reduces the step to 1. Each accepted key movement is one undo step, including repeated keydown events. Ctrl/Meta/Alt combinations and text-entry controls are not geometry commands. A plain arrow during an unfinished drag or armed insertion only cancels that transient action; press again after cancellation to nudge. Focus stays on the edited raw-index handle after redraw. An explicit arrow movement can replace automatic (`null`) label placement; merely focusing it cannot. Existing points retain their untouched perpendicular coordinate exactly. A newly materialized automatic label snaps both anchor coordinates to the grid. Fully clamped arrows preserve exact data and redo history.
- Route reset removes bend records while retaining every anchor in relative order; label reset clears `labelPosition` to null. The core `resetConnectionLayout` command performs both together. A referenced anchor cannot be removed unless every dependent end is explicitly rebound to a valid same-concept endpoint in the same transaction. Already-reset actions do not create history entries.
- Pointer previews are disposable. Release commits one `updateConnectionLayout` command against the captured view, connection and revision; undo restores both original arrays and the exact nullable label. Other views and connections sharing the same relationship are unaffected.
- Coordinates use the inverse SVG screen transform, then the existing 0.1-unit grid and coordinate limits. There is no new zoom/pan implementation; transformed/fit canvases use the same conversion. Unavailable or singular transforms cannot authorize a geometry edit.
- Escape, cancelled/lost pointer capture, blur, resize, view changes, history navigation and file replacement discard unfinished pointer work. Layout edits participate in existing draft/navigation safeguards. A successful file load enables saved-route display when that model contains route points or label positions; the editing mode remains off.

Mermaid output does not carry these coordinates. Browser pointer/layout verification remains distinct from the automated event and roundtrip tests.


## Current local contours

The new silhouettes are application-owned interpretations of independent draft shape labels. Their proportions are not normative ArchiMate geometry. These contours use the single current catalogue.

- Octagon: eight edges; each corner cut is min(width/5, height/5, 12).
- Ellipse: analytic ellipse inscribed in the stored bounds, with analytic segment intersections.
- Folder: a six-vertex concave outline; the raised upper-left tab occupies 40% of width, and the body begins at 20% of height.
- Cloud: an original eight-lobed radial silhouette represented by 96 polygon vertices.
- Wavy rectangle: straight top/sides and a lower sinusoidal edge sampled in 48 equal-width segments; its baseline is 90% of height with amplitude 10%.

Polygon vertices are the actual painted SVG outline and the clipping geometry. There is no separately smoothed curve with a different hit boundary. New concave shapes use sorted segment intersections and interval containment, so an inside→outside→inside excursion is visible even when both segment endpoints are inside. Only the hidden endpoint prefix/suffix is removed; later crossings are preserved, without rewriting saved bendpoints. Automatic straight routes use the outermost filled ray exit, avoiding re-entry into a concave endpoint; stored routes retain their first-visible-exit interpretation. New shape-aware automatic self/overlap routes use exterior cardinal bridges. Rectangles, rounded rectangles and Box3D use their respective local contours. Fit includes the resulting route and label extents.

## Relationship markers · local visual@2

Line descriptors select solid, dashed or dotted rendering plus independent source/target markers. Source markers attach to the stored source; Read Access does not swap endpoint IDs. Original arrows/diamonds have a 10-unit length and 8-unit height, and the filled dot has a 6-unit diameter. Marker reference points are at the terminal tip/tangent, with user-space units and automatic start reversal. Rounded strokes and all rotations fit within 12 canvas units of the endpoint; existing Fit padding is at least 70 units. Marker geometry never rewrites connection endpoints, bendpoints or labels.

Dashed lines use a local 7/5 pattern and dotted lines a local 1/4 pattern with round caps. These numeric dimensions and spacing are implementation choices. Hollow markers use the canvas background; filled markers use themed link ink. Very short connections may show overlapping markers; they are not silently scaled or converted. Palette, Help legend and canvas use the same closed marker definitions with distinct scope IDs. The editor uses typed notation only; removing the neutral-mode selector does not remove the independent saved-route display checkbox or geometry-editing controls. Unknown-type fallback remains defensive.

## Multiplicity end labels

Relationship-end text is independent of the central relationship name and its saved labelPosition. Display positions are calculated from local rendered endpoint tangents, then shifted outward to clear their own node and endpoint marker bounds. No per-view positions are stored. Fit includes conservative text bounds and measured text bounds where available. Unrelated objects and other labels can still overlap. See [MULTIPLICITY.md](MULTIPLICITY.md) for raw-value preservation, display shortening and syntax boundaries.

## Stored host anchors

An anchor is `{ kind: 'anchor', id, point }` within its host connection's ordered
`routePoints`. Connection-kind ViewEndpoints name that host and anchor ID in the
same view. The exact stored coordinate is the attachment, so rendering never
recursively samples another connection's path. Self and mutually referring
drawings remain finite; model permission is a separate diagnostic question.

Anchor points remain visible route constraints in both route-display modes,
including repeated/co-located points with distinct IDs. Occluded anchor positions
are reported as geometry diagnostics, never silently removed or relocated.
Moving an occurrence leaves absolute anchor and label coordinates unchanged.
Connection creation may insert a snapped anchor and create the dependent model
relationship/drawing atomically. Cancelled, stale or invalid edits cannot leave
partial anchors behind.

The core offers insert/move/remove-anchor and rebind-endpoint commands. View
duplication remaps anchor/host IDs while preserving model references. Deleting a
host drawing removes its dependent drawings transitively rather than silently
choosing another drawing of the same relationship. Anchor reset/removal,
self/mutual attachment, hidden optional bends, fit, native reopen and interrupted
operations require focused numerical/DOM and separate browser acceptance.
