# Selection matrix

Design problem → candidates → the simpler alternative → what decides. Read the fourth column
before the second. The columns suggest candidates, not measured win rates or automatic decisions.

## Creation

| Design problem                                            | Candidates                                          | Simpler alternative                                    | What decides                                                                                |
| --------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Construction has many or optional parameters              | Builder                                             | Constructor/named factory; record if its contract fits | Consumer naming, defaults, invariants and ownership; count alone does not decide            |
| Several related objects must stay mutually consistent     | Abstract Factory                                    | Existing DI family configuration                       | Family invariant, selection timing and construction ownership; DI and factories can coexist |
| An inherited algorithm must not know the concrete product | Factory Method                                      | Injected `Supplier` / `Map<Key, Supplier>`             | Existing extension contract and ownership of construction                                   |
| A new object must be built from an existing one's state   | Prototype                                           | Copy constructor; immutable sharing                    | Required distinct identity, subtype and aliasing semantics                                  |
| Exactly one instance is needed                            | Singleton                                           | One bean, injected                                     | "One per what?" — class loader, process, or cluster                                         |
| Which concrete type depends on runtime data               | Factory/registry; Factory Method for subclass hooks | Map of suppliers or compatible switch                  | Registration ownership, extension and creation lifecycle                                    |

## Structure and boundaries

| Design problem                                                   | Candidates | Simpler alternative                        | What decides                                                                             |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| An existing type has the wrong interface                         | Adapter    | Change one side, if compatible             | Ownership plus external compatibility and migration cost                                 |
| A subsystem of collaborators is used in one standard sequence    | Facade     | Direct composition                         | Useful boundary/policy or repeated orchestration, not caller count                       |
| Cross-cutting behaviour must be added, stackably, at runtime     | Decorator  | The framework's filter/interceptor         | Is the concern transport-shaped or domain-shaped?                                        |
| Access to an object must be controlled or deferred               | Proxy      | An explicit lazy accessor or `Supplier`    | Required consumer transparency, access and lifecycle contracts; preserve adequate APIs   |
| Two things vary independently and the class count is multiplying | Bridge     | Composition (a field)                      | Independent evolution/ownership and implementor contract; current class counts are clues |
| A part and a whole must be treated identically, recursively      | Composite  | A collection field                         | Uniform recursive operations; finite depth is valid and should be bounded                |
| Many long-lived duplicate objects dominate the heap              | Flyweight  | String deduplication; a smaller field type | occurrences ÷ distinct values; measure first                                             |

## Behaviour and interaction

| Design problem                                          | Candidates              | Simpler alternative                         | What decides                                                                                |
| ------------------------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| One operation has interchangeable algorithms            | Strategy                | A lambda; configuration                     | Do the variants differ in behaviour or only in constants?                                   |
| Behaviour changes with the object's own status          | State                   | Enum/status plus transition function        | State-dependent legality/behavior; transitions may be externally driven                     |
| An algorithm's skeleton is fixed; steps vary            | Template Method         | A class taking composed steps               | Existing hook/SPI and lifecycle contracts; who owns the extension set                       |
| A request must be offered to several possible handlers  | Chain of Responsibility | A `switch` over a sealed kind               | Is the handler set open to other modules?                                                   |
| An invocation must be queued, logged, retried or undone | Command                 | Call the method                             | Does anything actually consume the reification?                                             |
| Prior state must be restorable                          | Memento                 | Immutable capture; exact inverse            | Restoration ownership, intervening changes and effects; cheap inverse alone is insufficient |
| Dependents must be told something changed               | Observer                | Direct calls                                | Subscription ownership, lifecycle and decoupling; known listeners can qualify               |
| Many-to-many collaboration has become a web             | Mediator                | Events; or fewer collaborators              | Who owns coordination decisions, results, ordering and participant lifetimes?               |
| Several operations must run over one object structure   | Visitor                 | Compatible exhaustive dispatch              | Type ownership, operation growth, target Java and extension contracts                       |
| A structure must be traversed without exposing it       | Iterator                | Return an unmodifiable collection           | Is the sequence computed, unbounded, or paged?                                              |
| A small language must be evaluated                      | Interpreter             | Existing bounded evaluator or configuration | Grammar/semantics, translation needs, security and maintenance cost                         |

## The rows that most often resolve to "no pattern"

Six problems that look like pattern problems and usually are not:

```text
"We might need another implementation later"
        → no speculative variation layer; retain a present boundary, policy or test seam if justified.

"These three classes differ only in a rate/limit/URL"
        → validated values/table/configuration, unless identity or metadata justifies types.

"We need to make this testable"
        → fix the untestability: a static, a clock read, I/O in a
          constructor. A narrow seam may be the appropriate fix (java-test-design).

"This should be faster"
        → measure the complete path; neither overhead nor benefit is automatic (java-performance).

"Every service in this codebase has a Facade/Factory/Manager"
        → precedent, not justification. Re-derive or record the
          convention (architecture-decision-making).

"The framework does not do exactly what we want"
        → inspect actual extension points and configured behavior. Custom composition remains
          valid when supported mechanisms cannot meet the contract (gof-patterns-in-modern-java).
```

## Worked selections

**"Adding a payment provider touches five classes and a switch in each."**
Variation: one axis (provider), each variant a whole set of related behaviours — authorise,
capture, refund. Not one behaviour, so not a plain function value. Candidates: Strategy over a
provider interface; Abstract Factory if the provider's several objects must stay matched. Decision:
one interface with the three operations per provider — a Strategy with multiple methods — because
the objects are one adapter each, not a family that could be mixed. Simpler alternative rejected:
configuration, because the providers differ in protocol, not in values. Result: `gof-strategy` plus
one `gof-adapter` per provider.

**"The order object has `paid`, `shipped`, `cancelled` and `refunded` booleans."**
First establish which combinations are legal: paid and shipped can both be true, and payment,
fulfilment and refund may be independent dimensions. Compare an enum with centralized transitions
against sealed state variants when payloads differ. Booleans alone do not disqualify the enum option
or prove one state machine fits. Choose after invariant and transition evidence (`gof-state`).

**"Every outbound call needs retries, a timeout, metrics and a circuit breaker."**
Same interface in and out, several additions, order significant. Candidates: Decorator. Simpler
alternative: the existing client's configuration and resilience integrations. Inspect request
factory, observations/tracing setup, retry ownership and deadline semantics before deciding which
concerns are already covered. Add only missing behavior, then test composition (`gof-decorator`,
`rpc-and-api-contracts`).

**"Users need to filter search results with arbitrary conditions."**
Candidates: Interpreter or an existing bounded expression representation. Fixed fields lose only
if nesting/disjunction are real requirements. SQL translation alone does not justify owning a
parser/language: compare semantics, backend mappings, validation, resource bounds and maintenance.
Any chosen translator must parameterize values and allowlist accessible fields/operators
(`gof-interpreter`).

**"Two services must both know when a policy is renewed."**
Candidates: Observer, with a separate distributed delivery contract for the remote subscriber.
Local listener mechanics do not establish that contract. If committed policy changes require
reliable notification, inspect existing publication/consumer guarantees before evaluating a transactional
outbox plus messaging and idempotent consumption; best-effort notifications have different needs
(`gof-observer`, `event-driven-architecture`). The in-process listener and the message consumer are
different mechanisms whose guarantees must be stated, even when the same conceptual role is useful.

Sources: [JEP 441, finalized in Java 21](https://openjdk.org/jeps/441) and
[Spring REST client configuration](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html).
Apply framework guidance to the project's resolved version; the current reference is not an upgrade request.
