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
   responsible Product or Engineering stage.
2. **Name the parties and authority.** Identify provider, every known consumer, contract owner,
   approver, and independently deployed parties. An unowned boundary is blocking.
3. **Select only the applicable surfaces.** API/RPC, event/message, persisted/shared data, external
   integration, security, or operational/SLO. Read the matching sections of
   [Contract surfaces](references/contract-surfaces.md).
4. **Define success and failure semantics.** Inputs, outputs, invariants, errors, timeouts, retries,
   duplication, ordering, partial success, authorization, and observability where applicable.
5. **Define evolution.** Current version, proposed version, compatible and incompatible changes,
   coexistence window, migration/deprecation, rollout order, rollback limit, and consumer evidence.
6. **Publish one source of truth.** Link the authoritative OpenAPI, AsyncAPI, schema, protocol, or
   equivalent artefact. Summaries point to it; they do not become a second copy.
7. **Make it verifiable.** Add `TC-*` contract criteria and planned `EV-*` evidence such as contract,
   compatibility, serialization, migration, security-negative, or consumer tests.

## Decision rules

```text
IF a consumer can observe a change
THEN compatibility is a contract question even when the code change is additive.

IF producer and consumer deploy independently
THEN define the coexistence window and verify both old/new combinations.

IF an error can cross the boundary
THEN its classification, representation, retryability, and ownership are contract fields.

IF delivery can repeat or reorder work
THEN idempotency key, ordering scope, deduplication responsibility, and replay behavior are explicit.

IF an authoritative specification already exists
THEN amend and link it; do not copy it into the feature dossier.

IF a contract choice changes product behavior
THEN return that decision to Product instead of resolving it as an engineering detail.
```

## Constraints

- Repository conventions are evidence, not authority to change a published boundary.
- Do not call a draft contract accepted until its accountable owner and affected independent parties
  have a recorded status.
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
Semantics      <success, failures and invariants>
Evolution      <compatibility, coexistence, migration, deprecation>
Security       <identity, authorization, data exposure>
Operations     <SLO, telemetry, support/recovery obligations>
Criteria       <TC-*>
Evidence       <planned or observed EV-*>
Status         Draft | In review | Accepted | Blocked
```

Hand the accepted contract and its exact version to the implementation plan. A `Blocked` contract
returns to the owner of the missing product rule or engineering decision.
