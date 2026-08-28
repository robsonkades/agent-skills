# Memento, snapshot and event sourcing

## The comparison

| Dimension              | Memento                     | Snapshot                              | Event sourcing                           |
| ---------------------- | --------------------------- | ------------------------------------- | ---------------------------------------- |
| Lives                  | In memory, in one process   | In storage, across versions           | In storage, as an append-only log        |
| Readable by others     | No — opaque by design       | Yes — it is a contract                | Yes — events are the contract            |
| Schema and versioning  | None needed                 | Required                              | Required, for every event type, forever  |
| Answers "what was it?" | Yes                         | Yes                                   | Yes, by replay                           |
| Answers "why?"         | No                          | No                                    | **Yes**                                  |
| Cost                   | Memory                      | Storage plus a serialisation contract | Replay, projections, schema evolution    |
| Undo                   | Natural                     | Coarse                                | Natural (compensating events)            |
| Typical use            | Editor undo, what-if branch | Job checkpoint, aggregate snapshot    | Audit-critical domains, temporal queries |

Decision sequence that works:

1. **Does anything outside this process need the capture?** No → memento. Stop.
2. **Does "why it changed" have business value — audit, correction, analytics, temporal
   queries?** No → snapshot. Stop.
3. Yes → event sourcing, and snapshots become an optimisation over replay
   (`event-sourcing`).

Do not arrive at event sourcing by accumulating snapshots. A snapshot history tells you the state
at times T1…Tn and can never tell you what happened between them; that information is destroyed at
capture time and is not recoverable later.

## Encapsulation in Java

The classical requirement — the caretaker can hold the memento and nothing else — has three
workable expressions.

```java
// 1. Sealed public interface, private record implementation. Best default.
public final class Editor {
    public sealed interface Snapshot permits State { }
    private record State(String text, int caret) implements Snapshot { }

    public Snapshot capture() { return new State(text, caret); }
    public void restore(Snapshot s) { var st = (State) s; text = st.text(); caret = st.caret(); }
}

// 2. Marker interface with no members (pre-sealed style). Opaque, but any class can implement it.
public interface Snapshot { }

// 3. Package-private class. Opaque outside the package only; fine within a module.
final class EditorState { }
```

Option 1 is the strongest and the cheapest to write. The cast in `restore` is safe because
`sealed` guarantees no other implementation exists — and it is worth guarding anyway when the
originator may hold snapshots from another instance:

```java
public void restore(Snapshot s) {
    if (!(s instanceof State state)) throw new IllegalArgumentException("foreign snapshot");
    ...
}
```

What breaks encapsulation, and is the common shortcut:

```java
public Map<String, Object> getState();      // anyone can read and edit it
public EditorState getState();              // public type with public accessors
```

Both make the capture's shape a contract. Sometimes that is what you want — then call it a DTO and
version it — but it is no longer this pattern's guarantee.

## Memory strategies for undo

```text
Full capture per step        depth × size. Simple; the default that
                             surprises people when the object is large.

Command inverses             store what to undo, not what it was. Cheapest
                             when inverses are exact (gof-command).

Diffs                        store the delta. Compact; restoring the k-th
                             prior state costs k applications.

Persistent (immutable)       each edit produces a new version sharing the
structures                   unchanged parts. The undo stack becomes a
                             stack of references, and memory is
                             proportional to what actually changed.

Bounded depth                cap the stack; the oldest entries are
                             discarded. Almost always also needed.
```

The persistent-structure option is the one to reach for first in modern Java: making the state an
immutable record whose collections are shared where unchanged gives correct concurrency, free
capture, and a memory profile proportional to real change.

Retention is the failure that shows up in production rather than review: an undo stack of ten
captures of a large document graph pins ten graphs. Where the object references loaded entities or
buffers, an editing session's heap grows monotonically and looks like a leak
(`heap-dump-analysis`).

## Torn captures

```java
// capture reads five fields; a concurrent mutation between the first and last
// produces a state the object never had
public Snapshot capture() { return new State(text, caret, marks, selection, dirty); }
```

Two correct designs:

```java
// (a) capture under the lock that guards mutation
public synchronized Snapshot capture() { return new State(...); }

// (b) the state IS an immutable value behind one reference
private volatile State state;
public Snapshot capture() { return state; }                  // one read, atomic
public void restore(Snapshot s) { state = (State) s; }       // one write, atomic
```

(b) is strictly better where it fits: capture and restore become single reference operations,
there is no copying, and concurrent readers never see a partial state. It requires every mutation
to build a new `State`, which is the same discipline that makes the memory strategy above work.

## Versioning, once it is durable

The moment a capture is written to disk, a queue or a database, a future version of your code will
read it.

```java
public record CheckpointV2(
        int version,                 // explicit, first field, never inferred
        long processedCount,
        Cursor position,
        Optional<Instant> pausedAt   // added in v2; absent in v1 data
) { }
```

Rules:

- **Version explicitly.** Inferring the version from present fields breaks the first time two
  changes overlap.
- **Additive changes are optional with documented defaults**; anything else is a new version with
  an explicit upgrade path.
- **Decide what an older reader does with a newer capture.** Usually: refuse, loudly. Silently
  ignoring unknown fields is right for events and wrong for a checkpoint, because the ignored field
  may be the one that says where to resume.
- **Never use Java serialisation for it.** It couples the format to class shapes, breaks on
  refactoring, and is a deserialisation attack surface (`gof-prototype`).

## Restore is not compensation

Restoring an object's fields does not unsend an email, unpublish an event, or unmove money. A
design that offers "undo" over operations with external effects needs compensating actions with
their own outcomes and failure modes, and those cannot be hidden behind a `restore` call
(`distributed-transactions-and-sagas`, `idempotency`).

State the boundary in the API: `restore` reverts in-memory state up to the last externally visible
effect; anything past that is a business operation.
