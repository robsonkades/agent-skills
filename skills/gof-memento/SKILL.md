---
name: gof-memento
description: >
  Memento in modern Java: capturing an object's state so it can be restored later, without
  exposing that state to whoever holds the capture. Covers the encapsulation techniques Java offers, why an
  immutable object is its own memento, the memory cost of an undo stack and the alternatives
  (inverses, diffs, structural sharing), the torn capture when the source mutates mid-copy, and
  the distinction from a durable snapshot and from event sourcing. Use when undo, drafts, what-if branches or checkpoints are being designed, when
  a getState/setState pair is proposed on a domain object, when an undo stack grows without bound,
  or when someone calls a persisted snapshot a memento. Does not cover the operations being undone
  (gof-command), copying an object for reuse (gof-prototype), event-sourced aggregates and
  projections (event-sourcing), or distributed checkpoint barriers
  (distributed-aggregation-and-barriers).
---

# Memento

## Purpose

Let something outside an object hold that object's past state without being able to read or
corrupt it. The caretaker keeps the capture and hands it back; only the originator understands
what is inside.

That opacity is the pattern, and it is what a `getState()`/`setState()` pair is not: exposing the
state as a public structure lets any holder inspect it, mutate it, and depend on its shape, which
is the coupling the pattern exists to prevent.

## Memento, snapshot, event sourcing

```text
Memento          in-process, opaque, transient. Restores an object to a
                 prior state. No schema, no versioning, no durability.
                 Answers: what was it?

Snapshot         durable, serialised, a contract. Written to storage,
                 read back by a future version of the code, so it needs a
                 schema and a versioning policy.
                 Answers: what was it, later and elsewhere?

Event sourcing   state is derived by replaying an append-only log of
                 facts. Snapshots become an optimisation over replay.
                 Answers: what was it, AND why did it become that?
```

Choose by the question you must answer. If "why" never matters, event sourcing's cost — schema
evolution across every historical event, replay, projection rebuilds — buys nothing. If "why"
matters for audit, correction or analytics, no amount of snapshotting recovers it after the fact
(`event-sourcing`).

The naming failure worth catching in review: calling a persisted, versioned, cross-process state
document a "memento". It is a snapshot, and the difference is precisely that it has a schema
somebody else depends on.

## When it is the answer

```text
Undo or revert of in-memory work, where the operation's inverse is
hard to compute or lossy
        → Memento. Cheaper to remember the old value than to invert.

A what-if branch: the user explores a change and may discard it
        → Memento of the pre-state, or a copy of the working object.

A long computation must be resumable after a failure
        → a checkpoint, which is a durable snapshot, not a memento —
          it needs a format and a version.
```

## When it is not

- **The object is immutable.** It is already its own memento: keep the reference. This removes
  most proposed uses (`java-immutability`).
- **The operation has a cheap exact inverse.** `Move(+5)` undoes with `Move(-5)`; storing the
  whole diagram is waste (`gof-command`).
- **The capture must survive the process.** That is a snapshot: give it a schema, a version, and a
  tolerant reader.
- **Every change must be recoverable, with reasons.** That is event sourcing.
- **The "memento" is passed to another module that reads it.** Then it is a DTO with a contract,
  and the encapsulation the pattern promised is gone.

## Modern Java expression

```text
Classical                          Modern
─────────────────────────────────  ────────────────────────────────────
class Memento with package-        a private nested record inside the
private accessors                  originator — opaque by construction

originator.setMemento(m)           originator.restore(m), where the
                                   parameter type is a public marker
                                   interface the caretaker cannot read

deep-copied mutable state          immutable components; capture is then
                                   a field copy with no defensive copying

full state per undo step           the object is immutable and the "undo
                                   stack" is a stack of references, with
                                   structural sharing between versions
```

```java
public final class Editor {

    public sealed interface Snapshot permits State { }        // opaque to callers
    private record State(String text, int caret, List<Mark> marks) implements Snapshot { }

    public Snapshot capture() { return new State(text, caret, List.copyOf(marks)); }

    public void restore(Snapshot snapshot) {
        var state = (State) snapshot;                          // only Editor can see inside
        this.text = state.text();
        this.caret = state.caret();
        this.marks = new ArrayList<>(state.marks());
    }
}
```

A `sealed` public interface with a private record implementation gives exactly the classical
guarantee: the caretaker can hold and return it and can do nothing else with it.

## Decision rules

```text
IF the originator is immutable
THEN there is no memento to design. Keep the old reference.

IF the caretaker reads fields of the capture
THEN encapsulation is broken and the capture is now a contract. Either
     narrow the type, or accept it is a DTO and version it.

IF the capture shares mutable structure with the originator
THEN restoring later restores whatever it has become, not what it was.
     Copy the mutable parts at capture time.

IF the source can be mutated while it is being captured
THEN the capture may hold fields from two different states. Capture
     under the same lock as the mutators, or from an immutable value.

IF an undo stack holds full captures of a large object
THEN memory is depth × size. Prefer command inverses, diffs, or
     persistent structures with structural sharing.

IF the capture is written to storage or sent to another process
THEN it is a snapshot: it needs a stable format, a version field, and
     a defined behaviour when read by an older or newer version.

IF restoring must also restore things outside the object — files sent,
messages published, money moved
THEN restore is not enough; that is compensation
     (distributed-transactions-and-sagas).

IF what changed matters as much as what it was
THEN consider event sourcing before building a snapshot history that
     will never answer "why".
```

## Cross-cutting checks

- **Concurrency.** Capturing is a multi-field read and is not atomic: a concurrent mutation
  produces a capture the object never had. The same applies to `restore`, which must not be
  observable half-applied. Either both run under the lock that guards the state, or the state is
  an immutable value swapped through a single `volatile` reference — in which case capture is
  reading one reference and restore is writing one, and both are atomic for free
  (`java-memory-model`).
- **Distribution.** A memento does not cross a process boundary; the moment it does it is a
  serialised snapshot with a schema. Replaying a snapshot written by a different version needs a
  version field and a tolerant reader, and a snapshot that omitted a field added later must have a
  documented default. Distributed checkpointing — consistent captures across several processes —
  is a different problem requiring barriers or a consistent-cut algorithm
  (`distributed-aggregation-and-barriers`).
- **Performance.** The cost is memory: depth × size, retained for as long as undo is offered.
  Options in order of preference — make the object immutable and share structure between versions;
  store inverses instead of states; store diffs; bound the depth. Also watch retention: an undo
  stack holding large graphs keeps them alive and is a common source of "the heap grows during a
  long editing session" (`heap-dump-analysis`).
- **Testing.** The property to assert is a round trip: `restore(capture(s))` leaves the object
  equal to `s`, over generated states. That single property catches the recurring defect — a field
  added to the object but not to the capture — which no example-based test finds reliably.

## Review checklist

- [ ] The originator is genuinely mutable; otherwise the capture is a reference
- [ ] The capture type is opaque to the caretaker
- [ ] Every mutable component is copied at capture time
- [ ] Capture and restore are atomic with respect to concurrent mutation
- [ ] Adding a field to the originator breaks the capture at compile time, or a round-trip test fails
- [ ] Undo depth is bounded, and the memory cost was calculated
- [ ] A durable capture has a version field and a tolerant reader
- [ ] External effects are compensated, not "restored"
- [ ] It is called a snapshot when it is persisted, and event sourcing when history matters

## References

- [Memento, snapshot and event sourcing](references/memento-snapshot-eventsourcing.md) — the three
  compared on durability, schema, history and cost; Java encapsulation techniques for an opaque
  capture; memory strategies for undo stacks (inverses, diffs, persistent structures); and
  versioning rules once a capture becomes durable. Read when choosing between them.
- [Worked example](references/worked-example.md) — a multi-step form with undo built on an opaque
  memento, converted to an immutable state with structural sharing when the stack grew, plus a
  batch job checkpoint that deliberately is a versioned snapshot rather than a memento. Read when
  implementing.
