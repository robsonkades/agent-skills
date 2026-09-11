---
name: gof-factory-method
description: >
  Factory Method in modern Java, and the three different things that share its name: the GoF
  pattern (a creation hook a subclass overrides inside an inherited algorithm), Effective Java's
  static factory method (a named constructor, not this pattern), and any method someone called
  createX. Covers when the subclass hook is genuinely right, when an injected Supplier or a keyed
  map is a simpler alternative, and the constructor-calls-an-overridable-method trap
  it invites. Use when a protected createX() hook is proposed, when a class is subclassed only
  to change which type it instantiates, when tests subclass production code to substitute an
  object, when a static factory is being called Factory Method in review, or when deciding
  between a subclass hook and a Supplier. Does not cover families of related products
  (gof-abstract-factory), the surrounding algorithm skeleton (gof-template-method), or static
  factory naming conventions (java-object-construction).
---

# Factory Method

## Purpose

Let an inherited algorithm create an object whose concrete type it must not know. The creator
class supplies workflow behaviour and delegates product creation to an overridable method.
Other hooks and creation arguments can coexist with this pattern.

That is a narrow pattern, and most code labelled Factory Method is not it. A `static of(...)` on
the type itself is a **static factory method**: a named constructor with the freedom to cache,
return a subtype and be given a meaningful name. It solves a different problem — naming and
control over instantiation — and it involves no subclass and no hook. Both are useful; calling
them the same thing is how a `Supplier` turns into a class hierarchy.

## When it is the answer

Inspect the project's compiler release, toolchain, framework construction path and callers
before changing a public extension point. Examples are partial Java 17 sketches with domain
types/imports omitted; pattern matching over a sealed kind requires Java 21 without preview.
Keep the target baseline; do not upgrade it to adopt an alternative.

Start with the ordinary consumer call, an advanced extension or resource-owning use, and a
creation failure or misuse. Inspect who constructs and calls the creator, all supported hooks,
creation frequency, arguments, checked failures and ownership. Preserve an adequate constructor,
provider or existing hook; compare alternatives against those contracts. Ask only unresolved
questions that could change extension compatibility or lifecycle.

```text
An algorithm is inherited, and one variation point is which
concrete product it creates
        → Factory Method (this is Template Method whose varying step
          is construction).

A framework must let unknown subclasses supply the product, and
cannot accept constructor arguments (it instantiates the subclass
itself)
        → Factory Method. This is why frameworks use it and
          applications usually should not.

The product type must correlate with the creator's own type — a
DocumentReader subtype pairs with its Document subtype
        → Factory Method, with the covariant return declared.
```

## When it is not

- **The creator has no inherited algorithm.** Consider a `Supplier`, but keep a named domain
  provider when checked failures, arguments, lifecycle or a published SPI justify its contract.
- **Application-controlled subclasses exist only to select products.** An injected creation
  function may simplify this selection. Inspect supported external subclasses and useful
  creator/product typing before replacing the hierarchy (`java-composition-over-inheritance`).
- **The selection is data-driven.** `Map<Kind, Supplier<T>>` or a sealed `Kind` with an
  exhaustive `switch` is clearer than a subclass per kind, and the set of kinds is visible in
  one place.
- **A new hook is proposed only for test substitution.** Prefer an existing injection seam where
  it fits. A test subclass may legitimately characterize a supported extension contract; do not
  remove that contract solely to change the test style (`java-test-doubles`).
- **You mean a named constructor.** Write `static Money of(...)`. Do not build a hierarchy to
  get a name.

## Modern Java expression

```text
Classical                            Modern equivalent
───────────────────────────────────  ────────────────────────────────────
abstract class Creator {             final class Creator {
  abstract Product create();           private final Supplier<Product> create;
  void run() { ... create() ... }      void run() { ... create.get() ... }
}                                    }

class PdfCreator extends Creator     Creator pdf = new Creator(PdfProduct::new);

subclass-per-kind selection          Map<Kind, Supplier<Product>>
                                     or sealed Kind + exhaustive switch

open extension by third parties      ServiceLoader<ProductProvider>
```

The method reference `PdfProduct::new` is a **creation function**, not the GoF Factory Method
pattern: it preserves deferred creation while replacing inheritance with composition. Keep the
abstract hook when the framework's actual extension contract requires it and offers no suitable
injection seam, or when the product type is covariant and callers rely on that contract.

## Decision rules

```text
IF the base class has no behaviour other than the abstract create()
THEN consider a Supplier; preserve meaningful domain and public extension contracts.

IF a constructor calls the overridable factory method
THEN subclass state may still hold default values. Prefer injected creation;
     any deferred init must occur after construction and enforce readiness.

IF subclasses exist only to select products and the extension set is application-controlled
THEN composition through suppliers, a keyed map, or a sealed kind is usually simpler.
     Keep the hook when open framework extension or creator/product covariance is material.

IF the product must vary per call, from an argument
THEN compare an argument-taking hook with Function<Input, Product>;
     arguments do not disqualify Factory Method.

IF several related products must vary together
THEN Abstract Factory, not N independent factory methods
     (gof-abstract-factory).

IF the creator caches or reuses what it creates
THEN a lifetime has been introduced. Say what it is; do not let a
     factory method quietly become a singleton or a pool.

IF the method is static and lives on the product type
THEN it is a static factory method. Judge it by naming and instance
     control (java-object-construction), not by this pattern's criteria.
```

## Cross-cutting checks

- **Concurrency.** The classic defect is a constructor invoking the overridable factory method:
  subclass state can be read before initialization; cross-thread exposure additionally requires
  the creator to escape. Avoid overridable constructor calls (`java-composition-over-inheritance`).
  Lazy caching needs safe publication and an initialization policy: a volatile field alone does
  not prevent duplicate creation. Specify failure/retry and disposal of losing instances.
- **External selection.** The pattern adds no remote boundary. When a product key comes from a
  message header or other external input, select from the authorized supported registry before
  loading a class. Plugins can register approved keys without a compile-time closed enum.
  Arbitrary reflective loading can execute class initialization before a later type check;
  validating the key does not replace payload validation or operation authorization.
- **Performance.** The hook implies neither one allocation nor failed inlining: implementations
  may cache products, and HotSpot can inline stable virtual calls. A highly polymorphic hot call
  site can inhibit inlining, but only profiles and compilation evidence establish that
  (`jit-inlining-and-escape-analysis`).
- **Testing.** An injected `Supplier` avoids coupling new tests to protected hooks. A test
  subclass can still be a useful characterization seam for an existing public extension point;
  do not remove that contract solely to simplify tests.

## Review checklist

For a review, return the concrete hook/call sites, creation frequency and ownership, chosen
alternative or reason to retain the hook, and checks performed versus pending. If framework
construction or external subclass usage is unknown, keep removal conditional until inspected.

- [ ] The creator has real inherited behaviour, not just the hook
- [ ] No constructor calls the overridable factory method
- [ ] A new hook earns its extension cost; existing supported hooks are not removed merely for test style
- [ ] Subclassing is justified by an inherited algorithm, open extension constraint, or useful
      creator/product type relationship—not merely by a closed application selection table
- [ ] Any externally supplied product key is validated against the supported registry; reflective
      class loading is not driven directly by untrusted input
- [ ] Lazy caching inside the hook, if present, is correctly published
- [ ] Covariant return types are declared where callers depend on the product subtype
- [ ] A `static of/from/valueOf` is described as a static factory, not as this pattern

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — the three meanings of
  "factory method" separated, the hook against `Supplier`, keyed maps, `ServiceLoader` and
  dependency injection, the constructor trap in full, and how the pattern relates to Template
  Method and Abstract Factory. Read before adding or removing a creation hook.
- [Worked example](references/worked-example.md) — an import pipeline whose subclasses existed
  only to pick a parser, converted to an injected supplier and then to a keyed map, alongside a
  framework case where the hook correctly stays. Read when refactoring a creator hierarchy.
