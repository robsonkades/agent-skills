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

**When not to apply.** Code with a single reader-path and a short life: test bodies,
one-off migration scripts, `main` in a tool. Test methods in particular _should_ read as
given/when/then mechanics; extracting them into helpers hides what the test asserts.

## Temporal coupling

**Detect.**

- Pairs like `init()`/`execute()`, `open()`/`send()`, `validate()` that must precede
  `save()` — where the compiler cannot enforce the order.
- Setters that must run before a method call for it to work.
- Fields that are null until some method assigns them ("phased construction").
- Javadoc or comments saying "must be called after/before X".
- A `reset()`/`clear()` method whose only purpose is making an object reusable.

**Fix directions**, in order of preference: make the first step a constructor or static
factory so an instance _is_ the completed first step; return the intermediate state from
`a()` and take it as a parameter in `b()`; encode phases as distinct types
(`UnvalidatedOrder` → `ValidatedOrder`, records make this cheap); merge the methods when
callers never legitimately separate them.

**False positives:**

- Lifecycles owned by a container or protocol: a framework-managed bean's
  post-construct step, JDBC's `prepare`/`execute`, an `Iterator`'s
  `hasNext`/`next`. The order _is_ the published contract and callers know it; wrapping
  these in phase types is ceremony.
- Test fixtures: `@BeforeEach` then the test method is temporal coupling by design,
  managed by the runner.
- Builders. A builder is temporal coupling made safe: order-free accumulation with one
  terminal `build()`. Do not "fix" a builder into a 9-argument constructor.

**When not to apply.** When the ordered API is public and published, re-shaping it is API
evolution with compatibility costs (java-api-design), not an internal cleanup. Inside the
module, fix it; at the boundary, document and deprecate first.

## Hidden dependencies

**Detect.** Ambient reads inside domain logic: `LocalDate.now()`, `Instant.now()`,
`Locale.getDefault()`, `TimeZone.getDefault()`, `Math.random()`, static config holders,
system properties, singletons reached through static getters. The test-side symptom is
decisive: a test that needs to set a system property, freeze a static, or sleep is
witnessing a hidden dependency.

**Fix.** Take the dependency as a parameter at the boundary — `Clock` (then
`LocalDate.now(clock)`), `Locale`, `RandomGenerator`, a config value rather than the
config source. Only the composition root and the outermost adapter layer touch the
ambient versions.

**False positives:**

- Logging frameworks reading time — the timestamp is telemetry, not an input to logic.
- Constants and pure statics: `BigDecimal.ZERO`, `Comparator.naturalOrder()` are
  dependencies in no meaningful sense.
- The composition root itself: somewhere `Clock.systemUTC()` must be called once. That
  place is not hiding a dependency; it is declaring one.
- `UUID.randomUUID()` for identifiers whose value no logic branches on — inject a
  generator only when tests actually need to predict ids.

**When not to apply.** Threading a `Clock` through fifteen call layers to reach one
`now()` is worse than the disease if nothing between them uses it — restructure so time
is sampled once at the boundary and the _value_ is passed, rather than plumbing the
clock. If neither is practical this sprint, a package-private seam plus a TODO beats a
half-threaded parameter that some paths ignore.

## The fragmentation limit (when NOT to split)

Splitting stops paying when any of these holds:

- The fragment has one caller and needs fields or 3+ parameters to share state with it —
  the signature is wider than the body.
- The fragment's name would restate its body (`addToTotal` for `total = total.add(x)`).
- Understanding any fragment requires reading its caller anyway.
- The pieces would sit at the _same_ level as the caller — you are paginating, not
  layering.

The over-fragmented example in `worked-examples.md` shows the merge. The honest metric is
concepts-in-flight for the reader, not method length; a linear 30-line method at one level
is often the most readable form a computation has.
