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

Use Java 21 without preview as the example baseline. Inspect compiler/toolchain, runtime,
framework construction/serialization rules and supported callers before changing a creation
path. Do not upgrade Java or add a container for these examples. Unless marked complete, reference
code blocks are partial or alternative sketches; supply imports and collaborators, and compile
alternatives separately. Missing lifecycle/identity evidence makes a recommendation conditional.

1. **Sketch ordinary, advanced and invalid consumer calls before declarations.** Inspect existing
   callers: required values, meaningful defaults, conversion failures, repeated construction,
   aliases and who owns a supplied or acquired resource. Resolve material unknowns from project
   evidence or a focused question; keep minor reversible assumptions explicit.
   If two ways of creating the object differ in
   _meaning_ rather than in parameter types, that difference belongs in a name, not in an
   overload. `Money.ofMinor(1050)` and `Money.ofMajor(new BigDecimal("10.50"))` should not be
   two ambiguous constructors—and an exact decimal must not pass through a `double`.
2. **Compare the forms that address the observed caller risk.** An ordinary constructor is often
   enough; a record fits transparent component values, a named factory expresses distinct creation
   meanings or instance control, and a builder can clarify costly optionality or invalid combinations.
   Compare lifecycle, invariants, framework paths and existing callers, not a fixed progression or
   parameter threshold. Keep the simplest viable form, including the existing one, and state what
   new caller evidence would change the choice; `java-fluent-apis` owns builder mechanics.
3. **Decide instance control explicitly.** Does every successful call have to produce a fresh
   identity? A factory may cache, canonicalise, share or allocate. Identity becomes a contract
   only if the API promises it; otherwise callers must use value equality. Bound any cache.
4. **Keep ordinary domain constructors side-effect-contained.** Validate, normalize, assign.
   Resource-owning types may necessarily acquire a resource and must define failure/cleanup
   semantics. Never register/start threads/call overridable methods/let `this` escape during
   construction—see java-immutability's safe-publication rules.
5. **Make variable collaborators explicit.** Pass a clock, HTTP client, repository or random source
   when its policy, lifetime or substitution matters; a factory can assemble them at the composition
   root. Ordinary owned values may still use `new`. Do not introduce an interface or container merely
   to avoid allocation syntax, and distinguish borrowed collaborators from owned resources.
6. **Verify.** Domain construction is testable without unrelated infrastructure. Resource-owner
   integration tests cover acquisition failure and cleanup using isolated resources. Any static
   mutable state has a justified scope, concurrency and shutdown policy; each factory's identity
   promise (fresh, cached, or unspecified) is written down.

## Rules

- Prefer a named static factory when the class has more than one meaningful way to be
  created, when creation may return a cached or a substituted instance, or when the return
  type should be an interface or sealed supertype rather than the concrete class. Prefer a
  public constructor when there is exactly one way, it always allocates, and the type is
  the type.
- Follow the platform naming conventions — `of`, `from`, `valueOf`, `instance`/`getInstance`,
  `create`/`newInstance`, `copyOf`, `parse`. A factory called `build`, `make` or `get` on a
  type whose neighbours use `of` may be surprising; an established domain/framework vocabulary can
  justify it. The documented behavior, not the name, determines freshness, validation and ownership.
- A private-constructor-only surface blocks ordinary external subclass construction; nested
  code with private access is a separate case. Use `final` when the type must prohibit all
  subclasses. Blocking external extension is usually the
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
- Prevent ordinary external construction of a utility class with a private constructor.
  Throwing from it can catch accidental internal invocation; `final` expresses no extension,
  but neither is required just to block external construction. `abstract` alone permits
  concrete subclasses and suggests an extension contract.
- Within standard reflection and Java serialization, a single-element enum has the strongest
  built-in singleton guarantees. A `private static final` field plus private constructor can be
  bypassed by deep reflection (subject to module/access policy) and serialization creates another
  instance unless `readResolve` returns the canonical one. Fields need not all be transient for
  identity, though serializing instance state may be wasteful or unsafe.
- A singleton belongs to its defining class identity and class loader in one JVM. It is not a global lock, not a
  cluster-wide counter and not a distributed cache. When uniqueness must hold across
  replicas, define the invariant and hand it to the relevant distributed-system design;
  leader-election or distributed-locks-and-leases may apply, but neither is automatically required
  or sufficient. The local singleton is at best a handle to that mechanism.
- Static mutable state can couple tests and hide per-replica behavior. Prefer an injected,
  replaceable object for application/tenant/request state. Intentionally class-loader-scoped
  infrastructure may remain static with explicit bounds, concurrency and lifecycle policy;
  a container-managed singleton also needs the right scope and shutdown contract.
- Prefer the lazy-initialisation holder class to double-checked locking when a static
  really must be built lazily; and prefer eager initialisation to both unless the cost of
  building it is proven and the object is genuinely often unused. java-memory-model owns
  the correctness argument.

For the change report, show the decisive consumer calls, creation/identity contract, preserved
callers, ownership on success/failure, and targeted checks run. Exercise every supported creation
path against the same invariants, including a record's canonical constructor; a factory-only check
does not protect paths that bypass it. Tests of one implementation do not establish a new
public identity guarantee or a cluster-wide singleton.

## References

- [Factories and instance control](references/factories-and-instance-control.md) — read
  when choosing between a constructor, a named factory and a record's canonical
  constructor, when naming a factory, when a factory will cache or canonicalise
  instances, or when a factory's return type must survive API evolution; includes a compact
  consumer-first constructor/factory example and misuse checks.
- [Singletons and static state](references/singletons-and-static-state.md) — read whenever
  a singleton, a static registry, a static cache or a static mutable field is proposed or
  found: the forms, what each actually defends against, the testing and class-loader
  consequences, and what changes when the process is one of many.
