# Design

## Direction

Arkita's editor is a focused work tool. Optimize for scanability, model readability, consistent controls, and predictable actions during long sessions. Keep familiar desktop conventions and the existing product identity. Do not turn editor flows into promotional or decorative surfaces.

## Existing visual system

- Treat [`style.css`](style.css) as the source of truth for current visual tokens. Reuse its semantic properties, including `--surface`, `--canvas`, `--ink`, `--muted`, `--line`, `--focus`, `--primary`, `--danger`, `--warning-*`, `--tree-selected-*`, `--notation-*`, `--node-*`, and `--link`.
- The current stylesheet declares a light color scheme. Do not imply that an unimplemented theme or appearance is supported.
- Extend existing tokens only when a reusable semantic value is missing. Do not add a competing palette, one-off hard-coded colors, or a dependency for an isolated control.
- Prefer existing DOM controls and patterns for menus, panels, forms, and dialogs. Use the existing SVG canvas for diagram content; do not replace it with a parallel drawing surface for a small feature.

## Interaction and accessibility

- Make focus, selection, hover, disabled, warning, and error states distinguishable. Focus must remain visible; meaning must not rely on color alone.
- Keep pointer and keyboard routes usable. A drag-only action needs an existing or documented keyboard alternative; do not claim parity until it is verified.
- Give controls meaningful accessible names and preserve the label and explanatory text users need when a palette or panel is compact.
- Dialogs and transient flows must preserve text drafts and IME input, move focus predictably, and return it when closed.
- Show actionable failures in a visible status or error surface even when a status bar or side panel can be hidden.

## Model and canvas

- Keep semantic records, view occurrences, connection routing, labels, and visual-only drawings distinct. A visual edit must not silently create, delete, or rebind semantic data.
- Preserve stable IDs, cross-view references, route data, labels, and saved bytes outside the requested scope.
- For a canvas change, verify the rendered path and its relevant hit-testing or export path when those paths share geometry. Do not infer canvas behavior from a DOM-only assertion.

## Desktop constraints

Design for resizable Electron windows and the user's actual work area. Treat display removal, multi-monitor placement, DPI scaling, native dialogs, and installed-window behavior as platform questions. Renderer checks can establish renderer behavior; they do not establish installed Windows acceptance.

Do not advertise accessibility conformance, platform coverage, or format support beyond the evidence recorded for the exact change.
