# Retention, targets and processing

## Retention decides who can ever see it

| Retention         | Kept in the class file | Visible to reflection | Use for                                                         |
| ----------------- | ---------------------- | --------------------- | --------------------------------------------------------------- |
| `SOURCE`          | no                     | no                    | compiler checks, lint, code generation, documentation-only tags |
| `CLASS` (default) | yes                    | **no**                | bytecode tools, weavers, static analysers reading class files   |
| `RUNTIME`         | yes                    | yes                   | anything a framework or your own code reflects over at runtime  |

The default is `CLASS`, and that default is the single most common reason a hand-written
annotation "does nothing": the framework calls `getAnnotation(...)` and gets `null`, with no
error anywhere. Declare the retention explicitly on every annotation you define.

`SOURCE` retention is not a lesser option — `@Override` and `@SuppressWarnings` are both
`SOURCE`, and they are among the most valuable annotations in the language precisely because
their work is finished at compile time. (Do not generalise from them: `@FunctionalInterface`
and `@SafeVarargs` are `RUNTIME`, so retention cannot be inferred from "it is a compiler
annotation".)

## Targets, and the record-component case

```java
@Retention(RUNTIME)
@Target({ FIELD, PARAMETER })          // no METHOD: this must not be put on an accessor
public @interface Sensitive { }
```

`@Target` is a constraint on where the annotation may be written, and therefore on where a
reader can find it. Omitting it allows every declaration context, which sounds permissive and
in practice produces annotations sitting where nothing reads them.

Record components are the case that surprises people. An annotation written on a component:

```java
public record Payment(@Sensitive String cardNumber, Money amount) { }
```

is _propagated_ to every declaration the annotation's `@Target` allows — the private field, the
accessor method, the canonical constructor parameter, and the record component itself. The
consequences:

- If the annotation targets only `METHOD`, it lands on the accessor and a framework reading
  constructor parameters (Jackson with parameter names, a validator on the constructor) will
  not see it.
- If the annotation targets only `FIELD`, reflection over the accessor finds nothing.
- If it targets none of the applicable contexts, the code does not compile — which is the
  helpful case.
- `RECORD_COMPONENT` is its own target, readable via `RecordComponent.getAnnotation`.

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

`getAnnotation(Schedule.class)` returns `null` when the annotation is repeated — the compiler
wraps the repetitions in the container. Use `getAnnotationsByType(Schedule.class)`, which
handles both the single and the repeated case.

A meta-annotation is simply an annotation on an annotation type; composing them
(`@Retention` + `@Target` + your own semantic marker) is how frameworks build shorthand
annotations. The language does not merge attributes across a meta-annotation — that is again a
framework feature.

## Three ways to act on an annotation

| Mechanism                                       | When it runs         | Cost                                               | Fails when                                                                                                |
| ----------------------------------------------- | -------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Compiler check (`SOURCE`, javac plugin, linter) | build                | build/IDE integration; none at runtime             | plugin/tool not configured, version drift, generated-source or incremental-build gaps                     |
| Annotation processor (JSR 269)                  | build                | build time; generates code you can read            | requires the processor on the annotation path                                                             |
| Runtime reflection / scanning                   | startup, or per call | scope/index/cache-dependent discovery and dispatch | retention/access mismatch; JPMS access denial; AOT reachability metadata or framework integration missing |

Prefer the highest row that can do the job. Concretely, this is why modern frameworks moved
validation, mapping and dependency metadata towards processors and build-time transformation:

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

Since JDK 24, command-line `javac` does not implicitly run processors discovered only from the
ordinary class path: configure processing explicitly (`--processor-path`, module path,
`-processor`, `-proc:full`/`only`, or the build tool's processor dependency mechanism). This both
stabilizes builds and limits execution of processor code during compilation.

## Making an annotation observable

An annotation whose effect is invisible is a maintenance hazard: the reader of the call site
cannot tell that something happens. Two mitigations that cost little:

- **Fail loudly at startup** when an annotation is present but its precondition is not
  (a `@Scheduled` method on a bean that is not proxied, an annotated class the processor did
  not process). A container that validates its own annotation usage at boot converts a silent
  runtime no-op into a startup failure.
- **Make the behaviour visible in telemetry.** If an annotation causes a retry, a transaction
  or a cache lookup, that should appear as a span or a metric, so the behaviour is discoverable
  from an operational view rather than only from the source. See distributed-tracing-design and
  metrics-and-cardinality.
