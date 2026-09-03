---
name: java-object-contracts
description: >
  The four contracts every Java object inherits or opts into — equals, hashCode, toString,
  Comparable — plus why clone is not one of them. The equals properties and how inheritance
  breaks symmetry, the hashCode obligation and what is stable across JVMs, records'
  generated implementations and their array and floating-point edges, entity identity under
  JPA and Hibernate proxies, total ordering and TimSort contract violations, and copying
  without Cloneable. Use when equals is overridden without hashCode, when an object is a
  HashMap key, when an entity's equals is built on a database id, when a TreeSet loses an
  element, when compareTo subtracts, or when a record's generated toString reaches a log.
  Immutability is java-immutability, null handling inside these methods is java-null-safety,
  and cross-process hashing is consistent-hashing.
---

# Java Object Contracts

## Purpose

Make the methods every collection, framework and debugger silently calls behave the way
those callers assume. The failure modes are quiet by nature: an object that cannot be found
in the `HashSet` it was just added to; a `TreeSet` that drops a value it considers equal to
one already present; a sort that throws only on some inputs; a log line carrying a password
because a record generated `toString` for every component.

## Workflow

1. **Decide whether the type has value semantics at all.** Entities with identity, service
   objects, and anything mutable that will be used as a key are all better served by _not_
   overriding `equals`. Identity equality is a legitimate answer, and the default one.
2. **If it has value semantics, define the value.** List the fields that constitute it.
   Everything derived, cached, or incidental (load timestamps, cached hashes, lazy proxies)
   is excluded — and stays excluded from `hashCode` for the same reason.
3. **Write `equals` and `hashCode` together, from the same field list**, or let a record
   write both. There is no valid state where only one is overridden.
4. **Check the inheritance question explicitly.** Either the class is `final`, or `equals` is
   defined so subclasses cannot break symmetry. `references/equals-and-hashcode.md` has the
   two defensible answers and the one that is a trap.
5. **If the type will be sorted or put in a sorted collection**, implement `Comparable` for
   the natural order or supply a `Comparator` that satisfies the total-order contract. Add a
   unique deterministic tiebreaker when distinct elements must coexist in a sorted set, or when
   pagination/canonicalization must reproduce one strict sequence.
6. **Write `toString` for the person reading the incident**, then check what it discloses.
7. **Verify by contract, not by example.** Reflexivity, symmetry, transitivity and the hash
   obligation are properties: assert them over generated pairs, not over one hand-picked
   pair.

## Rules

- Override `hashCode` whenever you override `equals`. The obligation is one-directional and
  absolute: equal objects must produce equal hashes; unequal objects may collide. Violating
  it makes the object undiscoverable in every hash-based collection, including ones the code
  does not know it is in — `HashSet`, `HashMap`, `ConcurrentHashMap`, `distinct()` in a
  stream, set-based dirty tracking in an ORM.
- Never include a mutable field in `equals`/`hashCode` if instances are used as keys.
  Mutating a key after insertion moves its bucket without moving the entry: the value is
  still in the map, reachable by nothing.
- Prefer a record when the type _is_ its components. The generated `equals` and `hashCode`
  cover every component; the two edge cases to know are array components (compared by
  identity — use `List` instead) and floating-point components (compared as by
  `Double.compare`, so `NaN` equals `NaN` and `0.0` does not equal `-0.0`).
- Choose floating-point equality deliberately. `Double.compare`/`Float.compare` provide the
  wrapper/record equivalence needed by conventional collections (all NaNs equivalent, signed
  zeros distinct); primitive `==` has different semantics. Reject/canonicalize special values or
  use a tolerance in an algorithm—not in `equals`—when the domain requires another relation. And
  compare arrays with `Arrays.equals`/`Arrays.deepEquals`, never `==`. `Objects.equals`
  handles null on both sides for everything else.
- Do not depend on any hash value crossing a process, a restart or a JVM version. `Object`'s
  — and therefore every enum's — `hashCode` is identity-based and differs per run; `String`'s
  is specified and stable but is not a distribution function. Persisting, sharding,
  partitioning or deduplicating on `hashCode` is a defect; use an explicit digest or key. See
  consistent-hashing and idempotency.
- Entity equality is a lifecycle/provider decision. Reference equality may be sufficient inside
  one persistence context. For detached/cross-context values, prefer an immutable real business
  key or an application-assigned identifier available at construction. A generated id requires
  special handling: two transient instances with null ids are never equal, equality becomes
  id-based only after assignment, and hash membership must remain stable. Proxy-safe type checks
  are provider-specific—plain `instanceof`, `getClass()` and provider “effective class” helpers
  make different inheritance/loading trade-offs. Test transient, managed, detached and
  proxy/unproxied pairs with the actual provider; see orm-structural-mapping.
- `equals`, `hashCode` and `toString` must not trigger loading. Touching a lazy association
  inside them turns a debugger step, a log line or a `Set.add` into a query, and outside a
  session into a `LazyInitializationException`.
- Keep `compareTo` consistent with `equals` unless you can state why not. When it is not —
  `BigDecimal("1.0")` versus `BigDecimal("1.00")` is the canonical case — a `TreeSet` and a
  `HashSet` of the same elements have different sizes, and the sorted one is usually the
  surprise.
- Never implement `compareTo` by subtraction (`a.value - b.value`). It overflows for large
  and negative operands and returns the wrong sign. Use `Integer.compare`, `Long.compare`,
  `Double.compare`, or build the comparator with `Comparator.comparingInt(...)`.
- A comparator that violates its contract may corrupt ordered-collection semantics or be detected
  by a sorting implementation. OpenJDK object sorts commonly use TimSort and can throw
  `IllegalArgumentException: Comparison method violates its general contract!` for some input
  shapes; detection is not guaranteed. Treat the exception as evidence against the comparator,
  and test its algebraic properties over adversarial/generated triples.
- Any order used for paging, for cross-service comparison, or for a reproducible export must
  be total: append a unique tiebreaker (the id) after every business sort key. Ties broken
  arbitrarily mean two pages can both contain, or both skip, the same row.
- Write `toString` for diagnosis, and treat what it exposes as a disclosure decision. A record
  generates a `toString` containing every component — including tokens, passwords, PII and
  card numbers — and that string reaches logs, exception messages and traces. Override it on
  any type carrying a secret; structured-logging covers what belongs in a log at all.
- Nothing may parse `toString`. If a textual form is part of the API, give it a named method
  and a documented grammar (`toIso8601`, `format`), and let `toString` stay free to change.
- Avoid introducing `Cloneable` into new domain APIs. It is a marker interface around a protected,
  shallow-copy mechanism; final reference fields cannot be replaced by ordinary clone code and
  inheritance makes deep-copy semantics hard to state. Immutable objects can safely be shared or
  shallow-copied, so `Cloneable` is not inherently incompatible with them—it is usually
  unnecessary. Prefer a copy constructor, `copyOf`, explicit deep-copy operation or withers.
  Arrays retain an idiomatic public `clone()`.

## References

- [equals and hashCode](references/equals-and-hashcode.md) — read when writing or reviewing
  either method, when a class with subclasses needs value equality, when an entity or a
  proxied object needs identity, or when hash-based lookups behave inconsistently.
- [Ordering and comparators](references/ordering-and-comparators.md) — read when implementing
  `Comparable`, building a `Comparator`, putting objects in a `TreeMap`/`TreeSet`, diagnosing
  a TimSort contract violation, or defining a sort a second process or a paging query must
  reproduce.
- [toString and copying without Cloneable](references/tostring-and-copying.md) — read when
  designing a diagnostic representation, when a generated `toString` may disclose secrets, or
  when code needs a copy of an object and `clone` is being considered.
