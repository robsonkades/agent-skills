# The stage catalogue

Five shapes. Everything else is a composition of them, and a stage that does not fit one of the
rows is usually two stages that should be separated before it is reasoned about.

| Shape        | What it does                           | Ordering effect                                                               | Safe above concurrency 1 when                                    | State                                       | Characteristic failure                                             |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| **Copier**   | Fan-out to independent consumers       | Preserves per-partition order for each consumer separately                    | Always — the consumers do not interact                           | None                                        | Consumers coupled by a shared downstream they both write           |
| **Filter**   | Drop records failing a predicate       | Preserves relative order of survivors; creates gaps in any sequence numbering | Stateless predicate                                              | None (stateful predicate makes it a merger) | Cost paid upstream on records that are then discarded              |
| **Splitter** | One input, N outputs by classification | Per-output order follows the input; **no order between outputs**              | Stateless classification                                         | None                                        | Non-atomic outputs: a crash between output 1 and 2 leaves a gap    |
| **Sharder**  | Re-partition by a new key              | **Destroys the input's per-key order**; establishes order on the new key only | Never a free knob — parallelism here _is_ the re-key             | None per record, but a write boundary       | New skew profile; guarantee boundary ends at the new producer      |
| **Merger**   | Join or combine streams, keyed         | Output order is the join's, not either input's                                | Both inputs partitioned by the join key, one owner per partition | **Windowed keyed state**                    | Unbounded state when the window is missing or effectively infinite |

## Reading the table

- **Filter.** The predicate must be stateless for the stage to stay a filter. `keep the first
event per user` is not a filter; it is a merger with a key-space-sized state and all of a
  merger's problems. The other trap is cost placement: the record was fetched, decompressed and
  deserialised before the predicate ran, so a 99%-drop filter wasted 99% of that work. Push it
  to the source — a broker-side predicate, a query `WHERE`, or separate topics per class — when
  the source can express it.
- **Splitter.** The classification is usually trivial; the transactional question is not. If the
  N outputs are written by N independent sends, consumers of output B must tolerate arriving
  without output A, forever. If they cannot, either the outputs must be inside one transaction
  (`delivery-semantics` for what that boundary actually covers), or the split must happen
  downstream of a single durable record.
- **Sharder.** The stage everything else defers to. Three things change at once:
  1. **Order.** Two records now sharing a key may have come from partitions with no relative
     order. There is no order to restore — it never existed.
  2. **Guarantee.** The output is produced by a writer that does not own the input's offsets, so
     an exactly-once claim covering the input does not extend past this point unless one
     transaction covers reading the input and writing the output.
  3. **Distribution.** A new key means a new skew profile; a uniform old key says nothing about
     the new one (`hot-partitions-and-rebalancing`).
- **Merger.** The only shape whose state is unavoidable, because a join must remember one side
  while waiting for the other. Everything about that state — windows, retention, sizing,
  detection — is `stateful-stages.md`.
- **Copier.** In a log, a second consumer group. It costs the producer nothing, costs the first
  consumer nothing, and can be added and removed without coordination — which is why it is the
  cheapest decoupling in the catalogue and the first thing to reach for when a new consumer
  appears. In a queue, by contrast, fan-out is a real copy of every message and has a real cost.

## Composition rules

- **Stateless stages fuse.** filter → map → filter can run in one operator on one thread per
  partition with no correctness question at all. Fuse them; each extra hop is a serialisation
  round trip for no benefit.
- **A re-partition splits the pipeline into two reasoning units.** Everything before it holds
  one ordering and one guarantee; everything after it holds different ones. Draw the boundary
  in the diagram — most topology diagrams do not, which is why the discussion "is this
  exactly-once?" has no answer.
- **Filters go as early as possible; sharders as late as possible.** Filtering early saves the
  cost of every stage after it. Sharding late means fewer records cross the expensive boundary,
  and fewer stages live on the far side of the ordering break.
- **A merger after a sharder must be sharded on the join key**, or it is not a merger — it is a
  merger plus a hidden shuffle that someone will discover under load.
- **Two shapes in one operator is the recurring design smell.** "Filter and route" is a filter
  plus a splitter. "Enrich from a lookup" is a merger, not a map, the moment the lookup is
  itself a stream. Naming them separately is what makes the four questions answerable.

## Anti-patterns, as shapes

- `stream.parallel()` or a `flatMap(..., concurrency)` over records of one partition, where the
  handler writes keyed state. Reordered within the key, and no test catches it because the
  reordering is timing-dependent.
- A join whose retention is left at the framework default, or set to a value copied from another
  pipeline. The number must come from how late the other side can legitimately arrive.
- A splitter whose outputs are documented as "always produced together" with no transaction
  behind the claim.
- A stage that consumes from a topic and produces to the same topic. It is a loop with no
  termination argument; at best it is a retry mechanism, and it should be named one.
- A filter placed after an enrichment call. The enrichment was performed for records about to be
  discarded — the most expensive ordering of a two-stage pipeline.
