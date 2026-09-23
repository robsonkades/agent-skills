# Retention, targets and processing

## Retention decides who can ever see it

| Retention         | Kept in the class file | Visible to reflection | Use for                                                         |
| ----------------- | ---------------------- | --------------------- | --------------------------------------------------------------- |
| `SOURCE`          | no                     | no                    | compiler checks, lint, code generation, documentation-only tags |
| `CLASS` (default) | yes                    | **no**                | bytecode tools, weavers, static analysers reading class files   |
| `RUNTIME`         | yes                    | yes                   | anything a framework or your own code reflects over at runtime  |

These entries describe retained declaration metadata, not a discovery guarantee. Local-variable
and lambda-parameter **declaration** annotations are never retained in the class file, even with
`RUNTIME`. Their **type-use** annotations follow separate retention rules; retention in method
bytecode does not provide a general core-reflection API for enumerating local-variable annotations.

The default is `CLASS`, and that default is one reason a hand-written
annotation "does nothing": the framework calls `getAnnotation(...)` and gets `null`, with no
error anywhere. Declare the retention explicitly on every annotation you define.

`SOURCE` retention is not a lesser option — `@Override` and `@SuppressWarnings` are both
`SOURCE`, and they are among the most valuable annotations in the language precisely because
their work is finished at compile time. (Do not generalise from them: `@FunctionalInterface`
and `@SafeVarargs` are `RUNTIME`, so retention cannot be inferred from "it is a compiler
annotation".)

## Targets, and the record-component case

Java blocks here are partial declarations: annotation imports/static imports are omitted,
and `Money` is a domain placeholder.

```java
@Retention(RUNTIME)
@Target({ FIELD, PARAMETER })          // no METHOD: this must not be put on an accessor
public @interface Sensitive { }
```

`@Target` is a constraint on where the annotation may be written, and therefore on where a
reader can find it. Omitting it permits declaration contexts except type parameters, but not
type-use contexts; it can still allow annotations where the consumer never looks.

Record components are the case that surprises people. An annotation written on a component:

```java
public record Payment(@Sensitive String cardNumber, Money amount) { }
```

is retained on the component for `RECORD_COMPONENT` and propagated to eligible generated
members: the private field, implicit accessor and derived constructor parameters. The
consequences:

- If the annotation targets only `METHOD`, it lands on the accessor and a framework reading
  constructor parameters (Jackson with parameter names, a validator on the constructor) will
  not see it.
- If the annotation targets only `FIELD`, reflection over the accessor finds nothing.
- If it targets none of the applicable contexts, the code does not compile — which is the
  helpful case.
- `RECORD_COMPONENT` is its own target, readable via `RecordComponent.getAnnotation`.
- `TYPE_USE` alone is legal; inspect `getAnnotatedType()` and the relevant annotated
  return/parameter types instead of declaration `getAnnotation()`.
- Explicit accessors receive no component annotation propagation. Normal explicit canonical
  constructors use their own parameter annotations; compact constructors still derive
  parameters and eligible annotations from the record header.

Choose targets from the declarations the actual consumer inspects. Adding all four does not make a
constraint universally enforced and can cause duplicate validation when a framework inspects more
than one location. Write a record-specific test for the selected access strategy.

## Inheritance is narrower than it looks

`@Inherited` means: when reflection asks a **class** for the annotation and the class does not
have it, the superclass chain is consulted. That is all.

- Not inherited from **interfaces**, ever.
- Not applicable to **methods**, fields, parameters or constructors — an override does not
  inherit its parent method's annotations.
- Frameworks that appear to do more (Spring finding `@Transactional` on an interface method, or
  through a meta-annotation, or on a superclass method) implement their own search
  (`MergedAnnotations`, `AnnotatedElementUtils`) with different rules. Those rules are the
  framework's, they differ between frameworks, and code should not assume them without
  checking.

## Repeatable and meta-annotations

```java
@Retention(RUNTIME) @Target(METHOD) @Repeatable(Schedules.class)
public @interface Schedule { String cron(); }

@Retention(RUNTIME) @Target(METHOD)
public @interface Schedules { Schedule[] value(); }
```

On a method with repeated `@Schedule`, `getAnnotation(Schedule.class)` returns `null` — the compiler
wraps the repetitions in the container. Use `getAnnotationsByType(Schedule.class)`, which
handles both the single and the repeated case.

A meta-annotation is simply an annotation on an annotation type; composing them
(`@Retention` + `@Target` + your own semantic marker) is how frameworks build shorthand
annotations. The language does not merge attributes across a meta-annotation — that is again a
framework feature.

## Three ways to act on an annotation

| Mechanism                                       | When it runs         | Cost                                                   | Fails when                                                                                                 |
| ----------------------------------------------- | -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Compiler check (`SOURCE`, javac plugin, linter) | build                | build/IDE integration; none at runtime                 | plugin/tool not configured, version drift, generated-source or incremental-build gaps                      |
| Annotation processor (JSR 269)                  | build                | build time; can validate declarations or generate code | processor discovery/execution not configured; incompatible processor/toolchain or generated output missing |
| Runtime reflection / scanning                   | startup, or per call | scope/index/cache-dependent discovery and dispatch     | retention/access mismatch; JPMS access denial; AOT reachability metadata or framework integration missing  |

Choose from the consumer's required information and lifecycle. Build-time validation can reject
declaration errors or generate runtime checks; it cannot validate request values that arrive later.
Retain an adequate existing consumer. Consider processing/generation when equivalent semantics
and measured or required deployment benefits justify its build, IDE and debugging cost:

- **Startup cost.** Full classpath scanning grows with candidate resources/classes, but indexes,
  bounded packages and cached metadata change the cost. Measure discovery separately from class
  loading, verification and framework initialization.
- **Ahead-of-time and native image.** Dynamic reflective reachability may require framework-
  generated or supplied metadata; build-time analysis can discover other paths. Test native
  artifacts against reflection-heavy features rather than assuming every type needs manual
  registration. See graalvm-native-image.
- **Module boundaries.** Deep reflection into non-public members generally requires the package
  to be `open` (or qualified `opens`); exported public API has different access rules. Failures may
  throw access exceptions rather than silently omit metadata, so test the modular runtime.

Since JDK 23, command-line `javac` does not implicitly run processors discovered only from the
ordinary class path: configure processing explicitly (`--processor-path`, `--processor-module-path`,
`-processor`, `-proc:full`/`only`, or the build tool's processor dependency mechanism). This both
stabilizes builds and limits execution of processor code during compilation.
The processor itself runs in the compiler's environment; `--release 17` does not turn `javac 25`
into a JDK 17 processor host. Check processor compatibility and generated-source compatibility
separately. For repeatable annotations, a processor should support both the repeated annotation
and its container; reflected `getAnnotationsByType` and processor discovery are different paths.

Type-use occurrences are ignored when JSR 269 computes which annotation interfaces are present
for processor selection. A processor supporting only `example.Checked` may therefore never have
`process` called when the only occurrence is `List<@Checked String>`; naming that processor with
`-processor` makes it a candidate, not an unconditional check. Changing retention does not fix
this selection gap.

Keep a working checker integration. For a custom processor, one deliberate option is supporting
`"*"`, handling an empty annotation set and traversing the relevant type positions through
`TypeMirror` or the compiler's syntax-tree API. Declaration queries such as
`getElementsAnnotatedWith` do not enumerate every annotated type use; nested type arguments,
array components and method-body positions need the appropriate traversal. A universal processor
used only for additional checks should return `false` so it does not claim unrelated annotations
and prevent other processors from running. Verify invocation, accepted/rejected source and
coexistence with the other configured processors; invocation alone does not prove coverage.

## Making an annotation observable

An annotation whose effect is invisible is a maintenance hazard: the reader of the call site
cannot tell that something happens. Two mitigations that cost little:

- **Fail loudly at startup** when required annotation behavior lacks its enabling infrastructure
  (scheduling infrastructure is disabled, or required generated code is absent). `@Scheduled`
  registration uses a bean post-processor and does not itself require an AOP proxy.
  A container that validates its own annotation usage at boot converts a silent
  runtime no-op into a startup failure. Preserve intentionally disabled behavior allowed by the
  configuration contract.
- **Make the behaviour visible in telemetry.** If an annotation causes a retry, a transaction
  or a cache lookup, use adequate existing signals or focused bounded instrumentation when needed
  to make that behavior discoverable
  from an operational view rather than only from the source. See distributed-tracing-design and
  metrics-and-cardinality.

## Primary sources

- [JLS 17 record members and constructors](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.10.3)
  specifies propagation and explicit-member exceptions.
- [JLS 17 annotation interfaces](https://docs.oracle.com/javase/specs/jls/se17/html/jls-9.html#jls-9.6.4.1)
  specifies target, retention and inheritance contracts.
- [JDK 23 release notes: annotation processing](https://www.oracle.com/java/technologies/javase/23-relnote-issues.html)
  documents explicit processing configuration; use the compiler version, not merely `--release`.
- [Spring scheduling](https://docs.spring.io/spring-framework/reference/integration/scheduling.html)
  documents scheduling infrastructure; check the project's Spring version when applying it.
- [JDK 25 processor contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.compiler/javax/annotation/processing/Processor.html)
  distinguishes processor matching, repeatable containers and supported source versions.
- [Java 17 processor contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/annotation/processing/Processor.html)
  specifies type-use exclusion from matching, universal processors and annotation claiming.
- [Java 17 TypeMirror](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/lang/model/type/TypeMirror.html)
  exposes annotations on represented types, separately from declaration elements.
