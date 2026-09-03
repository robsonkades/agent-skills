---
name: java-object-construction
description: >
  Choosing how an object comes into existence in Java: static factory versus public
  constructor, the of/from/valueOf/getInstance naming conventions, instance control
  (caching, canonicalisation, value-based classes), enum and holder singletons,
  noninstantiable utility classes, and passing collaborators in rather than hardwiring them
  with new. Use when a class has several constructors distinguished only by parameter types,
  when a constructor does work beyond assigning fields, when a singleton or a static mutable
  field is proposed, when new appears inside domain logic for something the code can never
  substitute in a test, or when a factory hands back a type its callers should not be able
  to name. Does not cover builders and fluent chains (java-fluent-apis), which dependency
  edge should exist at all (java-dependency-inversion), defensive copying of components
  (java-immutability), or releasing what construction acquires (java-resource-management).
---

# Java Object Construction

## Purpose

Decide how instances are obtained, and keep that decision reversible. Three failure modes
this exists to prevent: the overload set where callers pick the wrong constructor because
the types happen to match; the constructor that does real work — I/O, registration,
overridable calls — so the object is unusable in a test and observable half-built; and the
singleton or static field that is treated as global state when its actual scope is one
class loader in one JVM among N replicas.

## Workflow

1. **State what the caller needs to say.** If two ways of creating the object differ in
   _meaning_ rather than in parameter types, that difference belongs in a name, not in an
   overload. `Money.ofMinor(1050)` and `Money.ofMajor(new BigDecimal("10.50"))` should not be
   two ambiguous constructors—and an exact decimal must not pass through a `double`.
2. **Pick the cheapest form that carries it.** Canonical/compact constructor of a record →
   named static factory → static factory plus private constructor → builder. Stop at the
   first that fits; `java-fluent-apis` owns the builder threshold.
3. **Decide instance control explicitly.** Does every successful call have to produce a fresh
   identity? A factory may cache, canonicalise, share or allocate. Identity becomes a contract
   only if the API promises it; otherwise callers must use value equality. Bound any cache.
4. **Keep ordinary domain constructors side-effect-contained.** Validate, normalize, assign.
   Resource-owning types may necessarily acquire a resource and must define failure/cleanup
   semantics. Never register/start threads/call overridable methods/let `this` escape during
   construction—see java-immutability's safe-publication rules.
5. **Push variability to the caller.** Anything the class cannot substitute later — clock,
   HTTP client, repository, random source — arrives through the constructor. `new` on such
   a thing inside domain logic is the decision you will need to undo first.
6. **Verify.** Every creation path is reachable in a test without a container or a network;
   no static holds mutable state that outlives a request; and each factory's identity
   promise (fresh, cached, or unspecified) is written down.

## Rules

- Prefer a named static factory when the class has more than one meaningful way to be
  created, when creation may return a cached or a substituted instance, or when the return
  type should be an interface or sealed supertype rather than the concrete class. Prefer a
  public constructor when there is exactly one way, it always allocates, and the type is
  the type.
- Follow the platform naming conventions — `of`, `from`, `valueOf`, `instance`/`getInstance`,
  `create`/`newInstance`, `copyOf`, `parse`. A factory called `build`, `make` or `get` on a
  type whose neighbours use `of` costs the caller a Javadoc lookup.
- A static factory with a private constructor removes subclassing. That is usually the
  point; take it deliberately, not by accident, and say so in the Javadoc rather than
  leaving callers to discover it from a compile error.
- Document whether fresh or canonical identity is guaranteed. An implementation is free to add
  or remove an undocumented cache while preserving value semantics; callers using `==` on that
  basis are wrong. A documented freshness/canonicalization guarantee is an API commitment and
  constrains future implementations.
- Never cache without a bound. An unbounded interning map keyed by user or tenant data is a
  leak with a factory in front of it — see java-reference-types-and-leaks.
- Do not synchronise on, or key identity off, a value-based class (`Optional`, `LocalDate`,
  `Integer`, the boxed primitives). Their identity is explicitly unspecified and the
  identity-sensitive operations are documented as subject to failure in a future release.
- Enforce noninstantiability with a private constructor that throws, not with `abstract`:
  an abstract class is still instantiable through a subclass, and reads as "extend me".
- Within standard reflection and Java serialization, a single-element enum has the strongest
  built-in singleton guarantees. A `private static final` field plus private constructor can be
  bypassed by deep reflection (subject to module/access policy) and serialization creates another
  instance unless `readResolve` returns the canonical one. Fields need not all be transient for
  identity, though serializing instance state may be wasteful or unsafe.
- A singleton's scope is one class loader in one JVM. It is not a global lock, not a
  cluster-wide counter and not a distributed cache. When uniqueness must hold across
  replicas, that is leader-election or distributed-locks-and-leases, and the local
  singleton is at best a per-process handle to it.
- Static mutable state makes tests order-dependent and makes horizontal scaling change
  behaviour. If it must exist, it belongs in an injected, replaceable object whose lifetime
  the composition root controls — a container-managed singleton bean is that, a `static`
  field is not.
- Prefer the lazy-initialisation holder class to double-checked locking when a static
  really must be built lazily; and prefer eager initialisation to both unless the cost of
  building it is proven and the object is genuinely often unused. java-memory-model owns
  the correctness argument.

## References

- [Factories and instance control](references/factories-and-instance-control.md) — read
  when choosing between a constructor, a named factory and a record's canonical
  constructor, when naming a factory, when a factory will cache or canonicalise
  instances, or when a factory's return type must survive API evolution.
- [Singletons and static state](references/singletons-and-static-state.md) — read whenever
  a singleton, a static registry, a static cache or a static mutable field is proposed or
  found: the forms, what each actually defends against, the testing and class-loader
  consequences, and what changes when the process is one of many.
