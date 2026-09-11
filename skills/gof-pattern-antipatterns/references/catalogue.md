# Catalogue of pattern misuse

Each entry describes a candidate misuse, its possible cost and a corrective option. Establish the
actual contract/cost before reporting a defect; the listed symptoms do not prove their cause.

## Speculative interface

**Why.** "We might need another implementation." The interface is written first because it feels
like good design, and the second implementation never arrives.

**Detect.** One production implementor plus a mock. Use `rg` and inspect generated/reflected or
external implementations; a mock does not prove runtime variability.

**Cost.** Readers may follow an unnecessary hop. A shape overfitted to one implementation may not
fit a later variant; that forecast needs evidence rather than an assumed future rewrite.

**Fix.** Inline only when no present force remains. Dependency direction, ownership, security,
a deliberate test seam or a narrowed foreign API can justify one implementation (`gof-adapter`).

## Class per constant

**Why.** A `switch` over three rates is refactored into "strategies" because branching feels like a
smell.

**Detect.** Sibling classes whose bodies differ only in literals.

**Cost.** Rates spread across classes can be harder to inspect together. A code table can still
require review and deployment; release/change control may be a requirement, not a structural defect.

**Fix.** Compare a constant table/enum with validated configuration. Keep required identity,
metadata and change controls. Configuration still needs a deploy unless a reload path exists.

## Factory for a constructor

**Why.** A convention that construction "should go through a factory".

**Detect.** `createX()` whose body is `return new X(...)`, with one implementation and no
selection.

**Cost.** Potential unnecessary indirection. First exclude naming, access control, supplier/lifecycle
seams and compatibility requirements; do not assume a runtime stack-frame cost after JIT inlining.

**Fix.** Call the constructor, or use a named static factory on the type if the name adds meaning
(`gof-factory-method`).

## Abstract Factory everywhere

**Why.** One legitimate family factory becomes the place to put every `createX` anyone needs.

**Detect.** No shared family-selection or compatibility invariant across products. Products can be
used at different call sites while still needing consistent family selection.

**Cost.** A service locator with a factory's name: every caller couples to one type that knows
everything, and the family guarantee it was built for no longer applies to most of its methods.

**Fix.** Split by usage cluster, or delete and inject the products directly
(`gof-abstract-factory`).

## Builder for a trivial object

**Why.** Consistency with a codebase that builds everything.

**Detect.** A small constructor already expresses the required values clearly and the builder adds
no meaningful naming, defaults, compatibility or staged construction contract.

**Cost.** A conventional optional-setter builder may defer missing values to runtime; staged or
required-argument builders need separate assessment. Multiple paths must enforce the same invariants.

**Fix.** The record's canonical constructor, or named static factories (`gof-builder`).

## Singleton as global state

**Why.** "It should exist once" — where the requirement was access, not uniqueness.

**Detect.** `getInstance()`. A `reset()` method used only by tests. Tests that pass alone and fail
in a suite.

**Cost.** Dependencies invisible to constructors; initialisation order nobody chose; order-dependent
tests; and process-local uniqueness failing to hold across replicas. Eight independent 100/s
limits do not enforce one cluster-wide 100/s budget: their configured rates sum to 800/s before
traffic distribution and other limits. That arithmetic is not measured throughput.

**Fix.** Explicitly owned instances, injected with the required application/container scope.
One bean is not process-global or cluster-global uniqueness (`gof-singleton`).

## Observer leak

**Why.** Registration is easy and deregistration has no obvious owner.

**Detect.** `register`/`addListener` with no matching removal on any path. Lambdas registered
without keeping a reference need a returned subscription/token, owner-scoped disposal or another
documented removal mechanism. Matching publisher/subscriber lifetimes may need no early removal.

**Cost.** Slow heap growth correlated with sessions or documents; the subject's listener list is
the dominant retainer in a heap dump. Also: listeners firing after their owner is logically
disposed, acting on stale state.

**Fix.** A subscription object that is `AutoCloseable`, or explicit lifecycle pairing
(`gof-observer`).

## Mediator god object

**Why.** Each new coordination rule is one more method on the hub, and each addition is reasonable.

**Detect.** Unrelated protocols, tests needing unrelated setup and changes concentrated for unrelated
reasons. Participant/fake counts alone are not defects.

**Cost.** Unrelated changes and test setup concentrate in one class. Runtime serialization is a
separate hypothesis: inspect shared state, locks/mailboxes and workload before claiming a bottleneck.

**Fix.** Split unrelated protocol ownership; retain cohesive coordination even when large.
Some responsibilities may become plain listeners, with no predicted fraction (`gof-mediator`).

## Opaque decorator stack

**Why.** Layers are added one at a time, each justified, and the order is never written down.

**Detect.** Order and failure/context propagation are unclear at the wiring site; depth alone
does not establish a defect.

**Cost.** Nobody can predict the semantics. Whether the timeout bounds one attempt or the whole
operation, whether an open breaker prevents retries, whether a cache hit skips the metrics — all
undecidable by reading (`gof-decorator`).

**Fix.** Make the order and rationale discoverable; reuse or add relevant composed-behavior checks.
Keep a fixed stack that expresses useful contracts. Collapse only when it reduces demonstrated
cost while preserving order, outcome, lifecycle and framework behavior.

## Proxy hiding a network

**Why.** An interface written for a local implementation is later implemented over HTTP, and the
"benefit" is that no caller changed.

**Detect.** A getter or a per-item method whose implementation makes a call. A loop over a
collection calling such a method.

**Cost.** N per-item remote calls, plus an initial fetch when present, from code that looks like
field access; latency omitted from local reasoning; retries the caller never asked for; a timeout presented as an ordinary
exception.

**Fix.** Make remote cost/outcomes explicit and compare justified bulk operations, deadlines and
failure vocabulary. Per-item calls may remain appropriate; evolve published APIs compatibly rather
than silently breaking callers (`gof-proxy`, `rpc-and-api-contracts`).

## Flyweight contention

**Why.** "Lots of small objects" is assumed to be a memory problem and pooling is assumed to be
free.

**Detect.** A shared pool on a hot path with no heap measurement behind it; `computeIfAbsent` with
an expensive mapping function; pooled objects that are short-lived.

**Cost.** Lookup, retention and contention may outweigh saved allocation/construction work; neither
throughput loss nor bin-lock contention follows from the API name. Measure the complete path
(`gof-flyweight`).

**Fix.** Reuse representative retention/construction evidence or obtain the smallest missing check;
do not require a new heap dump when adequate evidence exists. Compare existing sharing, applicable
String backing-array deduplication and boundary canonicalisation; dedup is not relevant to every
object/lifetime/collector. Keep ordinary objects or an adequate measured pool. Bounded admission,
confinement or a validated closed domain may help; short lifetime alone does not bound peak memory.

## Visitor over a growing type set

**Why.** Visitor was correct when the type set was stable, and the domain changed.

**Detect.** Every release adds an element type and breaks every visitor.

**Cost.** The expression problem, chosen in the wrong direction: each new type is a change to N
operations; a permissive default can accidentally skip a new type. Check whether its fallback is
intentional and satisfies the operation's contract.

**Fix.** Move behaviour back onto the elements for the operations that are intrinsic; keep the
fold only for the operations that genuinely belong outside (`gof-visitor`).

## Template Method with nine hooks

**Why.** Each new variant needs one more variation point, and adding a `protected` method is easy.

**Detect.** Hooks with unclear ordering/invariants; a subclass overriding a hook to do nothing; a hook requiring
`super.hook()` at a specific point; a subclass overriding the template method itself.

**Cost.** A base class nobody can subclass correctly without reading its source, and a base-class
change that is an unreviewed change to every subclass.

**Fix.** Inventory overrides and extension contracts first, then migrate to composed steps where
justified. Making a method final can break external subclasses and framework proxies; do not use
that change as a substitute for the inventory (`gof-template-method`).

## Strategy class for a lambda

**Why.** The pattern is remembered as "an interface and implementations".

**Detect.** Implementations with one method, no state, no key, no metadata, each a single
expression.

**Cost.** Five files for five expressions, and a selector to maintain.

**Fix.** A domain-named functional interface and lambdas — with a class kept for any variant that
needs a name in a stack trace or a profile (`gof-strategy`).

## Prototype with `clone()`

**Why.** `Cloneable` looks like the language's answer to copying.

**Detect.** `implements Cloneable`; `super.clone()`; a "copy" sharing a `List` with its original.

**Cost.** Object.clone copies reference fields shallowly; shared mutable referents can violate
the intended copy contract. ConcurrentModificationException is not guaranteed or a race detector.
Custom clone implementations may repair aliasing; constructors are not run by Object.clone.

**Fix.** Prefer a copy constructor/factory when it clarifies ownership. Adding a field does not
automatically break such methods: review field coverage and test mutation independence for owned
mutable state. Preserve intentional sharing and existing public clone contracts (`gof-prototype`).

## Pattern by precedent

**Why.** "Every service in this codebase has a Facade, a Factory and a Manager."

**Detect.** Ask why a specific abstraction exists and receive an answer about consistency.

**Cost.** Every entry above, propagated at the rate the codebase grows, with each instance
defended by the existence of the others.

**Fix.** Two options, and either is fine: re-derive the abstraction for this module and keep it if
it holds, or record the convention explicitly as a decision with its rationale so it can be
re-opened on evidence rather than defended by inertia
(`architecture-decision-making`).

## Pattern matching by name

**Why.** The problem contains a word that appears in a pattern's name — "we need to adapt the
payload", "there is a chain of checks", "the state changes".

**Detect.** A design discussion in which a pattern name appears before the forces are stated.

**Cost.** The chosen pattern solves a neighbouring problem convincingly enough that the real one is
never examined. No frequency estimate follows from these examples.

**Fix.** Restate the problem with no pattern name in it and re-decide from the restatement
(`gof-pattern-thinking`).

Source: [Object.clone contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html).
