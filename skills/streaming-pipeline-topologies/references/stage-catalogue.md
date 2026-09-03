# The stage catalogue

Five shapes. Everything else is a composition of them, and a stage that does not fit one of the
rows is usually two stages that should be separated before it is reasoned about.

| Shape        | What it does                           | Ordering effect                                                       | Safe above concurrency 1 when                                  | State                                        | Characteristic failure                                              |
| ------------ | -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **Copier**   | Fan-out to independent consumers       | Each branch can preserve source order; there is no cross-branch order | Branch effects and shared limits are independent               | Offset/checkpoint per branch                 | Shared broker or sink capacity couples supposedly independent paths |
| **Filter**   | Drop records failing a predicate       | Preserves survivor order only if execution/emission does              | Predicate and effects are deterministic/order-insensitive      | None for a pure predicate                    | Side effects or mutable predicates make replay/order incorrect      |
| **Splitter** | One input, N outputs by classification | Per-output order follows the input; **no order between outputs**      | Stateless classification                                       | None                                         | Non-atomic outputs: a crash between output 1 and 2 leaves a gap     |
| **Sharder**  | Re-partition by a new key              | Old-key order does not define order after many-to-one reshuffling     | Partition contract and recovery boundary are explicit          | In-flight buffers; often internal topic      | Skew, migration incompatibility or a sink outside the guarantee     |
| **Merger**   | Join or combine streams, keyed         | Output order is operator-defined, not either input's                  | Inputs co-partitioned and one fenced owner manages keyed state | Window/raw matches, table state or aggregate | Unmatched or live-key state grows without an effective bound        |

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
  2. **Guarantee.** Enumerate what atomically couples input progress, repartition output, state
     and final sink. Kafka Streams transactions or Flink checkpoints can include an internal
     shuffle; an arbitrary external side effect usually remains outside that scope.
  3. **Distribution.** A new key means a new skew profile; a uniform old key says nothing about
     the new one (`hot-partitions-and-rebalancing`).
- **Merger.** Combining asynchronous inputs usually needs state: raw unmatched events for a
  stream-stream join, current values for a table join, or a fixed-size aggregate. Tombstones,
  window closure and business terminal states determine whether keys can leave.
- **Copier.** In a log, a second consumer group separates progress and replay, but adds reads,
  decompression, network, cache churn, ACL/retention administration and downstream load. It can
  still hurt the first group through shared broker, quota or sink capacity. Prefer it when those
  costs are acceptable and branches genuinely need independent lifecycle.

## Composition rules

- **Fuse only across compatible failure semantics.** `filter → map → filter` can avoid
  serialization and scheduling, but fusion also merges scaling, retry, deployment and
  observability boundaries. Preserve logical stage names and do not fuse across different
  side-effect, trust or isolation requirements.
- **A repartition is a visible semantic and recovery boundary**, even when one engine guarantee
  spans it. Record old/new key, partitioner/count, topology version, state migration and sinks
  inside or outside the atomic boundary.
- **Push pure, authorized filters earlier when it reduces work.** Do not move a filter before a
  validation/audit/security step whose observation is required. Delay shuffles when it reduces
  volume, unless the earlier key is needed to parallelize expensive work or bound state.
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

## Primary references

- [Kafka Streams processing guarantees](https://kafka.apache.org/documentation/streams/developer-guide/config-streams.html#processing-guarantee) — transaction scope and `exactly_once_v2`.
- [Apache Flink fault tolerance](https://nightlies.apache.org/flink/flink-docs-stable/docs/learn-flink/fault_tolerance/) — checkpoints, replayable sources and consistent state.
- [Apache Flink event-time watermarks](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/) — partition watermarks, idleness and event-time progress.
