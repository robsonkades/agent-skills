---
name: component-and-release-boundaries
description: >
  Deciding what becomes an independently releasable component — a Maven module, a JPMS
  module, a published library — and what that costs: the tension between reusing code and
  being able to release it, why a shared jar couples every service depending on it, breaking
  cycles between components, and judging whether a component is stable enough to depend on.
  Use when a `common` or `shared` module is proposed or has grown, when extracting code into
  a library so two services can reuse it, when a dependency cycle appears between Maven
  modules, when upgrading one library forces a coordinated release of several services, or
  when services are independently deployable in theory but always ship together. Does not
  cover cohesion and coupling at
  class and package level (java-cohesion-coupling), whether a component should become a
  separate process (distribution-boundaries), the API compatibility of a published type
  (java-api-design), or wire contract versioning (rpc-and-api-contracts).
---

# Component and Release Boundaries

## Purpose

This skill uses **release component** for a unit published or deployed on its own schedule and
consumed through a versioned contract. Internal Maven or JPMS modules can still be meaningful
encapsulation/build components; they simply do not acquire the same external compatibility and
release obligations. State which meaning applies before using component metrics.

Prevent shared-library changes from unnecessarily forcing fleet-wide upgrades, and avoid
publication boundaries whose compatibility and release costs exceed their value. A shared
jar or shared version number alone does not establish either failure.

Inspect the project's JDK/compiler release, Maven/Gradle configuration, resolved dependency
graph, module path versus classpath, publication policy and deployed consumer versions.
This skill does not mandate a Java baseline: JPMS requires Java 9+, records Java 16+ and
sealed types Java 17+ without preview. Examples are partial illustrations; do not upgrade
the project or add modules/dependencies just to reproduce their syntax.

## Workflow

1. **Ask what is released, not what is grouped.** If two candidate components have never been
   released on different schedules, investigate why. A release train or shared parent version
   can coordinate independently buildable components without requiring that coordination.
   Preserve justified encapsulation/build boundaries even when publication stays combined.
2. **Name the consumers and ownership boundary.** One consumer does not make a module pointless:
   plugin isolation, optional deployment, security boundaries and build ownership can justify it.
   Independent consumers upgrading at different times create the strongest compatibility duty
   (`java-api-design`).
3. **Resolve the cohesion tension deliberately** — reuse, common closure and common reuse
   pull in different directions and cannot all be satisfied. Decide which one this component
   optimises for, and record it.
4. **Prevent source/build cycles and investigate release cycles.** Maven/JPMS reject cycles in the
   current build graph. Published artifacts can sometimes evolve against previous versions, but a
   mutually breaking change then requires coordination and exposes that independent evolution is
   weak.
5. **Point dependencies toward stability.** A component many things depend on must be hard to
   change; if it is also volatile, its churn reaches everything.
6. **Recheck against release history and compatibility tests.** Distinguish required lockstep
   from habitual batching; with missing history or consumer evidence, report a hypothesis
   and the compatibility experiment needed rather than a proven boundary failure.

## The tension you must resolve, not solve

Three cohesion principles pull in different directions and cannot all be satisfied: **reuse /
release** pulls components larger, **common closure** groups by reason to change, and **common
reuse** pulls them smaller because depending on a component means depending on all of it. The
derivation and the trade-off diagram are in `references/component-principles.md`.

The trajectory is the part to act on. **Early, favour common closure**: a component that is
easy to change is worth more than one that is easy to reuse, because there are no external
reusers yet. As reusers appear the cost shifts onto them and common reuse starts to win — that
is the moment to split, not before.

A catch-all `commons` jar can violate common reuse: one helper may pull in unrelated
libraries and release obligations. Inspect actual resolved dependencies, scopes, exclusions
and optionality; neither the name nor the presence of unrelated classes proves that every
dependency or defect affects every consumer.

## Decision rules

```text
Two candidate components have always been released at the same version
        → evidence, not proof, that they form one release unit. Check whether
          separate ownership, optionality, startup isolation or future compatibility
          justifies keeping the boundary before merging artefacts.

Code is duplicated in two services and a shared library is proposed
        → first ask whether the duplication is coincidental. Two services
          computing tax the same way today, for different reasons, will
          diverge; the library then couples them into agreeing. Duplicate
          deliberately and record why.

The shared thing is a domain invariant both sides must agree on
        → compare a versioned library with a single authoritative service or
          versioned rule/data contract. A library alone does not ensure deployed
          consumers run the same rule; identify effective-version policy.

The shared thing is a wire contract between two services
        → define the wire contract independently of implementation. Schema/code
          generation is one option, not a compatibility guarantee. Version DTOs
          independently and test old/new peers (rpc-and-api-contracts).

A source/build dependency cycle exists between two components
        → break it or merge the release unit. Either move the classes creating
          the edge into one of them, or invert the edge with an interface
          owned by the policy requiring the behavior, with the implementation
          depending on that contract (java-dependency-inversion).

A component is depended on by many AND changes often
        → the highest-risk position in the graph. Either stabilise it
          (reduce incompatible surface changes) or shrink it until only
          the stable part is shared.

A component is depended on by many and is hard to change on purpose
        → potentially appropriate. Stable concrete values can be sound; add
          extension points only for an actual variation boundary.

Nothing outside this repository consumes it
        → default to keeping it internal. Publish only for a concrete independent
          consumer or delivery constraint. An internal module is cheap; a published
          artefact carrying a semver promise is not.
```

## Rules

- **The unit of release is the unit of the decision.** Folders, packages, and JPMS modules
  used only for encapsulation are a different boundary, with their own tooling, reflection
  and access costs; they need not be independently published.
  Publication adds obligations to consumers that pin released artifacts.
- A dependency creates compatibility and upgrade obligations. It becomes coupling to a
  release schedule when support, security deadlines or incompatible changes require it.
- **Version numbers must mean something or they mean nothing.** A consumer should read the
  bump under the declared policy. For SemVer after 1.0: patch is a compatible fix, minor a
  compatible addition, major an incompatible public-contract change. Not every behavior
  change is breaking, and adding surface can break consumers. Verify compatibility rather
  than treating the number as evidence; inspect the policy for pre-1.0 versions.
- Mutable snapshots, floating ranges and tracking main weaken reproducibility and upgrade
  control. Inspect resolved versions and the support window; they are risks, not proof that
  all consumers must deploy simultaneously. Prefer immutable versions for released consumers.
- Prefer dependencies on contracts whose rate of incompatible change is lower than their consumers
  can tolerate. Instability/abstractness metrics are diagnostic prompts, not laws: generated models,
  stable concrete value types and internal modules routinely sit away from the proposed diagonal.
- A `common`/`util`/`shared` name is a prompt to inspect cohesion, consumers and ownership.
  Split only when measured change reasons and usage justify the new release obligations;
  a narrowly governed shared component may already be coherent.
- Prefer discovering component boundaries from change history over designing them up front.
  Files that change together are evidence; a diagram is a hypothesis.

## Minimum result

State the proposed release unit, consumers/owners, current versus proposed dependency
edges, compatibility/support policy and evidence for keeping, merging or splitting it.
Include migration order, old-consumer retention and a focused old/new compatibility check.
Mark assumptions and runtime compatibility not exercised; a clean build alone does not
prove independently deployable services.

## References

- [The component principles applied](references/component-principles.md) — reuse/release
  equivalence, common closure and common reuse worked through with concrete Maven and JPMS
  examples; the acyclic dependencies rule and the three mechanical ways to break a cycle;
  stability and abstractness as a pair, the zones of pain and uselessness, how each is
  measured and how the measurement misleads. Read when designing a module structure or arguing
  about a specific split.
- [Shared code across a service fleet](references/shared-code-in-a-fleet.md) — why a shared
  library is a synchronous coupling, the four kinds of shared code and which are safe, the
  shared-DTO and shared-entity traps, choosing between duplication and a library, and
  migrating off a `commons` jar without a fleet-wide release. Read when extracting or
  untangling code shared between services.
