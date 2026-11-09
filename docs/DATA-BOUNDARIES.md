# Data boundaries and future landscape integration

Platform code and synthetic fixtures belong here. Real home service catalogs, personal systems, real model bindings and evidence belong in private data storage and are not included in this repository or build. The first catalog module supports explicit local import/export only.

The application repository and the user's model repository remain independent. Model files and their history belong to the user's model space, not to an application image or source release. Updating the application must not rewrite or migrate that repository; any future repository integration requires a separately approved, explicit data operation.

The separate landscape bootstrap currently describes a neutral synthetic graph (`schemaVersion: 0.1.0`, `classification: synthetic`, `semantics: schemka-neutral-draft`) in `manifest.json` with separate `model`, `views`, and `catalog` paths. It is not the same format as either a `.schemka.json` editor file or the rich home-catalog JSON. The platform does not claim those files are automatically interchangeable.

A future adapter must validate the manifest and each referenced file; resolve stable IDs; explicitly map supported node and relationship types; reject or preserve unknown constructs; keep factual/proposed status; and return a reviewable conversion report. Unresolved architecture bindings remain unresolved. Never infer a private infrastructure diagram from service names or publish private imported data into the synthetic landscape.

GitHub sync is disabled. `platform/contracts.ts` records interfaces only, with revision checks required for future writes. This phase creates no tokens, OAuth grants, repository permissions or background synchronization.


The editor accepts only its current native model contract. Other repository/staging formats require a future explicit adapter and are not silently converted. No historical projection runtime is bundled.
