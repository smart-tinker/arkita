# Schemka current catalogue and assessment

Dependency-free ES modules for read-only assessment and closed presentation
adapters. One built-in descriptor, `CURRENT_PROFILE`, matches core's
`CURRENT_METAMODEL` (`schemka-archimate4@2`) and `CURRENT_CATALOG`: 42 element IDs
and 15 relationship IDs, with the separate AndJunction/OrJunction catalogue.
The relationship IDs are eleven base relationship names plus four
nominal variants, not fifteen normative relationship kinds. `rules` is empty.
Site 24 is the published placement-correction baseline: GitHub `86d8a55`, Sites source `cb9e34859989bebf6e36052f710779805337e1f0`, deployed on 2026-10-13 at 12:39:11 UTC with public access revision 2 unchanged. That baseline passed 1,055 tests, 145 syntax checks, the clean build, independent review and bounded placement browser QA. A separate historical 16,663-byte synthetic file passed byte-identical browser reopen/download; its exact live commit was not verified. The standalone typed-only editor increment is not deployed. Its post-review aggregate passed 1,067 tests with zero failures/skips, 145 syntax checks and a clean build; independent runtime and prepared-test correction review passed without findings. The prepared browser suite was migrated and statically checked, but not executed; real-browser acceptance of this UI remains NOT RUN. Full ArchiMate 4 support is the release 1.0 acceptance goal, not a current result; coverage remains partial and whole-model conformance remains UNKNOWN. See [VALIDATION.md](../docs/VALIDATION.md).
The code-owned endpoint check now includes all
1,764 ordered element pairs in the current catalogue. Its 26,460 reviewed
source/relationship/target triples have 26,452 settled decisions: 4,443 `ALLOWED`
with `permissionClass: 'direct'`, 2,935 `ALLOWED` with
`permissionClass: 'derived'`, and 19,074 `FORBIDDEN`. Eight exact triples remain
source-unresolved `UNKNOWN`. This is complete current-catalogue raw endpoint
matrix coverage, with bounded endpoint-type semantics. Overall normative
conformance always remains `UNKNOWN`. See the [verification status](../docs/VALIDATION.md).

## Source and scope

The descriptor selects names from the independent, unofficial Kalin Maldzhanski /
Linked.Archi ArchiMate 4.0 draft [ontology](https://meta.linked.archi/archimate4/onto/ontology.ttl)
and [notation](https://meta.linked.archi/archimate4/notation/archimate4-notation.ttl),
modified 2026-10-10 and retrieved 2026-10-12. The
[notice](https://meta.linked.archi/docs/TRADEMARKS/) declares
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Author, URLs and exact
SHA-256 hashes are pinned in [src/current.js](src/current.js) and the
[current source ledger](../docs/ELEMENT-SOURCES.json).
Changes are bounded name selection, local identifiers, original code/labels and
neutral adapters. No source definitions, icons, SHACL, hierarchy or derivation
code are imported. The separate bounded endpoint facts below are not attributed
to these independent sources or their CC BY declaration. Source hashes identify artifacts; they
are not normative authority or independent verification of upstream rights.
No endorsement, certification or conformance is claimed.

`ReadAccess`, `WriteAccess`, `ReadWriteAccess` and `DirectedAssociation` are
nominal type IDs. There is no `accessType` property or automatic endpoint swap.
`Access` is valid without a qualifier. Grouping and Location do not imply
nesting. UI-specific notation is separate from these primitive adapters.

## API

```js
import { CURRENT_METAMODEL } from '../schemka-model-core/src/index.js';
import {
  CURRENT_PROFILE, createRegistry, evaluateRelationship, assessProject,
  getPresentation, assessMultiplicity, getVerifiedRelationshipDecision,
  getVerifiedRelationshipCoverage, evaluateConceptRelationship, assessJunctions,
  getVerifiedConceptDecision, getVerifiedJunctionAssessment, getVerifiedJunctionIssue,
} from './src/index.js';
const registry = createRegistry([CURRENT_PROFILE]);
evaluateRelationship(registry, CURRENT_METAMODEL, {
  sourceType: 'Product', relationshipType: 'Association',
  targetType: 'DataObject', scope: 'direct',
});
// status: 'ALLOWED', permissionClass: 'direct', reason: 'verified-table-direct'
// ruleId and sourceEvidence identify the exact checked B.5 cell.
getPresentation(registry, CURRENT_METAMODEL, 'element', 'ApplicationComponent');
// KNOWN, plain label 'Application Component', box/neutral primitive
const coverage = getVerifiedRelationshipCoverage(registry, CURRENT_METAMODEL);
// { sourceTypeIds, targetTypeIds, relationshipTypeIds, excludedTypeIds: [],
//   verifiedPairCount: 1764, reviewedTripleCount: 26460,
//   verifiedTripleCount: 26452, sourceUnresolvedTripleCount: 8,
//   unknownTripleCount: 8, totalTripleCount: 26460 }
const report = assessProject(validCoreState, registry);
// { profile, localStatus, counts: { ALLOWED, FORBIDDEN, UNKNOWN },
//   verifiedDirect, verifiedDerived, verifiedConcept, junctionAssessment,
//   relationships: [{ relationshipId, status, permissionClass, reason, ruleId, sourceEvidence }],
//   normative: { status: 'UNKNOWN', reason: 'overall-conformance-not-assessed' } }
```

`PROFILE_LIMITS` and `ProfileError` are also exported. `createRegistry` takes an
explicit array of trusted built-in descriptors, copies/deep-freezes them and
returns a frozen handle with `get({ id, version })` and `list()`. Exact identity
and numeric version are required; there is no fallback or mutation API.
The registry cannot widen core's persisted catalogue. Uploaded/remote descriptors
must not be passed to this API. There is no dynamic loader, plugin execution,
network request, profile importer or executable renderer in a descriptor.

`evaluateRelationship` returns a frozen
`{ status, permissionClass, reason, ruleId, sourceEvidence }`.
Malformed queries, missing profile/type/rule, unsupported scope and unverified
evidence remain `UNKNOWN`. The descriptor mechanism can represent explicit
trusted local `ALLOWED`/`FORBIDDEN` rules for exact direct triples; the shipped
current descriptor contains none. Its code-owned endpoint-type lookup is
separate from descriptor rule data. Artificial local rules used to test the
mechanism have `permissionClass: null` and `sourceEvidence: null`; their local
`ALLOWED` does not claim source-backed permission. No inheritance, wildcard,
reverse, transitive, nesting or general graph-derivation inference is implemented.
Bounded junction reachability checks are a separate API below. `UNKNOWN` is
not permission.

`assessProject` first performs authoritative core structural validation, then
assesses each relationship once regardless of its number of drawings. Counts
are relationship counts, not a conformance or catalogue completeness score.
`verifiedDirect` and `verifiedDerived` count source-backed allowances in each
table permission class, respectively. `verifiedConcept` counts allowed
source-backed concept-rule results, whose `permissionClass` is null. The separate
`junctionAssessment` reports PASS/FAIL/UNKNOWN and coverage of bounded junction
checks. `localStatus` does not incorporate it or certify the complete graph.
`localStatus` aggregates relationship results, prioritizing `FORBIDDEN`, then
`UNKNOWN`, then `ALLOWED`; it is not a whole-model conformance verdict.
The frozen report never changes IDs, views, files, store revision or history.
Descriptive metadata cannot authorize normative conformance.

`getPresentation` accepts `element`, `junction` or `relationship`. Known IDs use closed
application-owned `box`/`circle`/`open-arrow` adapters and a `neutral` token. Unknown
references/types receive the same safe primitive with `UNKNOWN`, an `unknown`
token and a plain fallback label. No SVG/path, HTML, CSS, image URL or callback
is accepted. Renderability does not establish semantic permission. Labels must
be rendered as text.

## Verified endpoint-type block

The independently checked, owner-provided C260 artifact has SHA-256
`a29ef66a0771d7a45a1f5bf667d2c88fde1844c23ea88fbd56e4e9b0f844b093`.
Bounded technical facts are implemented in
[src/endpoint-permissions.js](src/endpoint-permissions.js) and recorded in the
[endpoint source ledger](../docs/ENDPOINT-RULES.json). All 42 catalogue element
types are included in both endpoint positions. The 1,764 ordered B.5 cells cover
all 15 relationship IDs, with source columns and target rows. Two independent
readings of the 320 added cells were reconciled against the source; the original
1,444 cells are retained. Raw reconciliation and the eight-triple semantic
qualification are separate:

- Table B.5 source pages: Motivation, printed 140 / PDF 158 (378 cells);
  Strategy, 141 / 159 (168); Common, 142 / 160 (378); Business and Application,
  143 / 161 (294); Technology, 144 / 162 (420); Implementation and Migration,
  145 / 163 (126)
- Legend: printed page 139 / PDF page 157; uppercase permissions are direct,
  lowercase permissions derived; ten letters cover eleven base families because
  Aggregation and Composition share G/g
- Composition mapping: section 5.1.2, printed page 31 / PDF page 49; the shared
  G/g mapping here applies only to the implemented element-to-element endpoints
- Access variants: section 5.2.2, printed page 38 / PDF page 56; `ReadAccess`
  and the other variants retain stored model source/target orientation
- Association variants: section 5.2.4, printed page 40 / PDF page 58; O is
  explicitly present in every selected cell and covers both nominal IDs
- User-asserted derived permissions: section 5.8, printed pages 49–50 / PDF
  pages 67–68; a supporting intermediate chain is not required by this check

A missing family letter yields `FORBIDDEN` within the checked matrix except for
these eight qualified triples: `{Product, Plateau}` × `{Deliverable, WorkPackage}`
× `{Aggregation, Composition}`, preserving source-to-target order. Their B.5
cells lack G/g. The generic composite wording in §12.4 (printed 104 / PDF 122)
and the specific Product/Plateau qualification in B.4 (printed 139 / PDF 157)
leave the exact scope unresolved. The result is `UNKNOWN` with reason
`source-scope-unresolved`, not a claim that the standard contradicts itself.
Other families in those same cells retain their checked decisions.

Resolve a qualified triple only through authoritative source evidence: an official
clarification, applicable erratum or verified updated specification explicitly
settling Product/Plateau aggregation eligibility for that exact target. Then
independently review and record its publication, hash and locators before
changing only the affected decisions and tests. A guessed
precedence rule or generic wording alone cannot settle it. Raw letters and
coordinates must remain faithful to the inspected artifact.

B.4 (printed 137–139 / PDF 155–157) restricts applying derivation rules; it cannot
be used as a blanket filter over direct metamodel permissions. B.6 (printed 146 /
PDF 164) includes its element-to-element additions in B.5. Product/Plateau to
Grouping aggregation/composition is supported by B.5 lowercase g and B.6.
Plateau to Goal, Outcome and Requirement is supported by §12.4 Figure 12-6
(printed 104 / PDF 122) and B.5 uppercase G. These cases are settled independently
of the narrow unresolved scope above. Grouping and Location permissions do not
require inferred members or a constituent chain for this endpoint-type check.

The original three-type Access subset remains eight derived allowances and 28
forbidden cases. Preserving all 735 seven-type decisions and all 21,660 previous
38-type decisions and evidence is a regression requirement, not a second runtime
profile. Endpoint permission does not validate individual instances, group
membership, cycles, self-relations, containment or lifecycle behavior. Relationship
and junction endpoints now have the separately bounded scope below. General
graph derivation, viewpoints and standards-based interchange remain separate work. The repo records the complete current-catalogue
raw B.5 element matrix, but no PDF prose, images, document or normative artwork.
The independent-source CC BY declaration does not apply to this C260 artifact.

Each deeply frozen `sourceEvidence` record has:

- `id: 'archimate4-endpoint-types-b5'`, `publication: 'C260'`, and exact `sha256`
- `matrix: { section: 'B.5', printedPage, pdfPage }` for the specific source column
- `cell: { sourceType, relationshipType, targetType, letters, relationshipLetter,
  matchedLetter, classification }`; `letters` preserves the selected cell's
  exact case, `relationshipLetter` is the lowercase family code, `matchedLetter`
  is the exact matched character or null, and `classification` is `direct`,
  `derived` or `not-listed`
- `legend: { printedPage: 139, pdfPage: 157 }`
- `family`: `{ baseRelationship, section, printedPage, pdfPage }` for Access,
  Association (including their variants) and Composition, using the locators
  above; null for other families
- `derivedAssertion: { section: '5.8', printedPages: [49, 50], pdfPages: [67, 68] }`
  for derived allowances only; null otherwise
- Only source-unresolved results add `qualification`, carrying the scoped issue,
  §12.4/B.4 locators and the evidence required for resolution. Their raw cell
  classification remains `not-listed`; this does not turn the decision into
  `FORBIDDEN`.

Verified reasons are `verified-table-direct`, `verified-table-derived` and
`verified-table-forbidden`; rule IDs are
`am4-b5-${sourceType}-${relationshipType}-${targetType}`. Forbidden results have
null `permissionClass`. The eight source-unresolved `UNKNOWN` results retain
their checked cell evidence and qualification, with null `permissionClass`.
Generic unknown and ordinary local results have null `sourceEvidence` and
`permissionClass`. No model field can assert either output.

**Identity trust boundary:** `createRegistry([CURRENT_PROFILE])` authorizes the
bounded lookup only when it receives that exact original deeply frozen module
object. A private registry entry holds this fact. An equal clone, stolen ID,
metadata claim, custom local rule, forged registry, serialized marker or copied
`registry.list()` / `registry.get()` descriptor cannot activate the source-backed
lookup. Re-register the original `CURRENT_PROFILE` explicitly when creating a
new trusted registry. Query/reference validation and type-kind checks run before
any matrix lookup.

`getVerifiedRelationshipDecision(value)` recognizes source-backed results using
a private WeakMap. A genuine evaluator result returns itself; a genuine
`assessProject` relationship row returns its original evaluator result, without
`relationshipId`. Genuine source-unresolved `UNKNOWN` decisions are also
recognized, proving the evidence and unresolved disposition rather than a
permission. Generic unknown/local results, clones, JSON copies, forged objects,
proxies and primitives return null. Copying a qualified result cannot confer its
identity-backed source status; untrusted copies receive only generic UNKNOWN
presentation. The helper reads no input fields and invokes no getters. A returned
proof is deeply frozen and recognized by the helper again.
The identity marker is never exported or persisted. Consumers should use this
helper rather than treating structurally matching evidence as verified.

`getVerifiedRelationshipCoverage(registry, profileReference)` uses the same
original-profile registry authority and strict reference guards. It returns null
for missing/unverified entries or invalid references; a forged registry raises
`PROFILE_REGISTRY`. Pass the exact `{ id, version }` reference, not the full
descriptor. The deeply frozen result has `sourceTypeIds`, `targetTypeIds`,
`relationshipTypeIds` and `excludedTypeIds` arrays in current catalogue order,
plus `verifiedPairCount`, `reviewedTripleCount`, `verifiedTripleCount`,
`sourceUnresolvedTripleCount`, `unknownTripleCount` and `totalTripleCount`.
`verifiedPairCount: 1764` counts raw checked cells; `reviewedTripleCount: 26460`
counts their supported-family triples. `verifiedTripleCount: 26452` counts settled
decisions after subtracting the eight source-unresolved triples.
`sourceUnresolvedTripleCount: 8` and `unknownTripleCount: 8` are equal in this
complete current-catalogue matrix, and `excludedTypeIds` is empty. Counts come
from actual checked entries and qualified dispositions, not an assumed square
of listed types. The closed catalogue supplies the total universe.
Descriptive metadata and uploaded files cannot change the summary.
It describes implemented endpoint coverage, not model conformance or inferred
relationships, and lets consumers show scope without evaluating every triple.

`scope: 'direct'` means a query about an explicit stored relationship, whether
or not a view draws it. It does **not** mean the table's permission is direct.
A verified result can therefore have query scope `direct` and permission class
`derived`. Querying `scope: 'derived'` remains unsupported; this API is not a
path derivation engine. Diagnostics do not create, delete, reverse or modify
relationships and do not make structurally valid forbidden/unknown data unsavable.
The native file remains authoritative; Mermaid projections do not carry these
assessment results or establish source-backed semantics.

## Concept permissions and bounded junction graphs

The ordinary-element lookup above is unchanged. `evaluateConceptRelationship`
uses exact queries of this form:

```js
const decision = evaluateConceptRelationship(registry, CURRENT_METAMODEL, {
  source: { kind: 'element', type: 'Grouping' },
  relationshipType: 'Aggregation',
  target: { kind: 'relationship', type: 'Flow' },
  scope: 'direct',
});
const graph = assessJunctions(validCoreState, registry, { workLimit: 50000 });
```

Each endpoint kind is `element`, `junction` or `relationship`; types must belong
to their separate current catalogues. Ordinary element pairs delegate to
`evaluateRelationship`, retaining B.5 evidence and counts. Other source-backed
results have `sourceEvidence.basis: 'concept-rule'` and null `permissionClass`.
B.6 evidence `cell.letters` contains normalized family-code sets, not direct or
derived table-case semantics. A referenced relationship's own type does not
change the generic Relationship category in the source clauses.

[CONCEPT-ENDPOINTS.json](../docs/CONCEPT-ENDPOINTS.json) records exact evidence,
source-qualified UNKNOWNs and independently reviewed oracle hashes. That oracle
is bounded; its nine selected positive ordinary-element/junction port witnesses
do not establish exhaustive independent port coverage:

- Association/DirectedAssociation between any element and relationship in either
  orientation; Grouping/Location/Plateau to a relationship by Aggregation or
  Composition. Product and reverse-direction controls do not inherit that case.
- Two relationship endpoints on one relationship are FORBIDDEN for every family,
  including Association. Structurally storing such a draft is not permission.
- Association in either relationship/junction orientation. The eight positive
  junction transit families are Access, Flow, Assignment, Influence, Association,
  Realization, Triggering and Serving. Element ports use the oriented B.6
  possible-source/possible-target conditions and the Grouping-source exception.
- Specialization at junction endpoints is FORBIDDEN in this checked scope.
  Aggregation/Composition at ANY junction endpoint, including a relationship at
  the other end, is `source-scope-unresolved` UNKNOWN. This is separate from the
  exact eight ordinary-element B.5 UNKNOWNs. Raw table omission and qualified
  source uncertainty must not be collapsed into the same negative disposition.

`assessJunctions(state, registry, options = {})` validates core structure first.
Its frozen report has `{ status, complete, reason, issues, work, normative }`.
Status is PASS, FAIL or UNKNOWN for the bounded checked scopes. `work` exposes
`limit`, `visitedStates`, `evaluatedPairs` and `pendingStates`; pending states are
not an exact count of unexplored terminal pairs. The default local work limit
is 50,000 and the maximum accepted option is 500,000. These are analysis budgets,
not normative model constraints. Exhaustion yields incomplete coverage and
UNKNOWN diagnostics; an established FAIL still takes precedence.

Checks include local endpoint permission; at least two distinct transit IDs,
at least one incoming and outgoing role; same base family; every reachable
terminal-concept pair along same-family junction paths; explicit container-role
applicability; and junction-end multiplicity applicability. Derived B.5 terminal
allowances are accepted. A relationship terminal is never expanded into its own
endpoints. Multiple paths are deduplicated without discarding terminal sources
or uncovered junction regions. Repeated drawings do not affect model counts.

Explicit `junctionRole: 'container'` on Aggregation from Grouping/Location/Plateau
to a junction excludes that edge from degree, same-family checks and traversal.
Its endpoint permission still remains source-scope UNKNOWN. Unmarked aggregation
is transit; a false role does not bypass checks. Composition's exception
applicability remains UNKNOWN. Access variants share Access and DirectedAssociation
shares Association, while mixed qualifiers retain a separate UNKNOWN. Mixed
Aggregation/Composition compatibility also remains UNKNOWN; a shared g code does
not establish common junction-family semantics.

Cycle-safe traversal does not impose a DAG or self-link ban. Terminal-less or
uncovered regions are UNKNOWN rather than vacuously passing; cyclic components
retain an unassessed cycle scope even with witnessed terminal pairs. No unique
owner, single specialization parent, three-edge minimum, execution semantics or
instance-cardinality rule is added. Whole-model `normative.status` stays UNKNOWN,
including when every bounded issue is PASS.

`getVerifiedConceptDecision`, `getVerifiedJunctionAssessment` and
`getVerifiedJunctionIssue` recognize original code-produced results via private
object identity. Project relationship rows map back to their original concept
results. Copies, JSON, forged registry/descriptors, getters and proxies cannot
gain authority, and recognizers inspect no caller fields. Ordinary B.5 results
continue to use `getVerifiedRelationshipDecision`; matching a concept result's
shape does not make it a B.5 result. Diagnostic output is neither persisted nor
used to mutate state, history, geometry or raw annotations.

## Raw multiplicity diagnostics

Core stores optional `sourceMultiplicity` and `targetMultiplicity` strings;
this module never edits them or rejects files for their semantic contents.
`assessMultiplicity(raw, defined = raw !== undefined)` returns frozen
`{ status, reason, sourceEvidence }`, never a persisted field or whole-model
conformance verdict. `defined: false` means absent regardless of the first
argument. There is no implicit default. All exact strings, including empty,
whitespace and invalid-looking numeric text, are valid storage within the local
128 UTF-16-unit input bound.

- `ABSENT`: missing value, `not-specified`
- `CONFIRMED_SYNTAX`: canonical positive integer, `*`, `0..*`, `1..*`, or
  canonical nonnegative bounded range `n..m` with `m > n`
- `UNVERIFIED`: standalone `0`, empty/arbitrary text, other `n..*` spellings
  such as `2..*`, leading zeros, whitespace, plus signs and Unicode digits
- `INVALID_SYNTAX`: recognized negative/fractional numeric forms or descending
  and equal bounded ranges; raw text remains storable

Large integer/range comparisons use `BigInt`, avoiding Number precision loss.
There is no trimming, normalization, instance-count validation or graph mutation.
The separate junction report diagnoses any present multiplicity field at a
junction-attached end, including empty text, without deleting it. The opposite
end is not excluded by that clause; raw-text syntax stays independent.
Other `n..*` values are local generalizations with reason
`local-unbounded-generalization`, not global standard prohibitions. Standalone
zero is `zero-singleton-not-established`. Unverified numeric spellings use
`unverified-numeric-spelling`. Non-string helper inputs and over-bound text yield
`UNVERIFIED` diagnostics (`non-string-input`, `local-input-limit`); core enforces
those structural bounds independently.

Bounded source evidence is identified by `archimate4-section-5.6-p47-pdf65`;
the confirmed `1..*` example by `archimate4-example-5-16-p48-pdf66`. Unknown
forms have null evidence. See [multiplicity evidence](../docs/MULTIPLICITY.md).
No source prose or graphics are copied by this helper.

## Defensive contract

Descriptors reject functions, symbols, getters without invoking them, hidden
properties, unsafe keys, nonplain prototypes, cycles, sparse/extended arrays,
nonfinite numbers, negative zero, unknown/missing fields, duplicate IDs/triples,
and wrongly kinded/dangling references. This is not a sandbox for hostile Proxies
or a compromised runtime. Accepted records are detached and deeply frozen.

Limits: 32 explicit registry descriptors, 256 types per kind, 4,096 rules per
descriptor, 1 MiB serialized UTF-8 per descriptor, 4 MiB per registry, depth 12,
50,000 data nodes, 16 own fields per record, 2,048 UTF-16 units per string,
96 per identifier, 160 per label, versions 1–1,000,000. These are safety budgets,
not promises to accept additional persisted project identities.

Run `npm test`, `npm run check`, `npm run coverage` in this package; the root
aggregate uses `npm test`, `npm run check` and `npm run build`. The historical
v2 pre-publication checkpoint on 2026-10-13 at 08:56 UTC passed automated checks
and independent review, while its local-preview route was blocked. That dated
blocker is not the current publication status: Site 24 subsequently passed
bounded placement browser QA. The current standalone typed-only increment
passed its 1,067-test post-review aggregate, 145 syntax checks, clean build and
independent runtime/prepared-test correction review. Its prepared browser suite
was migrated and statically checked but not executed; real-browser acceptance
of the new UI remains NOT RUN. See [VALIDATION.md](../docs/VALIDATION.md).

The retained ordinary-element regression gate checks all 26,460 triples individually and in bounded
project batches under core's unchanged 2,048-file budget, with exact totals
4,443 allowed/direct, 2,935 allowed/derived, 19,074 forbidden and eight
source-unresolved unknown. The unified 1,764-cell transcription fixture
checks exact letters, per-cell provenance and orientation across all 15 IDs.
The retained test-only 49-cell oracle protects all 735 seven-type decisions;
a hash regression pins the old 21,660 decisions and evidence without adding a
legacy 38-type fixture or another active profile.

Automated coverage includes the original 36 Access cases, genuine and forged
unresolved evidence, identity guards, frozen data, chain-free explicit assertions,
and unchanged native/Mermaid bytes, layouts, multiplicities, endpoint orientation
and undo/redo after assessment. Representative composite cases preserve the
eight-case boundary without changing other relationship families or claiming
instance semantics. The current 630-edge native-file regression covers all 42
reviewed endpoint types, with multiple views and every relationship identifier.
A separate native-file regression preserves all eight qualified UNKNOWN cases.
These automated checks are separate from browser acceptance.

## Internal creation assessment

The core store calls `assessRelationshipCreation` only after structural validation,
with an inert candidate and its private genuine-CURRENT_PROFILE registry. This
export is an internal command seam, not a public diagnostic API for arbitrary
caller input. Unlike `assessProject`/`assessJunctions`, it does not repeat validation.
Its null result means only that no scoped blocker was proved, never ALLOWED.

The endpoint evaluator is reused without new source rules. The same bounded
junction traversal has an internal focused-edge mode: queue and visited state
retain whether the new edge was traversed; terminal pair deduplication retains a
focused witness. Default reports are unchanged. Only definite incompatible
family membership involving the new edge and the explicit attributable
role/multiplicity/terminal checks can block. An unresolved Composition container
does not inherit unrelated definite-family failures. The explicit container
role is the editor's local intent convention, not a source-required field.

The command uses the fixed 50,000 work budget, never a caller-supplied option.
A found focused FORBIDDEN proof blocks even if analysis exhausts later. No proof
plus incomplete analysis remains UNKNOWN. Minimum degree, cycle scope, mixed
qualifiers, uncertain coverage and unrelated imported failures are diagnostic,
not blanket creation prohibitions. Imports/save/reuse/history and existing
role/multiplicity updates retain their prior scope. Whole-model conformance is
still UNKNOWN.
