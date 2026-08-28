---
name: java-annotations
description: >
  Annotations as metadata that only means something if code reads it: retention policies and
  what each one costs, targets and where an annotation on a record component actually lands,
  @Inherited and its limits, marker interfaces versus marker annotations, @Override as a
  correctness check rather than decoration, and the gap between annotating something and
  enforcing it. Use when defining a custom annotation, when an annotation appears to have no
  effect, when validation or security annotations are trusted without a validator or a proxy
  invoking them, when @Override is missing on an override, when a naming convention encodes
  behaviour that an annotation should carry, when annotation scanning slows startup or
  breaks under native image, or when deciding between a marker interface and a marker
  annotation. Does not cover nullability annotation contracts (java-null-safety), reflective
  access mechanics (java-reflection-and-method-handles), or the enum type itself
  (java-enums).
---

# Java Annotations

## Purpose

Keep metadata honest: an annotation changes nothing by itself, so every annotation in a
codebase must have an identifiable reader — a compiler check, an annotation processor, a
runtime framework — or it is a comment with a compiler-checked spelling. Two failure modes:
the annotation that is believed to be enforcing something it is not (a `@NotNull` with no
validator on the path, a `@Transactional` bypassed by self-invocation), and the naming
convention or magic string doing a job an annotation would do with compile-time checking.

## Workflow

1. **Name the reader before defining the annotation.** Which processor, framework or piece of
   your own code reads it, and what does it do? If the answer is "nothing yet", the annotation
   is documentation — write Javadoc instead.
2. **Pick the retention from the reader.** `SOURCE` for compile-time-only checks, `CLASS` for
   bytecode tools, `RUNTIME` only when something reflects over it at runtime. Retention is not
   a default to copy from the last annotation you wrote.
3. **Constrain the targets.** `@Target` restricts where it can be applied; without it, an
   annotation is legal in places the reader never looks, which is how "the annotation does
   nothing here" bugs happen.
4. **Verify the enforcement path end to end**, with a test that violates the annotated
   constraint and asserts the failure. An annotation with no failing test proves nothing.
5. **Check what happens under proxying, native image and module boundaries** — the three
   places where annotation-driven behaviour silently stops applying.

## Rules

- Use `@Override` on every method that overrides or implements one. It is the cheapest
  correctness check the language offers, and the one it catches is the expensive one: an
  `equals(MyType other)` that overloads instead of overriding, so the collection calls
  `Object.equals` and identity semantics apply. Interface implementations included — it is
  allowed there and catches the same drift when the interface changes.
- Prefer an annotation to a naming pattern for marking code (`@Test` over `testFoo`,
  `@Deprecated` over a comment). A naming pattern has no compiler support: a typo produces
  silence, and the convention cannot carry parameters.
- Prefer a marker **interface** when the marked thing is a type and something should be checked
  at compile time: an interface defines a type, so it can be a parameter or return type, and
  the compiler enforces it at every use. Prefer a marker **annotation** when the target is not
  a type (methods, fields, parameters, packages, modules), when the marking must be added later
  without touching the type hierarchy, or when the marker may gain parameters.
- Give every annotation an explicit `@Retention` and `@Target`. The default retention is
  `CLASS`, which is almost never what a runtime framework needs, and is the reason a
  hand-written annotation is silently invisible to reflection.
- `@Inherited` applies only to annotations on **classes**, and only along the superclass chain.
  It does not make an annotation inherited from an interface, and it does not apply to methods
  or fields. Framework meta-annotation mechanisms (Spring's `@AliasFor`, `MergedAnnotations`)
  implement their own richer rules — those are the framework's semantics, not the language's.
- An annotation on a **record component** is distributed according to its `@Target`: it can
  land on the field, the accessor, the constructor parameter, or several of these — and if it
  targets none of them it does not compile. A validation annotation that targets only
  `FIELD` will not be seen by a framework reading the constructor parameters. State the
  targets, and test that the constraint actually fires.
- Annotations do not validate anything. Jakarta Bean Validation constraints run only when a
  `Validator` is invoked — by the framework at a `@Valid` parameter, or by your code. A DTO
  covered in `@NotBlank` that is deserialised and used without validation is unvalidated
  input; java-defensive-programming covers where the check belongs.
- Proxy-based annotations (`@Transactional`, `@Cacheable`, `@Retryable`, `@Async` and their
  equivalents) apply only when the call arrives through the proxy. A call from one method of a
  class to another method of the same instance bypasses it entirely, as does a call to a
  private or final method, or one made before the container has wired the bean. This is the
  most common "the annotation is there but nothing happens" defect; framework-coupling-and-independence
  covers keeping such behaviour visible.
- `RUNTIME` retention plus classpath scanning has a startup cost proportional to the classes
  scanned, and it defeats static analysis: ahead-of-time compilation and native image need the
  reflective use registered explicitly, and dead-code elimination cannot see it. Prefer
  annotation _processing_ (compile-time code generation) when the same job can be done then —
  it moves the cost to build time and keeps the runtime introspection-free. See
  graalvm-native-image and startup-cds-crac-leyden.
- Do not put secrets, environment values or anything mutable in annotation members. Annotation
  members must be compile-time constants; the value is baked into the class file and cannot be
  changed without recompiling.
- Deprecate with `@Deprecated(since = "…", forRemoval = …)` plus `@deprecated` Javadoc saying
  what to use instead. `forRemoval = true` turns usage warnings into a stronger signal and is
  part of the API contract — see java-api-design.

## References

- [Retention, targets and processing](references/retention-targets-and-processing.md) — read
  when defining an annotation, when one appears to have no effect, or when choosing between
  runtime reflection, an annotation processor and build-time generation.
- [Markers, custom annotations and enforcement](references/markers-and-custom-annotations.md)
  — read when choosing between a marker interface and a marker annotation, when designing an
  annotation that must be enforced, or when annotation-driven behaviour is silently not
  applying.
