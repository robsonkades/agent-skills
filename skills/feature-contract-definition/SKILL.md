---
name: feature-contract-definition
description: >
  Defining a versioned API, event, data, integration, security, or operational contract for a
  feature after its behavior is agreed and before implementation is planned. Use when callers,
  consumers, stored data, or operators will depend on a changed boundary and its success, failure,
  ownership, compatibility, and verification must be explicit. Does not choose the architecture or
  transport (feature-solution-analysis), record the decision (feature-decision-analysis), or
  implement the contract (feature-execution).
---

# Feature Contract Definition

## Purpose

Turn an agreed boundary change into an authoritative contract that independent producers and
consumers can implement and verify without guessing. A contract describes externally observable
semantics; a DTO, schema, or endpoint list without failures, ownership, and compatibility is only a
shape.

## Workflow

1. **Start from accepted intent.** Trace the contract to `OBJ-*`, `BR-*`, `BAC-*`, affected `SC-*`
   items, and the boundary crossing in the impact map. If behavior is still disputed, return to the
   responsible Product or Engineering stage for that decision. Reuse existing repository/session
   references and accepted revisions; do not invent IDs or require a new dossier merely to draft
   a contract. Record missing mappings explicitly and continue unaffected surfaces.
   Inspect existing decisions, specifications and consumer evidence before asking. If a material
   gap remains, state the competing observable outcomes and ask the accountable role which is
   required; keep the dependent clause provisional instead of silently choosing a guarantee.
2. **Name the parties and authority.** Identify provider, every known consumer, contract owner,
   approver, and independently deployed parties. Reuse authority already established in the
   accepted inputs; do not request it again. An unresolved owner blocks acceptance of that
   boundary, not evidence gathering or a reviewable draft. Unknown public consumers require a
   documented support/version policy rather than an invented list of approvals.
3. **Select only the applicable surfaces.** API/RPC, event/message, persisted/shared data, external
   integration, security, or operational/SLO. Read the matching sections of
   [Contract surfaces](references/contract-surfaces.md).
4. **Start with consumer interactions.** Trace the changed boundary through available producer
   and consumer artifacts; record uninspected parties instead of treating search results as a
   complete inventory. When deriving clauses from existing behavior or ambiguous terms, use
   [From evidence to clauses](references/contract-surfaces.md#from-evidence-to-clauses).
   Walk ordinary use, plus recovery/version-skew and invalid or unauthorized use where those
   risks exist. State what the provider guarantees and what the consumer must do, then define
   inputs, outputs, invariants, errors, timeouts, retries,
   duplication, ordering, partial success, authorization, and observability where applicable.
   For mutations, use [Failure and recovery](references/contract-surfaces.md#failure-and-recovery)
   to distinguish a recoverable condition from a safe repeat of the operation.
   When an interaction crosses several surfaces, check their promises together: what a success
   response means for subsequent reads, emitted events and downstream effects. Follow
   [Interacting surfaces](references/contract-surfaces.md#interacting-surfaces); separate valid
   schemas do not establish a coherent end-to-end contract.
5. **Define evolution.** Current version, proposed version, compatible and incompatible changes,
   coexistence window, migration/deprecation, rollout order, rollback limit, and consumer evidence.
   Name exact producer/consumer/schema revisions and retained data that remain supported;
   syntactic compatibility alone does not establish unchanged meaning or failure behaviour.
   Use [Compatibility evidence](references/contract-surfaces.md#compatibility-evidence) for the
   applicable wire, behavioral and client-library checks.
6. **Maintain one source of truth.** Amend and link the authoritative OpenAPI, AsyncAPI, schema,
   protocol, or equivalent artefact within the project's established ownership and authority.
   For an externally owned contract, link its applicable revision and keep local integration
   obligations separate; a local specification cannot change a supplier's guarantees.
   Summaries point to the sources; they do not become a second copy.
   Follow its declared specification/toolchain version and repository validation commands;
   do not upgrade a format, generator or runtime simply to express the change. External
   publication or messaging requires authorization for that action.
7. **Make it verifiable.** Add `TC-*` contract criteria and planned `EV-*` evidence such as contract,
   compatibility, serialization, migration, security-negative, or consumer tests.
   Each criterion names stimulus/precondition, observation point, observable result and failure
   condition; include the agreed time bound when timing matters, or flag the missing bound.
   If required observations or fixtures are unavailable, the result remains inconclusive,
   not passed; record the missing evidence.
   Keep an unknown operation outcome separate from an unknown verification result. Mark
   evidence as planned, executed-pass, executed-fail or unavailable, tied to exact revisions
   and environment; a schema linter cannot prove behavioral compatibility. Run applicable
   existing specification checks now, and identify runtime checks that belong to implementation.
8. **Reconcile new evidence.** Record the counterexample or changed authoritative revision and
   revisit the affected clauses, compatibility assumptions and `TC-*`/`EV-*`. An implementation
   violating an accepted contract is a conformance gap, not permission to weaken the promise.
   If the promise itself must change, return the choice to the responsible Product or Engineering
   stage, preserve the accepted `CT-*` revision and track the proposed revision's status
   separately. Reuse unaffected evidence only while its premises and tested revisions still apply.

## Decision rules

```text
IF a consumer can observe a change
THEN compatibility is a contract question even when the code change is additive.

IF producer and consumer deploy independently
THEN name each supported old/new producer-consumer pair, retained-data reader pair and
rollback combination; verify them or record the pending check. Justify excluded combinations.

IF an error can cross the boundary
THEN its classification, representation, retryability, and ownership are contract fields.

IF delivery can repeat or reorder work
THEN define operation/event identity scope, payload reuse policy, deduplication horizon,
ordering scope and replay behavior; a timeout is not proof that no effect occurred.

IF an authoritative specification already exists
THEN link it and amend only within established ownership; record gaps in externally owned
contracts without rewriting their guarantees or copying the specification into the feature dossier.

IF a contract choice changes product behavior
THEN return that decision to Product instead of resolving it as an engineering detail.
```

## Constraints

- Repository conventions are evidence, not authority to change a published boundary.
- Do not call a draft contract accepted until its accountable owner and affected independent parties
  have a recorded status under the established authority/support policy. Record consultations,
  required approvals and unresolved parties separately; a recorded rejection is not acceptance.
- Contract acceptance approves a specification revision; it does not prove implementation
  conformance. New semantic changes require impact review under the established authority policy.
- Do not require all surface sections. Mark only applicable surfaces; absence follows from the impact
  map, not convenience.
- Keep implementation tasks out. The contract states what parties may rely on; resources implement it
  later.

## Output

```text
Contract       CT-01 <name and surface>
Trace          <OBJ/BR/BAC/SC and boundary-crossing IDs>
Owner          <accountable role>
Parties        <providers, consumers, operators>
Authority      <approver and consulted roles>
Specification  <authoritative link and version>
Semantics      <success, failures and invariants; clause sources and unresolved meanings>
Evolution      <compatibility, coexistence, migration, deprecation>
Security       <identity, authorization, data exposure>
Operations     <SLO, telemetry, support/recovery obligations>
Criteria       <TC-*>
Evidence       <EV-* status, tested revision/environment, result or pending check>
Status         Draft | In review | Accepted | Blocked
```

Use only applicable fields and existing identifier conventions. Hand the accepted contract and
its exact version, plus pending conformance checks, to the implementation plan. A `Blocked`
contract names the unresolved rule/decision, accountable role and dependent work; unaffected
drafting and verification can continue.
