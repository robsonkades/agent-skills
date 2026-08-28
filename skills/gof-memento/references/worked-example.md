# Worked examples: an in-memory undo, and a durable checkpoint

## 1. A multi-step claims form with undo

A claims assessor works through a long form: line items, evidence links, adjustments, notes. Steps
are not independent — adding an adjustment recalculates totals and may clear a previously chosen
settlement option — so command inverses were not available for most operations.

### First version: opaque memento

```java
public final class ClaimDraft {

    public sealed interface Snapshot permits State { }

    private record State(List<LineItem> items, List<Adjustment> adjustments,
                         Optional<SettlementOption> settlement, String notes) implements Snapshot { }

    private List<LineItem> items = new ArrayList<>();
    private List<Adjustment> adjustments = new ArrayList<>();
    private Optional<SettlementOption> settlement = Optional.empty();
    private String notes = "";

    public Snapshot capture() {
        return new State(List.copyOf(items), List.copyOf(adjustments), settlement, notes);
    }

    public void restore(Snapshot snapshot) {
        if (!(snapshot instanceof State state)) throw new IllegalArgumentException("foreign");
        this.items = new ArrayList<>(state.items());
        this.adjustments = new ArrayList<>(state.adjustments());
        this.settlement = state.settlement();
        this.notes = state.notes();
    }
}
```

The caretaker — a `Deque<Snapshot>` in the session — can hold and return captures and can read
nothing. `List.copyOf` at capture time is what makes the capture a capture rather than an alias:
without it, adding a line item later would mutate the "past" state too.

### The round-trip property, which found a real bug

```java
@Property
void restoring_a_capture_returns_the_draft_to_that_state(@ForAll("drafts") ClaimDraft draft,
                                                         @ForAll("edits") List<Edit> edits) {
    var before = draft.capture();
    edits.forEach(e -> e.applyTo(draft));
    draft.restore(before);
    assertThat(draft.capture()).isEqualTo(before);
}
```

Two months later a `reviewer` field was added to `ClaimDraft` and not to `State`. Every
example-based undo test still passed — none of them set a reviewer — and this property failed
immediately. That is the failure mode this pattern has, and the property is the only cheap defence.

### When the stack grew

With twenty undo levels and drafts holding several hundred line items, an editing session retained
twenty full copies. Heap analysis showed the undo stack as the largest retainer in the session
scope.

The fix was to make the state immutable and let the draft be a reference to it:

```java
public final class ClaimDraft {

    private volatile State state;          // one reference; capture and restore are atomic

    private record State(List<LineItem> items, List<Adjustment> adjustments,
                         Optional<SettlementOption> settlement, String notes) implements Snapshot {
        State withNotes(String notes) { return new State(items, adjustments, settlement, notes); }
        State withAdjustmentAdded(Adjustment a) {
            return new State(items, append(adjustments, a), Optional.empty(), notes);
        }
    }

    public Snapshot capture() { return state; }                 // no copying at all
    public void restore(Snapshot s) { state = (State) s; }
}
```

Three things improved at once:

- **Memory** became proportional to what changed: `withNotes` shares both lists with the previous
  version, so twenty undo levels of note edits cost twenty small records, not twenty copies of the
  line items.
- **Capture and restore became atomic.** Previously each read five fields and wrote four; a
  concurrent autosave could observe a half-restored draft. Now each is one reference operation.
- **`List.copyOf` disappeared from `capture`,** because the lists are never mutated in place —
  which is also what makes the sharing safe.

The discipline it costs: every mutation must build a new `State`. That is the same discipline the
memory saving depends on, so it is not an additional price.

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
    int version = raw.get("version").asInt();
    return switch (version) {
        case 1 -> upgradeV1(json.treeToValue(raw, CheckpointV1.class));
        case 2 -> json.treeToValue(raw, ReconciliationCheckpoint.class);
        default -> throw new UnsupportedCheckpointVersion(version, 2);
    };
}
```

- **The position is a keyset cursor, not an offset.** Records inserted during the run would make an
  offset resume skip rows silently (`gof-iterator`).
- **It is written atomically with the work it describes**, or resuming double-processes: the
  checkpoint and the batch's effects commit in the same transaction, and the processing step is
  idempotent so a redelivered batch is harmless (`idempotency`).

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
