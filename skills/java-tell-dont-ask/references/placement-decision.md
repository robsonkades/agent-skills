# Placement decision: does this decision move into the object?

## Heuristics — signs a decision wants to move

- **The same branch on the same getters appears in N places.** Two call sites deciding
  "may this order ship?" from `order.status()` and `order.paidAt()` is one rule written
  twice; they will drift. The rule wants to be `order.isShippable()` — or better, the
  mutation sites want `order.ship()` to enforce it.
- **A setter only ever runs behind a guard.** If every `setBalance` in the codebase sits
  inside an `if` on `getBalance`, the guard is the real operation and the setter is its
  loophole. Replace the pair with a command.
- **The invariant lives in comments or wiki, not in a type.** "Callers must check the
  credit limit before debiting" is documentation doing a constructor's job.
- **Check-then-act on shared state.** A read, a decision, then a write on the same object
  with time in between is a race window; a single command method narrows it and gives one
  place to synchronise or version.
- **Tests for a domain rule construct a service with five mocks.** The rule is trapped in
  orchestration; in the domain object it tests with a constructor call.
- **Queries with observable side effects.** "Touch on read" timestamps, emitted business events
  or mutation visible through later results make reads order-dependent. Private memoization can
  be observationally pure, but must still be safe under the type's concurrency contract and must
  not cache data whose validity changes behind it.

## False positives — asking that is correct

| Pattern                                                           | Why it stays                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapper/serialiser reading every field to build a DTO or JSON      | Boundary projection. Data out is the job; there is no decision to move.                                                                                                                                           |
| A view or template reading state to render it                     | Rendering is a query over state, not a decision about it.                                                                                                                                                         |
| Validation of raw input _before_ a domain object exists           | There is no object to tell yet; parse and validate at the boundary, then construct.                                                                                                                               |
| A pricing engine reading catalogue, customer and campaign objects | Cross-aggregate policy: no participating entity owns the whole rule. A domain policy or service decides, asking each object questions it can answer (`campaign.isActiveOn(date)`), rather than mining raw fields. |
| Reporting and analytics queries                                   | Read models exist to be asked.                                                                                                                                                                                    |
| A transaction script over a table with no invariants              | CRUD. Adding behaviour methods to a bag of columns is ceremony; anemia without invariants is not a disease.                                                                                                       |
| Framework-required accessors (JPA, Jackson)                       | The framework asks by contract. Keep those accessors from becoming the API other _domain_ code uses to decide.                                                                                                    |

## The costs of moving — count them before refactoring

- **The domain type gains responsibilities and tests; the service loses them.** Good when
  the rule is the object's own; bad when the object starts accumulating every rule that
  merely mentions it — a growing entity with unrelated commands is heading toward a God
  Object.
- **Infrastructure must not follow the decision.** If the decision needs a rate from a
  remote service, the application layer obtains a trusted snapshot and passes a domain value,
  or invokes a separately owned domain policy. Do not inject an HTTP client or repository into
  an entity. If the method needs many externally fetched values, the decision likely belongs
  outside or needs a cohesive policy/context value.
- **Snapshot semantics become part of correctness.** A supplied exchange rate, entitlement or
  limit needs an as-of time/version and an explicit stale-data policy when it can change between
  retrieval and commit.
- **Outcome signalling changes shape.** A service `if` can return anything; a domain
  command needs a result the caller can act on — an exception for "caller broke the
  contract", a result type for expected refusals. That is new API to design and keep
  stable.
- **Visibility of the rule moves.** Readers of the service no longer see the policy
  inline. The cure is naming (`withdraw` that can refuse), not moving the rule back.
