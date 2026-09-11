# The stage catalogue

These five shapes are a reasoning vocabulary, not an exhaustive operator taxonomy. Decompose
semantic steps when useful without forcing each implementation into one category.

| Shape        | What it does                             | Ordering effect                                                                        | Safe above concurrency 1 when                                                                | State                                        | Characteristic failure                                              |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **Copier**   | Fan-out to independent consumers         | Each branch can preserve source order; there is no cross-branch order                  | Branch effects and shared limits are independent                                             | Offset/checkpoint per branch                 | Shared broker or sink capacity couples supposedly independent paths |
| **Filter**   | Drop records failing a predicate         | Preserves survivor order only if execution/emission does                               | Predicate and effects are deterministic/order-insensitive                                    | None for a pure predicate                    | Side effects or mutable predicates make replay/order incorrect      |
| **Splitter** | One input, N outputs by classification   | Per-output order only if execution/emission preserve it; no general cross-output order | Classification plus effects tolerate reordering, or emission preserves required order        | None                                         | Non-atomic outputs: a crash between output 1 and 2 leaves a gap     |
| **Sharder**  | Redistribute by key or partition mapping | Preserve only order established by source/application protocol and execution           | Partition contract and recovery boundary are explicit                                        | In-flight buffers; often internal topic      | Skew, migration incompatibility or a sink outside the guarantee     |
| **Merger**   | Join or combine streams, keyed           | Output order is operator-defined, not either input's                                   | For keyed joins: compatible partitioning/ownership or a documented broadcast/lookup strategy | Window/raw matches, table state or aggregate | Unmatched or live-key state grows without an effective bound        |

## Reading the table

- **Filter.** A pure predicate holds no keyed history; `keep the first event per user` is
  stateful deduplication with retention/recovery requirements, whether its API calls it a filter
  or not. Pushdown must preserve null/type/time semantics and required observations; dropped
  record percentage does not determine byte/CPU savings.
- **Splitter.** Review classification and the transactional contract separately. If the
  N outputs are written by N independent sends, consumers of output B must tolerate arriving
  without output A until recovery, or permanently if no repair protocol exists. If they cannot, either the outputs must be inside one transaction
  (`delivery-semantics` for what that boundary actually covers), or the split must happen
  downstream of a single durable record.
- **Sharder.** Review the actual key and partition mapping; redistribution need not re-key records:
  1. **Order.** Two records now sharing a key may have come from partitions with no relative
     transport order. An original authoritative sequence or version protocol may define logical
     order; preserve it with the required buffering/gap/effect policy rather than inventing order
     from arrival. An unchanged key alone does not prove order survives redistribution.
  2. **Guarantee.** Enumerate what atomically couples input progress, repartition output, state
     and final sink. Kafka Streams transactions or Flink checkpoints can include an internal
     shuffle; an arbitrary external side effect usually remains outside that scope.
  3. **Distribution.** Key, partitioner and parallelism changes can alter skew; measure the actual
     mapping and workload (`hot-partitions-and-rebalancing`).
- **Merger.** A union can interleave inputs without retaining keyed matches. A join needs
  a defined matching strategy: raw unmatched events for a
  stream-stream join, current values for a table join, or a fixed-size aggregate. Tombstones,
  window closure and business terminal states determine whether keys can leave.
- **Copier.** In a log, a second consumer group separates progress and replay, but adds reads,
  decompression, network, cache churn, ACL/retention administration and downstream load. It can
  still hurt the first group through shared broker, quota or sink capacity. Kafka retention and
  compaction are topic policies, not per-group policies. Prefer it when those
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
- **Name a join's physical strategy.** A partitioned keyed join needs compatible key/partition
  mapping on both sides; a broadcast or external lookup join has different state and consistency
  costs. A union does not automatically require a join-key shuffle.
- **Separate semantic reasoning from physical stages.** "Filter and route" combines filtering
  and splitting; a stream-backed lookup adds join/consistency concerns. Name those contracts,
  but retain a useful fused operator when its ordering, state, effects and isolation fit.
  Different operator parallelism or state policies can coexist in one engine/job; a split needs
  a concrete lifecycle, capacity or isolation reason.

## Anti-patterns, as shapes

- `stream.parallel()` or a `flatMap(..., concurrency)` over records of one partition, where the
  handler writes keyed state. Without ordered completion/effect control this can reorder within the key;
  deterministic gates can expose it in a test.
- A join whose retention comes from an unexamined default or an unrelated pipeline. Derive the
  policy from required matches, accepted loss and key lifecycle; a verified default may fit.
- A splitter whose outputs are documented as "always produced together" with no transaction
  behind the claim.
- Feedback without a termination/progress and load argument. Same-topic feedback can be a
  deliberate iteration: prove decreasing finite work, an enforced lifetime with defined expiry,
  or convergence to a fixed point with an explicit progress/convergence contract. Preserve
  identity, duplicate/replay handling and failure outcomes. Reaching an iteration/TTL cap must
  produce the declared incomplete/expiry outcome when the result has not converged; the cap or
  a fixed-point label alone is not proof of correct completion.
- A filter after enrichment when its predicate needs only original fields and moving it preserves
  required effects. If the predicate depends on enrichment, moving it earlier changes semantics.

## Primary references

- [Kafka 4.1 Streams processing guarantees](https://kafka.apache.org/41/streams/core-concepts/#processing-guarantees) — transaction scope and `exactly_once_v2`.
- [Flink 1.20 fault tolerance](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/learn-flink/fault_tolerance/) — checkpoints, replayable sources and consistent state.
- [Flink 1.20 event-time watermarks](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/concepts/time/) — partition watermarks, idleness and event-time progress.
- [Kafka topic configuration](https://kafka.apache.org/41/configuration/topic-configs/) — shared retention and compaction policies; verify the deployed release.
- [Flink 1.20 operator parallelism](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/dev/datastream/execution/parallel/) and [chaining/redistribution](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/dev/datastream/operators/overview/) — per-operator configuration and physical placement do not require separate jobs. These are source-version examples, not a recommendation to change the deployed engine.
