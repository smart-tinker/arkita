# Local workspace preferences

Arkita keeps local settings in `arkita.preferences.v1`, through one service. Theme,
workspace and gesture controls are adapters to that service. Legacy theme/workspace/
gesture keys are read on initial migration. Preferences do not change an opened
model, its saved coordinates, Undo history or Git files.

The closed `arkita-preferences` version 1 JSON envelope and `arkita-colors` version 1
color envelope are limited to 64 KiB. Unknown fields, invalid values, duplicate JSON
keys and reserved/duplicate shortcuts are rejected. Older version 1 settings that
lack panel order or the view-label template receive their original defaults when
read. Desktop export uses the native external-file boundary; import stages a draft.
Apply commits local preferences, Cancel discards the draft, and Reset initially
changes only that draft. Storage failure is reported; current-window values may
still apply without a persistence guarantee.

Panel order offers the six permutations of catalog, canvas and palette. Widths,
visibility and an already detached palette determine the effective desktop grid.
Narrow layouts retain their panel tabs. Reset returns the original catalog/canvas/
palette order and retains the model and its selection.

Display defaults for font, colors, wrapping and derived borders are projections;
explicit saved drawing styles win. Creation defaults are different: the chosen
style and legend defaults become explicit values of a newly created drawing.
Existing drawings and loaded models are not rewritten.

New boards use the application theme unless a custom background default was saved.
In **Файл → Шаблоны и доски… → Canvas и эскизы**, choose **По теме приложения**
or **Свой цвет**. Saving this default changes only future boards. To clear an
existing view background, choose **По теме приложения → Изменить фон текущей доски**,
review the change and apply it. This model edit supports Undo/Redo; explicitly
saved colors, including white, otherwise keep their appearance in either theme.

Natural sorting and paged
catalogs affect presentation only. Search still covers the entire model; revealing
a result opens the containing folder and page. Non-lazy mode shows the full list.

The ordinary Paste shortcut follows the selected reuse/clone preference. The menu
shows that choice before insertion; explicit commands for reuse and independent
copies remain available. Portable cross-model input always presents its independent
clone preview and reference closure. Copy/Cut/Paste safety and per-window Undo are
described in [FRAGMENT-COPY](FRAGMENT-COPY.md).

Container resize has two modes: `retain` preserves descendants' absolute positions;
`offset` preserves their offsets when the parent's top-left corner changes. Nested
containers and internal routes/labels move together in the latter mode. A preview
never writes the live model; one accepted bounds edit is one Undo step. Locked
children refuse changes that would move their geometry. A preference change by
itself never moves a drawing.

View labels in usage tables accept only literal `${name}`, `${path}` and `${id}`
substitutions. Unknown, unfinished or empty expressions fall back to the saved view
name. Labels are text, never HTML or evaluated code. Folder path and exact IDs remain
available even if the optional name display is disabled.

Animation is optional presentation: at most 200 drawings and 500 ms, with reduced
motion respected. A new render or cancellation stops previous animation; geometry
attributes and stored model data already hold the final values. Graph animation
has a separate switch. Large views skip animation.

The preferences form exposes a setting only when its actual consumer is integrated.
DOM tests establish source behavior and model preservation; they do not establish
Windows layout, native fonts or physical pointer acceptance of a packaged artifact.
