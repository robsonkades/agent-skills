# Memento, snapshot and event sourcing

## The comparison

| Dimension              | Memento                     | Snapshot                              | Event sourcing                           |
| ---------------------- | --------------------------- | ------------------------------------- | ---------------------------------------- |
| Lives                  | Transient or durable        | In storage, across versions           | In storage, as an append-only log        |
| Readable by others     | No — opaque by design       | Yes — it is a contract                | Yes — events are the contract            |
| Schema and versioning  | Needed when persisted       | Required                              | Required, for every event type, forever  |
| Answers "what was it?" | Yes                         | Yes                                   | Yes, by replay                           |
| Answers "why?"         | No                          | No                                    | Only recorded reasons                    |
| Cost                   | Memory                      | Storage plus a serialisation contract | Replay, projections, schema evolution    |
| Undo                   | Natural                     | Coarse                                | New compensating facts; not erasure      |
| Typical use            | Editor undo, what-if branch | Job checkpoint, aggregate snapshot    | Audit-critical domains, temporal queries |

Decision sequence that works:

1. **Must the caretaker be unable to inspect the state?** Use an opaque memento boundary.
2. **Must it survive storage or cross versions?** Add snapshot schema/recovery policy; a durable
   memento can also be a snapshot.
3. **Must authoritative events reconstruct state?** Consider event sourcing. If only audit
   reasons matter, compare a separate audit trail; events explain only what was recorded.

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
    private record State(String text, int caret) implements Snapshot {
        @Override public String toString() { return "Editor snapshot"; }
    }

    public Snapshot capture() { return new State(text, caret); }
    public void restore(Snapshot s) { var st = (State) s; text = st.text(); caret = st.caret(); }
}

// 2. Marker interface with no members (pre-sealed style). Opaque, but any class can implement it.
public interface Snapshot { }

// 3. Package-private class. Opaque outside the package only; fine within a module.
final class EditorState { }
```

Sealing controls implementation types, not originating instances. The short sketch above permits
cross-instance restoration and does not reject null explicitly; use the owner-token variant in
the entrypoint when captures belong to one originator. The following type guard alone only rejects
null or a different implementation, not another Editor's State:

```java
public void restore(Snapshot s) {
    if (!(s instanceof State state)) throw new IllegalArgumentException("foreign snapshot");
    ...
}
```

Records generate toString(), equals() and hashCode() over components; private nesting does not
hide those Object methods. Override rendering to avoid accidental disclosure, or use a private
class with identity equality when comparisons must not reveal state. Neither is a sandbox against
reflection. See [Java 17 records](https://docs.oracle.com/en/java/javase/17/language/records.html).

What exposes a public state contract:

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

Immutable state can make capture a reference read, provided collections and their elements are
immutable. Records do not enforce deep immutability or persistent collection algorithms; copying
a modified list still costs its length. Compare this with full copies/diffs using actual edit
patterns and retained bytes. Bound history whichever representation is chosen.

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

(b) publishes each immutable value atomically. Readers must load the reference once; multiple
reads can observe different versions. Concurrent read-modify-write edits still need writer
serialization or CAS, and restore needs an explicit stale-edit policy. A lock may be simpler for
coupled state. CAS update functions must be side-effect-free because retries can repeat them;
see [AtomicReference 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/atomic/AtomicReference.html).

## Versioning, once it is durable

The moment a capture is written to disk, a queue or a database, a future version of your code will
read it.

```java
public record CheckpointV2(
        int version,                 // one possible schema identity convention
        long processedCount,
        Cursor position,
        Optional<Instant> pausedAt   // added in v2; absent in v1 data
) { }
```

Rules:

- **Identify the schema explicitly.** A field, envelope or schema identifier can do this;
  positional order of a JSON version field is not significant.
- **Additive changes are optional with documented defaults**; anything else is a new version with
  an explicit upgrade path.
- **Decide what an older reader does with a newer capture.** Reject unsupported semantics;
  ignoring unknown fields is safe only under a proven compatibility policy, for events too.
- **Prefer an explicit durable schema over native Java serialization.** Existing serialized
  formats require compatibility review and hardened deserialization; do not replace a deployed
  format without a migration (`java-serialization-hardening`).

## Restore is not compensation

Restoring an object's fields does not unsend an email, unpublish an event, or unmove money. A
design that offers "undo" over operations with external effects needs compensating actions with
their own outcomes and failure modes, and those cannot be hidden behind a `restore` call
(`distributed-transactions-and-sagas`, `idempotency`).

State the boundary in the API: restore changes only the state it owns. Reject or reconcile a
capture that conflicts with already committed external facts; compensation is a separate business
operation with its own authorization and failure handling.
