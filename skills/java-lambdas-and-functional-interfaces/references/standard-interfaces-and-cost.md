# Standard interfaces and runtime cost

## The six basics and how the rest are derived

| Interface           | Signature      | Method   | Typical use                       |
| ------------------- | -------------- | -------- | --------------------------------- |
| `Supplier<T>`       | `() -> T`      | `get`    | lazy value, factory, default      |
| `Consumer<T>`       | `T -> void`    | `accept` | side effect at the end of a chain |
| `Function<T,R>`     | `T -> R`       | `apply`  | mapping                           |
| `Predicate<T>`      | `T -> boolean` | `test`   | filtering, matching               |
| `UnaryOperator<T>`  | `T -> T`       | `apply`  | same-type transformation          |
| `BinaryOperator<T>` | `(T,T) -> T`   | `apply`  | reduction, merge function         |

Everything else in `java.util.function` is one of these with a prefix:

- `Bi*` — two arguments (`BiFunction`, `BiConsumer`, `BiPredicate`).
- `Int`/`Long`/`Double` specialize relevant inputs/results: `IntPredicate` takes an int,
  `IntFunction<R>` takes an int and returns R, `IntSupplier` takes no arguments and returns int,
  and `IntUnaryOperator` takes and returns int. Read the SAM signature, not just the prefix.
- `To*` prefix — the **result** is that primitive (`ToIntFunction<T>`, `ToLongBiFunction<T,U>`).
- `Obj*Consumer` — mixed (`ObjIntConsumer<T>` takes `(T, int)`).

Learning the naming scheme is the point: it means you can predict the interface name instead
of defining a new one.

## When a custom functional interface is justified

Define one when at least one of these holds:

- **The name carries domain meaning at many call sites.** A standalone `PricingRule` with
  `priceOf(Order)` gives the operation a domain name; extending `Function<Order, Money>` can
  preserve useful interoperability. A named abstract method plus a default `apply` bridge can
  offer both. Compare actual consumers and preserve public extension/compatibility contracts.
- **The signature is not expressible.** Three or more parameters, a checked exception, a
  primitive combination the JDK does not ship, or a genuinely different generic function type.
  Bounds on an API's type parameters alone need not require a new interface. A generic abstract
  method can define a functional interface but cannot be implemented by a lambda; a compatible
  generic method reference or named implementation may fit.
- **Default methods add real composition** specific to the domain (`RetryPolicy.orElse`,
  `Validator.and` with error accumulation).
- **The contract is stronger than the shape.** "Must be pure and idempotent", "must be
  thread-safe", "is called once per element in order" — a documented interface is where such a
  contract lives.

Do not define one merely to avoid `Function<Order, Money>` in a signature; and never define one
that duplicates a standard interface's shape without adding any of the above, because callers
then cannot pass a lambda they already have as a `Function`.

Always annotate a functional interface with `@FunctionalInterface`. It is not required, but it
turns "someone added an incompatible abstract method" from a broken build at lambda call sites
into one clear error on the interface.

## What the runtime actually does

A lambda is not an anonymous class in disguise. `javac` typically translates a lambda body to
a synthetic helper and an `invokedynamic` call site; a method reference can target an existing
method directly. Helper visibility and exact translation are compiler details. At linkage the
`LambdaMetafactory` commonly links a generated/hidden implementation to the call site; exact
class generation and caching are runtime details. Practical
consequences:

- **Identity/allocation are unspecified.** HotSpot commonly reuses a non-capturing instance per
  linked call site and commonly creates an object holding captured values, with possible scalar
  replacement. Never rely on identity or a fixed allocation count; confirm with allocation and
  compilation evidence before hoisting loop-invariant functions.
- **First use can add linkage cost.** Count sites actually linked/executed during the measured
  startup path, not all expressions declared in a class. Runtime/CDS/AOT support can change
  which work occurs when; startup-cds-crac-leyden owns those version-specific mechanisms.
  Investigate only when existing startup evidence makes that cost relevant.
- **A highly polymorphic call site can inhibit inlining.** Receiver profiles, tier and compiler
  heuristics determine whether guarded/speculative inlining remains possible
  (jit-inlining-and-escape-analysis). A flat profile alone does not establish the cause;
  correlate hot-site profiles with compiler/inlining evidence before
  restructuring code around it.
- **Boxing can be the larger cost.** Trace where primitives cross reference boundaries:
  passing an existing `Integer` through `Function.identity()` does not itself box or unbox it.
  Primitive arithmetic and adapters can introduce conversions; caches and escape analysis mean
  those conversions do not imply a fixed allocation count. `IntUnaryOperator` can avoid them on
  a primitive path, but a primitive parameter or result cannot represent null. Unboxing null
  throws `NullPointerException`; preserve the existing absence policy rather than inventing a
  sentinel to enable specialisation. Use allocation-profiling when actual allocation pressure
  makes these conversions relevant.

## Lambdas and threads

- **Check how the executor invokes the task.** An `Executor` may execute inline on the caller's
  thread. When the task crosses threads, captured references can become shared; the submission
  contract orders prior actions, not later mutations. Those require their own ordering/coordination;
  they are not automatically races if locks, volatile/atomic operations or other publication
  protocols provide the required guarantees (java-memory-model).
- **Request context does not travel merely because code is a lambda.** A `ThreadLocal` is not
  automatically copied to arbitrary pool tasks. Use explicit context/task wrappers; `ScopedValue`
  bindings propagate to structured child tasks under the StructuredTaskScope contract, not to
  unrelated executor submissions (scoped-values, structured-concurrency).
- **Retained callbacks can retain captured graphs.** A bounded task count only bounds memory
  if capture sizes and other holders are also bounded. Running/discarding a queued task does
  not release references retained by registries, futures or application code; trace ownership
  and cleanup instead of inferring collection from task completion alone.

## Reviewing lambda-heavy code

- [ ] Lambdas with non-local policy, failure semantics or diagnostic needs are named/extracted.
- [ ] Mutable captures have an actual callback/accumulation need and a valid ownership,
      invocation and synchronization contract; simple traversals use simpler accumulation where suitable.
- [ ] Long-lived lambdas (scheduled, registered, queued) capture only what they need, and do
      not capture `this` unintentionally.
- [ ] Standard interfaces used where they fit; each custom one justified by name, signature,
      contract or default methods, and annotated `@FunctionalInterface`.
- [ ] Primitive specialisations considered where measured boxing cost matters; preserve existing
      API compatibility and reject allocation claims unsupported by evidence.
- [ ] Checked exceptions handled by one deliberate strategy, never by sneaky throw.
- [ ] Overloads have an unambiguous consumer path without breaking supported signatures.

Primary references: [LongAdder sum semantics](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/LongAdder.html)
and [ExecutorService memory consistency](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html).
For target-type limits and inline execution, see
[JLS functional interfaces and function types](https://docs.oracle.com/javase/specs/jls/se25/html/jls-9.html#jls-9.8),
[lambda compatibility](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.27.3), and
[Executor execution contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executor.html).
For primitive boundaries, see [JLS boxing](https://docs.oracle.com/javase/specs/jls/se25/html/jls-5.html#jls-5.1.7),
[unboxing and null](https://docs.oracle.com/javase/specs/jls/se25/html/jls-5.html#jls-5.1.8) and
[Function.identity](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/function/Function.html#identity()>).
