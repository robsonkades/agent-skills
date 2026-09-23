# Shared Code Across a Service Fleet

Independent deployment means a supported service change need not require simultaneous peer
deployment. Shared libraries create compatibility obligations; whether they force lockstep
depends on version policy, runtime contracts and support windows.

## A shared library creates build-time and release coupling

The reasoning teams apply to runtime calls stops at the build boundary, and it should not.

```text
Runtime coupling                    Build-time coupling
─────────────────────────────       ─────────────────────────────
A calls B synchronously             A compiles against lib v2
    → B's failure may affect A          → affected A versions may need a security update
    → visible in a trace                → invisible in a trace
    → everybody prices it               → priced at zero
```

Unlike a synchronous RPC, a pinned library does not make a consumer unavailable when its producer
or publisher is down. The useful analogy is coordinated evolution, not runtime failure propagation.
The failure mode is a **lockstep release**: a change to the shared library that everyone must
take on the same schedule becomes a coordinated release. Distinguish genuinely simultaneous
compatibility requirements from rolling upgrades within a security deadline, or a voluntary
release train. A common deadline does not by itself require atomic fleet deployment.

The severity depends on whether consumers may lag:

- **May lag freely** (library is versioned, old versions keep working, no shared state): the
  coupling is real but cheap. This is the acceptable case.
- **Must upgrade in step** (a required change has no supported mixed-version state or staged
  transition): the affected consumers need coordinated evolution. Name the incompatible
  contract and the versions affected; encoding a wire format or schema alone does not prove
  lockstep. Record a binding release policy separately from technical necessity.

## The four kinds of shared code

Not all sharing is equal. Classify before deciding.

### 1. Generic technical utilities — usually safe, rarely worth writing

String/date helpers may be stable, but locale/time-zone assumptions and retry semantics can
encode policy. Inspect behavior and consumers before treating a helper as domain-neutral;
retry wrappers especially need deadlines, idempotency and load-amplification review.

They are also the category most likely to be redundant. Before writing one, check whether the
JDK or an existing dependency already provides it — a hand-rolled retry helper in a shared jar
competes with `retries-and-backoff` guidance and with the resilience library the team already
has.

**Verdict:** share if genuinely stable and not already available; expect little value.

### 2. Cross-cutting platform code — useful with an explicit compatibility policy

Logging setup, tracing propagation, authentication filters, metric conventions, health
endpoints. Real value: consistency across the fleet is the whole point
(`structured-logging`, `distributed-tracing-design`, `metrics-and-cardinality`).

Two conditions make it work:

- Additions and defaults must preserve the supported observable contract; an additive API
  or new default alone does not establish safe behavior or skipped-version compatibility.
- It must not encode business meaning, or it silently becomes category 4.

**Security fixes can shorten the support window.** Assess affected versions and exposure,
then set a remediation deadline with the security owner. A compatible fix or backport can
often roll out independently; protocol changes may need staged compatibility. Track deployed
versions and exceptions, verify the hostile case is rejected after upgrading, and consider
separating security code when it reduces unrelated upgrade burden. Do not infer that every
consumer must deploy at the same instant.

**Verdict:** the best case for a shared library. Version it strictly and let consumers lag,
with the security carve-out above.

### 3. Wire contracts — share the schema, not the implementation

Request and response types, event payloads.

Generated types from a schema (OpenAPI, Protobuf, Avro) can keep the authoritative contract
explicit, but generator/runtime versions and schema changes still affect source, binary and
wire compatibility. Apply the format's compatibility rules and old/new peer tests
(`rpc-and-api-contracts`).

Hand-written DTO classes need the same explicit wire contract and compatibility checks.
Neither Java signatures nor generation alone establish them. Partial Java 16+ illustration
(requires `java.math.BigDecimal`; not an executable program):

```java
// producer module: shared-contracts
public record OrderCreated(String orderId, BigDecimal total) { }
```

Adding a record component changes the canonical constructor signature. Callers using the
old constructor break unless it is retained through an explicit overload; existing accessor
calls may remain valid. Deserialization of old/new payloads depends on the serializer,
configuration, defaults and required-field semantics, not on successful Java compilation.

Adding `totalWithTax()` also distributes business logic to consumers at independently
pinned versions. Treat that as a domain-rule ownership decision and state supported versions;
it does not become unsafe merely because a DTO has a method.

**Verdict:** prefer an explicit schema where the transport supports it. If shipping types,
keep them data-focused and versioned, with supported old/new peers tested. Separately
deployed consumers may pin different jar versions; do not assume two versions of the same
classes coexist safely in one classloader.

### 4. Domain logic — share only for a genuinely shared invariant

A tax calculation, an eligibility rule, a pricing model.

Sharing this creates a need to govern rule versions and effective dates. Independently pinned
jars can diverge; a shared source repository does not ensure runtime agreement. Determine
whether historical/versioned rules may coexist or whether one authoritative service/data
contract must resolve the decision for both consumers.

Legitimate cases exist and are narrow: a regulatory calculation with one correct answer, a
canonical identifier format, a checksum algorithm. The test is whether the two services would
be _wrong_ to diverge. If they would merely be _inconsistent_, they should own their own copy.

**Verdict:** default to duplication. Share only where divergence is a defect, and expect to
own the compatibility burden.

### The shared entity — almost always the boundary being wrong

A shared JPA `@Entity` couples mappings and may signal shared database ownership; it does not
prove that processes use the same database or require simultaneous deployment. Inspect actual
schemas, writers and supported migration states before concluding that a column change
requires fleet-wide coordination
(`distribution-boundaries`, `metadata-mapping`).

Where two independently owned services share an entity, independent schema evolution and incident
ownership become difficult. Prefer one data owner with an API/event contract. A consciously shared
database can still work under joint ownership, backward-compatible migrations and explicit write
authority, but it is not independent data ownership. (Two processes
deployed from one service — an API and its batch worker — are a single owner and are not this
case; they legitimately share the entity and the schema.)

## Deciding: duplication or a library

Duplicating one rule can require repeating fixes and tests. Across independently released
services, compare that maintenance cost with a library's compatibility and upgrade obligations.
Keep independently owned domain policies separate as described above. For stable technical or
platform code, reuse can be worthwhile even when divergence would be allowed; the absence of a
mandatory shared invariant does not by itself settle the economics.

```text
Do consumers need the same stable abstraction, rather than coincidentally similar code?
        no  → keep independent copies and record the ownership/change reasons.
        yes ↓

Does reuse avoid enough maintenance cost or correctness risk to justify a release unit?
        no  → keep it local; name the evidence that would justify extraction later.
        yes ↓

Can supported old consumers coexist for the agreed upgrade window?
        no  → identify the compatibility or remediation constraint. A schema
              with compatible evolution, supported backports, or one owning
              service may help; generation alone does not permit coexistence.
        yes ↓

Is there an owner who will version it, write release notes, and
support the declared compatibility window?
        no  → do not create the library. An unowned shared jar
              becomes the commons module.
        yes → create it, versioned, with a compatibility policy.
```

A useful default is to wait for evidence of a stable abstraction before extracting. Consumer count
alone is not a threshold: two high-risk implementations may justify one governed library, while ten
tiny coincidental helpers may remain duplicated. Price divergence defects, release coupling,
ownership and compatibility support explicitly.

## Migrating off a `commons` jar

The goal is to reduce unwanted consumer obligations while retaining supported artifacts.
Removing classes from a new major release need not move all consumers at once if their old
versions remain supported. Do not mistake deleting published artifacts for completing migration.

1. **Stop unrelated growth.** Agree an owner and scope for new work; retain required fixes
   and compatibility bridges during migration. A freeze has delivery/support costs too.
2. **Inventory by consumer and supported version.** Combine source/bytecode analysis with
   reflection, service-loader metadata, configuration, serialization and external consumer
   evidence. Missing search hits do not prove an unused public class.
3. **Move single-consumer code into its owner** while keeping old published versions intact.
   Deprecate or retain compatibility bridges in supported release lines; removing public
   classes is a separate breaking change. Check duplicate classes, package names and JPMS
   split packages if old and extracted artifacts coexist in a consumer.
4. **Split the rest by reason to change**, not by layer. Platform concerns into a platform
   library; domain vocabulary into a vocabulary library; wire types into generated contracts.
   Each new component gets an owner and a version policy before it gets code.
5. **Leave the old artefact published**, deprecated, delegating where it still must. Consumers
   migrate within the support window. Retire maintenance only after supported consumers
   migrate; do not delete or overwrite released artifacts needed for reproducible builds.

This sequence can avoid simultaneous releases when supported versions and intermediate contracts
can coexist. Check each checkpoint and recovery path; where coexistence is impossible, retain the
constraint and assess a bounded coordinated cutover rather than promising independent rollout
(`architecture-refactoring-paths`).

## Verifying independence

The claim "our services are independently deployable" is testable, and worth testing before
believing:

- **Release-history evidence.** If release tags cluster, inspect why: shared campaigns or
  tooling can batch releases without a technical constraint. Confirm the required edge.
- **The coexistence test.** Keep an existing supported consumer artifact with its original
  dependency set unchanged while upgrading another consumer/provider. Exercise their actual
  shared protocol/schema and rollout/rollback combinations. Separately rebuild old consumer
  sources against a candidate compatible library and test already-built old binaries with it
  when that deployment mode is supported. Recompiling today's source against an arbitrarily
  old library tests the wrong direction: using a newly added API does not imply lockstep.
- **The publication test.** Build a separate consumer from the candidate artifact and
  metadata, then exercise its resolved runtime dependencies. Follow the
  [consumer dependency checks](component-principles.md#check-the-published-consumer-boundary);
  a passing producer build or converged dependency tree alone does not establish compatibility.
- **The upgrade blast radius.** Count consumers affected and distinguish upgrades required
  eventually, within a deadline, or simultaneously. Only the last establishes a lockstep
  deployment requirement for that change; record the contract that forces it.
