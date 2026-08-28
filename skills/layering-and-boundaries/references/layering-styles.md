# Layering Styles Compared

All of these are answers to one question: which dependencies are allowed. They differ in
where they draw the line and how much ceremony they demand.

## Classical three-layer

```text
presentation → domain → data source
```

**Constrains:** downward dependency only. The domain does not import the web layer.

**Does not constrain:** the domain's dependency on the persistence mechanism. In practice
the domain imports the ORM's annotations, and the data-source layer is a set of
repositories the domain calls directly.

**Costs:** almost nothing beyond the discipline. There is no mapping tax unless you add
one.

**Right answer when:** the persistence technology is settled, the domain is not expected to
outlive it, and the team is small enough that the direction rule is actually followed. This
covers a large fraction of real enterprise applications, and saying so is not a concession.

**Fails when:** the domain becomes genuinely valuable and independently long-lived, or the
data source is not a database you control (a mainframe, a vendor API, a partner feed) and
its shape starts dictating the model.

## Hexagonal / ports and adapters

```text
        driving adapters (HTTP, CLI, consumer)
                        │  call
                        ▼
              ┌──────────────────┐
              │   application    │  ports = interfaces the inside owns
              │      domain      │
              └──────────────────┘
                        │  call through a port
                        ▼
        driven adapters (JPA, HTTP client, broker)
```

**Constrains:** every dependency points inward. Outward needs are expressed as interfaces
declared by the inside and implemented outside — dependency inversion applied at the
boundary rather than the class.

**Costs:** one interface plus one implementation per outward need, plus mapping between the
domain type and whatever the adapter speaks. This is the real price and it is paid on every
field.

**Driver that justifies it:** the domain must be testable without infrastructure, or a
driven side is genuinely expected to be replaced, or the same use cases are driven from
several places (HTTP, batch, message consumer) — the last is the most under-appreciated and
the most convincing.

**Failure mode:** ports declared for things that will never be swapped, so the codebase has
`OrderRepository` (interface, domain) and `JpaOrderRepository` (implementation, adapter)
with identical method lists and a mapper between two structurally identical types. That is
indirection wearing an architecture's name (`enterprise-architecture-smells`).

## Clean / onion

Same rule as hexagonal — dependencies point inward — with prescribed concentric rings
(entities, use cases, interface adapters, frameworks) and, usually, a use-case class per
operation.

**Adds over hexagonal:** an explicit application layer of use cases, which is genuinely
useful when transaction and authorisation boundaries need to be visible
(`service-layer-design`).

**Costs:** the ring vocabulary and, in most implementations, a request/response object per
use case, which is a second mapping layer on top of the adapter's.

**Practical guidance:** treat clean and hexagonal as one style with two vocabularies. Do
not run both sets of names in one codebase. Adopt the ring discipline only where the
inversion is doing work; in most systems that is the persistence and integration edges, not
every ring.

## Modular monolith

```text
one deployable, N modules, each with a published surface
[orders] → published API of [pricing] → published API of [catalogue]
```

**Constrains:** cross-module access goes through each module's published surface; internals
are unreachable. Layering may still exist **inside** a module — and this is the key point:
the two schemes are orthogonal and compose.

**Costs:** enforcement machinery (Java modules, an architecture test, or a build-level
module per component), and honest module boundaries, which is the hard part.

**Driver that justifies it:** independent teams, or a credible future extraction, or the
practical one — a codebase where "where does this go?" has stopped having an answer.

**Why it usually beats early service extraction:** the module boundary is the same boundary
a service extraction needs, but it costs no network, no serialisation and no distributed
transaction (`distribution-boundaries`). Getting a module boundary wrong costs a refactor;
getting a service boundary wrong costs a migration.

## Vertical slices

```text
features/place-order/{Endpoint, Handler, Sql, Tests}
features/cancel-order/{...}
```

**Constrains:** almost nothing globally. Cohesion is per feature; each slice may reach the
database in whatever way suits it.

**Costs:** duplication across slices, and no single place enforcing an invariant. This is
tolerable when the rules are thin and intolerable when they are not.

**Driver that justifies it:** many independent, simple operations over shared data, where
the layered version scatters each feature across three packages and every change is a
five-file diff. CQRS read sides are the archetype.

**The honest trade:** slices optimise for change locality and against invariant
enforcement. Systems with real invariants tend towards a hybrid — slices on the read side,
a shared domain model on the write side (`pattern-selection-and-composition`).

## Choosing

| If the driver is…                                         | Style                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Nothing in particular; small team; settled stack          | Classical three-layer. Do not apologise for it.                     |
| Domain must be testable and infrastructure-independent    | Hexagonal, applied at the persistence and integration edges         |
| Use cases must be explicit for transactions/authorisation | Clean's application ring, on top of hexagonal                       |
| Independent teams or a credible extraction later          | Modular monolith, layered inside each module                        |
| Many thin operations, change locality dominates           | Vertical slices, with a shared model only where invariants live     |
| "Because it is best practice"                             | None of them. Find a driver first (`architecture-decision-making`). |

## What these styles do not decide

None of them says where business logic goes — that is `domain-logic-organization`, and a
hexagonal codebase with all its rules in a service class is an anaemic domain wearing a
hexagon. None says whether a boundary should be remote — that is
`distribution-boundaries`. And none removes the need to decide what crosses the boundary,
which is where most of the actual coupling lives.
