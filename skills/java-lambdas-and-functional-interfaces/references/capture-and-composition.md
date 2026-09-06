# Capture, composition and exceptions

Examples are partial snippets with omitted domain types, imports and enclosing declarations.
Use the target Java release; `Predicate.not` and `Files.readString` need 11+, `toList` 16+.

## What a lambda captures

```java
class ReportJob {
    private final ReportData data;          // large
    private final int retries = 3;

    Runnable task(String reportId) {
        int attempt = 0;                     // effectively final local — captured by value
        return () -> render(reportId, attempt);   // render() is an instance method:
    }                                             // captures `this`, therefore `data` too
}
```

Three distinct capture kinds, with different lifetimes:

| Captured                                         | How                 | Lifetime consequence                                                     |
| ------------------------------------------------ | ------------------- | ------------------------------------------------------------------------ |
| A primitive local                                | primitive value     | no object graph retained through that value                              |
| A local holding any object, immutable or mutable | reference value     | the referenced graph may remain reachable while the callback is retained |
| `this` or instance access through it             | enclosing reference | enclosing state may stay reachable                                       |

The third is the one that leaks. A lambda submitted to a scheduler, stored in a listener list,
or queued in an executor holds those references for as long as the holder lives. The fix is
mechanical: copy what you need into locals first.

Extraction can move computation from task execution to submission: preserve intended snapshot
timing, side effects and failures, and ensure the extracted value does not retain the original graph.

```java
Runnable task(String reportId) {
    ReportSummary summary = data.summarise();    // extract the small thing
    return () -> render(reportId, summary);      // still captures `this` because render() is
}                                                // an instance method — make it static too
```

`this`-capture is invisible in the source; the signal is any unqualified reference to an
instance field or an instance method. If neither appears, the lambda is non-capturing of
`this`.

## Lambda `this` versus anonymous-class `this`

```java
class Handler {
    private final String name = "handler";

    Runnable asLambda()    { return () -> System.out.println(this.name); }        // Handler
    Runnable asAnonymous() { return new Runnable() {
        public void run()  { System.out.println(this.getClass()); }               // the anonymous class
    }; }
}
```

A lambda introduces no new scope for `this`, `super` or names: a local declared in the
enclosing method cannot be shadowed by a lambda parameter (it is a compile error), whereas an
anonymous class may shadow freely. Converting an anonymous class to a lambda therefore changes
what `this` means, and any self-reference (`this.someField`, recursion via `this`) either
changes target or stops compiling. That is also why a lambda cannot refer to itself: a
recursive callback needs a named method or a field holding the instance.

## Method references: the four kinds

| Kind             | Form                  | Equivalent lambda          |
| ---------------- | --------------------- | -------------------------- |
| Static           | `Integer::parseInt`   | `s -> Integer.parseInt(s)` |
| Bound instance   | `logger::info`        | `msg -> logger.info(msg)`  |
| Unbound instance | `String::toLowerCase` | `s -> s.toLowerCase()`     |
| Constructor      | `ArrayList::new`      | `() -> new ArrayList<>()`  |

Two practical notes:

The table shows invocation shapes, not universal evaluation equivalence. A bound expression
`receiver()::run` evaluates the receiver once when the reference is created and throws then
if it is null; `() -> receiver().run()` evaluates it per invocation and fails later. Replacing
a field-reading lambda with a bound reference also freezes the current receiver rather than
following later field reassignment. Preserve these semantics when choosing the shorter form.

- A **bound** reference captures the receiver at the point the reference is created, so
  `logger::info` pins that logger — and `this::handle` pins the enclosing object exactly as a
  lambda would.
- The unbound and bound forms look identical at a glance (`String::toLowerCase` versus
  `name::toLowerCase`) and mean different things. When a reader has to resolve which, the
  lambda is clearer; prefer it.

A method reference is not always shorter or clearer: `x -> x.getValue() + 1` has no reference
form, and `(a, b) -> a.merge(b)` reads better than a contorted reference. Choose per call site.

## Composition

The standard interfaces compose, and using that is what keeps a codebase's predicates and
mappers interchangeable:

```java
Predicate<Order> active     = o -> o.status() != CANCELLED;
Predicate<Order> highValue  = o -> o.total().isGreaterThan(THRESHOLD);
Predicate<Order> reviewable = active.and(highValue).and(Predicate.not(Order::isInternal));

Function<Order, Money>  total   = Order::total;
Function<Money, String> display = Money::format;
Function<Order, String> label   = total.andThen(display);       // or display.compose(total)

Comparator<Order> byValueThenId =
    Comparator.comparing(Order::total, Money.byAmount()).thenComparing(Order::id);
```

- `andThen` runs the receiver first, `compose` runs the argument first. Getting them the wrong
  way round type-checks whenever the types happen to line up.
- `Predicate.not(...)` (Java 11+) reads better than `p.negate()` for a method reference.
- Composed predicates evaluate left to right with short-circuiting. Reorder for cost only
  when effects, exceptions, null guards and semantic dependencies remain equivalent.
- Composition may introduce wrappers and calls; allocation/inlining depend on the target
  runtime. Measure its significance rather than assuming request-scope cost is irrelevant.

## Checked exceptions

The standard interfaces declare no checked exceptions, so a lambda body cannot throw one. The
three legitimate answers, in order of preference:

**1. Translate at the throw site.** Usually correct: the checked exception is an implementation
detail of the operation, and the caller of the pipeline needs a domain exception anyway.

```java
static Config parse(Path p) {
    try { return Config.from(Files.readString(p)); }
    catch (IOException e) { throw new ConfigLoadFailed(p, e); }   // cause preserved
}
paths.stream().map(Loader::parse).toList();
```

**2. Declare your own throwing interface**, when the exception genuinely belongs in the
contract and callers must handle it.

```java
@FunctionalInterface
interface ThrowingFunction<T, R, E extends Exception> { R apply(T t) throws E; }

static <T, R, E extends Exception> Function<T, R> unchecked(ThrowingFunction<T, R, E> f) { ... }
```

Useful, and worth exactly one implementation per codebase — not one per package.

**3. Keep the operation out of the pipeline.** A `for` loop with a normal `try`/`catch` is
often the honest shape, especially when different elements need different handling, or when
one failure must abort the rest.

What not to do: the "sneaky throw" trick, which uses an unchecked generic cast to throw a
checked exception the compiler cannot see. The exception then propagates through call sites
whose signatures deny it can happen, so no caller catches it and the failure surfaces
somewhere with no relevant context.

Two related points:

- **A lambda that swallows an exception is worse than a method that does**, because the
  suppression is buried in an expression. `java-exception-design`'s rule applies unchanged: do
  not catch and log without either handling or rethrowing.
- **With typical ExecutorService `submit`, task failure is captured in the `Future`** and
  need not be logged unless a caller or configured hook observes it. This is one of the quietest failure
  modes in Java; see executors-and-task-lifecycle.

Primary reference for receiver evaluation and null timing:
[JLS method-reference evaluation](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.13.3).
