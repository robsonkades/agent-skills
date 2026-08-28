---
name: enterprise-base-patterns
description: >
  The small structural patterns that hold an enterprise application together — Gateway,
  Mapper, Layer Supertype, Separated Interface, Registry, Special Case, Plugin and Service
  Stub — with the judgement about when each earns its place and when it is indirection. Use
  when an external system's API is being called directly from business code, when the same
  null check appears in twenty callers, when a base class is accumulating unrelated
  protected helpers, when a Registry or a static holder is being used to reach a
  collaborator, when an interface is needed on the caller's side of a dependency, when tests
  are slow because they call a real third-party sandbox, when a plugin mechanism is proposed
  for a variation that has one implementation, or when a mapper has started making
  decisions. Does not cover data-access specifics (data-source-patterns), the aggregate
  boundary abstraction (repository-pattern), overall layering (layering-and-boundaries), or
  detecting overuse in general (enterprise-architecture-smells).
---

# Enterprise Base Patterns

## Purpose

Name the small pieces that recur in every enterprise codebase, so they are chosen rather
than reinvented — and so the ones that are usually mistakes are recognised as such. Most of
these patterns are one class each. Their value is not complexity; it is that each one has a
known cost and a known failure mode.

## The patterns, in one line each

```text
Gateway              an object that encapsulates access to an external
                     system or resource, presenting it in your terms.

Mapper               an object that moves data between two subsystems
                     while keeping them ignorant of each other.

Layer Supertype      a common superclass for all types in a layer,
                     holding what genuinely all of them need.

Separated Interface  the interface is declared in the package that USES
                     it; the implementation lives elsewhere.

Registry             a well-known object other objects use to find
                     common services. A controlled global.

Special Case         a subclass providing behaviour for a special case
                     (usually "absent"), so callers stop branching.

Plugin               links a class chosen at configuration time rather
                     than at compile time.

Service Stub         a stand-in for an external service, so tests do not
                     depend on it.
```

## Workflow

1. **Name the problem before the pattern.** Each of these is one page of code; the risk is
   never the code, it is applying it where the problem does not exist.
2. **For anything crossing to an external system, use a Gateway** — this is the highest
   value pattern here and the most consistently under-applied.
3. **For a repeated null or default check, consider Special Case** — but only when the
   default behaviour is genuinely the same everywhere.
4. **For an interface with one implementation, require the inversion or the seam.** Without
   one, it is a file, not a boundary (`layering-and-boundaries`).
5. **Prefer injection to a Registry.** A registry is a global with a nicer name, and its
   cost is invisible coupling and untestable code.
6. **Give tests a Service Stub with the failure modes**, not just the happy path.

## Decision rules

```text
Business code calls a third-party SDK, an HTTP client, a filesystem or
a clock directly
        → Gateway. Wrap it, express it in your domain's terms, translate
          its errors, and let tests replace it. This is the single most
          reliably worthwhile pattern on this list.

Two subsystems must exchange data and neither should know the other
        → Mapper. If one is allowed to know the other, a direct
          translation is simpler than a mapper (enterprise-base-patterns
          exists to be skipped when it is not needed).

Every type in a layer genuinely needs the same thing (an id, an audit
stamp, an equality rule)
        → Layer Supertype, holding ONLY that. The moment it holds
          helpers used by three subclasses, it has become a junk drawer.

A high-level module needs an interface that a lower module implements
        → Separated Interface: declare it where it is used. This is what
          makes the dependency point the right way.

Code needs to find a collaborator and injection is available
        → inject it. Registry only where injection genuinely cannot
          reach — a static utility, a serialised object being rehydrated.

The same "if absent, do X" appears in many callers, and X is the same
everywhere
        → Special Case (a NullCustomer, an UnknownRate). If X differs by
          caller, keep Optional and let each caller decide.

Behaviour must be selected at deployment or per tenant, and there are
genuinely several implementations
        → Plugin, wired at configuration time. With one implementation
          and no second in prospect, this is speculative generality.

A test depends on a third-party service
        → Service Stub, plus a contract test against the real thing on a
          schedule (architecture-testing).
```

## Rules

- **A Gateway's value is that it converts someone else's model into yours**, including their
  errors. A wrapper that passes the vendor's types and exceptions through has moved the
  coupling, not removed it.
- Gateways make time, randomness and the filesystem testable. `Clock`, an id generator and a
  file store injected as interfaces remove the most common cause of flaky tests and of
  untestable business rules (`architecture-testing`).
- **Layer Supertype fails by accretion.** It starts with an identifier and ends with twelve
  protected helpers, at which point every subclass depends on things it does not use.
  Review it whenever a method is added: does _every_ subtype need this?
- **Separated Interface is the mechanism behind hexagonal architecture**, and stating it
  plainly demystifies the style: the interface belongs to the caller's package, the
  implementation to the adapter's. That single placement rule is most of ports and adapters
  (`layering-and-boundaries`).
- **Registry is a global variable with a design pattern's name.** It defeats constructor
  injection, hides dependencies from the signature, and makes tests order-dependent. Use it
  only where injection cannot reach, and then keep it thread-safe and replaceable in tests.
- **Special Case removes branching only when the behaviour is uniform.** A `NullCustomer`
  whose `discountRate()` returns zero is excellent; one that callers keep testing with
  `instanceof` has made things worse than `Optional`.
- Special Case and `Optional` are not rivals. `Optional` at a boundary where the caller must
  decide; Special Case inside a model where the absent case has real, uniform behaviour.
- **Plugin requires a second implementation to exist or to be scheduled.** Configuration-time
  selection with one implementation is a strategy interface, a factory, a properties key and
  a wiring test, in exchange for nothing (`enterprise-architecture-smells`).
- A Service Stub must reproduce the real service's **failure** modes — timeouts, 500s,
  malformed payloads, rate limits — or it certifies only the path that never breaks. A stub
  that always succeeds is worse than no stub, because it produces confidence.
- **A Mapper must not decide.** Computation, defaulting that encodes a rule, and status
  resolution inside a mapper are business logic in a translation layer
  (`metadata-mapping`).

## References

- [Gateway and Mapper](references/gateway-and-mapper.md) — a gateway around an external
  system in Java with error translation, retry placement and the stub that mirrors it;
  gateways for time, identity and the filesystem; mapper placement and the rule against
  logic inside it; and the difference between a gateway and an adapter in the hexagonal
  sense. Read when integrating with anything outside the process.
- [Structural base patterns](references/structural-base-patterns.md) — Layer Supertype,
  Separated Interface, Registry, Special Case and Plugin, each with a worked example, the
  cost it imposes and the concrete condition that justifies it; plus Record Set and Value
  Object as they appear in modern Java. Read when introducing one of them, or when
  reviewing a base class, a registry or a plugin mechanism.
