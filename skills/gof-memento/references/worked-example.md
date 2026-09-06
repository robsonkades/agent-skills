# Worked examples: an in-memory undo, and a durable checkpoint

## 1. A multi-step claims form with undo

A claims assessor works through a long form: line items, evidence links, adjustments, notes. Steps
are not independent — adding an adjustment recalculates totals and may clear a previously chosen
settlement option — so command inverses were not available for most operations.

### First version: opaque memento

Partial Java 17 example: all LineItem, Adjustment and SettlementOption values are deeply
immutable; mutable leaves would require value copies. This version is confined to the session's
single editing thread. Concurrent readers/mutators must share a lock covering capture and restore.

```java
public final class ClaimDraft {

    public sealed interface Snapshot permits State { }

    private final Object owner = new Object();

    private record State(Object owner, List<LineItem> items, List<Adjustment> adjustments,
                         Optional<SettlementOption> settlement, String notes) implements Snapshot {
        @Override public String toString() { return "ClaimDraft snapshot"; }
    }

    private List<LineItem> items = new ArrayList<>();
    private List<Adjustment> adjustments = new ArrayList<>();
    private Optional<SettlementOption> settlement = Optional.empty();
    private String notes = "";

    public Snapshot capture() {
        return new State(owner, List.copyOf(items), List.copyOf(adjustments), settlement, notes);
    }

    public void restore(Snapshot snapshot) {
        if (!(snapshot instanceof State state) || state.owner() != owner) {
            throw new IllegalArgumentException("foreign or null snapshot");
        }
        this.items = new ArrayList<>(state.items());
        this.adjustments = new ArrayList<>(state.adjustments());
        this.settlement = state.settlement();
        this.notes = state.notes();
    }
}
```

The caretaker has no typed state accessors; rendering is redacted. Owner identity prevents a
snapshot from another draft being accepted; the implementation type alone would not.
`List.copyOf` prevents later list edits from changing the capture, but does not clone elements.
See [List.copyOf in Java 17](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>).

### A round-trip property with an independent oracle

Illustrative jqwik/AssertJ property; use the project's test libraries and provide generators
that vary every restorable field. `observeDraft` is an independent immutable semantic view of
the actual draft (including reviewer if present), not a wrapper around capture().

```java
@Property
void restoring_a_capture_returns_the_draft_to_that_state(@ForAll("drafts") ClaimDraft draft,
                                                         @ForAll("edits") List<Edit> edits) {
    var expected = observeDraft(draft);
    var before = draft.capture();
    edits.forEach(e -> e.applyTo(draft));
    draft.restore(before);
    assertThat(observeDraft(draft)).isEqualTo(expected);
}
```

If reviewer is omitted from State, comparing capture() before and after cannot detect it:
both captures omit the same field. An edit must change reviewer and the independent observation
must include it. Also test null/foreign snapshots, mutation after capture and repeated restores.

### When the stack grew

Twenty undo levels retain twenty copied list structures plus shared immutable items and other
reachable state. Whether that dominates session memory needs a heap/retention measurement;
this is an illustrative scenario, not a reported production measurement.

One alternative is immutable state behind one reference. The following partial variant omits
mutators and the append helper, which returns an immutable copied list:

```java
public final class ClaimDraft {

    public sealed interface Snapshot permits State { }
    private final Object owner = new Object();
    private volatile State state = new State(owner, List.of(), List.of(), Optional.empty(), "");

    private record State(Object owner, List<LineItem> items, List<Adjustment> adjustments,
                         Optional<SettlementOption> settlement, String notes) implements Snapshot {
        @Override public String toString() { return "ClaimDraft snapshot"; }
        State withNotes(String notes) { return new State(owner, items, adjustments, settlement, notes); }
        State withAdjustmentAdded(Adjustment a) {
            return new State(owner, items, append(adjustments, a), Optional.empty(), notes);
        }
    }

    public Snapshot capture() { return state; }                 // no copying at all
    public void restore(Snapshot s) {
        if (!(s instanceof State captured) || captured.owner() != owner) {
            throw new IllegalArgumentException("foreign or null snapshot");
        }
        state = captured; // intentional overwrite; serialize with edits when required
    }
}
```

Expected effects to verify:

- **Memory:** `withNotes` shares both lists; each version retains its notes string and state record.
  A copied append still allocates a whole list; a record alone is not a persistent collection with
  change-proportional cost. Measure the retained graph and bound history depth/bytes.
- **Capture and restore of the state reference are atomic.** With separate mutable fields, a
  concurrent autosave could observe a half-restored draft. Now each is one reference operation.
- **`List.copyOf` disappeared from `capture`,** because the lists are never mutated in place —
  which is also what makes the sharing safe.

All lists and elements must already be immutable. Read the volatile reference once for a
multi-field observation. Volatile does not make read-modify-write edits atomic: serialize writers
or use a CAS loop with pure transformations. Define whether restore intentionally overwrites
intervening edits or rejects stale versions; do not reset a conflict counter as part of undo.

## 2. A batch job checkpoint — deliberately not a memento

A nightly reconciliation processes millions of records and must resume after a crash without
starting over.

```java
public record ReconciliationCheckpoint(
        int version,                       // 2
        String jobId,
        Cursor position,                   // keyset position, not an offset
        long processedCount,
        Instant capturedAt,
        Optional<String> pausedReason      // added in v2
) { }
```

This is a snapshot, not a memento, and every difference is deliberate:

- **It is public and readable.** Operations tooling shows the position and the count; support asks
  "where is it". Opacity would be an obstacle, not a feature.
- **It is versioned.** A checkpoint written by yesterday's deploy is read by today's. `version` is
  the first field and is explicit.
- **An unknown version is refused, loudly.** For a checkpoint, ignoring an unrecognised field is
  the wrong default — the ignored field might be the one that says where to resume.

```java
public ReconciliationCheckpoint read(byte[] bytes) {
    var raw = json.readTree(bytes);
    var versionNode = raw == null ? null : raw.get("version");
    if (versionNode == null || !versionNode.isIntegralNumber() || !versionNode.canConvertToInt()) {
        throw new IllegalArgumentException("missing or invalid checkpoint version");
    }
    int version = versionNode.intValue();
    return switch (version) {
        case 1 -> upgradeV1(json.treeToValue(raw, CheckpointV1.class));
        case 2 -> json.treeToValue(raw, ReconciliationCheckpoint.class);
        default -> throw new UnsupportedCheckpointVersion(version, 2);
    };
}
```

This decoder is a partial Jackson 2.x sketch (API checked against 2.17.3) requiring project dependencies, checked-exception
handling and explicit adapters for Optional/time/cursor types. Validate job identity, cursor,
counts and required fields after migration; Java Optional alone does not define wire defaults.
Bound input bytes/depth before constructing the JSON tree.
See [JsonNode source](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-2.17.3/src/main/java/com/fasterxml/jackson/databind/JsonNode.java)
for integral/range checks; this example does not authorize a dependency upgrade.

- **Keyset avoids offset shift, not all missed rows.** Insertions before an offset can repeat rows;
  deletions can skip them. Stable unique keys and snapshot/high-water semantics must match the
  completeness requirement, including key updates and late arrivals (`gof-iterator`).
- **Commit checkpoint and effects atomically when one local transaction owns both.** Otherwise a
  crash can repeat effects or advance past unfinished work. Remote effects require durable progress
  and idempotency/reconciliation; a local transaction alone cannot cover them (`idempotency`).

### Why not event sourcing

It was considered, because "which records were processed, and why each was matched" has audit
value. It was rejected for this job on cost: the log would be tens of millions of events per night
to answer a question the business asks about a handful of disputed records, and those are already
answerable from the output. Recorded as the reason, so the decision can be revisited if the audit
requirement changes — which is the point of writing it down rather than just choosing
(`event-sourcing`, `architecture-decision-making`).

## What the two examples share, and do not

|                          | Claims form undo            | Reconciliation checkpoint             |
| ------------------------ | --------------------------- | ------------------------------------- |
| Crosses a process        | No                          | Yes                                   |
| Opaque                   | Yes — sealed private record | No — deliberately readable            |
| Versioned                | No                          | Yes, explicitly, with an upgrade path |
| Failure of a bad capture | A wrong undo                | Double processing or skipped records  |
| Retention concern        | Heap, per session           | Storage, negligible                   |

Same idea, opposite engineering. Deciding which one is being built — before writing the class — is
what the distinction is for.
