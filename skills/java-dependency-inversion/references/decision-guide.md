# Decision guide: when to invert, when to leave it

## Classifying the edge

| The dependency is on…   | Examples                          | Decision                               |
| ----------------------- | --------------------------------- | -------------------------------------- |
| A mechanism you own     | persistence layer, HTTP client    | Invert when policy tests need a seam   |
| A system you do not own | payment gateway SDK, mail relay   | Invert — the boundary exists anyway    |
| A stable platform type  | `java.time`, `BigDecimal`, `Path` | Leave it; you will never substitute it |
| Another piece of policy | pricing rules used by order flow  | Leave it; peers may call directly      |
| An API you publish      | plugin SPI, extension points      | Already inverted — keep the interface  |

Direction matters more than layering vocabulary. The question is never "is this the
service layer calling the repository layer" but "if this dependency changed vendor,
protocol or shape tomorrow, which source files would the compiler force me to edit?"
If the answer includes policy files, the edge points the wrong way.

## Invert when

- Policy code cannot be unit-tested without network, filesystem, container or a
  mocking framework stubbing a vendor type you do not own.
- Two production implementations exist or are scheduled — not imagined. A second
  implementation is the moment the abstraction stops being speculative.
- The mechanism's types leak into policy signatures (`HttpResponse`, `ResultSet`,
  a generated SDK class as a parameter or return type). The leak couples every
  caller, not just the class that made it.
- The edge crosses a team or release boundary: the mechanism ships on a different
  cadence, so a source-level dependency turns their schedule into yours.

## Leave it alone when

- One implementation, no boundary, and tests are already easy — a port here is a
  file you open on every navigation, for nothing.
- The "abstraction" would mirror the concrete class method-for-method. That is the
  class's surface with an `I` in front; substitutability was never designed in.
- The candidate is pure computation (a tax table, a rounding rule). Call it
  directly; deterministic code needs no double.
- You would wrap a JDK port (`Clock`, `Random` via `RandomGenerator`) in a local
  interface. Inject the JDK type instead.

## Making direction physical: JPMS

`requires` edges are the dependency graph the compiler enforces. A layering rule
that lives in a wiki is advice; the same rule in `module-info.java` is a compile
error when broken:

```java
module shop.orders {            // policy: no requires on any mechanism
    exports shop.orders;        // includes the ports the adapters implement
}

module shop.smtp {              // adapter: depends on the policy, not vice versa
    requires shop.orders;
    requires jakarta.mail;
}

module shop.app {               // composition root: the only module seeing both
    requires shop.orders;
    requires shop.smtp;
}
```

Two properties fall out. The policy module's `module-info` documents — and
enforces — that it depends on nothing replaceable. And the module system rejects
cyclic `requires` at resolution, so an accidental policy→adapter edge cannot creep
in as a cycle; it fails the build. Without JPMS, the same edges can be enforced
with an architecture test over the package graph — weaker, but better than prose.

## Factories

A factory inverts _creation_ the way a port inverts _invocation_. Decide the same
way:

- Policy needs a fresh mechanism instance per unit of work (a connection, a
  session) → inject a factory port (`ConnectionFactory`), not the product.
- Policy needs one collaborator for its lifetime → inject the instance; a factory
  adds a level of indirection with no second creation site.
- The factory only centralises `new` with no variation → it is the composition
  root's job, not a type of its own.

## The testability check, made concrete

After inverting, all of these should hold; if any fails, the inversion is
incomplete or was not needed:

- The double is a hand-written class of under ~15 lines implementing the port.
- The policy test constructs the subject with `new`, no framework and no reflection.
- The test asserts on policy outcomes (what was sent, what was decided), not on
  interaction scripts ("verify method X was called once").
- Deleting the adapter module leaves the policy module compiling.
