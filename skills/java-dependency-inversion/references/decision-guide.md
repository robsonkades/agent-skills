# Decision guide: when to invert, when to leave it

## Classifying the edge

| The dependency is on…   | Examples                         | Decision                                                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| A mechanism you own     | persistence layer, HTTP client   | Invert when change/failure/release isolation repays a port                           |
| A system you do not own | payment gateway SDK, mail relay  | Quarantine it at an adapter; add a policy port when policy calls it                  |
| A stable value/API type | `Instant`, `BigDecimal`, `Path`  | Usually keep it; abstract the operation (`Files`/remote I/O), not value syntax       |
| Another piece of policy | pricing rules used by order flow | Usually call directly; inspect real variation, ownership or release boundaries first |
| An API you publish      | plugin SPI, extension points     | Preserve its extension contract; inspect actual ownership and dependency direction   |

Direction matters more than layering vocabulary. The question is never "is this the
service layer calling the repository layer" but "if this dependency changed vendor,
protocol or shape tomorrow, which source files would the compiler force me to edit?"
If the answer includes policy files, ask whether the change is a mechanism detail the
policy should be insulated from, or a real policy-contract change. A source edge or release
boundary alone does not establish the cost or justify a new interface.

## Look for value in inversion when

- Policy code cannot be unit-tested without network, filesystem, container or a
  mocking framework stubbing a vendor type you do not own.
- Two production implementations exist or are scheduled — not imagined. Check whether
  they satisfy the same policy capability; do not hide incompatible semantics behind a
  misleading common contract.
- The mechanism's types leak into policy signatures (`HttpResponse`, `ResultSet`,
  a generated SDK class as a parameter or return type). The leak couples every
  caller, not just the class that made it.
- The edge crosses a team or release boundary. Inspect actual compatibility promises and
  change propagation; a stable contract may already permit independent releases.

## Leave it alone when

- One implementation, no boundary, and tests are already easy — a port here is a
  file you open on every navigation, for nothing.
- The abstraction merely mirrors a concrete surface and adds no ownership, capability or
  testing seam. Matching signatures alone do not prove that the contract is unnecessary.
- The candidate is stable pure computation with no independent variation/release boundary.
  Determinism makes direct testing easy; independently changing tax policy may still justify
  a strategy even though it performs no I/O.
- You would wrap a JDK port (`Clock`, `Random` via `RandomGenerator`) without different
  policy semantics or a useful capability restriction. Inject the matching JDK type instead.

Matching the API does not establish safe sharing. `Clock` implementations must be thread-safe;
`RandomGenerator` implementations need not be. Select the implementation and its confinement or
sharing scope together. Replacing a per-operation generator with one shared injected instance can
change both concurrency safety and random-sequence ownership; injection alone validates neither.

## Making direction physical: JPMS

`requires` edges are the dependency graph the compiler enforces. A layering rule
that lives in a wiki is advice; the same rule in `module-info.java` is a compile
error when broken:

These are three separate `module-info.java` sketches. The adapter's `jakarta.mail` module
is an assumed dependency: inspect the actual artifact with `jar --describe-module` before
using that name. They are not a complete build or a requirement to adopt Jakarta Mail.

```java
module shop.orders {            // policy: no requires on any mechanism
    exports shop.orders;        // includes the ports the adapters implement
}

module shop.smtp {              // adapter: depends on the policy, not vice versa
    requires shop.orders;
    requires jakarta.mail;
    exports shop.smtp to shop.app;
}

module shop.app {               // composition root: the only module seeing both
    requires shop.orders;
    requires shop.smtp;
}
```

Here the policy reads only the mandated `java.base` module, so ordinary static use of
adapter types fails compilation. In larger graphs inspect `requires transitive` readability
and launch-time `--add-reads`; absence of a direct edge alone proves less. JPMS rejects cyclic
`requires`, but not every undesired edge creates a cycle. Keep the permitted direction under
review and test that a forbidden source dependency fails to compile.

`jdeps -verbose:class <policy-classes-or-jar>` exposes class-file dependencies, not all source
or build dependencies. A vendor annotation with `RetentionPolicy.SOURCE` is discarded by the
compiler: its absence from `jdeps` does not mean the policy source compiles without that vendor.
Inspect source references, annotation processors and generated-source inputs; rebuild policy into
a fresh output directory with the mechanism absent, avoiding cached classes or generated outputs
that hide the missing dependency. Report accepted build-time coupling separately from runtime
isolation rather than introducing a port merely because an annotation exists.

Reflective class names, service-provider behavior and configuration/schema coupling also need
separate inspection. Without JPMS, package architecture tests can enforce finer-grained edge
rules; bytecode-based checks share the source-dependency blind spot.

## Factories

A factory inverts _creation_ the way a port inverts _invocation_. Decide the same
way:

- Policy controls the creation/acquisition timing or scope of a **policy concept**, including
  lazy or per-unit-of-work use → consider a factory port and specify reuse/cleanup.
  Database connections, HTTP sessions and transport clients should normally be acquired inside
  the adapter; exposing `ConnectionFactory` to policy merely renames the mechanism leak.
- Policy needs one collaborator for its lifetime → inject the instance; a factory
  adds a level of indirection with no second creation site.
- The factory only centralises `new` with no variation → it is the composition
  root's job, not a type of its own.

## The testability check, made concrete

### A port can outlive its method call

Source isolation is necessary for a claimed source boundary, but it does not prove equivalent
runtime behavior. Define the consumer's operation from invocation through completion and cleanup.
Keep the synchronous notification example synchronous unless requirements call for a change.

- For `CompletionStage<Receipt>`, a `try/catch` around stage creation cannot translate a failure
  delivered later. Map both invocation-time failures and exceptional completion according to the
  port contract; test the declared caller-visible exception/wrapper shape. `whenComplete` observes
  an outcome and normally preserves it: if the source already failed, throwing a replacement from
  that observer does not replace the source failure. Use a transforming stage such as `handle`
  when changing the outcome, and do not accidentally turn a failure into normal completion.
- Mapping a stage does not establish cancellation propagation, callback thread/context or
  effect rollback. For example, cancelling a dependent `CompletableFuture` does not by itself
  cancel its source. Preserve the actual provider/port contract and describe unsupported
  guarantees rather than adding `join()` to hide asynchronous behavior.
- For an iterator or `Stream<Order>`, fetching rows and raising a vendor error can happen during
  consumption. Define who owns the backing cursor/connection and whether the view remains valid
  after return. Do not return a lazy view from a resource scope that already closed it. A
  resource-owning stream needs an effective close path on success, early exit and failure;
  consuming it with a terminal operation is not itself a promise that the resource is closed.

Keep provider failure translation at the provider operation. Catching every `RuntimeException`
around a consumer callback or an entire traversal can mislabel a policy bug as a transport failure
and trigger inappropriate retries. Translate recognized provider failures according to the port
contract; preserve consumer failures and test them separately. For a scoped callback, this means
distinguishing acquisition/fetch/close failures from failures raised by the supplied action.

Choose the smallest result shape that satisfies actual consumers. A bounded materialized value
or list can keep acquisition, translation and release inside the adapter. A large or intentionally
short-circuited traversal may justify a lazy result with explicit ownership instead. A callback
scoped inside the adapter is another option, but its execution, failure and re-entry semantics
become part of the port. Do not materialize an unbounded query merely to avoid describing its lifetime.

These are port obligations, not reasons to require futures, streams or new interfaces everywhere.
For example, a port returning `Map<String, Object>` still leaks its provider if callers must know
SDK field names and cast nested provider objects. Prefer existing stable value types or the smallest
consumer-owned result that carries the needed meaning; do not duplicate a valid provider-owned SPI.

### Check both sides of the contract

After inverting, use these checks to locate remaining coupling. A failure needs explanation;
it does not by itself prove that the port was unnecessary:

- The double implements only the policy capability and has no vendor/framework setup; line count
  is a smell locator, not an acceptance criterion.
- The policy test constructs the subject with `new`, no framework and no reflection.
- The test asserts on policy outcomes (what was sent, what was decided). Effect count/order
  matters when it is part of the contract; avoid asserting incidental helper-call scripts.
- When the port permits deferred execution, use controlled completion or consumption to test
  delayed failure and partial consumption. An immediate recording fake may establish policy
  intent but cannot establish the adapter's delivery, cancellation or resource-release behavior.
  Exercise the same promised outcomes against the adapter, using an isolated provider fixture
  where available; label unavailable integration evidence instead of trusting the fake as a specification.
- Excluding the adapter module leaves the policy module compiling from source into fresh output.

## Primary sources

- [JLS 17 module dependencies](https://docs.oracle.com/javase/specs/jls/se17/html/jls-7.html#jls-7.7.1)
  defines readability, transitive dependencies and cycle restrictions.
- [JDK 17 jdeps](https://docs.oracle.com/en/java/javase/17/docs/specs/man/jdeps.html)
  documents the class-file analysis and output options.
- [JDK 17 annotation retention](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/annotation/RetentionPolicy.html)
  specifies that `SOURCE` annotations are discarded by the compiler.
- [Clock](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Clock.html)
  and [RandomGenerator](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/random/RandomGenerator.html)
  provide existing time/randomness seams; verify the target API version before choosing one.
- [CompletionStage](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/CompletionStage.html)
  specifies deferred outcome transformation and `whenComplete` exception precedence;
  [CompletableFuture](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
  defines its cancellation and dependent-stage behavior.
- [Stream](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/stream/Stream.html)
  defines lazy traversal and closing streams backed by I/O resources.
