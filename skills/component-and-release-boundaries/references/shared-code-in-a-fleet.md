# Shared Code Across a Service Fleet

Services are independently deployable exactly to the extent that they can be released without
coordinating with anyone. A shared library is the most common thing that quietly removes that
property, and it does so at build time, where no architecture diagram shows it.

## A shared library creates build-time and release coupling

The reasoning teams apply to runtime calls stops at the build boundary, and it should not.

```text
Runtime coupling                    Build-time coupling
─────────────────────────────       ─────────────────────────────
A calls B synchronously             A compiles against lib v2
    → A is down when B is down          → A must upgrade to fix a CVE in lib
    → visible in a trace                → invisible in a trace
    → everybody prices it               → priced at zero
```

Unlike a synchronous RPC, a pinned library does not make a consumer unavailable when its producer
or publisher is down. The useful analogy is coordinated evolution, not runtime failure propagation.
The failure mode is a **lockstep release**: a change to the shared library that everyone must
take — a security patch, a Spring major upgrade, a serialisation change — becomes a
coordinated release of every consumer. If that has happened even once, the fleet is coupled;
the only question is how much.

The severity depends on whether consumers may lag:

- **May lag freely** (library is versioned, old versions keep working, no shared state): the
  coupling is real but cheap. This is the acceptable case.
- **Must upgrade in step** (the library encodes a wire format, a schema, or a protocol both
  sides must agree on): every consumer is on the producer's release schedule. This is a
  distributed monolith regardless of how many processes are involved.

## The four kinds of shared code

Not all sharing is equal. Classify before deciding.

### 1. Generic technical utilities — usually safe, rarely worth writing

String helpers, date helpers, retry wrappers. Safe to share because they are stable and have
no domain meaning.

They are also the category most likely to be redundant. Before writing one, check whether the
JDK or an existing dependency already provides it — a hand-rolled retry helper in a shared jar
competes with `retries-and-backoff` guidance and with the resilience library the team already
has.

**Verdict:** share if genuinely stable and not already available; expect little value.

### 2. Cross-cutting platform code — safe, and the strongest case for a library

Logging setup, tracing propagation, authentication filters, metric conventions, health
endpoints. Real value: consistency across the fleet is the whole point
(`structured-logging`, `distributed-tracing-design`, `metrics-and-cardinality`).

Two conditions make it work:

- It must be **additive and defaulted**, so upgrading is safe and skipping a version is safe.
- It must not encode business meaning, or it silently becomes category 4.

**Security-relevant platform code is the exception, and it is an important one.** An
authentication or authorisation filter cannot be "safe to lag": a bypass defect obliges every
consumer to upgrade at once, which is precisely the coordinated release this whole document
exists to avoid — and no design avoids it. Ship it as its own artefact, separate from the rest
of the platform library, publish the deployed-version inventory as a monitored metric, and set
a bounded maximum lag. "Consumers may lag" is a property of feature changes only.

**Verdict:** the best case for a shared library. Version it strictly and let consumers lag,
with the security carve-out above.

### 3. Wire contracts — share the schema, not the implementation

Request and response types, event payloads.

Sharing the _generated_ types from a schema (OpenAPI, Protobuf, Avro) is fine: the schema is
the contract, the code is a build artefact of it, and compatibility rules are checkable
(`rpc-and-api-contracts`).

Sharing _hand-written_ DTO classes in a jar is the trap. It looks identical and behaves
differently:

```java
// producer module: shared-contracts
public record OrderCreated(String orderId, BigDecimal total) { }
```

Add a required component and every consumer that _constructs_ it breaks on upgrade — while
consumers that only read it keep compiling against the new class and go on deserialising the
old wire shape. The compile error is not even the real risk; the silent shape mismatch is. The jar creates the illusion that the wire format is enforced when the
only thing enforced is a Java signature.

Worse, the jar tempts the producer into putting behaviour on the type. The moment
`OrderCreated` gains a `totalWithTax()` method, the consumer is executing the producer's
business logic at a version the producer no longer supports.

**Verdict:** share the schema and generate. If you must ship types, ship them generated,
data-only, and versioned so old and new coexist.

### 4. Domain logic — share only for a genuinely shared invariant

A tax calculation, an eligibility rule, a pricing model.

Sharing this means both services must agree on the rule **forever**, at the same version, or
diverge in production while appearing to agree. That is exactly the coupling that service
boundaries exist to prevent, and a shared jar reintroduces it while the architecture diagram
still shows two independent services.

Legitimate cases exist and are narrow: a regulatory calculation with one correct answer, a
canonical identifier format, a checksum algorithm. The test is whether the two services would
be _wrong_ to diverge. If they would merely be _inconsistent_, they should own their own copy.

**Verdict:** default to duplication. Share only where divergence is a defect, and expect to
own the compatibility burden.

### The shared entity — almost always the boundary being wrong

A shared JPA `@Entity` means two services share a schema. Everything about ownership,
independent migration and independent deployment is gone: a column rename is a fleet-wide
release, and the database becomes the integration point
(`distribution-boundaries`, `metadata-mapping`).

Where two independently owned services share an entity, independent schema evolution and incident
ownership become difficult. Prefer one data owner with an API/event contract. A consciously shared
database can still work under joint ownership, backward-compatible migrations and explicit write
authority, but it is not independent data ownership. (Two processes
deployed from one service — an API and its batch worker — are a single owner and are not this
case; they legitimately share the entity and the schema.)

## Deciding: duplication or a library

Duplication has a bad reputation earned in a single codebase, where two copies of one rule
means a fix applied once. Across independently released services the calculus is different,
because the library adds a coupling that the duplicate does not.

```text
Is divergence between the two copies a DEFECT (not merely untidy)?
        no  → duplicate. Note in both places that the other exists
              and that they are deliberately independent.
        yes ↓

Would a consumer be able to stay on an old version for a sprint?
        no  → the code encodes a contract both sides must agree on.
              Share the SCHEMA and generate, or move the logic into
              the owning service and expose it (rpc-and-api-contracts).
        yes ↓

Is there an owner who will version it, write release notes, and
support at least one previous version?
        no  → do not create the library. An unowned shared jar
              becomes the commons module.
        yes → create it, versioned, with a compatibility policy.
```

A useful default is to wait for evidence of a stable abstraction before extracting. Consumer count
alone is not a threshold: two high-risk implementations may justify one governed library, while ten
tiny coincidental helpers may remain duplicated. Price divergence defects, release coupling,
ownership and compatibility support explicitly.

## Migrating off a `commons` jar

The goal is not to delete it — that requires a fleet-wide release, which is the thing you are
trying to escape. The goal is to make it stop growing and let it shrink as consumers move.

1. **Freeze it.** No new classes. This alone stops the problem worsening and costs nothing.
2. **Inventory by consumer.** For each class, which services actually use it. This is a
   static analysis, not a survey; the result is usually that most classes have one consumer.
3. **Push single-consumer code down.** A class used by one service moves into that service.
   No coordination, no version bump for anyone else, and the jar shrinks. This is the bulk of
   the work and the cheapest part of it.
4. **Split the rest by reason to change**, not by layer. Platform concerns into a platform
   library; domain vocabulary into a vocabulary library; wire types into generated contracts.
   Each new component gets an owner and a version policy before it gets code.
5. **Leave the old artefact published**, deprecated, delegating where it still must. Consumers
   migrate on their own schedule, which is the property you wanted. Delete it when the last
   consumer drops it — possibly never, and that is an acceptable outcome.

At no point does this require every service to release at once, which is the constraint that
makes the migration feasible at all.

## Verifying independence

The claim "our services are independently deployable" is testable, and worth testing before
believing:

- **Release-history evidence.** Do the services' release tags cluster in time? Clustering is
  the symptom; the shared library is usually the cause.
- **The lag test.** Pick a service; pin every shared dependency to the version from three
  months ago; build and run its tests. If it fails, consumers cannot lag, and the coupling is
  lockstep. Note what this does and does not prove: it establishes **compile and test
  compatibility**, not wire compatibility. A fleet can pass it and still be lockstep at
  runtime because an old client cannot deserialise a new producer's payload — that is a
  separate check, against the contract (`rpc-and-api-contracts`).
- **The upgrade blast radius.** For the shared library, count consumers that must release when
  it does. If the answer is "all of them", the fleet has one deployable unit with several
  processes.
