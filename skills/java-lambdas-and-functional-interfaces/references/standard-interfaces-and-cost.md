# Standard interfaces and runtime cost

## The six basics and how the rest are derived

| Interface           | Signature      | Method   | Typical use                       |
| ------------------- | -------------- | -------- | --------------------------------- |
| `Supplier<T>`       | `() -> T`      | `get`    | lazy value, factory, default      |
| `Consumer<T>`       | `T -> void`    | `accept` | side effect at the end of a chain |
| `Function<T,R>`     | `T -> R`       | `apply`  | mapping                           |
| `Predicate<T>`      | `T -> boolean` | `test`   | filtering, matching               |
| `UnaryOperator<T>`  | `T -> T`       | `apply`  | in-place transformation           |
| `BinaryOperator<T>` | `(T,T) -> T`   | `apply`  | reduction, merge function         |

Everything else in `java.util.function` is one of these with a prefix:

- `Bi*` — two arguments (`BiFunction`, `BiConsumer`, `BiPredicate`).
- `Int`/`Long`/`Double` prefix — the argument is that primitive (`IntPredicate`,
  `IntFunction<R>`, `IntUnaryOperator`).
- `To*` prefix — the **result** is that primitive (`ToIntFunction<T>`, `ToLongBiFunction<T,U>`).
- `Obj*Consumer` — mixed (`ObjIntConsumer<T>` takes `(T, int)`).

Learning the naming scheme is the point: it means you can predict the interface name instead
of defining a new one.

## When a custom functional interface is justified

Define one when at least one of these holds:

- **The name carries domain meaning at many call sites.** `interface PricingRule extends
Function<Order, Money>` is worse than `interface PricingRule { Money priceOf(Order order); }`
  — the second gives the method a name too, which is where most of the readability lives.
- **The signature is not expressible.** Three or more parameters, a checked exception, a
  primitive combination the JDK does not ship, or generics with bounds the standard interfaces
  cannot carry.
- **Default methods add real composition** specific to the domain (`RetryPolicy.orElse`,
  `Validator.and` with error accumulation).
- **The contract is stronger than the shape.** "Must be pure and idempotent", "must be
  thread-safe", "is called once per element in order" — a documented interface is where such a
  contract lives.

Do not define one merely to avoid `Function<Order, Money>` in a signature; and never define one
that duplicates a standard interface's shape without adding any of the above, because callers
then cannot pass a lambda they already have as a `Function`.

Always annotate a functional interface with `@FunctionalInterface`. It is not required, but it
turns "someone added a second abstract method" from a broken build at every lambda call site
into one clear error on the interface.

## What the runtime actually does

A lambda is not an anonymous class in disguise. `javac` compiles the body to a private
synthetic method and emits an `invokedynamic` call site; on first execution the
`LambdaMetafactory` bootstrap spins the implementing class and links the call site. Practical
consequences:

- **Non-capturing lambdas are effectively singletons.** With nothing to capture, the metafactory
  returns the same instance on every evaluation. `list.removeIf(String::isEmpty)` in a loop does
  not allocate per iteration.
- **Capturing lambdas allocate per evaluation** — one small object holding the captured values.
  Escape analysis may scalar-replace it when the lambda does not escape the compiled method;
  it may equally not. Treat this as "cheap but not free", and hoist a lambda out of a loop when
  the capture is loop-invariant.
- **First use has a linkage cost.** Bootstrapping a call site is far more expensive than
  invoking it, and a class with hundreds of distinct lambdas pays that at startup. This is
  visible in short-lived processes, serverless cold starts, and CLI tools; it is one of the
  things AppCDS and AOT caching address (startup-cds-crac-leyden). It is not a reason to avoid
  lambdas in a long-running service.
- **A polymorphic call site stops inlining.** When one `forEach`/`map` call site receives many
  different implementations, the receiver type becomes megamorphic and the JIT can no longer
  inline through it — the multiplier that enables the rest of C2's optimisations
  (jit-inlining-and-escape-analysis). This shows up as a flat profile with time spread across
  interface dispatch, on genuinely hot paths only. Diagnose it with a profile before
  restructuring code around it.
- **Boxing is usually the larger cost.** `Function<Integer, Integer>` over a million elements
  allocates two boxes per element; `IntUnaryOperator` allocates none. When a measurement points
  at allocation pressure in a functional pipeline, this is the first thing to check —
  allocation-profiling shows it directly.

## Lambdas and threads

- **A lambda handed to an executor is a heap-shared object.** Everything it captured is now
  reachable from another thread; the executor's own submission provides the happens-before edge
  for the captured values as of submission, and nothing more. Mutating a captured object after
  submission is a race (java-memory-model).
- **Request context does not travel with a lambda.** A `ThreadLocal` set on the request thread
  is not visible inside a lambda running on a pool thread; `ScopedValue` with structured
  concurrency is the mechanism that does propagate (scoped-values, structured-concurrency).
- **A queued lambda holds its captures until it runs or is discarded.** A bounded queue of tasks
  each capturing a request payload is a bounded memory cost; an unbounded one is a leak with a
  throughput problem in front of it.

## Reviewing lambda-heavy code

- [ ] No lambda longer than a few lines; longer bodies extracted to named methods.
- [ ] No captured `AtomicInteger`/array used purely to work around effective finality.
- [ ] Long-lived lambdas (scheduled, registered, queued) capture only what they need, and do
      not capture `this` unintentionally.
- [ ] Standard interfaces used where they fit; each custom one justified by name, signature,
      contract or default methods, and annotated `@FunctionalInterface`.
- [ ] Primitive specialisations on bulk primitive paths; no `Function<Integer, Integer>` in a
      hot loop.
- [ ] Checked exceptions handled by one deliberate strategy, never by sneaky throw.
- [ ] No overload pairs distinguished only by functional interface type.
