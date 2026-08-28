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

For a constraint that must always apply, declare
`@Target({FIELD, METHOD, PARAMETER, RECORD_COMPONENT})` and write a test asserting the
constraint fires for a record, not only for a class.

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

| Mechanism                                       | When it runs         | Cost                                                   | Fails when                                                                                                     |
| ----------------------------------------------- | -------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Compiler check (`SOURCE`, javac plugin, linter) | build                | none at runtime                                        | never — the strongest option when it fits                                                                      |
| Annotation processor (JSR 269)                  | build                | build time; generates code you can read                | requires the processor on the annotation path                                                                  |
| Runtime reflection / scanning                   | startup, or per call | classpath scan at startup; reflective dispatch per use | the annotation is not `RUNTIME`; the module does not open the package; native image has no reflection metadata |

Prefer the highest row that can do the job. Concretely, this is why modern frameworks moved
validation, mapping and dependency metadata towards processors and build-time transformation:

- **Startup cost.** Scanning a large classpath for annotated types is proportional to the
  number of classes, and it happens on every process start — multiplied by every replica and
  every restart in an autoscaling deployment.
- **Ahead-of-time and native image.** Reflection over an annotation is invisible to static
  analysis, so every reflectively accessed type must be registered in native image
  configuration; anything missed fails at runtime, in production, on a path that a JVM run
  never exercises. See graalvm-native-image.
- **Module boundaries.** With JPMS, reflective access to a package requires it to be `open`
  (or `opens ... to`). A framework that cannot open the package silently finds no annotated
  members.

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
