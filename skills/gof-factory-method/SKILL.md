---
name: gof-factory-method
description: >
  Factory Method in modern Java, and the three different things that share its name: the GoF
  pattern (a creation hook a subclass overrides inside an inherited algorithm), Effective Java's
  static factory method (a named constructor, not this pattern), and any method someone called
  createX. Covers when the subclass hook is genuinely right, why an injected Supplier or a keyed
  map replaces it in most application code, and the constructor-calls-an-overridable-method trap
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
class implements the whole workflow and leaves exactly one hole — "make the thing" — which a
subclass fills.

That is a narrow pattern, and most code labelled Factory Method is not it. A `static of(...)` on
the type itself is a **static factory method**: a named constructor with the freedom to cache,
return a subtype and be given a meaningful name. It solves a different problem — naming and
control over instantiation — and it involves no subclass and no hook. Both are useful; calling
them the same thing is how a `Supplier` turns into a class hierarchy.

## When it is the answer

```text
An algorithm is inherited, and its only variation point is which
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

- **The creator has no inherited algorithm.** A class whose only content is `createX()` is a
  `Supplier` with extra steps.
- **Subclassing exists only to change the created type.** Pass the creation function in. One
  object with a field beats two types in a hierarchy (`java-composition-over-inheritance`).
- **The selection is data-driven.** `Map<Kind, Supplier<T>>` or a sealed `Kind` with an
  exhaustive `switch` is clearer than a subclass per kind, and the set of kinds is visible in
  one place.
- **Tests are the reason.** Subclassing production code to override `createX()` couples the test
  to the hierarchy and to `protected` members; an injected `Supplier` is a seam that costs
  nothing to read (`java-test-doubles`).
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
abstract hook when the framework instantiates your subclass and therefore cannot hand you a
`Supplier`, or when the product type is covariant with the creator's and callers rely on that.

## Decision rules

```text
IF the base class has no behaviour other than the abstract create()
THEN delete the hierarchy; inject a Supplier.

IF a constructor calls the overridable factory method
THEN it runs before the subclass's fields are initialised, so the product
     is built from nulls. Move creation to an init step, or out entirely.

IF subclasses exist only to select products and the extension set is application-controlled
THEN composition through suppliers, a keyed map, or a sealed kind is usually simpler.
     Keep the hook when open framework extension or creator/product covariance is material.

IF the product must vary per call, from an argument
THEN it is not a subclass hook — it is a function of that argument.

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
  the subclass's `final` fields are not yet assigned, so the product is created from default
  values, and under the memory model another thread may observe the partially constructed
  creator. Never call an overridable method from a constructor
  (`java-composition-over-inheritance`). A factory method that lazily caches its product needs
  an explicit publication argument — `volatile`, a holder class, or `AtomicReference`.
- **Distribution.** Nothing crosses a boundary here, with one exception: when the product kind
  is chosen from externally supplied data (a message type header, a content type), that key must
  be validated against a closed set before it selects a class. Reflective instantiation from an
  unvalidated name is a deserialisation vulnerability, not a factory.
- **Performance.** The hook implies neither one allocation nor failed inlining: implementations
  may cache products, and HotSpot can inline stable virtual calls. A highly polymorphic hot call
  site can inhibit inlining, but only profiles and compilation evidence establish that
  (`jit-inlining-and-escape-analysis`).
- **Testing.** The good seam is an injected `Supplier` — substituted with a lambda, no
  framework. The bad seam is a test-only subclass overriding a `protected` hook, which locks the
  production class's inheritance shape into the test suite and breaks whenever the base class is
  refactored.

## Review checklist

- [ ] The creator has real inherited behaviour, not just the hook
- [ ] No constructor calls the overridable factory method
- [ ] The hook is not present solely to give tests a substitution point
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
