# Profiles and viewpoints in V4

The profile manager uses the existing model-owned `customizationProfiles`
contract. Human controls author primitive, Structure and List attribute types,
optional defaults and explicit per-concept overrides. `false`, `0`, an empty
string, an empty List, absence and a default are distinct. Lists initially show
64 rows; unrendered rows remain exact and can be revealed. URL values stay
inert text. Cancel/stale drafts do not enter model history.

Usage counts count concept IDs, not drawings. The manager can show those
concepts and all views containing their occurrences/connections. Ordinary
Delete keeps its existing refusal for a used definition. A separate explicit
“detach all and delete” confirmation lists the impact and removes applications
and their overrides together with the definition as one Undo; concepts,
relationships and shared assets remain.

Names are labels, while profile IDs are identity. Comparison for overlap
warnings trims and NFC-normalizes the name and compares case-insensitively,
only among specialization definitions whose concrete targets overlap. Creating
or renaming to a newly conflicting label requires an explicit separate-ID
choice; it does not merge definitions. Imported/legacy collisions remain
readable and are labeled in the manager. This is a local authoring policy,
not an ArchiMate semantic constraint. Existing multiple specializations per
concept remain supported.

A specialization may select an embedded asset. The icon is inherited by its
occurrences; a local drawing image override wins. The inherited/local icon is
a bounded badge, preserving the base notation contour. Removing a profile's
image reference does not delete the shared asset. The existing image library
owns safe upload and resource deletion checks. Changing purpose away from
specialization clears its image reference in the same Undo action.

Viewpoint stakeholders and concerns use human row controls. The existing
binding control still provides immediate, undoable selection; the optional
scope preview lets a user choose a candidate and inspect hidden drawing IDs
and reasons before Apply. Applying a scope never deletes hidden records or
geometry. A no-op scope has no history entry. Unsupported endpoints/types,
UNKNOWN decisions, relation-specific attributes and endpoint permissions
retain the existing current ArchiMate 4 rules; these dialogs do not import
ArchiMate 3.2 rules or claim normative conformance.

Unit/core/IO and actual app DOM checks cover these behaviors. Real Windows
focus, high DPI, image rendering and native dialogs remain part of the owning
release acceptance protocol.
