# Placement decision: does this decision move into the object?

## Heuristics — signs a decision wants to move

- **The same branch on the same getters appears in N places.** Two call sites deciding
  "may this order ship?" from `order.status()` and `order.paidAt()` may duplicate one rule.
  Confirm shared eligibility and change ownership; a report and an operational guard can
  intentionally differ. For a shared object-owned rule, `order.isShippable()` can expose the
  query, while `order.ship()` rechecks and enforces it at mutation time.
- **A setter only ever runs behind a guard.** If every `setBalance` in the codebase sits
  inside an `if` on `getBalance`, inspect whether callers own legitimate correction policy
  or are compensating for a missing invariant check. Replace misplaced guard/mutation pairs
  with commands; a validated administrative assignment can remain a distinct operation.
- **The invariant lives in comments or wiki, not in a type.** "Callers must check the
  credit limit before debiting" needs an actual enforcement boundary on relevant mutations,
  not just a constructor check.
- **Check-then-act on shared state.** A read, a decision, then a write on the same object
  is a race window; a single command gives one place to synchronize or version but does not
  reduce the legal interleavings until that concurrency protocol is actually applied.
- **Tests for a domain rule construct a service with five mocks.** The rule is trapped in
  orchestration only if those dependencies are incidental to the rule. A pure policy/domain
  command can then simplify its tests; mock count alone does not determine ownership.
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
- **Existing entry points have consumers.** Inspect compiled clients, binders and authorized
  correction/import paths before removing or narrowing a setter. Keep a compatible validating
  entry point when it preserves the intended contract, or plan an explicit migration; retaining
  the signature alone does not preserve behavior or make an unsafe bypass acceptable.
- **Visibility of the rule moves.** Readers of the service no longer see the policy
  inline. The cure is naming (`withdraw` that can refuse), not moving the rule back.

[Fowler's discussion](https://martinfowler.com/bliki/TellDontAsk.html) treats responsible queries
and layering as legitimate trade-offs. For published Java APIs, deleting a non-private method
can break existing binaries ([JLS 21 §13.4.12](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.4.12)).
