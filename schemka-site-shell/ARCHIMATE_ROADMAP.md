# ArchiMate implementation plan

The active application uses one current catalogue: 42 element identifiers, eleven base relationships and four nominal UI variants. Everything is available immediately in a new or educational project.

Full ArchiMate 4 support is the acceptance goal for release 1.0. Current coverage remains partial, with whole-model conformance UNKNOWN. Removing the fixed banner does not close the documented source/implementation gaps.

Current priorities:
1. Complete and verify the standalone typed-only editor interface, including browser evidence and readable responsive layout. Keep the landing-to-editor entry, without cross-product or return navigation inside the editor.
2. Complete source-supported notation and semantic validation for the release goal; retain qualified diagnostics while source questions remain unresolved.
3. Extend the already implemented junction and typed-endpoint scope only after its source, data and validation contracts are checked; derivation, viewpoints and other uncovered language features remain work ahead.
4. Verify host-independent packaging and installation. Current route isolation does not yet provide a separate installer, authentication or persistence backend.
5. Keep optional catalogue bindings and repository synchronization separate from the editor’s core runtime; any future integration needs explicit IDs, conflict handling and appropriate private-data access controls.

See the current [coverage ledger](../docs/ARCHIMATE-COVERAGE.md), [source facts](../docs/NOTATION-SOURCES.md) and [validation report](../docs/VALIDATION.md). Catalogue membership alone is not full standard conformance.
