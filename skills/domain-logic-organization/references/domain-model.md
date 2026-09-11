# Domain Model

## What the pattern actually claims

Objects that carry both data and the rules over that data, arranged so each invariant has
one logical owner. Database constraints can additionally enforce the same invariant across
writers; this is not a ban on defensive enforcement. The claim is not that objects are
better than procedures;
it is that when rules interact, having one owner per rule stops the combinatorial
duplication that scripts suffer.

The test for whether it owns a rule: **pick an invariant, trace every supported transition,
and identify its enforcement point.** ORM hydration, bulk SQL and competing writers also
need their own protections; object methods alone do not make stored violations impossible.

## Rich versus anaemic, concretely

```java
// Anaemic: the object holds data; the rule lives elsewhere and can be skipped.
@Entity
public class Order {
    @Id private Long id;
    private OrderStatus status;
    @OneToMany(mappedBy = "order") private List<OrderLine> lines = new ArrayList<>();
    // getters and setters for everything
}

@Service
class OrderService {
    void addLine(Long orderId, ProductId product, int quantity) {
        Order order = orders.findById(orderId).orElseThrow();
        if (order.getStatus() != OrderStatus.DRAFT) {      // rule, enforced here only
            throw new OrderNotEditable(orderId);
        }
        order.getLines().add(new OrderLine(product, quantity));
    }
}
```

The rule is enforced in `OrderService.addLine` and nowhere else. `CancelOrderService`,
the import job, and the admin screen each get their own copy — or forget it.

```java
// Rich: the invariant is enforced by the object that owns the state.
@Entity
public class Order {

    @Id private Long id;
    @Enumerated(STRING) private OrderStatus status = OrderStatus.DRAFT;
    private Instant cancelledAt;

    @OneToMany(mappedBy = "order", cascade = ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();

    @Version private long version;

    protected Order() { }   // ORM only

    public void addLine(ProductId product, int quantity, Money unitPrice) {
        requireDraft();
        if (quantity <= 0) throw new InvalidQuantity(quantity);
        lines.stream()
            .filter(line -> line.isFor(product))
            .findFirst()
            .ifPresentOrElse(
                line -> line.increaseBy(quantity),
                () -> lines.add(new OrderLine(this, product, quantity, unitPrice)));
    }

    public void cancel(Clock clock) {
        if (status == OrderStatus.SHIPPED) throw new OrderAlreadyShipped(id);
        if (status == OrderStatus.CANCELLED) return; // preserve the first cancellation time
        Instant cancellationTime = Instant.now(clock); // fail before changing state
        status = OrderStatus.CANCELLED;
        cancelledAt = cancellationTime;
    }

    public Money total() {
        return lines.stream().map(OrderLine::lineTotal).reduce(Money.ZERO, Money::plus);
    }

    public int lineCount() { return lines.size(); } // no mutable child escapes

    private void requireDraft() {
        if (status != OrderStatus.DRAFT) throw new OrderNotEditable(id);
    }
}
```

What changed that matters: there is no setter for `status`, no mutable view of `lines`, and
`requireDraft()` is unavoidable on every editing path. The service now orchestrates; it
does not decide (`service-layer-design`).

`List.copyOf(lines)` alone would protect only collection structure, not mutable child entities.
Expose immutable value projections when callers need line details and keep child mutators inside
the aggregate's trusted implementation. This partial sketch assumes OrderLine validates overflow,
Money is immutable, and an existing product retains its original unit price; define those policies
in a real model. Portable JPA persistent fields are non-final. A root `@Version` alone does not
guarantee every inverse-child update increments that version; test competing edits and select
an explicit aggregate concurrency policy with `offline-concurrency-control`.

Note also what did _not_ change: this is still a JPA entity. A domain model does not
require persistence ignorance — that is a separate decision with its own price
(see `data-source-patterns` for the trade).

## Classifying a concept: entity, value, or neither

Before deciding where a rule lives, decide what kind of thing holds it. These practical
questions apply Evans' identity/value distinction (_DDD Reference_, 2015, pp. 11–12):

| Ask                              | Entity                                                                                             | Value object                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The question the concept answers | "Which one?"                                                                                       | "How much / what kind?"                                                                         |
| Defined by                       | A thread of identity running through time, across changing attributes and distinct representations | Its attributes alone — "many objects have no conceptual identity"                               |
| Equality                         | Identity, and the model "must define what it means to be the same thing"                           | All attributes equal                                                                            |
| Change                           | Identity persists across state changes; representation may be mutable or replaced                  | Treat as immutable; replace the value when attributes change                                    |
| Cost of getting it wrong         | Mistaken identity, which Evans names as leading to data corruption                                 | Identity attached where none exists: performance cost, and every object starts to look the same |

The default is the value: identity requires a continuity and equality policy, so the burden
of proof sits on the entity. It does not require a repository for every entity; aggregate
children may be reached through their root. Two operational tests help — _continuity_: if
attributes change, is it still the same business thing, even when its in-memory representation
is replaced? — and _conceptual
whole_: are these attributes meaningless apart (an amount without its currency, a street
without its postcode)? If so they are one value, not several fields.

The third answer is **neither**. A parameter with no rule and no confusion risk needs no
type at all; a significant transformation that is nobody's natural responsibility is a
domain service, not an object looking for a home (Evans, p. 14).

This classification decides only _what kind of type_ a concept gets. Once decided, the
mechanics belong elsewhere: record shape, shallow immutability and defensive copies are
`java-immutability`; the `equals`/`hashCode` contract and entity identity under an ORM are
`java-object-contracts`; closed variant sets are `java-composition-over-inheritance`;
whether a given primitive is worth wrapping at all is `java-code-smells` (Primitive
Obsession).

### Concept to construct

| The concept is…                                              | Construct                              | Equality                    | Note                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A closed set of named constants, fixed at your release cycle | `enum`                                 | identity                    | Behaviour per constant, never `ordinal()` (`java-enums`)                                                                                                                                                             |
| A value, immutable, every component part of what it is       | `record`                               | value, over every component | The default for values since JDK 16                                                                                                                                                                                  |
| A value with a closed set of variants                        | `sealed interface` + `record` variants | value                       | Exhaustive `switch`, no `default`                                                                                                                                                                                    |
| An entity: identity, lifecycle, mutable state                | class with an explicit identity policy | identity                    | Application-assigned stable ids simplify equality; generated ids need lifecycle/hash-collection care (`java-object-contracts`). A record cannot be a portable JPA `@Entity`.                                         |
| An immutable snapshot of an entity                           | `record`                               | by default, all components  | Snapshots of one identity with different state are unequal by default. Custom identity equality is possible but needs an explicit `equals`/`hashCode` contract; event sourcing does not make entity state immutable. |
| Neither                                                      | the primitive                          | —                           | `java-code-smells`, Primitive Obsession, carries the budget for when a wrapper earns its place                                                                                                                       |

Records (final in JDK 16), sealed interfaces (17) and pattern matching for `switch` with
record patterns (both 21) let the compiler check a closed variant set. Use that capability
when the domain is closed; an external status code with evolving values may need a boundary
translation and unknown-value policy instead. On a Java 21 baseline write
`case Pending p ->`, not `case Pending _ ->` —
unnamed patterns are JDK 22 (JEP 456) and `--release 21` rejects them.

Review prompts for this classification:

- Would anyone ever ask "which one?" about this, or only "how much"?
- What is this type's identity, and can it change during the object's life?
- Does this attribute mean anything without the one next to it?
- Is this set of variants closed against everyone, or only against us?

## Invariants and their enforcement point

For each invariant, decide which of these it is:

| Kind                                     | Enforcement point                                                             | Consequence                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| True of one object at all times          | The object's constructor and mutators                                         | Cheap; always available                                                                                               |
| True across an object and its parts      | The aggregate root; parts are not modified from outside                       | Defines the aggregate boundary and the transaction's shape                                                            |
| True across two aggregates               | A coordinated transaction/constraint where supported, or an explicit protocol | Assess contention and consistency needs; merging or eventual consistency are alternatives, not the only possibilities |
| True across the whole table (uniqueness) | The database                                                                  | A unique constraint; the model cannot check it without a race                                                         |

The fourth row is the one most often got wrong. `if (!repository.existsByEmail(email))`
followed by a save is a check-then-act race under any isolation level that permits it; the
constraint is the enforcement and the check is only for the error message
(`offline-concurrency-control`).

## Sizing: what the model costs to load

A transition needs enough authoritative state to enforce its invariant. Loading an aggregate
is one strategy; maintained summaries, database constraints or conditional writes may avoid
loading every related row, provided all writers preserve the same contract. Assess the actual
fetch path rather than attributing a full graph load to every domain-model write.

- An aggregate spanning 4 tables and 30 rows may be acceptable; measure fetch plans, row width,
  lock duration and latency against its workload budget rather than assigning a universal cost.
- An aggregate that spans a customer's entire order history: unbounded, and it degrades
  with tenure, so it passes every test and fails for your best customer.

Aim for a bounded load within the operation's budget. When an invariant appears to require
an unbounded collection, consider a maintained summary (a running total, count or timestamp)
only if it captures the required decision. Define initialization, concurrent updates and repair;
an approximate or stale summary cannot enforce a strict invariant merely because it is cheap.

## The four failure modes

1. **Anaemic model** — described above. Setters and service conditionals are investigation
   leads. Trace a bypassable or duplicated domain rule before diagnosing a defect; deliberate
   scripts, shared policies and ORM accessors can be valid.
2. **Aggregate too large** — everything reachable is in one aggregate because the object
   graph made it convenient. Symptoms: lock contention, `OptimisticLockException` between
   users editing unrelated parts, and slow loads. The fix is splitting on invariants, not
   on foreign keys.
3. **Logic that leaked back out** — the model exists but each release adds rules to
   services because that is where the transaction and the other repositories are. Detect
   by diffing: rules arriving in services over six months is the trend that matters.
4. **Reads forced through the write model** — a list screen loading 50 aggregates to
   display 4 columns each. Compare projections (`query-objects-and-specifications`) when
   traces show unnecessary loads. Bounded entity reads that need the model's behavior may
   already be adequate; diagnose N+1 from actual fetches (`architecture-and-performance`).

## When the domain model is the wrong choice

- The rules do not interact — scripts are clearer and cheaper.
- The work is inherently set-shaped and measured hydration/round-trip cost dominates; compare
  equivalent set-based behavior rather than claiming a fixed speed ratio.
- The data's shape is owned elsewhere and the "model" would be a renaming of a foreign
  schema. Either build a real translation (`legacy-enterprise-modernization`) or admit it
  is a gateway.
- The team will maintain it without understanding it. This is a legitimate driver and
  belongs in the record explicitly, not as an unspoken reason
  (`architecture-decision-making`).

## Sources

- [Evans: DDD Reference](https://www.domainlanguage.com/ddd/reference/) — entity identity, value semantics and aggregate/repository boundaries.
- [Jakarta Persistence 3.2 specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2): entity requirements, relationship ownership, optimistic locking and bulk operations.
- [Java 17 Record API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Record.html): default component equality and explicitly declared methods.
- [Fowler: Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html): data and behavior in the domain model.
