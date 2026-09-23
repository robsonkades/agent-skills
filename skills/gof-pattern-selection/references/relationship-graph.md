# Relationship graph

Four kinds of edge: **implies** (a contract to examine), **replaces** (a candidate implementation or
alternative, not a mandated migration), **combines** (possible composition), **confused with** (see
`gof-pattern-confusion`).

Language mechanisms can express the same pattern rather than replace its intent. No edge mandates
adding another pattern. Type-pattern switch requires the Java compatibility conditions in SKILL.md.

## Creational

```text
Factory Method ──implies──► a creator with an inherited algorithm
               ──combines─► Abstract Factory  (family creation can use subtype hooks)
               ──replaced by─► Supplier / Map<Key,Supplier> / DI
               ──confused with─► static factory method (Effective Java Item 1)

Abstract Factory ──implies──► a family invariant, or it is not this pattern
                 ──combines─► Builder      (a family member returns a builder)
                 ──combines─► Prototype    (a family may clone exemplars)
                 ──replaced by─► existing DI configuration when it preserves the family invariant

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
Adapter ──combines─► Bridge     (when a backend needs contract translation)
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
          ──replaced by─► framework hooks when coverage, ordering and lifecycle fit
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
Strategy ──expressed by─► a compatible function value, with an explicit capture contract
         ──combines───► Template Method (an inherited skeleton may invoke injected policies)
         ──confused with─► State (lifecycle vs policy) and Command (request vs behavior)

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

Mediator ──implies──► explicit protocol ownership and a cohesion check
         ──combines─► Observer (notification), State (protocol state),
                      Command (participants' requests)
         ──scales to─► an orchestrator; the alternative is choreography
         ──confused with─► Facade (direction), command dispatcher

Memento ──combines─► Command (undo pairs)
        ──confused with─► snapshot (state capture) and event sourcing (authoritative history)
        ──implemented with─► shared immutable captures; keep required opacity/restore ownership

Iterator ──combines─► Composite (traversing a tree)
         ──alternative─► Spliterator + Stream when pipeline/lifetime semantics fit
         ──scales to─► pagination, which is remote iteration

Visitor ──implies──► an element/operation extension contract; verify required coverage and fallbacks
        ──combines─► Composite (the structure), Iterator (the walk)
        ──replaced by─► sealed interface + exhaustive switch
        ──confused with─► Iterator (traversal vs operation)

Interpreter ──implies──► expression/evaluation semantics and resource bounds;
                         a parser only when text input requires one
            ──combines─► Composite (the AST), Visitor (the folds),
                         Flyweight (shared terminal nodes)
            ──replaced by─► CEL, a rules engine, configuration
```

A lambda can express a single-operation Strategy while capturing configuration or dependencies;
state alone does not require a named class. Inspect ownership, lifetime and concurrency of captured
objects. [JLS 17 capture rules](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.27.2)
require captured local variables to be final or effectively final, but a
[final reference does not make its object immutable](https://docs.oracle.com/javase/specs/jls/se17/html/jls-4.html#jls-4.12.4).
Prefer a named implementation when it clarifies related operations, invariants or lifecycle
responsibilities; either mechanism can retain the Strategy role (`gof-strategy`).

## Compositions worth naming

Type growth need not break every visitor. For example, [Java 17 ElementVisitor](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/lang/model/element/ElementVisitor.html)
uses default methods for newer kinds that call `visitUnknown`. Source compatibility does not
establish semantic support; check the required specialized or fallback behavior.

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
effect delivery, safe repeat handling and any required compensation
(`distributed-transactions-and-sagas`).

**Abstract Factory + Builder + Prototype.** A family whose members are elaborate: the factory picks
the family, a builder assembles a member, and a prototype supplies a configured starting point.
Rarely all three; recognising which one you need is the point.

**Decorator over Proxy.** A possible stack of behaviour over a controlled subject: retry and
metrics may decorate a remote client when existing mechanisms do not already meet the need. Keeping
the two roles distinct is what makes the ordering discussion possible
(`gof-decorator`, `gof-proxy`).

**Strategy inside Template Method.** An inherited skeleton may also call injected policies. A
final class calling composed steps is another way to retain a fixed sequence, but no longer uses
the subclass-hook mechanism. Compare only when a change serves the actual extension/lifecycle
contract; retain supported public hooks and callers rather than prescribing their replacement
(`gof-template-method`).

## Conflicts, with the failure each produces

Check whether the stated failure is present or possible under the actual implementation; these
pairs do not establish a defect on their own.

| Pair                                         | Failure                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Singleton + a design meant to be testable    | The seam exists but the static bypasses it                                  |
| Observer + unstated required ordering        | Correctness depends on an ordering guarantee not yet established            |
| Decorator + identity or `instanceof` checks  | The wrapper is a different object of a different class                      |
| Flyweight + unsafe shared intrinsic mutation | One caller can corrupt another's view                                       |
| Visitor + a growing element set              | Required specialized coverage may be missing; test declared fallbacks       |
| Mediator + competing transition owners       | Two sources of truth for the same protocol                                  |
| Remote proxy + per-item requests             | Avoidable round trips may dominate; inspect actual call/load evidence       |
| Template Method + open subclassing           | Base changes may violate external extension contracts                       |
| Prototype + new-entity intent                | Accidentally retaining an id/version rather than making a new identity      |
| Composite + lazily loaded children           | A walk may cause N+1 queries; inspect actual fetch, cache and batching      |
| Chain + shared mutable context               | A mid-chain failure leaves partial effects                                  |
| Abstract Factory + unrelated products        | Family invariant may be absent; inspect the actual lookup/construction role |

Diagnose the conflicting contract first. Remove unjustified structure, translate incompatible
boundaries, or define explicit composition according to the actual force. An adapter can resolve
an interface mismatch but cannot repair a race, duplicate authority or missing delivery semantics.
