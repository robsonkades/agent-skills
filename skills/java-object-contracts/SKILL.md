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

Inspect compiler release/toolchains, target JVM, collection usage, published consumers and
ORM/provider configuration first. References use Java SE 25; partial examples require records
and pattern `instanceof` from Java 16+, or `List.copyOf` from Java 10+ as applicable.
Adapt to the project without upgrades or preview. Missing lifecycle/provider evidence makes
equality recommendations conditional; state what must be tested before changing the contract.
Reuse available caller tests and lifecycle evidence; ask only about unresolved identity, ordering
or disclosure requirements that change the decision. Keep an adequate implementation, and separate
a demonstrated contract defect from a representation preference.

1. **Decide the intended identity.** Service objects often need reference equality. Value
   types need component equality; entities may need row/business identity across contexts.
   A mutable type can still use an immutable identity key; define lifecycle and collection
   membership before choosing, rather than excluding all mutable objects or entities.
2. **If it has value semantics, define the value.** List the fields that constitute it.
   Exclude incidental state (load timestamps, caches, lazy proxies). Derived hash inputs
   are valid only if equal objects are guaranteed to derive the same value.
3. **Write `equals` and `hashCode` together, from the same field list**, or let a record
   write both. A valid inherited hash implementation can suffice; overriding hash alone
   while retaining reference equality is not inherently a contract violation.
4. **Check the inheritance question explicitly.** Either the class is `final`, or `equals` is
   defined so subclasses cannot break symmetry. `references/equals-and-hashcode.md` has the
   two defensible answers and the one that is a trap.
5. **If the type will be sorted or put in a sorted collection**, implement `Comparable` for
   the natural order or supply a `Comparator` that satisfies the total-order contract. Add a
   unique deterministic tiebreaker when distinct elements must coexist in a sorted set, or when
   pagination must distinguish rows. Canonical output only needs to distinguish ties whose
   encoded representations differ; identical encoded values can remain interchangeable.
6. **Write `toString` for the person reading the incident**, then check what it discloses.
7. **Verify by contract, not by example.** Reflexivity, symmetry, transitivity and the hash
   obligation are properties: check individual values, pairs and triples as each law requires,
   including generated/adversarial inputs rather than one hand-picked equal pair.

## Rules

- Check `hashCode` whenever you override `equals`; retain an inherited implementation if it
  satisfies the obligation: equal objects must produce equal hashes, while unequal objects
  may collide. A violation can break equal-key lookup in hash-based collections, including ones the code
  does not know it is in — `HashSet`, `HashMap`, `ConcurrentHashMap`, `distinct()` in a
  stream, set-based dirty tracking in an ORM.
- Do not mutate equality/hash-relevant state while an instance is stored as a key.
  Changing equality/hash-relevant state after insertion can make lookup search a different
  bucket or change equality without reindexing the stored entry. Behavior is unspecified;
  iteration may still find it, so do not rely on either lookup failure or success. A controlled
  remove-before-mutation and reinsert can suffice; immutable identity avoids that lifecycle burden.
- Keep comparison-relevant state and comparator policy stable while elements/keys belong to a
  `TreeSet`/`TreeMap`, even if equality and hash codes remain unchanged. Remove before changing a
  sort key, then reinsert under the declared tie policy; changing the ordering policy may require
  rebuilding the index. These collections do not automatically reindex mutated keys.
- Prefer a record when the type _is_ its components. The generated `equals` and `hashCode`
  cover every component; the two edge cases to know are array components (compared by
  identity, which is valid only for that intended contract) and floating-point components (compared as by
  `Double.compare`, so `NaN` equals `NaN` and `0.0` does not equal `-0.0`).
- Choose floating-point equality deliberately. `Double.compare`/`Float.compare` provide the
  wrapper/record equivalence needed by conventional collections (all NaNs equivalent, signed
  zeros distinct); primitive `==` has different semantics. Reject/canonicalize special values or
  use a tolerance in an algorithm—not in `equals`—when the domain requires another relation.
  For array content equality, use matching `Arrays.equals`/`hashCode` or deep variants and
  appropriate ownership; copying alone does not change generated equality. Preserve deliberate
  identity semantics and public binary APIs instead of mandating `List<Byte>`. The reference covers
  record reconstruction and diagnostic contracts. `Objects.equals` is null-safe but not deep equality.
- Do not assume an arbitrary hash value is portable across a process, restart or JVM version. `Object`'s
  — and therefore every enum's — `hashCode` is identity-based without a cross-run guarantee; `String`'s
  is specified and stable, but that alone does not establish suitable distribution. Persisting,
  routing or deduplicating needs an explicit encoding, algorithm and collision policy, not an
  incidental object hash. Preserve a suitable specified existing protocol; see
  consistent-hashing and idempotency.
- Entity equality is a lifecycle/provider decision. Reference equality may be sufficient inside
  one persistence context. For detached/cross-context values, prefer an immutable real business
  key or an application-assigned identifier available at construction. A generated id requires
  special handling: two distinct transient instances with null ids are not equal, equality becomes
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
- Prefer `Integer.compare`, `Long.compare`, `Double.compare` or a `Comparator.comparing*`
  factory over subtraction. Subtraction needs a range proof against overflow; narrowing a
  floating-point difference can also turn distinct values into a false tie.
- A comparator that violates its contract may corrupt ordered-collection semantics or be detected
  by a sorting implementation. OpenJDK object sorts commonly use TimSort and can throw
  `IllegalArgumentException: Comparison method violates its general contract!` for some input
  shapes; detection is not guaranteed. Treat the exception as evidence against the comparator,
  and test its algebraic properties over adversarial/generated triples.
- Paging distinct rows needs a deterministic unique tiebreaker for otherwise tied keys; it
  does not solve concurrent changes or cursor/snapshot semantics. For a reproducible export,
  distinguish different encoded values; byte-identical ties do not need invented identities.
- Write `toString` for diagnosis, and treat what it exposes as a disclosure decision. A record
  generates a `toString` containing every component — including tokens, passwords, PII and
  card numbers — and that string reaches logs, exception messages and traces. Override it on
  any type carrying a secret; structured-logging covers what belongs in a log at all.
- Do not newly parse an unspecified diagnostic `toString`. Prefer a named method and documented
  grammar for a textual API (`toIso8601`, `format`); preserve or deliberately migrate an existing
  specified `toString` contract and its callers.
- Avoid introducing `Cloneable` into new domain APIs. It is a marker interface around a protected,
  shallow-copy mechanism; final reference fields cannot be replaced by ordinary clone code and
  inheritance makes deep-copy semantics hard to state. Immutable objects can safely be shared or
  shallow-copied, so `Cloneable` is not inherently incompatible with them—it is usually
  unnecessary. Prefer a copy constructor, `copyOf`, explicit deep-copy operation or withers.
  Arrays retain an idiomatic public `clone()`.

## References

Deliver the identity/equality/order contract, affected collection or lifecycle evidence,
compatibility impact and checks executed. Use pairs for symmetry/hash agreement and triples
for transitivity/ordering, including null, special numeric values and proxy states where relevant.
Finite tests expose defects; they do not prove the relation universally correct.

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
