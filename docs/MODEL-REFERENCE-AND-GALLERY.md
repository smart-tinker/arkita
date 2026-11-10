# Read-only model navigation and reference

“Where used” lists each exact drawing separately, including viewpoint-hidden
occurrences. Its visible folder path, view ID and drawing ID distinguish duplicate
names without hover. Folder labels are recomputed from current metadata; navigation
continues to use IDs. Stale source/revision/selection checks remain in place.

The view gallery opens from View. It filters the current model or a folder, with
an explicit descendant-folder option, labels every view by name, path and ID, and
supports keyboard selection. It renders 12 views per page and prepares their static
SVG thumbnails progressively. Changing thumbnail size changes only display.
The gallery invalidates cached previews after any model revision or replacement;
late/cancelled jobs and stale buttons cannot navigate the replacement document.
Its cache is bounded to 24 snapshots and 8 MiB, with a 2 MiB per-preview limit.
A failed or oversized preview is labeled; the exact view remains accessible.
Thumbnails use the same closed static SVG boundary as export, including embedded
resource validation. This is a view gallery, distinct from template previews.

The relationship reference opens from Help and permits selecting source category/
type, target category/type and relationship type. It calls the same built-in registry
and concept-relationship evaluator as creation; it contains no copied relationship
matrix. ALLOWED, FORBIDDEN and UNKNOWN are shown separately. Source-issued evidence
includes publication/hash, rule ID and exact locators when available. An unsupported
profile or unresolved query remains UNKNOWN. A permitted endpoint combination does
not establish legality of a particular graph or conformance of the whole model.

The quality check “Nesting: manual review” identifies every explicit occurrence-to-
occurrence parent pair, its concrete view and drawing IDs, and existing relationships
between the concepts. Existing relationships can be inspected through current
registry evidence. Bounds disagreement is stated separately. Decorative visual
containers never become semantic relationships or semantic nesting pairs.
These are read-only candidates for review: Arkita does not infer a missing relation,
guess ArchiMate containment legality or silently repair the model.

Focused source tests cover exact IDs, safe text, source evidence, folder filters,
paging/cache invalidation, stale/cancel behavior and unchanged native model bytes.
Packaged Windows GUI acceptance remains a separate release gate.
