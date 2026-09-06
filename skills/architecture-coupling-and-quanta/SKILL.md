---
name: architecture-coupling-and-quanta
description: >
  Map release and runtime coupling when services ship together, event-driven components still
  require coordinated changes, shared data obscures ownership, or a proposed architecture
  quantum boundary cannot be justified. Distinguish structural dependencies, workflow completion
  and connascence using contracts, deployment evidence and failure behavior. Does not choose
  service extractions (distribution-boundaries), diagnose architecture smells
  (enterprise-architecture-smells), or refactor package dependencies (java-cohesion-coupling).
---

# Architecture Coupling and Quanta

## Purpose and scope

Make a coupling claim checkable: what depends on what, for which change or workflow,
and what evidence supports the boundary. Use a focused edge review for a small task;
use an estate map only when the question needs it. One team can own several tightly
coupled deployables; team count is not an activation threshold.

An architecture quantum is a practitioner model involving independent deployment,
functional cohesion, static dependencies and synchronous runtime coupling. These are
different questions, not interchangeable proof. This skill produces a qualified map,
not a universal graph formula or a split/merge recommendation. Read
[Coupling vocabulary](references/coupling-vocabulary.md) when defining quantum boundaries
or distinguishing connascence forms.

## Workflow

1. **Fix the claim and scope.** Name the environment, observation window, relevant operation/
   success criterion and change class (for example additive API evolution versus removing a
   shared column). Inventory independently addressable deployment/rollback targets and their
   artifacts. One pipeline can ship several targets; a target can use several pipelines.
   Published libraries and shared platforms enter as dependencies, not extra service deployments.
2. **Collect enough evidence for the claim.** For release independence, inspect manifests,
   dependency versions, migration ownership, API/event contracts and deployment/rollback records.
   For runtime independence, inspect call paths, traces and tested failure/fallback behavior.
   Record source, date and coverage. A diagram alone identifies questions, not proven boundaries.
   Read [Measuring the unit](references/measuring-the-unit.md) before deriving metrics or counts.
   For Java library changes or event evolution, use its
   [compatibility evidence](references/measuring-the-unit.md#compatibility-evidence-for-the-actual-release) checks.
3. **Record separate findings per edge.** Use the table below. S and D can both be present;
   mark each as supported, absent within the tested scope, or unknown. Distinguish an observed
   co-change from the hypothesis that it was required. Name the test or artifact that would
   confirm or refute that hypothesis. Missing evidence never becomes positive evidence because
   a review deadline passed.
4. **Build the views the evidence supports.** Keep directed structural and runtime edges.
   For a release view, group only demonstrated lockstep constraints; record one-way rollout
   ordering separately. For a workflow view, follow dependencies needed for the stated success
   criterion, including request/reply implemented through queues. Show shared infrastructure
   failure domains separately rather than silently merging every tenant.
5. **Qualify any quantum count.** Declare which static dependencies and workflow are included,
   assess whether candidate groups have a coherent responsibility, and show the members.
   An undirected connected-component collapse is a conservative coupling envelope under stated
   assumptions, not proof of independent deployability or cohesion. Do not call a runtime
   dependency group a release unit. If evidence leaves alternative boundaries, report scenarios
   and the edges that change them; if coverage is unknown, decline an exact estate count.
6. **Deliver the finding and next check.** State the consequence for independent change or
   runtime completion, the smallest supported adjustment (often a contract clarification or
   validation experiment), and its acceptance condition. Choosing a new process boundary belongs
   to `distribution-boundaries`; evaluating a smell to `enterprise-architecture-smells`;
   shared-library release design to `component-and-release-boundaries`.

## Edge questions

| Axis                 | Question and required evidence                                                                                                                                                                           | What does not settle it                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| S: structural/static | Which version, schema, library or platform capability must exist to build, start or remain correct? Which changes require consumer coordination? Inspect actual dependencies and compatibility evidence. | Same library name, database host or broker alone                    |
| D: runtime           | For this operation, must the other component answer or act before success? Inspect traces and behavior during absence, delay and recovery.                                                               | HTTP versus messaging alone; returning 202 without defining success |
| Contract/semantic    | Which names, meanings, algorithms or invariants must agree, and who owns their evolution? Inspect schemas plus business semantics and mixed-version tests.                                               | A compatibility policy document alone; wire-schema validation alone |
| Process              | Why did these targets deploy together: technical necessity, shared feature, pipeline convenience or release policy? Inspect artifacts and the change record.                                             | Timestamp proximity or a high co-deployment ratio                   |

## Rules that prevent false boundaries

- A version-pinned shared library remains a structural dependency, but compatible consumers need
  not upgrade together. A shared schema can constrain evolution even when read-only; distinct
  schemas can share capacity/outage risk without sharing table ownership. Record the mechanism.
- Async can remove waiting for a consumer at request acceptance; it does not remove event-schema,
  ordering, completion or recovery obligations. A queue-based request/reply still waits logically.
- A timeout is bounded failure, not successful fallback. Verify that degraded output satisfies the
  stated operation contract, for how long, and during recovery. Cached success may depend on a
  freshness window. Callers and callees can have different SLOs and scale independently while a
  workflow remains dependent on both.
- Co-change and co-deployment identify candidates to inspect. Neither frequency nor one incident
  establishes a permanent quantum boundary. Do not turn quantum/deployment count ratios into a
  quality score or a “distributed monolith” verdict.
- Checks can enforce specific dependencies, compatibility or sequence invariants; no absence of
  a generic connascence tool proves those properties cannot be automated. Governance choices
  belong to `architecture-fitness-functions`, implementation to `architecture-testing`.

## Minimum output

For one edge: claim/scope, evidence, S/D/contract findings including unknowns, consequence,
proposed adjustment and validation. For a map: also show deployment targets, group membership,
directed edges, inclusion assumptions and unresolved boundaries. Keep observations distinct
from inferences; do not require an ADR for a small review.

Read [Evidence and disagreements](references/evidence-and-disagreements.md) when interpreting
research, disputing a definition or citing a case study. Use
[Validation cases](references/validation-cases.md) to rehearse or evaluate these decisions;
written cases are not measured evidence of skill improvement.
