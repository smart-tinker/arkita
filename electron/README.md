# Arkita desktop shell and native directories

The desktop Git service added for 0.5.0 is documented in [Git collaboration](../docs/GIT.md).
It uses an application-owned bare repository and the existing native codec,
independently of the native-directory recovery protocol below. Packaged Windows
builds use pinned MinGit from `resources/git`; development uses installed Git.
File I/O and Git I/O share busy exclusion and the native close guard. Renderer
networking remains disabled; only fixed, trusted-sender Git methods cross IPC.

Arkita is a standalone desktop application using Electron 44.10.2. `npm run desktop` starts the development shell; `npm run package:win` builds the Windows x64 per-user NSIS installer. No server or installed Node.js is needed by testers. See [Windows build and acceptance](../docs/WINDOWS.md). The separate Mermaid application is not packaged.

## File actions

Launching Arkita with one or more `.arkita` files opens only those documents, without an extra empty model. Repeated paths focus their existing window. A launch without files, or with no successfully opened file, leaves one new model available; invalid files are reported and interrupted-save recovery remains available before opening.

- **Файл → Открыть… / Сохранить как…** reads/writes the complete `.arkita` model file. Existing `.schemka.json` files remain readable; internal format IDs do not change.
- **Сохранить / Ctrl+S** writes the committed current file without another picker. A main-owned baseline retains the exact opened bytes, file identity and ancestor identities. File selection and Save As bind only after the renderer acknowledges its committed document; cancelled or stale operations never retarget the current file. Changed, replaced, missing, symlinked or multiply-linked targets refuse saving. Save As remains available for a separate copy. Failed writes never acknowledge success; post-write readback must exactly match the captured saved bytes. File paths stay main-owned for model reads/writes; recent-file summaries expose display paths. The explicit read-only `documentLocation(token)` returns only the current token-bound canonical path for model properties; normal save/recovery summaries retain path privacy. OS drop uses the isolated preload’s `webUtils.getPathForFile` result, never a generic filesystem method.
- Interrupted file writes leave a visible `arkita-recovery-<name hash>.json` beside the destination. **Открыть…** on the original model or this marker enters a main-owned recovery choice: retain the previous bytes, finish the intended bytes, or restore a uniquely captured external version when available. Opening the marker also works while the model filename is temporarily absent. Recovery is a disk operation; replacing the current editor document still requires its existing guarded load acknowledgment. The byte-preservation protocol also applies to SVG and Mermaid exports; restoring an export does not make it an Arkita model.
- **Открыть каталог…** reads the per-ID native layout, preserving source version separately from the model. Fully validated V2/V3 converts to V4 in memory and requires Save As to a new target; bound V2/V3 sources cannot be overwritten. See [Native V4](../docs/NATIVE-V4.md). Selection alone never changes the open model, history or writable binding. The existing guarded replacement must succeed before main acknowledges the directory binding.
- **Сохранить в новый каталог…** selects a parent and exclusively creates a new `schemka-*` child. The app reports its actual basename; it never overwrites an existing directory. An incomplete child is retained and cannot be reopened as a complete model.
- **Сохранить в открытый каталог** updates only the root bound to the current document. The expected raw disk snapshot must still match. New, envelope import and a different successfully loaded document detach the prior root. Cancelled/stale loads and late saves cannot retarget it.
- Recovery has two explicit choices: **Восстановить предыдущий снимок** or **Завершить новый снимок**. They operate on the named disk root only. They do not load that snapshot into the renderer, clear undo/redo, or mark newer in-memory edits clean.

Envelope and Mermaid **Save As** refuse native-owned destinations in the bound
directory, including header, model/view/viewpoint records, reserved markers and
new malformed native-shaped entries. Ordinary unowned notes and exports elsewhere
remain available. A rejected export leaves model bytes, dirty state and history
unchanged; it cannot be acknowledged as a successful native save.

Export protection compares both the selected spelling and canonical filesystem
paths, including available Windows 8.3 names and extended-path aliases. For a
new destination it resolves the existing parent and retains the new basename.
The writer receives the original picker path and checks its ancestors and file
identity before resolving the actual destination. It retains those original
ancestor checks through the operation, also guards the canonical parent, and
preserves the existing real basename. An opened file binds to that canonical
name, so its recovery marker does not depend on an available Windows short-name
alias. A disappeared bound root does not prevent rescue exports to an existing
separate directory. These portable checks still require real Windows alias QA.

The existing `exportFiles`/`importFiles` codec defines every model path and record. The same frozen V2/V3 validators and detached V4 conversion are used for files, directories and all Git comparison sides. The current writer is V4; legacy source versions require separate Save As and are never rewritten implicitly. No alternate Git representation, profile or ArchiMate rule is introduced. IDs, customization values, junctions, route anchors and raw multiplicity strings are preserved. Existing conformance/UNKNOWN qualifications remain unchanged.

## Filesystem boundaries

Main owns picker paths, filesystem observations, pending candidates and binding tokens. The isolated preload exposes fixed model/file/Git, document lifecycle, clipboard, palette, export/print, XML/font-worker and host-policy methods. External transport accepts a closed kind and bounded records, then uses native pickers and destination guards; caller-controlled arbitrary read/write paths are not accepted. No filesystem, shell, general IPC, caller-selected channel or renderer-supplied disk path is exposed. Monotonic main-state generations and binding IDs prevent late summaries or recovery replies from replacing a newer root status/baseline. Every method verifies the exact live top-level WebContents/frame/document. Native I/O shares the existing busy guard. The single normal Electron main process owns a document registry. Each model has its own BrowserWindow, renderer store/session/Undo, file service and Git service. Existing canonical path/inode targets focus their current window; other valid models open independent windows. Save/export cannot overwrite a model owned by another open window. `requestSingleInstanceLock` routes later launch arguments to the existing registry; it is not a filesystem lock and cannot exclude separate profiles, other programs or hostile processes. The `--cli` entry runs before GUI/single-instance setup.

The secure custom protocol still serves only in-memory bundled assets. Node integration remains off; context isolation, sandbox and web security remain on. Network/file navigation, subframes, popups and webviews remain blocked. Browser permissions allow only `clipboard-sanitized-write` and fullscreen from the exact live bundled top-level document; other documents, workers, subframes and unknown permissions remain denied. Separate fixed native clipboard methods validate portable fragments and bounded PNG bytes. Cut acknowledgments belong to the original window/document token and are one-shot; a changed source is preserved. There is no generic clipboard HTML, filesystem or shell API.

The native reader uses streaming directory enumeration with a 65,536-entry cap, four native path components, 8,192 model files, 256 KiB/file and 8 MiB raw total. It rejects malformed native-shaped names, casing aliases, symlinks/nonregular native entries, changing identities, malformed UTF-8/BOM/JSON and invalid complete models. It checks every relevant ancestor without following links. `.git` and unowned entries are not traversed or imported. Canonical namespaces are fixed; unrelated root entries and non-native entries such as notes directories remain unowned.

Fresh creation writes and syncs `.schemka-incomplete.json` before any model record. All records are created exclusively. Full bounded readback/import, exact raw hashes, canonical export comparison and final inventory checks precede removal of the original marker. Any reserved marker presence blocks ordinary open, regardless of its bytes/type/casing. Fresh Save As uses bounded case-insensitive marker scans at the selected parent and every ancestor before creating a child. Failure retains and quarantines the child and reports its main-owned location. Its separate incomplete warning offers saving the open model elsewhere, without restore-before/finish-after actions: fresh creation has no update journal. Retry uses another child; no rename-over-directory or recursive cleanup is used.

## Recoverable updates

An update performs one logical complete live preflight against the bound raw baseline, compares canonical before/intended exports to select actual changes, and performs one logical complete final validation. A logical read retains the existing per-file before/handle/after identity checks, repeated raw observation and ending inventory/ancestor check. An unchanged save creates no journal and rewrites no files. Untouched records retain their exact raw formatting.

An exclusive sibling `.schemka-transaction-<UUID>` uses explicit version 3 / `delta-update` journal metadata. Its bounded union inventory describes every baseline path and expected post-state using exact byte counts and SHA-256; equal descriptors denote untouched records. Only changed/deleted raw-before and changed/added canonical-after bytes are copied into `before/` and `after/`, using fixed `record-<index>.json` names. The journal is not a standalone model backup. It keeps a fixed `journal.json` and at most 128 metadata pages of 128 entries, each parsed under the existing strict 256 KiB limit. Metadata stays below 6.25 MiB and the transaction budget is 38.5 MiB, including at most one 256 KiB pending file and at most 16,384 displaced files / 16 MiB of captured bytes. Both complete inventories retain the 8,192-file / 8 MiB native limits. The journal protocol version is independent of the core/native model version; recovery does not authorize an in-place model migration.

All copied bytes and exact staging inventory are checked before installing the original recovery marker. The marker associates the root and transaction identities with that header hash. Unknown/duplicate fields, unsafe or incoherent paths/IDs, malformed versions/operations, hashes/lengths/absence states, duplicate entries, and extra/missing copies refuse before recovery writes. Untrusted native paths never select copy read locations: those are fixed indices. Both complete reconstructed sides pass the existing native importer before any recovery mutation. Previous version 2 delta journals remain readable; explicit recovery can add the bounded `pending/` and `displaced/` evidence directories without rewriting their immutable metadata. Older full-copy journal formats remain refused with all evidence retained.

If installing that marker fails before any model mutation, the writer attempts
to abort only its exclusively created marker: handle-owned identity, exact
current stamp, a single link, unchanged ancestors and bytes matching the intended
marker prefix must all verify. A successful abort leaves the original directory
reopenable and retryable; the original I/O error and complete journal are retained.
Unknown/replaced markers, an uncertain close or failed cleanup stay quarantined;
ordinary open never ignores a malformed marker. This does not remove the
documented single-writer last-check/unlink race or promise power-loss durability.

Each mutation first stages a complete file in the journal's `pending/` directory. A temporary hardlink probes the destination filesystem before any original is moved; unsupported hardlinks fail without a rename-overwrite fallback. The current target is compared with its captured identity and exact bytes, then the actual file is moved into a unique `displaced/record-<index>-<UUID>.json` slot. Its moved bytes are checked against the expected source. An external edit or replacement at that boundary is therefore retained, including an empty or malformed external file; it reports a conflict instead of success. A deleted record is kept in `displaced/` as well. Publication uses an exclusive hardlink from the staged file to the now-empty destination. If another writer creates the destination first, publication refuses and preserves that file. Recovery uses the same protocol.

Captured originals are retained throughout the write even when their initial bytes match the expected source: a previously opened external handle can still write to their inode after the move. A complete before copy remains separate. Marker, transaction, payload and ancestor checks remain. Earlier-written or untouched paths are checked by the final complete model verification, rather than a sweep before every later mutation. A conflict can therefore be discovered after other intended changes. Any observed divergence reports failure/recovery-required and retains evidence; it is never acknowledged as saved. Only the verified successful-save cleanup described below may remove duplicate evidence.

Restore-before and finish-after reconstruct the chosen complete target from unchanged live records plus the relevant delta copies. If an untouched baseline file has changed or disappeared, recovery refuses without overwriting it: the journal cannot reconstruct external damage to those uncopied records. Changed live paths must match a declared before/after/absence state; a missing replaced record is accepted only with captured evidence for that index. A live third state remains protected and refuses automatic recovery. Displaced external bytes remain raw evidence, never an implicit overwrite baseline or a silently imported model record. Exceeding a retained-evidence bound leaves the files for manual inspection and refuses further automatic mutation. The selected full result must validate and match the expected raw inventory and observed identities before original-marker removal. Native directory recovery does not modify the renderer model or history.

Marker-removal failure remains recovery-required. Once removal succeeds the disk result is complete at the verified boundary, even if the acknowledgment is lost. Detached delta copies and displaced files initially remain with a visible warning. Ordinary saves may then remove proven duplicates under the RC5 completion policy below; explicit recovery retains its journal. There is no background scan or global quota for retained old or uncertain transactions. Historical copies must not be deleted solely because their marker is absent.

Single-file writes use their own small version 1 / `file-update` manifest. A main-owned marker identifies the exact parent, transaction identity, target basename and manifest hash. Immutable `before.bin` (when a destination existed) and `after.bin` hold complete bytes; `pending/file.bin` holds the possible interrupted publication, and `displaced/file-<UUID>.bin` retains each actual moved file. Each file is bounded by 18 MiB; a transaction accepts at most 64 displaced entries totaling 72 MiB, plus its two snapshot files and one pending file. Unknown metadata, extra files, links, identity/hash mismatches or unrecognized live bytes stop recovery before a target mutation. A known partial pending write or the verified extra link from an interrupted probe/publication can be cleared only during explicit recovery. The uniquely captured external variant is offered separately from the previous and intended snapshots. The visible marker is removed before any optional successful-save cleanup. Explicit recovery retains its evidence. No-change saves create no transaction.

## Completed-save journal cleanup in RC5

Only a newly completed ordinary file save or native-directory update can expose
its main-only, single-use finalizer. The file service first accepts the verified
saved snapshot, then finalizes that exact transaction. It never scans previous
transactions or finalizes the explicit recovery path. Fresh native-directory
creation still has no update journal.

Before removing a journal, the finalizer rechecks the saved destination, absent
recovery marker, empty pending state, exact journal inventory, identities,
bytes, ancestors and single-link ownership of every file to be removed. Every
displaced file must match the original bytes. An overwritten version must also
have a complete independent backup whose bytes are read and verified again.
A native-directory backup is a canonical `.arkita` snapshot: all raw before-files
must match its canonical export byte-for-byte. Noncanonical JSON formatting
therefore keeps the directory journal. A fresh file Save As has no before-version
to back up; its after-copy can be removed once the live file is verified.

Cleanup unlinks only these known files and removes known empty directories;
it uses no recursive deletion. Disabled, missing or changed backups, unique
external bytes, unknown entries, altered identities or cleanup I/O failure
retain the remaining evidence and warning. A cleanup failure does not undo an
already completed save or report that save as failed. Existing, interrupted,
failed and explicit-recovery journals remain untouched. The user's bounded
backup history is separate and keeps its existing retention rules.

## Recovery, rescue and limitations

Root recovery/mismatch is separate from transient busy state and the ordinary exported-file dirty baseline. Once current I/O settles, editing, full envelope export and fresh Save As elsewhere remain usable. A rescue cannot write into a quarantined root/descendant, a known transaction sibling or a reserved `.git`/transaction boundary. Envelope and Mermaid exports also reject symlinked parents and multiply-linked destinations. They retain captured ancestor identities through staging, replacement and owned-temporary cleanup, so outside aliases cannot bypass quarantine or modify immutable recovery copies. Exporting elsewhere can make the generic session clean without hiding an unresolved root warning. A fresh Save As can bind the new root while retaining the old root's notice and evidence. Closing warns accurately; it does not claim recovery copies are lost or partially updated files are unchanged.

This provides detectable, recoverable process interruption, not atomic multi-file visibility or cross-platform power-loss durability. File sync failures are propagated. Directory fsync and hostile multiprocess exclusion are not promised. Native GUI/Windows behavior requires separate exact-package acceptance.

The supported contract remains one normal application writer and one file operation at a time. Do not change model files, their ancestors, markers or private transaction contents with Git or another editor DURING save or recovery. Moving the actual target into retained evidence closes the tested target-file clobber boundary of the previous check-then-rename/unlink writer; exclusive publication also preserves a new competing destination. This is bounded target-file evidence, not hostile multiprocess exclusion. Portable checks cannot prevent a last-instant ancestor/private-journal swap, tampering after the final verified observation, or a process deliberately deleting the retained evidence. An external handle can continue to change a retained inode. Successful-save cleanup relies on the documented single-writer contract: after verified duplicates are removed, a later write through an unrelated open handle is not preserved by that journal. The independent backup retains the verified previous bytes. No atomic multi-file visibility or race-free guarantee is made. The historical independent persistence HOLD remains open in the [1.0 readiness scope](../docs/RELEASE-1.0-READINESS.md). The bounded 0.7.0 single-writer release contract is assessed separately against exact-package evidence. This distinction does not dismiss new reproducible data-loss defects or close the historical gate.

Synthetic maximum-capacity tests exercise 8,192 files on both sides, 16,383 union paths, 16,382 changed paths, all 128 bounded pages, and raw inventories near the unchanged 8 MiB/side limit. Directory-rich and ordinary native-model benchmarks measure actual guard calls by recapturing each guard under its counting adapter and resetting counters at update start. Delta saves avoid copying unchanged records and repeated processed-path sweeps; actual displaced records are retained in addition to immutable delta copies until an eligible ordinary save completes its verified cleanup. Measured results are reported separately, without an overall linear-complexity or native responsiveness claim. Git uses a separate managed repository rather than changing these disk roots. The earlier detailed preservation evidence is not included in this public source snapshot; checks on a specific package remain separate from filesystem tests.

## Verification and remaining gates

`npm run test:desktop` exercises real temporary synthetic directories, injected native dialog/service boundaries, adversarial filesystem changes, journal corruption, interrupted recovery, actual child-process termination and maximum file capacity. `schemka-model-ui/test/file-actions.test.js` covers guarded loads, late saves, independent root mismatch and recovery/history preservation through injected adapters. `npm test` includes these plus the complete existing aggregate; `npm run check` checks source syntax.

The early native-persistence snapshot had no packaging acceptance and its local
Linux GUI route was blocked by an Xorg socket failure. Those historical results
do not describe acceptance of a later Windows package. Exact installer, payload,
clean-install, upgrade and GUI results belong to the owning release evidence;
Final 0.7.0 package verification and publication are not asserted here; its
changes from functional RC5 are version and documentation only. Node/DOM checks
are not GUI acceptance, and neither establishes power-loss durability. The
historical independent persistence gate for 1.0 remains open; local correction
checks and bounded 0.7.0 acceptance do not by themselves close that gate.

Official guidance remains [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc), [protocol](https://www.electronjs.org/docs/latest/api/protocol), and [native dialogs](https://www.electronjs.org/docs/latest/api/dialog). Electron is MIT-licensed; preserve runtime Chromium/third-party notices in any later authorized distribution.

## Viewpoints in native directories

The native scanner includes canonical `viewpoints/vpt-UUIDv4.json` records. Saves
use the complete project store, including hidden drawings and Chapter 14 data.
The conditional `schemka.json` codec marker `viewpointFormat: 1` guards any model
with definitions against older directory readers that ignored the namespace.
First/last definitions change the header through the existing delta journal and
both explicit recovery choices. Unsupported unguarded enhanced drafts fail import;
there is no conversion. See [viewpoint codec boundaries](../docs/VIEWPOINTS.md).

These historical local integration checks do not establish readiness of a later
package. Electron/native-dialog acceptance applies only to the exact tested package. Browser QA and filesystem tests do not replace desktop GUI acceptance or justify ignoring a newly reproduced defect.

## Additional document and output contracts in 0.6.0

The persistent local renderer partition retains UI settings without relaxing
network or frame permissions. Main and palette bounds are clamped to available
displays. A detached palette receives a bounded read-only DTO and dispatches
nonce/token/revision-scoped commands to its owner; it has no hidden model store.
Closing the owner closes its palette. Panel order and widths remain local UI state.

`documents.json` stores bounded MRU and previous-version backups under appData.
Backup is enabled by default for new settings; an existing saved opt-out remains
unchanged. Before replacing a valid file or native directory it retains 1–20
complete `.arkita` snapshots per source. File → Backups and recovery offers a
searchable list by source path and date. Restore creates a separate new `.arkita`
file, including for directory snapshots; existing files cannot be overwritten.
The open document, its history, binding and original source remain unchanged.
This is not timer autosave or the native interrupted-write recovery journal.
Opened view-tab order/selection is session UI state; closing a tab retains its view.

PDF/printing accepts validated inert SVG, closed paper/orientation/scale options
and the exact document token. A hidden print-only window has no preload, model
controller, JavaScript or network access. Shared print layout provides fit-to-page
at 100%, with 25–200% relative scale and explicit pages/tiles. PDF uses native
Save As and protects all opened models. Native output keeps the owner busy;
its dialog must complete or cancel before local export UI closes.

CLI, bounded external links, private Git proxy policy and credential management
are described in [AUTOMATION-AND-HOST](../docs/AUTOMATION-AND-HOST.md). Packaged
production dependencies and remaining native acceptance are recorded in
[Windows guide](../docs/WINDOWS.md) and the
[0.6.0 implementation ledger](../docs/feature-corpus/RELEASE-0.6.0.md).
