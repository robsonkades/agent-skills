# Relationship graph

Four kinds of edge: **implies** (a contract to examine), **replaces** (a candidate implementation or
alternative, not a mandated migration), **combines** (possible composition), **confused with** (see
`gof-pattern-confusion`).

Language mechanisms can express the same pattern rather than replace its intent. No edge mandates
adding another pattern. Type-pattern switch requires the Java compatibility conditions in SKILL.md.

## Creational

```text
Factory Method ──implies──► a creator with an inherited algorithm
               ──combines─► Abstract Factory  (its methods are factory methods)
               ──replaced by─► Supplier / Map<Key,Supplier> / DI
               ──confused with─► static factory method (Effective Java Item 1)

Abstract Factory ──implies──► a family invariant, or it is not this pattern
                 ──combines─► Builder      (a family member returns a builder)
                 ──combines─► Prototype    (a family may clone exemplars)
                 ──replaced by─► one @Configuration per profile

Builder ──implies──► a construction/invariant contract; immutable output is optional
        ──combines─► Abstract Factory, Command (building a command)
        ──replaced by─► record + static factories, when arity is small

Prototype ──implies──► a copy contract stating what is shared
          ──combines─► Abstract Factory (a registry of exemplars)
          ──replaced by─► immutable sharing when no distinct copy is needed; copy factories
          ──confused with─► Flyweight (share) and Memento (restore)

Singleton ──implies──► global access, and every test consequence of it
          ──replaced by─► explicitly scoped injected instance; bean scope is container-relative
          ──confused with─► Spring singleton scope; cluster leadership
```

## Structural

```text
Adapter ──combines─► Bridge     (a bridge's backends are usually adapters)
        ──confused with─► Facade, Decorator, Proxy  (see the confusion skill)
        ──scales to──► anti-corruption layer, at the module level

Bridge ──implies──► independently evolving abstraction and implementation dimensions
       ──implies──► an implementor contract all supported backends can honestly satisfy
       ──confused with─► Strategy (one axis) and Abstract Factory

Composite ──implies──► recursion, depth limits, and a cycle policy
          ──combines─► Iterator (traversal), Visitor (operations),
                       Decorator (a decorated node is still a node)
          ──expressed by─► sealed interface + records, for closed sets

Decorator ──implies──► the same interface, and an order that carries meaning
          ──combines─► Proxy, Strategy (a decorator may hold one)
          ──replaced by─► framework interceptors, for transport concerns
          ──confused with─► Proxy (access) and Adapter (interface)

Facade ──implies──► a simplified boundary; access restriction needs separate enforcement
       ──combines─► Adapter (a facade over adapters is normal)
       ──confused with─► Mediator (direction), API gateway (a deployment)

Flyweight ──implies──► safe shared intrinsic state and bounded retention; a pool is optional
          ──confused with─► Singleton (one instance) and a cache (policy)
          ──alternatives/forms─► array deduplication, boundary canonicalisation, enums

Proxy ──implies──► control over access, and a lifecycle it may own
      ──combines─► Decorator (a stack over a proxied subject)
      ──confused with─► Decorator, Adapter, remote client
```

## Behavioural

```text
Strategy ──replaced by──► a lambda, when there is one stateless operation
         ──combines───► Template Method (steps injected rather than overridden)
         ──confused with─► State (who changes it) and Command (what it is)

State ──implies──► an explicit transition policy, including invalid events and duplicate handling
      ──combines─► Command (requested actions that drive transitions),
                   Memento (undoing a transition)
      ──scales to─► a saga / durable workflow
      ──confused with─► Strategy

Template Method ──implies──► a defined skeleton and extension contract; final is a design choice
                ──replaced by─► a final class taking composed steps
                ──survives in──► framework extension points, contract tests
                ──confused with─► Strategy (whole vs part)

Command ──combines─► Memento (undo), Chain (offering a request),
                     Composite (macro commands), Queue (deferral)
        ──confused with─► Event (tense, ownership, rejectability)
        ──replaced by─► a method call, when nothing consumes the reification

Chain of Responsibility ──implies──► an unhandled-request policy
                        ──combines─► Command (the request), Decorator (a
                                     pipeline stage that wraps the rest)
                        ──replaced by─► sealed switch; framework filters

Observer ──implies──► subscription lifetime, error and ordering contracts; none inferred from name
         ──combines─► Mediator (the hub as publisher)
         ──scales to─► reactive streams, then distributed pub/sub —
                       with different guarantees at each step

Mediator ──implies──► a bounded hub, or a god object
         ──combines─► Observer (notification), State (protocol state),
                      Command (participants' requests)
         ──scales to─► an orchestrator; the alternative is choreography
         ──confused with─► Facade (direction), command dispatcher

Memento ──combines─► Command (undo pairs)
        ──confused with─► snapshot (durable) and event sourcing (history)
        ──replaced by─► immutability with structural sharing

Iterator ──combines─► Composite (traversing a tree)
         ──alternative─► Spliterator + Stream when pipeline/lifetime semantics fit
         ──scales to─► pagination, which is remote iteration

Visitor ──implies──► a stable element set; new types break every visitor
        ──combines─► Composite (the structure), Iterator (the walk)
        ──replaced by─► sealed interface + exhaustive switch
        ──confused with─► Iterator (traversal vs operation)

Interpreter ──implies──► a parser (separate) and resource bounds
            ──combines─► Composite (the AST), Visitor (the folds),
                         Flyweight (shared terminal nodes)
            ──replaced by─► CEL, a rules engine, configuration
```

## Compositions worth naming

**Composite + Visitor + Iterator.** The canonical trio for tree-shaped domains: Composite is the
structure, Iterator is the walk, Visitor is the operation. In modern Java the last becomes a fold
over a sealed type when the target Java and ownership permit it. The three concerns remain distinct;
do not replace stable extension contracts just because a new syntax exists.

**Command + Memento.** Local undo can use an exact inverse or restore owned state from a snapshot.
Neither automatically reverses external effects or concurrent edits; define ownership/version checks.
Compare snapshot size and sharing rather than assuming a fixed memory cost
(`gof-command`, `gof-memento`).

**State + Command + Memento.** These can model transitions, requested actions and snapshots, but
do not create durability or a saga by composition alone. Commands request actions; events report
facts. A restart-surviving distributed workflow additionally needs persisted progress, reliable
effect delivery, deduplication and any required compensation
(`distributed-transactions-and-sagas`).

**Abstract Factory + Builder + Prototype.** A family whose members are elaborate: the factory picks
the family, a builder assembles a member, and a prototype supplies a configured starting point.
Rarely all three; recognising which one you need is the point.

**Decorator over Proxy.** A stack of behaviour over a controlled subject — the standard shape of an
outbound client: retry and metrics decorate a proxy that stands in for a remote service. Keeping
the two roles distinct is what makes the ordering discussion possible
(`gof-decorator`, `gof-proxy`).

**Strategy inside Template Method.** The modern form of both: a final class whose fixed sequence
calls injected steps. It is Template Method's intent achieved with Strategy's mechanism, and it is
the recommended replacement for a hook hierarchy (`gof-template-method`).

## Conflicts, with the failure each produces

| Pair                                        | Failure                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Singleton + a design meant to be testable   | The seam exists but the static bypasses it                             |
| Observer + unstated required ordering       | Correctness depends on an ordering guarantee not yet established       |
| Decorator + identity or `instanceof` checks | The wrapper is a different object of a different class                 |
| Flyweight + mutable shared state            | One caller's mutation is another's data                                |
| Visitor + a growing element set             | Every new type breaks every operation                                  |
| Mediator + competing transition owners      | Two sources of truth for the same protocol                             |
| Proxy + a fine-grained interface            | Hidden per-call remote cost; N+1 over the network                      |
| Template Method + open subclassing          | Base changes may violate external extension contracts                  |
| Prototype + new-entity intent               | Accidentally retaining an id/version rather than making a new identity |
| Composite + lazily loaded children          | A walk becomes N queries                                               |
| Chain + shared mutable context              | A mid-chain failure leaves partial effects                             |
| Abstract Factory + unrelated products       | A service locator with a factory's name                                |

Diagnose the conflicting contract first. Remove unjustified structure, translate incompatible
boundaries, or define explicit composition according to the actual force. An adapter can resolve
an interface mismatch but cannot repair a race, duplicate authority or missing delivery semantics.
