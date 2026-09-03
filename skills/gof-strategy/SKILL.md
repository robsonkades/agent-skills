---
name: gof-strategy
description: >
  Strategy in modern Java, separated into three things that are usually conflated: the design
  concept (an algorithm varies), the classical class hierarchy, and the lambda or functional
  interface that expresses it today. Covers when a function value is enough and when a named type earns its
  keep, selecting a strategy by key instead of an if-else chain, the trap of strategies that
  differ only in constants and may be configuration, how shared state changes concurrency
  obligations, and the contract test implementations can share. Use when an algorithm must vary
  at runtime, when a switch over a type code keeps growing, when a class hierarchy exists whose
  members are one-line methods, or when strategy classes differ only in a rate or a threshold. Does not cover behaviour that changes with the
  object's own state (gof-state), two independently varying hierarchies (gof-bridge), an
  algorithm skeleton with varying steps (gof-template-method), or choosing which object to create
  (gof-factory-method).
---

# Strategy

## Purpose

Let an operation's algorithm vary independently of the code that uses it. Strategy is the most
useful and frequently over-implemented pattern in object design. The design concept can be sound
while a class hierarchy, lambda, enum strategy, table or direct branch is the better mechanism.

Three things share the name, and separating them settles most arguments:

```text
The concept        "This algorithm varies, and callers should not know
                   which one runs." Nearly always sound.

The class          interface + N implementations + a selector. One
hierarchy          expression of the concept, and the heaviest.

The function       a lambda or method reference passed where the
value              algorithm is needed. Another expression of the same
                   concept, and usually the right one.
```

A `Comparator` lambda is Strategy. Say so in review — recognising the intent is what keeps the
design legible; hand-building the hierarchy is what makes it bulky.

## When it is the answer

```text
An operation has more than one algorithm and the choice is made at
runtime — by configuration, by a caller, by data
        → Strategy, in whichever mechanism fits.

A switch over a type code keeps growing, and each branch is a
self-contained calculation
        → Strategy, keyed by that code.

Callers must be able to supply their own algorithm
        → Strategy as a functional interface in your public API.
```

## When it is not

- **One algorithm exists and there is no boundary/ownership reason to abstract it.** An interface
  may be premature, while a published port, platform SPI or testable external policy can justify
  one implementation (`gof-pattern-thinking`).
- **The variants differ only in data and share identical rules.** Prefer typed configuration.
  Separate named policies can still be warranted when validation, authorization, rollout,
  compatibility or lifecycle differs.
- **The algorithm depends on the object's own state and changes as that state changes.** That is
  State (`gof-state`).
- **Only part of an algorithm varies, inside a fixed sequence.** That is Template Method — or,
  better, a fixed method taking the varying part as a function (`gof-template-method`).
- **The branches are not self-contained.** If each `switch` arm mutates shared state and depends
  on the others, extracting them into strategies moves a tangle rather than resolving it.

## Lambda or named type?

```text
A lambda / method reference is enough when:
    one method, stateless, no metadata, no key, and the call site
    supplies it directly

A named type earns its place when:
    the strategy has more than one operation
      (apply, plus supports(...), plus a name for logging)
    it must be selected by a key from data
    it must be injected, configured, or decorated
    it must appear in stack traces, thread dumps and metrics by name
    it has its own tests and its own reason to change
```

Both are Strategy. The failure is not choosing the "wrong" one — it is building a five-class
hierarchy when three lambdas would do, or scattering anonymous lambdas that nobody can find when
the calculation misbehaves in production.

## Selection

```java
// what grows badly
if (code.equals("FLAT")) return flat(order);
else if (code.equals("TIERED")) return tiered(order);
else if (code.equals("WEIGHT")) return byWeight(order);
// ... and the else branch, which returns zero and nobody noticed

// keyed lookup, with the failure defined
private final Map<ShippingMethod, ShippingCost> byMethod;

ShippingCost costFor(ShippingMethod method) {
    var strategy = byMethod.get(method);
    if (strategy == null) throw new UnsupportedShippingMethod(method, byMethod.keySet());
    return strategy;
}
```

Spring will inject `List<ShippingCost>` or `Map<String, ShippingCost>` of every implementation,
which is convenient and has one hazard: the set becomes whatever is on the class path, so an
accidental extra bean silently joins it and a missing one silently does not. Build the map from an
explicit key the strategy declares, and fail at startup if a key is duplicated or a required key is
absent.

Where the key set is closed and owned, a sealed type with an exhaustive `switch` beats a map: the
compiler enumerates the cases (`java-composition-over-inheritance`).

## Decision rules

```text
IF strategies differ only in values
THEN first model typed validated configuration. Keep named strategies only when the
     values carry distinct policy ownership, compatibility or behavior contracts.

IF a strategy holds mutable state and is shared
THEN define synchronization, confinement or immutable snapshots. Stateless strategies
     are easiest to share, but stateful incremental algorithms are valid when lifetime
     and thread-safety are part of the contract.

IF selection is by a chain of if-else on a code
THEN compare an exhaustive switch for a closed set with a validated map/registry for
     open contributions. Define unknown/default semantics explicitly.

IF a strategy needs to know whether it applies
THEN it has two operations (supports + apply) and wants a named type,
     not a lambda. Consider Chain of Responsibility if several may
     apply in order (gof-chain-of-responsibility).

IF strategies are selected from data crossing a trust boundary
THEN validate/authorize against the supported registry. Extensible sets need not be
     compile-time closed, but untrusted input must never become an arbitrary class name.

IF a calculation is hard to attribute in profiles/logs
THEN use a named method/type, explicit metric tag, or registration metadata. A whole
     class is one option, not the only diagnostic identity.

IF every strategy needs the same pre- and post-processing
THEN that is a template, and it belongs in the caller once — not
     copied into each strategy.

IF the strategy choice changes system behaviour beyond this call —
partitioning, routing, serialisation
THEN changing it is a migration, not a configuration flip
     (message-ordering-and-partitioning).
```

## Cross-cutting checks

- **Concurrency.** A strategy selected once and shared is used by every thread. Any field it holds
  must be immutable, and any per-call state must be passed in. The recurring bug is a strategy
  accumulating results in a field — correct in a single-threaded test, wrong under load, and the
  symptom is one request's data appearing in another's (`java-memory-model`).
- **Distribution.** Several of the most consequential strategies in a distributed system are
  chosen by configuration and have system-wide effects: the partitioning strategy determines
  ordering guarantees, the serialisation strategy determines compatibility, the retry policy
  determines amplification under failure, the load-balancing strategy determines tail latency.
  Changing one is a migration with a compatibility window, not a switch to be flipped
  (`sharding-and-partitioning`, `load-balancing-and-routing`, `retries-and-backoff`).
- **Performance.** Dispatch and inlining depend on receiver profiles, compilation tier and code
  shape rather than a fixed implementation count. Non-capturing lambdas may be cached; capturing
  lambdas can allocate and either form may inline. Inspect profiles/compilation on measured hot paths
  (`jit-inlining-and-escape-analysis`).
- **Testing.** Three levels. Each strategy tested directly against its own inputs — the pattern's
  main dividend, since each is a pure function. The selector tested separately, including the
  unknown-key case. And a shared contract test that every implementation must pass, which is what
  stops the fifth strategy from quietly violating an invariant the first four honour.

## Review checklist

- [ ] Variation exists today, or a concrete port/SPI/ownership boundary justifies one implementation
- [ ] Strategies differ in behaviour, not only in constants
- [ ] Strategy state has explicit immutability, confinement or synchronization semantics
- [ ] Selection is keyed, and an unknown key fails loudly
- [ ] External keys are validated/authorized against a supported registry
- [ ] Strategies used in hot or diagnosed paths have names, not anonymous lambdas
- [ ] Shared pre/post processing lives in the caller, not duplicated per strategy
- [ ] A contract test runs against every implementation
- [ ] Strategy choices with system-wide effects are treated as migrations

## References

- [Concept, mechanism and selection](references/concept-mechanism-selection.md) — the three levels
  in detail; lambda against named type with the criteria that decide; selection mechanisms
  compared (map, sealed switch, injected list, `ServiceLoader`) with their failure modes; the
  constants-are-configuration test; and the shared contract test. Read when choosing a mechanism.
- [Worked example](references/worked-example.md) — shipping cost calculation taken from a growing
  if-else to lambdas, then to named strategies when logging, metrics and a `supports` check were
  needed, with the unknown-method failure, the stateless-strategy bug found under load, and the
  contract test. Read when implementing.
