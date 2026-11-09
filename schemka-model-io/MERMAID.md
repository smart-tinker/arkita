# Selected-view Mermaid projection

`exportMermaid(state, viewId, options = {})` is pure, synchronous and one-way.
It validates the entire current project before projecting a selected view into
a standalone ASCII Mermaid flowchart. It never renders, changes the model,
reads/writes storage or fetches resources. No Mermaid import is implemented.

The only option is `direction`, exactly `LR` (default), `RL`, `TB` or `BT`.
Unknown fields/values, nonplain objects, hidden/symbol properties and accessors
are rejected without coercion or getter execution.

## Included data and identity

The selected view must contain only element occurrences and occurrence-kind
connection endpoints. Any junction occurrence or connection-kind endpoint throws
`MERMAID_UNSUPPORTED`, directing the caller to native Schemka for exact data.
Unsupported records are never silently flattened or skipped. Junctions or typed
relationship endpoints elsewhere in an otherwise valid project do not prevent
export of an ordinary element-only selected view.

Each supported drawn occurrence becomes a rectangle with stable `n_` plus its full UUID
without hyphens. Repeated drawings of one element stay distinct. Only explicitly
drawn connections become arrows; parallel edges and self-edges are preserved.
All 42 element types use `TypeID: name`; all 15 relationship IDs use
`TypeID: label`, even when a name/label is empty. These IDs represent eleven
base relationship names and four nominal variants. All arrows use `-->` and
retain model source/target order. There are no inferred endpoints, nesting,
subgraphs, `accessType` properties or semantic permissions.

Nodes and connections are independently sorted by IDs using code-unit ordering.
Array ordering, geometry and z-order do not affect output. One final LF is
included. After the flowchart declaration every output, including an empty
view, has this fixed disclosure:

```text
%% relationship semantics UNKNOWN; not normative notation
```

Present raw end values on drawn relationships become a label suffix, for example
`[source multiplicity=""; target multiplicity="*"]`. Each value is first
represented as a JSON string, so empty values, literal quotes and escape
sequences remain visibly explicit. Omitted ends have no annotation. These labels
are an approximation and are not positioned at diagram endpoints. If any drawn
relationship has either end field, one additional fixed disclosure is emitted:

```text
%% multiplicities are text annotations only; use native Schemka for exact data
```

The profiles package's bounded endpoint-type assessments are separate;
this projection does not embed their status, permission class or source evidence.
Its fixed disclosure therefore describes the projection, not the coverage of
that separate evaluator. Native model bytes are unchanged by assessment.

Both type prefixes and all label/annotation text use the same safe encoder.
No project/view names, documentation, properties, unshown elements, undrawn
relationships or their multiplicities are included as comments or metadata.
An invalid record anywhere in the model still prevents export.

## Encoding and intentional information loss

ASCII letters, digits, `_`, `-`, `.` remain literal. Other resulting characters
use Mermaid's decimal entity syntax, such as `#34;` for a quote. No raw quotes,
whitespace, Unicode, HTML, directive delimiters or Markdown become executable
flowchart syntax. Literal input such as `#60;` remains label data.

Before encoding, six visible substitutions are applied: `<` → `＜`, `>` → `＞`,
`&` → `＆`, backtick → `｀`, `$` → `＄`, `:` → `：`. These prevent decoded text
from introducing HTML/entity delimiters, Markdown, math, icon abbreviations or
active URL schemes. The substitutions are intentionally irreversible.
Tab, LF, CR, NEL, U+2028 and U+2029 become spaces; CRLF becomes one space.
Significant spaces are not trimmed or collapsed. Other C0/C1 controls, unpaired
UTF-16 surrogates, Unicode noncharacters and bidi formatting characters
U+061C, U+200E–200F, U+202A–202E, U+2066–206F become U+FFFD. Ordinary Unicode,
valid astral pairs, combining sequences and zero-width joiners retain their text.
Multiplicity's JSON string representation occurs before this label encoding.

This projection loses model IDs/sharing semantics, model/view metadata, bounds,
coordinate positions, z-order, routePoints (bends/anchors) and label positions. Mermaid computes
its own layout; duplicate edges may overlap visually. Type prefixes are text,
not normative symbols or relation validation. Exact raw multiplicity recovery
is guaranteed by the native Schemka file, not by Mermaid text or a rendered image.
No icons, URLs, click actions, callbacks, configuration, styles or source graphics
are emitted. A receiving renderer should use supported Mermaid in strict mode,
preferably with `htmlLabels: false`. This exporter is not a universal sanitizer
for arbitrary Mermaid input or compromised page code.

## Limits and errors

Frozen `MERMAID_LIMITS`: 256 occurrences, 256 drawn connections, 48,000 ASCII
output bytes. Counts apply only to the selected view. Byte accounting includes
type prefixes, disclosures, annotations and decimal-entity expansion. Each
fragment is checked before appending; exceeding a limit throws rather than
silently truncating output. These limits cannot be overridden through options.
Core's separate project/string limits still apply.

Core validation errors propagate. Additional `SchemkaError` codes:
`MERMAID_VIEW` for a missing selected view, `MERMAID_OPTION` for invalid options,
`MERMAID_LIMIT` for projection budgets, and `MERMAID_UNSUPPORTED` for selected-view
junctions or connection-kind endpoints. Failure never changes state or history.

## Verification boundary

Tests cover stable IDs, repeated/self/parallel edges, selected-view isolation,
current type prefixes, all BMP code units, deterministic fuzz, hostile Mermaid /
HTML / entity / directive / link text, raw multiplicity annotations, Unicode
substitutions, immutable input and exact budget boundaries.

The optional generated-flowchart grammar harness uses an existing Mermaid Tiny
12.1.0 bundle pinned to SHA-256
`143c1b9345c45963ff429da4bdcd9051316a43522ea9edd7ccb7a87ff947a804`.
It checks official preprocessing for the fixed comments and captures grammar
actions for current typed and adversarial captions without DOM. It does not
claim DOM sanitization, rendering, browser or cross-version compatibility.

## Customization boundary

Any profile application on a concept actually drawn in the selected view rejects with `MERMAID_UNSUPPORTED` and native-file guidance. This includes metadata-only profiles and empty override records. Unused definitions and applications solely outside the selected view preserve its earlier bytes and do not appear in comments. Native save preserves the whole enhanced model. See [CUSTOMIZATION.md](../docs/CUSTOMIZATION.md).
