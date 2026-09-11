# Decision guide: when to invert, when to leave it

## Classifying the edge

| The dependency is on…   | Examples                         | Decision                                                                           |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| A mechanism you own     | persistence layer, HTTP client   | Invert when change/failure/release isolation repays a port                         |
| A system you do not own | payment gateway SDK, mail relay  | Quarantine it at an adapter; add a policy port when policy calls it                |
| A stable value/API type | `Instant`, `BigDecimal`, `Path`  | Usually keep it; abstract the operation (`Files`/remote I/O), not value syntax     |
| Another piece of policy | pricing rules used by order flow | Leave it; peers may call directly                                                  |
| An API you publish      | plugin SPI, extension points     | Preserve its extension contract; inspect actual ownership and dependency direction |

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

`jdeps -verbose:class <policy-classes-or-jar>` exposes class-file dependencies, not arbitrary
reflective class names, service-provider behavior or configuration/schema coupling. Inspect
those separately. Without JPMS, package architecture tests can enforce finer-grained edge
rules; their strength depends on the rule and coverage, not merely on being tests.

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

After inverting, use these checks to locate remaining coupling. A failure needs explanation;
it does not by itself prove that the port was unnecessary:

- The double implements only the policy capability and has no vendor/framework setup; line count
  is a smell locator, not an acceptance criterion.
- The policy test constructs the subject with `new`, no framework and no reflection.
- The test asserts on policy outcomes (what was sent, what was decided). Effect count/order
  matters when it is part of the contract; avoid asserting incidental helper-call scripts.
- Deleting the adapter module leaves the policy module compiling.

## Primary sources

- [JLS 17 module dependencies](https://docs.oracle.com/javase/specs/jls/se17/html/jls-7.html#jls-7.7.1)
  defines readability, transitive dependencies and cycle restrictions.
- [JDK 17 jdeps](https://docs.oracle.com/en/java/javase/17/docs/specs/man/jdeps.html)
  documents the class-file analysis and output options.
- [Clock](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Clock.html)
  and [RandomGenerator](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/random/RandomGenerator.html)
  provide existing time/randomness seams; verify the target API version before choosing one.
