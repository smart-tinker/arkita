---
name: Bounded work item
about: A concrete result with executable acceptance and honest evidence
---

## Scenario / evidence
User goal, observed vs expected behavior, baseline version/SHA, source links.
Facts separately from hypotheses. For a defect: minimal reproduction and impact.

## Scope
In:
Out:
Related issues/PRs and why this does not duplicate their work:
Relevant model/IO/UI/native invariants:

## Definition of Done
| Criterion | Check / command / scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| Observable user result | | | pending |
| Relevant negative path (cancel/stale/repeat/unsaved work) | | | pending |
| Regression + final aggregate validation | | | pending |

## Delivery boundary
Source / package / installed native acceptance: identify what is required and what is not.
Record exact tested SHA; for packages, source SHA + version + SHA-256 + environment.
No automatic merge, release or deployment.

## Current status
Implementation:
Validation: PASS / FAIL / UNRUN / INVALID / BLOCKED, with evidence per criterion.
Remaining decision / blocker:
Do not turn a hypothesis, mock test or unrun acceptance into a confirmed result.
