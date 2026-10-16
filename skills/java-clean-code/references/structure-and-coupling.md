# Structure and coupling: detection, false positives, limits

## Abstraction levels

**Detect.** Read the method as a sentence per statement. If some sentences are domain
("apply the platinum rate") and others are mechanics ("append to the builder", "advance
the iterator"), levels are mixed. A sharper probe: try to name each block with a domain
verb. A block you can only name "do stuff with the string" is mechanics sitting inside
policy.

**False positives — not level violations:**

- Guard clauses. `if (entries.isEmpty()) throw …` at the top is a precondition, not a
  mixed level; extracting each guard to `requireX` is optional polish, not a fix.
- Logging and metrics lines. They are annotations on the flow, not a second level. If
  they outnumber the logic, that is a different problem (volume), not this one.
- `try`/`finally` resource plumbing around otherwise single-level code.
- Genuinely trivial mechanics: one `toString`, one arithmetic expression. Extracting
  `subtract(fee)` to `netOf(gross, fee)` adds a hop and removes nothing.

**When not to apply.** A short test body, one-off migration or tool entrypoint may be
clearest as one reader-path. Keep the test's action and assertions visible; a named helper
for meaningful shared setup can still reduce distraction. Apply the actual project's
conventions and lifetime, not a blanket prohibition on test helpers.

## Extraction can change overload selection

Inspect the declared receiver/argument types and selected overload before and after moving
a call. A helper accepting a broader type can invoke a different method while receiving the
same object; runtime argument classes do not redo overload resolution. The chosen descriptor
comes from compile-time method selection ([JLS 25 §15.12.2](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.12.2)).

Partial Java 25 example; enclose these methods in a class. Both versions compile:

```java
static String original(char[] label) {
    return new StringBuilder().append(label).toString();
}

static String widened(char[] label) {
    return renderObject(label);
}

static String renderObject(Object value) {
    return new StringBuilder().append(value).toString();
}
```

For `new char[] {'O', 'K'}`, `original` returns `"OK"`; `widened` appends the array's object
representation. The calls select `append(char[])` and `append(Object)` respectively, whose
contracts differ ([StringBuilder API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/StringBuilder.html)).
Keeping a meaningful helper's `char[]` parameter preserves this selection; keeping the short
original call inline can be clearer. A cast inside a broadly reusable helper needs its own
input contract and can introduce a failure; it is not a universal repair.

The converse matters: if the original expression was already declared `Object`, retaining that
overload can be correct even when one fixture happens to hold a character array. Follow the
original contract rather than always narrowing to the runtime class. The same issue can route
an application call to a different overload with different effects, not just change formatting.
Compare the selected member in source or compiled descriptors when unclear, and check results
and effect paths with a value that distinguishes the overloads. Compilation alone misses this.

The example and typed-helper/original-`Object` controls were compiled with `--release 25` and
run on Temurin 25.0.3+9. Those checks demonstrate this boundary; they do not establish equivalence
for unrelated extractions or measure readability.

## Temporal coupling

**Detect.**

- Pairs like `init()`/`execute()`, `open()`/`send()`, `validate()` that must precede
  `save()` — where the compiler cannot enforce the order.
- Setters that must run before a method call for it to work.
- Fields that are null until some method assigns them ("phased construction").
- Javadoc or comments saying "must be called after/before X".
- A `reset()`/`clear()` method whose only purpose is making an object reusable.

**Fix directions**, when the order is accidental: make the first step a constructor or static
factory if construction legitimately owns that work; return the intermediate state from
`a()` and take it as a parameter in `b()`; encode phases as distinct types
(`UnvalidatedOrder` → `ValidatedOrder`); merge the methods when
callers never legitimately separate them.

Before treating a phase type as proof of validation, inspect every construction path and
the lifetime of the validated facts. A public record has a public canonical constructor:
a validating factory alone cannot prevent `new ValidatedOrder(invalidOrder)`. Enforce
local invariants in the constructor, or use an appropriately controlled representation.
Records are shallowly immutable; a mutable `Order` alias can invalidate a wrapper after
construction. Use stable validated values or preserve the existing ownership/checking
contract. A type recording successful validation cannot guarantee that external stock,
balance or authorization remains unchanged until use; retain the relevant action-time
check and consistency boundary. Verify bypass attempts and mutation after validation,
not just the successful factory call. Keep simple runtime checks when a new type does
not reduce a real caller error or comprehension cost.

**False positives:**

- Lifecycles owned by a container or protocol: a framework-managed bean's
  post-construct step or JDBC's `prepare`/`execute`. Inspect the actual contract before
  adding phase types: `Iterator.next()` does not require a preceding `hasNext()`;
  optional `remove()` instead requires a preceding `next()` and is limited to once
  per returned element.
- Test fixtures: `@BeforeEach` then the test method is temporal coupling by design,
  managed by the runner.
- Builders. Accumulation followed by `build()` can be a deliberate lifecycle when build
  validates required state. Inspect order dependence and reuse rules; the pattern alone
  does not enforce safety. Do not replace a useful builder with a 9-argument constructor.

**When not to apply.** When the ordered API is public and published, re-shaping it is API
evolution with compatibility costs (java-api-design), not an internal cleanup. Internal
methods may also implement framework or resource protocols. Keep adequate lifecycles;
when a change is justified, plan compatibility and any needed deprecation before removal.

## Hidden dependencies

**Detect.** Ambient reads inside domain logic: `LocalDate.now()`, `Instant.now()`,
`Locale.getDefault()`, `TimeZone.getDefault()`, `Math.random()`, static config holders,
system properties, singletons reached through static getters. A test that sets a system
property, freezes a static, or sleeps may reveal a hidden input; establish whether this
causes isolation, reproducibility or maintenance problems before prescribing a seam.

**Fix when control is needed.** Take the dependency as a parameter at a suitable boundary — `Clock` (then
`LocalDate.now(clock)`), `Locale`, `RandomGenerator`, a config value rather than the
config source. Resolve ambient inputs where their ownership is clear; avoid passing an
unused dependency through unrelated layers. Preserve the time zone and number/timing of samples: replacing repeated
time reads with one boundary snapshot changes semantics if the operation intentionally
observes elapsed time or a date rollover. Retain a clock for that contract.

Preserve any required random distribution, algorithm/sequence and sharing contract when exposing
a random source. [`Math.random()`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Math.html#random()>)
supports concurrent callers; `RandomGenerator` instances need not be thread-safe. An injected
generator may become shared through a singleton's lifetime. Inspect the concrete implementation
and use documented safe sharing or appropriate confinement (`java-thread-safety-contracts`);
an interface and a `final` field alone establish neither. Test reproducibility under the intended
ownership and call sequence, not merely with one seeded single-threaded test.

**False positives:**

- Logging frameworks reading time — the timestamp is telemetry, not an input to logic.
- Constants and pure statics: `BigDecimal.ZERO`, `Comparator.naturalOrder()` are
  dependencies in no meaningful sense.
- The composition root itself: somewhere `Clock.systemUTC()` must be called once. That
  place is not hiding a dependency; it is declaring one.
- `UUID.randomUUID()` for identifiers whose exact value is irrelevant — inject a generator
  when tests, replay, ordering, audit correlation or deterministic simulations need control,
  not merely because every dependency could theoretically be abstracted.

**When not to apply.** Threading a `Clock` through fifteen call layers to reach one
`now()` adds cost if nothing between them uses it. For a snapshot contract, sample at the
boundary and pass the _value_; for repeated observations, retain a clock at the component
that needs it. An existing adequate seam may suffice. A partial migration that silently
leaves some paths uncontrolled does not establish reproducibility.

## The fragmentation limit (when NOT to split)

These signals suggest that splitting may cost more than it saves:

- The fragment has one caller and needs broad shared state just to perform one small
  step — investigate its purpose rather than rejecting a parameter count.
- The fragment's name would restate its body (`addToTotal` for `total = total.add(x)`).
- Understanding any fragment requires reading its caller anyway.
- The pieces would sit at the _same_ level as the caller — you are paginating, not
  layering.

Check whether the boundary serves a real policy, extension or lifecycle contract before
merging. The over-fragmented example in `worked-examples.md` shows the merge. The honest metric is
concepts-in-flight for the reader, not method length; a linear 30-line method at one level
is often the most readable form a computation has.

## Diagnostic sequence

Use this sequence to identify candidates, then check the exceptions and affected contracts
above; matching a signal is not itself a review finding.

```text
Hard to understand
  ↓
Mixed policy/mechanics? ── yes → extract a named stable concept
  │ no
Hidden input or ordered state? ── yes → expose value/state transition
  │ no
Navigation exceeds local complexity? ── yes → inline/merge adjacent fragments
  │ no
Leave it; avoid a cosmetic churn diff
```

Useful primary API references: [`Clock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/time/Clock.html)
for explicit time sources and [`RandomGenerator`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/random/RandomGenerator.html)
for the deliberately broad generator abstraction. The refactoring vocabulary follows Martin
Fowler's [official catalog](https://refactoring.com/catalog/), but the decision criteria above
are stricter than applying a named refactoring mechanically.
For lifecycle claims, consult [`Iterator`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Iterator.html),
especially the separate contracts of `next()` and `remove()`.
For phase-type limits, see [JLS 25 §8.10.4](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.10.4)
on canonical-constructor accessibility and [`Record`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Record.html)
on shallow immutability.
