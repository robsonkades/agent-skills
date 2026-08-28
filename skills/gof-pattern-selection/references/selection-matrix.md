# Selection matrix

Design problem → candidates → the simpler alternative → what decides. Read the fourth column
before the second: in a majority of rows the third column wins.

## Creation

| Design problem                                            | Candidates       | Simpler alternative                        | What decides                                                       |
| --------------------------------------------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Construction has many or optional parameters              | Builder          | Record + named static factories            | ≥5 components, or optional ones, or a cross-field rule             |
| Several related objects must stay mutually consistent     | Abstract Factory | One `@Configuration` per profile           | Is the family chosen per deployment (DI) or per request (factory)? |
| An inherited algorithm must not know the concrete product | Factory Method   | Injected `Supplier` / `Map<Key, Supplier>` | Does a framework construct the creator? If not, inject             |
| A new object must be built from an existing one's state   | Prototype        | Copy constructor; immutability             | Can the state be re-derived from parameters? Then it can           |
| Exactly one instance is needed                            | Singleton        | One bean, injected                         | "One per what?" — class loader, process, or cluster                |
| Which concrete type depends on runtime data               | Factory Method   | `Map<Key, Supplier>` or sealed `switch`    | Is the key set closed and owned? Then `switch`                     |

## Structure and boundaries

| Design problem                                                   | Candidates | Simpler alternative                        | What decides                                                    |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------ | --------------------------------------------------------------- |
| An existing type has the wrong interface                         | Adapter    | Change one side, if you own both           | Do you own the adaptee? If yes, change it                       |
| A subsystem of collaborators is used in one standard sequence    | Facade     | Call the three collaborators               | Is the sequence duplicated in ≥2 callers?                       |
| Cross-cutting behaviour must be added, stackably, at runtime     | Decorator  | The framework's filter/interceptor         | Is the concern transport-shaped or domain-shaped?               |
| Access to an object must be controlled or deferred               | Proxy      | An explicit lazy accessor or `Supplier`    | Can callers tolerate knowing? Then do not hide it               |
| Two things vary independently and the class count is multiplying | Bridge     | Composition (a field)                      | Does the abstraction side have variants too? Otherwise Strategy |
| A part and a whole must be treated identically, recursively      | Composite  | A collection field                         | Is the nesting genuinely unbounded?                             |
| Many long-lived duplicate objects dominate the heap              | Flyweight  | String deduplication; a smaller field type | occurrences ÷ distinct values; measure first                    |

## Behaviour and interaction

| Design problem                                          | Candidates              | Simpler alternative                        | What decides                                                |
| ------------------------------------------------------- | ----------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| One operation has interchangeable algorithms            | Strategy                | A lambda; configuration                    | Do the variants differ in behaviour or only in constants?   |
| Behaviour changes with the object's own status          | State                   | A sealed status + one transition function  | Does the object transition itself? Then State, not Strategy |
| An algorithm's skeleton is fixed; steps vary            | Template Method         | A final class taking its steps in          | Does a framework construct the subclass?                    |
| A request must be offered to several possible handlers  | Chain of Responsibility | A `switch` over a sealed kind              | Is the handler set open to other modules?                   |
| An invocation must be queued, logged, retried or undone | Command                 | Call the method                            | Does anything actually consume the reification?             |
| Prior state must be restorable                          | Memento                 | Immutability; command inverses             | Is the inverse exact and cheap? Then Command                |
| Dependents must be told something changed               | Observer                | A direct call, when there is one dependent | Is the subscriber set genuinely unknown?                    |
| Many-to-many collaboration has become a web             | Mediator                | Events; or fewer collaborators             | Do participants need results, or only notification?         |
| Several operations must run over one object structure   | Visitor                 | Sealed type + exhaustive `switch`          | Do you compile the element types? Then the `switch`         |
| A structure must be traversed without exposing it       | Iterator                | Return an unmodifiable collection          | Is the sequence computed, unbounded, or paged?              |
| A small language must be evaluated                      | Interpreter             | CEL, JSONLogic, configuration              | Must the AST be translated (to SQL, to a UI)?               |

## The rows that most often resolve to "no pattern"

Six problems that look like pattern problems and usually are not:

```text
"We might need another implementation later"
        → nothing. Add the interface with the second implementation.

"These three classes differ only in a rate/limit/URL"
        → configuration.

"We need to make this testable"
        → fix the untestability: a static, a clock read, I/O in a
          constructor. Not a new abstraction (java-test-design).

"This should be faster"
        → measure. Indirection is a cost (java-performance).

"Every service in this codebase has a Facade/Factory/Manager"
        → precedent, not justification. Re-derive or record the
          convention (architecture-decision-making).

"The framework does not do exactly what we want"
        → check again; framework mechanisms already implement six of
          these patterns (gof-patterns-in-modern-java).
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
Variation: behaviour by status, and the statuses transition. Candidates: State. Simpler
alternative: an enum plus scattered checks — rejected, because it is what exists and the illegal
combinations are reachable. Decision: sealed states with a single transition function
(`gof-state`). Note the second-order effect: per-state data (`trackingId`) moves onto the state
that owns it and stops being a nullable field.

**"Every outbound call needs retries, a timeout, metrics and a circuit breaker."**
Same interface in and out, several additions, order significant. Candidates: Decorator. Simpler
alternative: the HTTP client builder — which supplies timeouts, metrics and connection pooling,
so two of the four come off immediately. Decision: framework mechanisms for two, Decorator for
retry and breaking, with the order documented at the wiring site (`gof-decorator`,
`rpc-and-api-contracts`).

**"Users need to filter search results with arbitrary conditions."**
Candidates: Interpreter. Simpler alternatives: fixed filter fields in the request (rejected — the
conditions nest and disjoin), or CEL (a genuine contender). Decision: own AST, because the filter
must also be translated to SQL and CEL's tree would need translating anyway
(`gof-interpreter`).

**"Two services must both know when a policy is renewed."**
Candidates: Observer. But one subscriber is in another process, which takes it out of the pattern
entirely: the answer is an outbox plus messaging, with idempotent consumption
(`gof-observer`, `event-driven-architecture`). The in-process listener and the message consumer are
different designs sharing a name.
