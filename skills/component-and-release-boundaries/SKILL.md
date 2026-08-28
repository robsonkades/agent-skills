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

A component is not a folder — it is a unit that can be **released on its own schedule** and
consumed at a version. That is the whole content of the decision, and it is the one teams
skip: they extract a module for tidiness, acquire a versioning obligation they never wanted,
and discover a year later that nothing can be released alone.

The two failures this exists to prevent: the `commons` jar every service depends on, so a
change to it means a coordinated release of the fleet — a distributed monolith created at
build time rather than by RPC; and the premature split into twelve modules whose versions are
always bumped together, which is one component wearing twelve `pom.xml` files.

## Workflow

1. **Ask what is released, not what is grouped.** If two candidate components have never been
   released at different versions and there is no plan to, they are one component. The
   directory split may still be worth having — as packages, not as artefacts.
2. **Name the consumers.** A component with one consumer is a package. A component with many
   consumers that upgrade at different times is a real component, and inherits a
   compatibility obligation (`java-api-design`).
3. **Resolve the cohesion tension deliberately** — reuse, common closure and common reuse
   pull in different directions and cannot all be satisfied. Decide which one this component
   optimises for, and record it.
4. **Break every cycle before it becomes one.** A dependency cycle between releasable
   components has no valid release order; it is not a smell but an impossibility, which the
   build hides by releasing both together.
5. **Point dependencies toward stability.** A component many things depend on must be hard to
   change; if it is also volatile, its churn reaches everything.
6. **Recheck against the release history.** Components whose versions always moved together
   were never separate.

## The tension you must resolve, not solve

Three cohesion principles pull in different directions and cannot all be satisfied: **reuse /
release** pulls components larger, **common closure** groups by reason to change, and **common
reuse** pulls them smaller because depending on a component means depending on all of it. The
derivation and the trade-off diagram are in `references/component-principles.md`.

The trajectory is the part to act on. **Early, favour common closure**: a component that is
easy to change is worth more than one that is easy to reuse, because there are no external
reusers yet. As reusers appear the cost shifts onto them and common reuse starts to win — that
is the moment to split, not before.

**Common reuse is the principle a `commons` jar violates by construction.** Depending on it
for one string helper drags in its Jackson version, its logging binding, its release cadence
and its blast radius. In a service fleet this is the most frequent single cause of "we cannot
deploy that service on its own".

## Decision rules

```text
Two candidate components have always been released at the same version
        → one component. Merge the artefacts; keep the packages.

Code is duplicated in two services and a shared library is proposed
        → first ask whether the duplication is coincidental. Two services
          computing tax the same way today, for different reasons, will
          diverge; the library then couples them into agreeing. Duplicate
          deliberately and record why.

The shared thing is a domain invariant both sides must agree on
        → a component is justified, and must be versioned and compatible,
          not "everyone tracks main".

The shared thing is a wire contract between two services
        → not a shared implementation library. Share the schema and
          generate both sides (rpc-and-api-contracts). A shared DTO jar
          makes the consumer's compile depend on the producer's release.

A dependency cycle exists between two components
        → break it, do not document it. Either move the classes creating
          the edge into one of them, or invert the edge with an interface
          owned by the depended-upon side (java-dependency-inversion).

A component is depended on by many AND changes often
        → the highest-risk position in the graph. Either stabilise it
          (freeze the surface, make it abstract) or shrink it until only
          the stable part is shared.

A component is depended on by many and is hard to change on purpose
        → correct. Stability here is a feature, paid for with abstraction,
          so extension does not require modification.

Nothing outside this repository consumes it
        → do not publish it. An internal module is cheap; a published
          artefact carrying a semver promise is not.
```

## Rules

- **The unit of release is the unit of the decision.** Folders, packages, and JPMS modules
  used only for encapsulation are organisation, and are reversible almost for free.
  Publishing an artefact is not, because consumers pin it.
- A dependency between components is a coupling to a **release schedule**, not only to code.
  This is the cost teams price at zero, and it usually dominates.
- **Version numbers must mean something or they mean nothing.** A consumer should read the
  bump and know the risk: patch for corrected behaviour, minor for added surface, major for
  removed or changed behaviour. A team that ships a breaking change as a minor has a version
  string, not a contract.
- `SNAPSHOT`, floating ranges and "everyone tracks main" turn an independent release into a
  lockstep one while looking like the opposite. If a consumer cannot stay on last month's
  version for a sprint, the components are not independent.
- **Depend in the direction of stability, and let abstractness rise with it.** An edge from a
  stable component to a volatile one imports the volatility. The two failure positions this
  produces are worked through in `references/component-principles.md`.
- A `common`/`util`/`shared` component has no common closure by construction: it is grouped
  by "generic", which is not a reason to change. Expect the widest blast radius and the least
  clear ownership. Where one exists, split it by reason to change and let the pieces be
  depended on individually.
- Prefer discovering component boundaries from change history over designing them up front.
  Files that change together are evidence; a diagram is a hypothesis.

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
