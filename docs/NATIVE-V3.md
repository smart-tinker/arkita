# Native v3: metadata and safe v2 opening

Arkita writes `schemka-project` **formatVersion 3**. The ArchiMate catalogue stays
`schemka-archimate4@2`; the `.arkita` / `.schemka.json` file envelope remains
`schemka-project-file@1`. These are three separate identities. The accepted
[metadata contract](METADATA-CONTRACT.md) is implemented by issue #40.

## Owners and editing

Project, element, junction, relationship and view records each own required
`documentation: string` and `properties: Record<string, string>`. Existing
`name` fields stay unchanged; relationships continue to use `label`.
Occurrences, connections and anchors acquire no metadata fields.

Use **Модель → Свойства модели…** or **Модель → Свойства представления…** for
the corresponding owner. The ordinary concept inspector also edits shared
relationship documentation. Changes use the owner's kind and exact ID; an
element or relationship shown in several views has one shared document.

The documentation and property dialogs preserve unchanged or reverted raw
text even when the browser textarea normalizes CR/CRLF for display. Empty and
whitespace-only property keys already present in native input remain intact
while other fields change. Creating or renaming a key requires a nonblank
name. Removing a row is an explicit edit. Key comparison is exact UTF-16;
case and NFC/NFD forms stay distinct, and duplicates or unsafe keys are refused.

Model search covers the new fields, including the project's metadata. Search
normalizes its query/index only. Native values, owners and IDs are unchanged.

## One version boundary

`readProjectFiles(files)` returns `{ state, sourceVersion }`;
`readProjectFile(bytes)` offers the same preparation for a file envelope.
Their `state` is detached, fully validated v3. `importFiles` and
`deserializeProjectFile` return just that state. `sourceVersion` belongs to
the session/native snapshot, never to serialized model records.

For v2, the frozen `validateProjectV2` runs before conversion. Only then does
the pure converter add empty project documentation/properties, relationship
documentation and view properties, and change the inner version to 3. Every
other string, ID, optional field, typed profile, viewpoint and coordinate is
retained. A full v3 validation checks the result, including the same 256-KiB
record and 8-MiB project budgets. Empty additions count toward both limits.

Malformed v2 is refused, even if guessing or deleting fields would produce a
valid v3 project. Native v1, unsupported future versions, foreign metamodels,
duplicate JSON keys and unsupported envelopes remain refused. No v3→v2
converter or in-place upgrade exists.

`validateProject` and the active store accept strict v3 only. Commands and
serializers cannot produce a v3 record with one of the required metadata
fields missing. Git reads all three merge sides through the same converter
before comparing records; metadata conflicts still require a whole-record
choice. Preparing a merge does not alter a commit or remote branch.

## Source preservation and Save As

Opening v2 changes only an isolated candidate. Just before committing it,
the project session rechecks its revision/ticket and UI guard. Failed,
cancelled or stale opens leave the current project, both histories, file
binding, dirty baseline and pending save unchanged.

A successfully opened v2 model is explicitly marked as upgraded and dirty.
Undoing ordinary edits does not clear that state. **Сохранить** invokes
**Сохранить как** until a separate v3 file or fresh native directory is
successfully written. The main process refuses normal bound writes to a v2
source and checks the Save As target against both the source path and file
identity, including hard links and a renamed source. The existing native
directory-owned-path guards also apply to Save As and exports.

The successful Save As captures only the bytes actually written. Later edits
remain dirty. Cancelled or failed writes retain the upgrade warning. Git opens
retain the source version in their transported records, so a v2 Git model also
shows the upgrade and requires a separate native save; ordinary Git comparisons
and merge results use normalized v3 values.

Browser downloads cannot prove a disk write or control the user's filesystem
picker; the browser interface reports only successful download dispatch.
Desktop save completion verifies written bytes and then acknowledges the new
binding through the existing document token protocol.

## Verification and boundaries

The original `metadata-v2.arkita` fixture remains byte-for-byte frozen. The
independent expected `metadata-v3.arkita` fixture contains only the approved
empty additions. Tests cover strict v2/v3 rejection, exact metadata edits,
Undo/Redo, v2/v3 Git comparisons, canonical file/total migration limits, stale
and cancelled session reads, source-path/inode protection, fresh-directory
Save As and actual production-HTML metadata controls.

This changes metadata storage and editing, not ArchiMate relationship rules,
notation completeness or persistence's separate independent acceptance. Real
Windows file dialogs, Windows aliases, IME, fonts and display scaling remain
part of final local acceptance after the complete program is in `main`.
