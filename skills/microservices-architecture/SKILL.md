---
name: microservices-architecture
description: >-
  Coordinate interdependent architecture decisions when a microservices initiative spans
  domain, data, interaction and operation, or specialist proposals conflict. Build an
  evidence-backed decision map with owners, unresolved constraints and a first verifiable
  slice. Does not replace initial system triage, the decision to distribute a boundary,
  or a specialist's local implementation guidance.
---

# Microservices Architecture

## Purpose

Make several individually plausible decisions work together for one business outcome.
Own their dependencies, conflicting assumptions and integration evidence. A list of patterns
or services is insufficient: show which decision constrains which other decision, who can
resolve a conflict, and what the next useful increment will prove.

Use this after the affected initiative or use case is known. Initial enterprise orientation
belongs to `enterprise-application-architecture`; distributed symptom triage belongs to
`distributed-systems`. A single timeout adjustment belongs to `timeouts-and-deadlines`.
Do not send these tasks through the entire architecture track. Whether a particular module
should become a process belongs to `distribution-boundaries`; carry its decision forward
rather than redoing its analysis here.

## Establish the working constraints

Start from the requested result: review findings, an architecture decision, or implemented
changes. Reuse accepted decisions and existing evidence. Keep a suitable monolith or
existing service arrangement when it meets the outcome; neither a service count nor a
bounded-context count is a success criterion. Reopen an accepted boundary only when a
changed requirement or contradictory evidence warrants it.

Trace one representative business operation before mapping the whole system:

- **Outcome and invariants:** caller, protected business effect, latency/availability or
  freshness requirement, prohibited intermediate states, and the party authorized to
  change those requirements. Separate binding constraints from preferences such as
  "every capability needs a service." Use `architecture-characteristics` when the outcome
  is still only "scalable" or "reliable."
- **Actual path:** entry points, domain rules, transaction/data owners, calls/events,
  consumers, scheduled jobs, credentials and trust boundaries. Compare source/contracts
  with deployments and observations; a diagram or annotation is an assertion to check.
- **Delivery and operation:** current compatibility promises, release history, incidents,
  support ownership, deployment units, failure domains and existing recovery procedures.
  Use changes and incident evidence to test autonomy or isolation claims; separate
  pipelines alone establish neither.
- **Java/Spring target when present:** Maven/Gradle toolchains, compiler release, resolved
  dependency management, Spring Boot/Framework/Cloud versions, runtime images and CI.
  Inspect transaction managers, client configuration and effective profiles for the
  affected path. This skill has no fixed Java baseline or executable example and grants
  no upgrade, preview-feature or new-platform requirement.

Distinguish observed facts, inferred relationships and untested hypotheses. Record the
artifact/version and relevant workload or capture window behind consequential evidence.
If evidence is absent, name the smallest missing trace, contract or owner answer; continue
independent work and keep dependent conclusions conditional. Do not invent owners, traffic
volumes or performance gains to complete a map.

## Build and reconcile the decision map

Keep the map in the project's existing architecture record or task artifact. Link existing
ADRs rather than copying them. For each consequential open or affected decision, record:

1. **Question and constraint:** affected operation/invariant, evidence and any assumption
   that could change the answer.
2. **Choice and alternative:** retain/change/probe, rationale, consequential cost and what
   would cause reconsideration. When option comparison needs depth, use
   `architecture-trade-off-analysis`.
3. **Accountability:** decision authority, implementation/operation owner and specialist
   question. An advisory skill is not the accountable team.
4. **Dependencies and status:** decisions this answer needs or constrains, conflicting
   requirement/assumption, and whether the choice is proposed or accepted. Track its
   validation separately: accepted does not mean demonstrated.
5. **Acceptance evidence:** observable result, check/fixture, responsible owner and any
   remaining limit. Use `architecture-decision-making` for ADR lifecycle, proportionate
   to the consequence.

Order work by actual dependencies and uncertainty. Settle a blocking invariant or authority
question before committing its dependent API/read model. Independent investigations can
proceed together; a circular dependency is a reason for a bounded joint experiment or
requirement clarification, not an arbitrary ordering. Send each specialist the existing
evidence and exact unresolved question, and require a returned contract, assumptions,
failure semantics and verification. Do not restart discovery at each handoff.

When an answer changes, revisit only its dependent decisions. Compare their assumptions at
the shared boundary: identity/tenant, authoritative state, allowed staleness, transaction
participation, deadline, failure outcome and supported versions. For example, an available
cached balance does not establish permission to spend it, and moving work behind a gateway
does not establish authorization at the operation. Route the unresolved mechanism instead
of filling the gap with a framework annotation.

If two binding constraints cannot both hold under the proposed design, expose the conflict
and the options to its decision authority. Do not silently weaken an invariant or label
an unapproved compromise accepted. Read [Integrating decisions](references/integrating-decisions.md)
when proposals conflict, a process boundary changes semantics, or an implementation slice
needs checks across several owners.

## Ask the specialist for a bounded result

Load only owners needed by the current questions. This table states the handoff contract;
the detailed mechanism remains in its owning skill.

| Unresolved question                                                 | Owner                          | Result to integrate                                                                      |
| ------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| Which meanings and invariants belong together?                      | `bounded-context-design`       | Context relationships and translation contracts, without assuming a process per context. |
| Who may read or mutate authoritative data?                          | `service-data-ownership`       | Supported interfaces, enforceable access rules and bounded exceptions.                   |
| How does a cross-service read meet its consumer's semantics?        | `cross-service-query-design`   | Freshness/completeness/authorization contract and recovery of derived state.             |
| What belongs at the client-facing edge?                             | `api-gateway-and-bff`          | Edge responsibilities, identity propagation and partial-failure behavior.                |
| How does a caller learn changing endpoints?                         | `service-discovery`            | Bootstrap/update/expiry behavior, including stale or absent discovery data.              |
| Which workload or delegated identity is trusted for this operation? | `service-identity-and-trust`   | Trust and authorization boundaries, rotation and denial behavior.                        |
| How can versions coexist and an unsafe release be stopped?          | `progressive-service-delivery` | Compatibility constraints, cohorts, promotion/abort evidence and data-aware recovery.    |

Use these specialists for the remaining affected contracts and their verification:

- `rpc-and-api-contracts` and `schema-evolution-and-compatibility` for wire behavior and
  version coexistence; `distributed-transactions-and-sagas` and `idempotency` for
  cross-owner effects, delivery gaps, uncertain outcomes and safe repetition.
- `distributed-systems-testing` for failure evidence and `slo-and-alerting` for operational
  acceptance. Reuse established evidence when it covers the proposed change.

For deeper analysis or framework-specific work, consult:

- `architecture-coupling-and-quanta` when the independence claim needs a deeper coupling
  assessment; `architecture-refactoring-paths` when a migration across boundaries needs
  sequencing beyond the first slice.
- `spring-boot` for applicable Spring implementation routing, carrying the discovered
  project baseline. Consult `spring-transactions-and-events` when transaction or
  publication behavior is material, and `spring-boot-testing` for integration verification.

If an owner is unavailable, retain the question and next discriminating check in the map;
do not claim its work happened or install tools/skills as a prerequisite without need.

## Deliver the first verifiable slice

Choose the smallest business operation that tests the highest-risk interaction among the
decisions. State the effect and consumer, included paths, excluded work and why the result
will change confidence in the architecture. A small internal modular change can be the
right slice. A disconnected service scaffold cannot demonstrate an integration claim.

For a **review**, deliver the evidenced conflicts or supported retained decisions and
their consequences. For a **design**, deliver the reconciled map and an executable next
validation step. For an **implementation request**, continue through the authorized slice:
domain/API change, affected callers or consumers, configuration, data/permission changes,
operational documentation and recovery where relevant. Reuse project conventions and
supported dependencies; preserve encapsulation and business types, and justify new shared
libraries or abstractions by actual consumers. Do not stop after naming specialists.

Verify the combined path with checks capable of refuting its claims: business effect and
invariant, realistic dependency failure, relevant unauthorized access, and mixed versions
when coexistence is promised. Match deployment/capacity claims to the target topology and
workload; mock-only checks cannot demonstrate those properties. For a local-only change,
do not manufacture distributed failure tests. Choose checks from the actual map.

Return the retained/changed decisions, unresolved conflicts with owners, slice artifacts
or implementation, commands/cases and observed results, plus the next decision affected
by that evidence. Separate structural checks, executed behavior and unexecuted plans;
state tool/environment limits. An integrated test in an isolated environment is evidence
for its exercised conditions, not proof of production autonomy, security or availability.

## Sources and limits

- [Lewis and Fowler, Microservices](https://martinfowler.com/articles/microservices.html):
  consult when interpreting independent deployment, business capabilities and failure
  costs. These are architectural observations, not a conformance checklist.
- [Fowler, Monolith First](https://martinfowler.com/bliki/MonolithFirst.html): consult when
  evaluating an assumed extraction trajectory. Its tentative experiential argument
  supports considering retention, not a universal rule against starting with services.
