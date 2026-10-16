# Selection matrix

Design problem → candidates → the simpler alternative → what decides. Read the fourth column
before the second. The columns suggest candidates, not measured win rates or automatic decisions.

## Creation

| Design problem                                             | Candidates                                          | Simpler alternative                                    | What decides                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Construction has ambiguous or optional inputs              | Fluent value builder                                | Constructor/named factory; record if its contract fits | Consumer naming, defaults, invariants and ownership; count alone does not decide            |
| Same process must construct different representations      | Builder (GoF)                                       | Separate assembly functions/factories                  | Shared step protocol, representation variation and completion/ownership contract            |
| Several related objects must stay mutually consistent      | Abstract Factory                                    | Existing DI family configuration                       | Family invariant, selection timing and construction ownership; DI and factories can coexist |
| Subclasses must select the product through a creation hook | Factory Method                                      | Injected `Supplier` / `Map<Key, Supplier>`             | Supported creator/product types, arguments, failures and lifecycle                          |
| A new object must be built from an existing one's state    | Prototype                                           | Copy constructor; immutable sharing                    | Required distinct identity, subtype and aliasing semantics                                  |
| Exactly one instance is needed                             | Singleton                                           | One bean, injected                                     | "One per what?" — class loader, process, or cluster                                         |
| Which concrete type depends on runtime data                | Factory/registry; Factory Method for subclass hooks | Map of suppliers or compatible switch                  | Registration ownership, extension and creation lifecycle                                    |

## Structure and boundaries

| Design problem                                                   | Candidates | Simpler alternative                        | What decides                                                                             |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| An existing type has the wrong interface                         | Adapter    | Change one side, if compatible             | Ownership plus external compatibility and migration cost                                 |
| A subsystem of collaborators is used in one standard sequence    | Facade     | Direct composition                         | Useful boundary/policy or repeated orchestration, not caller count                       |
| Cross-cutting behaviour must be added, stackably, at runtime     | Decorator  | The framework's filter/interceptor         | Actual interception coverage, ordering and lifecycle fit the required contract           |
| Access to an object must be controlled or deferred               | Proxy      | An explicit lazy accessor or `Supplier`    | Required consumer transparency, access and lifecycle contracts; preserve adequate APIs   |
| Two things vary independently and the class count is multiplying | Bridge     | Composition (a field)                      | Independent evolution/ownership and implementor contract; current class counts are clues |
| A part and a whole must be treated identically, recursively      | Composite  | A collection field                         | Uniform recursive operations; finite depth is valid and should be bounded                |
| Many long-lived duplicate objects dominate the heap              | Flyweight  | String deduplication; a smaller field type | occurrences ÷ distinct values; measure first                                             |

Framework hooks can host domain-specific behaviour; the concern's label does not decide whether
custom decorators are needed. Inspect the existing mechanism and exercise representative call paths.
For example, [Spring 6.2 proxy-based AOP](https://docs.spring.io/spring-framework/reference/6.2/core/aop/proxying.html)
can advise service methods, but self-invocation bypasses the proxy's advice. Retain a hook that
meets the coverage, ordering and lifecycle contract; choose explicit composition when those
requirements cannot be met clearly (`gof-decorator`).

## Behaviour and interaction

| Design problem                                          | Candidates              | Simpler alternative                         | What decides                                                                                |
| ------------------------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| One operation has interchangeable algorithms            | Strategy                | A lambda; configuration                     | Do the variants differ in behaviour or only in constants?                                   |
| Behaviour changes with the object's own status          | State                   | Enum/status plus transition function        | State-dependent legality/behavior; transitions may be externally driven                     |
| An algorithm's skeleton is fixed; steps vary            | Template Method         | A class taking composed steps               | Existing hook/SPI and lifecycle contracts; who owns the extension set                       |
| A request must be offered to several possible handlers  | Chain of Responsibility | Ordered loop; compatible switch             | First-match vs required stages, precedence, fallthrough/failure and extension ownership     |
| An invocation must be queued, logged, retried or undone | Command                 | Call the method                             | Does anything actually consume the reification?                                             |
| Prior state must be restorable                          | Memento                 | Immutable capture; exact inverse            | Restoration ownership, intervening changes and effects; cheap inverse alone is insufficient |
| Dependents must be told something changed               | Observer                | Direct calls                                | Subscription ownership, lifecycle and decoupling; known listeners can qualify               |
| Many-to-many collaboration has become a web             | Mediator                | Events; or fewer collaborators              | Who owns coordination decisions, results, ordering and participant lifetimes?               |
| Several operations must run over one object structure   | Visitor                 | Compatible exhaustive dispatch              | Type ownership, operation growth, target Java and extension contracts                       |
| A structure must be traversed without exposing it       | Iterator                | Return an unmodifiable collection           | Is the sequence computed, unbounded, or paged?                                              |
| A small language must be evaluated                      | Interpreter             | Existing bounded evaluator or configuration | Grammar/semantics, translation needs, security and maintenance cost                         |

An open handler set is one reason for a chain, not its defining condition. Fixed overlapping
rules can still need ordered fallback; a switch requires a discriminator or guards that preserve
that precedence. If all checks must succeed before an effect, use an explicit validation pipeline
and failure policy; first-success handling would skip required checks. Pass an overlapping-request
example, required ordering and fallthrough/failure behavior to `gof-chain-of-responsibility` for
the detailed contract. The [original GoF chain](https://www.informit.com/articles/article.aspx?p=1398601)
offers candidate receivers and can leave a request unhandled; the name alone guarantees neither
all-stage execution nor atomic effects.

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

**"Our plugin creator only exposes `newDecoder(config)`; clients call it directly."**
Subclasses choosing the concrete decoder through that overridable method can be Factory Method
without an inherited workflow. Preserve supported subclasses, arguments, checked failures and
product lifecycle. A `Supplier` is a simpler candidate only if it preserves the actual contract;
do not remove a published hook merely because the creator has no other algorithm.

**"The value has only three fields, so its builder must be redundant."**
If all three are required, available together and clearly typed, retain the constructor or a
named factory. With the same count, repeated weak types, conditional defaults or incremental input
may justify stronger types, named factories or a fluent builder. Compare an ordinary call and a
likely swapped/missing-input call; validation must survive every public construction path.

**"One document construction process must produce both a tree and a compact summary."**
A GoF Builder can keep the step sequence while varying the representation being assembled;
this is different from fluent setters for one value. Compare separate assembly functions and
existing parser/output hooks before adding the protocol. If there is only one straightforward
representation, direct construction may suffice. Pass step order, partial-failure cleanup and
valid-completion requirements to `gof-builder`; no director class is required merely for the name.

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

The [GoF authors' introduction, catalog intents](https://www.grch.com.ar/docs/unlu.poo/Gamma-DesignPatternsIntro.pdf)
distinguishes Builder's construction/representation separation from Factory Method's subclass-based
product creation. Those intents motivate the separate creation rows; fluent value builders need
the additional caller-ergonomics test above.
