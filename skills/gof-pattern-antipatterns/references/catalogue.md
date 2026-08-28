# Catalogue of pattern misuse

Each entry: why it happens, how to detect it, what it costs in production, and the fix.

## Speculative interface

**Why.** "We might need another implementation." The interface is written first because it feels
like good design, and the second implementation never arrives.

**Detect.** One implementor plus a mock. `grep` for implementors; a test double is not one.

**Cost.** Every reader follows an extra hop to find the behaviour. The interface also freezes a
shape derived from one implementation, so the eventual second one does not fit it and the
interface is rewritten anyway.

**Fix.** Inline it; reintroduce with the second implementation, when its shape is known rather than
guessed. **Exception:** an external dependency — the port bounds a foreign model and gives tests a
seam even at one implementation (`gof-adapter`).

## Class per constant

**Why.** A `switch` over three rates is refactored into "strategies" because branching feels like a
smell.

**Detect.** Sibling classes whose bodies differ only in literals.

**Cost.** Changing a rate requires a code change, a review and a deploy. The rates are also spread
across a package, so nobody can see them together.

**Fix.** Configuration, with the values in one place and a startup-validated type to hold them.

## Factory for a constructor

**Why.** A convention that construction "should go through a factory".

**Detect.** `createX()` whose body is `return new X(...)`, with one implementation and no
selection.

**Cost.** A file, a stack frame, and an indirection between a caller and a constructor the compiler
was already checking.

**Fix.** Call the constructor, or use a named static factory on the type if the name adds meaning
(`gof-factory-method`).

## Abstract Factory everywhere

**Why.** One legitimate family factory becomes the place to put every `createX` anyone needs.

**Detect.** Two products that never appear in the same call site. Or: try to state the family
invariant — "an X from family A must never be used with a Y from family B, because ___" — and fail.

**Cost.** A service locator with a factory's name: every caller couples to one type that knows
everything, and the family guarantee it was built for no longer applies to most of its methods.

**Fix.** Split by usage cluster, or delete and inject the products directly
(`gof-abstract-factory`).

## Builder for a trivial object

**Why.** Consistency with a codebase that builds everything.

**Detect.** A builder on a type with ≤4 required components of distinct types.

**Cost.** A compile-time arity and order check is replaced by a runtime "missing required field"
exception, and the type gains a second construction path that can diverge from the constructor's
invariants.

**Fix.** The record's canonical constructor, or named static factories (`gof-builder`).

## Singleton as global state

**Why.** "It should exist once" — where the requirement was access, not uniqueness.

**Detect.** `getInstance()`. A `reset()` method used only by tests. Tests that pass alone and fail
in a suite.

**Cost.** Dependencies invisible to constructors; initialisation order nobody chose; order-dependent
tests; and the process-local uniqueness silently failing to hold across replicas — a "singleton"
rate limiter configured at 100/s becomes 800/s at eight replicas.

**Fix.** One bean, injected. Migrate leaf-first (`gof-singleton`).

## Observer leak

**Why.** Registration is easy and deregistration has no obvious owner.

**Detect.** `register`/`addListener` with no matching removal on any path. Lambdas registered
without keeping a reference — those cannot be removed at all.

**Cost.** Slow heap growth correlated with sessions or documents; the subject's listener list is
the dominant retainer in a heap dump. Also: listeners firing after their owner is logically
disposed, acting on stale state.

**Fix.** A subscription object that is `AutoCloseable`, or explicit lifecycle pairing
(`gof-observer`).

## Mediator god object

**Why.** Each new coordination rule is one more method on the hub, and each addition is reasonable.

**Detect.** More than ~7 participants; methods that share no state; a test needing more than four
fakes; merge conflicts concentrated in one file.

**Cost.** Every feature edits one class; nobody can hold the protocol in mind; the hub becomes both
a bottleneck and a merge hazard.

**Fix.** Split by protocol, not by noun. Expect a third of it to turn out not to be coordination at
all (`gof-mediator`).

## Opaque decorator stack

**Why.** Layers are added one at a time, each justified, and the order is never written down.

**Detect.** Six or more layers; no comment at the wiring site; a stack trace dominated by
forwarding frames.

**Cost.** Nobody can predict the semantics. Whether the timeout bounds one attempt or the whole
operation, whether an open breaker prevents retries, whether a cache hit skips the metrics — all
undecidable by reading (`gof-decorator`).

**Fix.** Document the order and its rationale at the wiring site; add a test that asserts the
composed behaviour; collapse the fixed part of the stack into one class if it never varies.

## Proxy hiding a network

**Why.** An interface written for a local implementation is later implemented over HTTP, and the
"benefit" is that no caller changed.

**Detect.** A getter or a per-item method whose implementation makes a call. A loop over a
collection calling such a method.

**Cost.** N+1 remote calls from code that looks like field access; latency that does not appear in
any local reasoning; retries the caller never asked for; a timeout presented as an ordinary
exception.

**Fix.** Change the contract, not the implementation: bulk operations, a deadline parameter, a
named failure vocabulary (`gof-proxy`, `rpc-and-api-contracts`).

## Flyweight contention

**Why.** "Lots of small objects" is assumed to be a memory problem and pooling is assumed to be
free.

**Detect.** A shared pool on a hot path with no heap measurement behind it; `computeIfAbsent` with
an expensive mapping function; pooled objects that are short-lived.

**Cost.** Memory possibly saved, throughput definitely spent: bin-lock contention, cache misses,
and objects promoted out of the nursery that would have died there. Frequently a net loss
(`gof-flyweight`).

**Fix.** Measure first (heap dump, occurrences ÷ distinct values). Try string deduplication before
writing code. Canonicalise at the boundary in a thread-confined map rather than a global pool.

## Visitor over a growing type set

**Why.** Visitor was correct when the type set was stable, and the domain changed.

**Detect.** Every release adds an element type and breaks every visitor.

**Cost.** The expression problem, chosen in the wrong direction: each new type is a change to N
operations, and the ones with a `default` branch are silently unhandled.

**Fix.** Move behaviour back onto the elements for the operations that are intrinsic; keep the
fold only for the operations that genuinely belong outside (`gof-visitor`).

## Template Method with nine hooks

**Why.** Each new variant needs one more variation point, and adding a `protected` method is easy.

**Detect.** More than ~4 hooks; a subclass overriding a hook to do nothing; a hook requiring
`super.hook()` at a specific point; a subclass overriding the template method itself.

**Cost.** A base class nobody can subclass correctly without reading its source, and a base-class
change that is an unreviewed change to every subclass.

**Fix.** Make the template `final` first — that alone reveals which subclasses have taken over the
algorithm — then convert to composed steps (`gof-template-method`).

## Strategy class for a lambda

**Why.** The pattern is remembered as "an interface and implementations".

**Detect.** Implementations with one method, no state, no key, no metadata, each a single
expression.

**Cost.** Five files for five expressions, and a selector to maintain.

**Fix.** A domain-named functional interface and lambdas — with a class kept for any variant that
needs a name in a stack trace or a profile (`gof-strategy`).

## Prototype with `clone()`

**Why.** `Cloneable` looks like the language's answer to copying.

**Detect.** `implements Cloneable`; `super.clone()`; a "copy" sharing a `List` with its original.

**Cost.** Shallow copies aliasing mutable state — the copy and the original mutate each other,
under concurrency with `ConcurrentModificationException` and lost elements. Invariants in
constructors are also bypassed, since `clone()` runs none.

**Fix.** A copy constructor or a copy factory that names every field, so adding one breaks
compilation (`gof-prototype`).

## Pattern by precedent

**Why.** "Every service in this codebase has a Facade, a Factory and a Manager."

**Detect.** Ask why a specific abstraction exists and receive an answer about consistency.

**Cost.** Every entry above, propagated at the rate the codebase grows, with each instance
defended by the existence of the others.

**Fix.** Two options, and either is fine: re-derive the abstraction for this module and keep it if
it holds, or record the convention explicitly as a decision with its rationale so it can be
re-opened on evidence rather than defended by inertia
(`architecture-decision-making`).

## Pattern matching by name

**Why.** The problem contains a word that appears in a pattern's name — "we need to adapt the
payload", "there is a chain of checks", "the state changes".

**Detect.** A design discussion in which a pattern name appears before the forces are stated.

**Cost.** The chosen pattern solves a neighbouring problem convincingly enough that the real one is
never examined. This is the root cause of roughly half the entries above.

**Fix.** Restate the problem with no pattern name in it and re-decide from the restatement
(`gof-pattern-thinking`).
