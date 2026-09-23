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

0. **Establish compatibility.** Inspect compiler release/toolchain, processor configuration,
   resolved framework versions and runtime. Language references and sketches here use Java 17;
   records require Java 16+ without preview, and
   `Deprecated.since`/`forRemoval` require Java 9+. Adapt to the project without upgrading it,
   enabling preview or adding dependencies implicitly. If configuration is missing, keep
   enforcement diagnoses conditional and name the evidence needed.
1. **Name the consumer before defining the annotation.** It may be the compiler, processor,
   framework, static-analysis tool, documentation generator or a human-facing API contract. If no
   consumer benefits from structured metadata, Javadoc is usually clearer. Keep adequate direct
   code or configuration; adding metadata or a processor needs a concrete consumer benefit.
2. **Pick the retention from the reader.** `SOURCE` for compile-time-only checks, `CLASS` for
   bytecode tools, `RUNTIME` only when something reflects over it at runtime. Retention is not
   a default to copy from the last annotation you wrote.
3. **Constrain the targets.** `@Target` restricts where it can be applied; without it, an
   annotation is legal in places the reader never looks, which is how "the annotation does
   nothing here" bugs happen.
4. **Verify the consumer's promised result.** For enforcement, exercise valid and invalid input
   through the actual path and assert acceptance/rejection. For documentation or generation,
   check the produced output and excluded cases; no runtime enforcement is implied.
5. **Check relevant deployment boundaries** — proxying, native image and modules when the
   actual consumer uses them. Reuse adequate existing tests and evidence; metadata visibility
   is a different check from discovery, invocation and enforcement.

## Rules

- Use `@Override` on every method that overrides or implements one. It is the cheapest
  correctness check the language offers, and the one it catches is the expensive one: an
  `equals(MyType other)` that overloads instead of overriding, so the collection calls
  `Object.equals` and identity semantics apply. Interface implementations included — it is
  allowed there and catches the same drift when the interface changes.
- Prefer an annotation to a naming pattern when the tool/API supports metadata (`@Test` over
  `testFoo`, `@Deprecated` plus migration Javadoc). The compiler checks annotation syntax and
  target, while the annotation's processor/framework still owns semantic validation.
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
- An annotation on a **record component** follows target and declaration rules, including
  `RECORD_COMPONENT` and `TYPE_USE`. Explicit accessors and normal canonical constructors
  differ from generated members; read the retention reference before changing either.
  A validation annotation that targets only
  `FIELD` will not be seen by a framework reading the constructor parameters. State the
  targets, and test that the constraint actually fires.
- Annotations do not validate anything. Jakarta Bean Validation constraints run only when a
  `Validator` is invoked — by the framework at a `@Valid` parameter, or by your code. A DTO
  covered in `@NotBlank` that is deserialised and used without validation is unvalidated
  input; java-defensive-programming covers where the check belongs.
- Proxy-based annotations (`@Transactional`, `@Cacheable`, `@Retryable`, `@Async` and equivalents)
  depend on the configured advice mechanism. In ordinary Spring proxy mode, self-invocation and
  private methods bypass advice; final classes/methods block subclass proxies but interface-based
  proxies differ. AspectJ weaving and programmatic APIs have other semantics. Test the actual
  call path; framework-coupling-and-independence covers making it visible.
- `RUNTIME` metadata does not itself force whole-classpath scanning or defeat AOT. Startup cost
  depends on framework indexing, scan scope and caching; native-image reachability depends on what
  build-time analysis can discover and supplied metadata. Prefer annotation processing or
  build-time generation when it provides equivalent semantics and its build/debugging cost is
  acceptable. On JDK 23+, command-line `javac` runs processors only when annotation processing is
  explicitly configured (for example `--processor-path`, `-processor`, or `-proc:full`); ensure
  the build tool declares processors rather than relying on classpath discovery.
- Do not put secrets in annotation elements. Explicit values are restricted to
  annotation-compatible constants/types and may be visible through bytecode/reflection.
  A fixed literal may be a property key or expression that the consumer resolves from external
  configuration; verify that consumer and its refresh lifecycle. Changing an annotation default
  can affect already compiled uses that omitted the element; review this as API behavior.

- For repeatable annotations, inspect both the repeated annotation and its container: retention,
  target and inheritance must be compatible. For `TYPE_USE`, decide whether the consumer reads
  declaration annotations or type annotations; they occupy different class-file/reflection APIs.
  Occurrences only on type uses do not trigger JSR 269 processor matching by annotation name.
  Check processor invocation and type traversal before trusting a compile-time checker; the
  retention reference covers selection and coexistence with other processors.
- Deprecate with `@Deprecated(since = "…", forRemoval = …)` plus `@deprecated` Javadoc saying
  what to use instead. `forRemoval = true` turns usage warnings into a stronger signal and is
  part of the API contract — see java-api-design.

## Deliverable

Identify the reader and call path, observed metadata/configuration, consequence, smallest
correction and a check that confirms it. Distinguish static evidence from executed rejection
tests. For a new annotation, supply its retention/target contract and consumer integration
with positive and negative checks. Annotation presence or reflection visibility alone does
not demonstrate enforcement.

## References

- [Retention, targets and processing](references/retention-targets-and-processing.md) — read
  when defining an annotation, when one appears to have no effect, or when choosing between
  runtime reflection, an annotation processor and build-time generation.
- [Markers, custom annotations and enforcement](references/markers-and-custom-annotations.md)
  — read when choosing between a marker interface and a marker annotation, when designing an
  annotation that must be enforced, or when annotation-driven behaviour is silently not
  applying.
