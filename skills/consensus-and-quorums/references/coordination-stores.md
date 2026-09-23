# Coordination stores in practice

etcd, ZooKeeper and Consul are coordination-oriented replicated state machines (Raft for etcd and
Consul, Zab for ZooKeeper), but their read, watch, lease and transaction contracts differ. Treat
them as versioned metadata/coordination systems, not interchangeable general databases.

## The four primitives, and what each is for

| Primitive                       | Role                                                               | Correct uses                                                  |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Versioned key + compare-and-set | Make one decision single-valued; revision may seed a fencing token | Shard-map/config generation, role claim                       |
| Lease / session with TTL        | A grant that expires without the holder's cooperation              | Liveness of a member, ephemeral registration, leader lease    |
| Watch                           | Learn that something changed                                       | Invalidate a local cache of the decision; trigger a re-read   |
| Ordered / sequential keys       | Impose a total order on claimants                                  | Queueing for a role so that failover is not a thundering herd |

A lease is the **ensemble's** liveness opinion, not the holder's: the cluster may expire a
session the holder still believes is alive, because a renewal was lost or the process paused.

## Workloads to avoid by default

- **Traffic-proportional business data.** Working sets and revision history replicate across voters, and
  families cap what you can store — a znode is capped around a megabyte (`jute.maxbuffer`) and
  etcd enforces a backend quota (`--quota-backend-bytes`); a NOSPACE alarm restricts writes
  while allowing recovery operations such as reads/deletes. Follow the product's
  compaction, defragmentation and alarm-disarm procedure; defragmentation alone does not
  remove live data or old logical revisions.
- **A queue.** Every enqueue and dequeue is a consensus decision, the whole queue lives in the
  replicated state machine, and the degenerate form — one key per item, everyone watching the
  parent — is a herd on every change. Use a broker (`task-queues-and-competing-consumers`).
- **A job table or a lock per request without a capacity argument.** This couples business
  traffic to coordination writes; justify rate, latency, retention and outage behavior instead
  of assuming the metadata cluster has unlimited spare capacity.
- **High-cardinality/churn state without a measured envelope.** Storage, revision history and
  watch cost grow with keys, updates, watchers and retention; benchmark the actual product and
  compaction policy.
- **Synchronous request-path coordination without an accepted latency/outage contract.** Loss of
  usable leader/quorum authority can block fresh reads and commits. A measured, bounded dependency
  may still be appropriate; do not substitute a stale fallback for a required fresh decision.

## Throughput and failure characteristics

- Writes pass a leader/quorum replication and durability path. Batching/pipelining can amortize
  round trips, so “one RTT per API call” is not a throughput formula; adding voters does not shard
  the leader write stream and usually adds work.
- Losing a usable leader can pause new commits while a replacement is established. Previously
  committed/in-flight operations may still produce replies; a timeout does not prove no write
  committed. Election timeouts trade failure-detection delay against disruptive elections under
  pauses or network delay; they are not themselves lease-validity proofs.
- Durable-log latency on the leader and required acknowledgements can constrain commits. A slow
  noncritical follower need not delay a particular commit, but its replication lag, catch-up work
  or changed role can still matter. Correlate those paths instead of declaring the disk invisible.
- Reads split into two classes and you must pick per call site: **linearizable** (requires the
  product's authority/freshness checks, which may require quorum confirmation) or **local/serializable** (served by the contacted
  member, may be arbitrarily stale — a partitioned member can serve an old value indefinitely).
  etcd's v3 read path is linearizable unless a serializable read is requested. ZooKeeper
  member-local reads are not generally linearizable; `sync` can improve freshness but its
  implementation does not provide a blanket linearizable-read guarantee (see its internals).

Consul exposes `default`, `consistent` and `stale` read modes where supported by the endpoint.
Default leader-lease checks can admit stale reads in a leader transition; `consistent`
requires leader/quorum confirmation, while `stale` allows follower reads. Check SDK/query
options and response metadata, rather than equating a successful HTTP response with freshness.

## A watch is not a delivery guarantee

Four properties that catch people:

1. **Product semantics differ.** etcd watches provide ordered, unique, resumable events within the
   retained revision window. ZooKeeper's standard one-shot watch may miss intermediate states
   during re-registration; persistent and persistent-recursive modes exist since 3.6 and
   avoid that re-registration lifecycle. Do not apply the weaker contract to every product—or assume the stronger
   one without revision checkpoints.
2. **Gaps after disconnection.** History is compacted; a client reconnecting at a revision
   already compacted away must re-read from scratch. ZooKeeper standard watches are one-shot — after
   firing they must be re-registered, and changes in the gap appear only in the re-read.
3. **Herd on a shared key.** Every watcher of one key wakes on every change to it. With N
   instances watching the leader key, a failover wakes N clients simultaneously.
4. **Read/write/watch ordering differs by product.** ZooKeeper orders watch events and
   asynchronous replies within its client contract; etcd watch delivery is not a linearizable
   read barrier. Use the documented session/revision rules when updating a local snapshot,
   especially across reconnects or separate channels, and reject stale snapshot replacement.

For current-state consumers, a watch invalidates or reconciles a versioned local snapshot; resync
on compaction/gap and consider periodic reconciliation. Event-history consumers may process
etcd's revision stream within its retention contract, but a coordination watch is not a durable
message broker.

### Joining an etcd snapshot to its watch

For an etcd 3.6 prefix cache, use this sequence rather than reading and then watching "now":

1. Read the prefix with a linearizable `Range` and retain its header revision `r`. If paginating,
   request every remaining page at revision `r`; mixing current revisions is not one snapshot.
   Keep that original `r`: a later historical page's header can report a newer current revision.
2. Watch the same prefix from `r + 1` (the start revision is inclusive). If bootstrap or resume
   encounters compaction, discard the incomplete reconstruction and start a fresh snapshot.
   This repairs current state; it cannot recover every discarded historical transition.
3. Apply all matching events of a revision before publishing that version or checkpointing it.
   Several keys can share a revision. With wire fragmentation enabled, assemble through the final
   `fragment=false` response before treating the batch as complete; check whether the SDK already
   does this. Bound buffering and rebuild the snapshot if the consumer cannot keep up.
4. Resume after the last fully applied revision, with its corresponding cached state. If that
   state was lost, rebuild it instead of loading only the checkpoint. A crash between applying
   data and saving a checkpoint can replay events: publish state/checkpoint together or make
   replay harmless. Ordinary response headers are not consumption checkpoints; a watch progress
   notification can advance the position only after earlier events have been applied. An empty
   watch-creation response is not such a progress notification.

Bind cached state and checkpoints to the cluster identity and watched scope, and invalidate
them when the history is replaced, including snapshot restoration. Restoring an older snapshot
can move revisions backward without producing a compaction error for the old checkpoint;
revision numbers alone do not identify one continuous history. Rebuild before serving that
cache again and follow the deployed version's recovery procedure, including its revision-bump
and compaction controls where applicable. See [etcd 3.6 revision recovery](https://etcd.io/docs/v3.6/op-guide/recovery/#revision-difference).

For example, if one transaction changes keys A and B at revision 42, saving 42 after only A and
restarting at 43 loses B. Uniqueness within a watch does not make external effects exactly once;
their retry/reconciliation contract belongs to `idempotency`. ZooKeeper standard watches need
its read-with-watch/re-registration protocol, not this etcd revision-resume algorithm.

## Compare-and-set has three outcomes, not two

```text
Create a unique attempt ID and write it atomically with the holder/grant under the CAS.
Acknowledged success -> APPLIED with the returned grant/version evidence.
Acknowledged failed comparison -> REJECTED under the store's comparison contract.
Timeout/disconnection or another error without a no-apply guarantee -> UNKNOWN, not false.
Reconcile using a supported strong read and the exact attempt ID or durable operation record.
If reconciliation is unavailable or ambiguous -> remain UNKNOWN; do not authorize side effects.
```

For example, etcd 3.6 documents that `ErrGRPCNoSpace` on `Put`/`Txn`/`LeaseGrant` can accompany
a write that succeeded in the backend. An error code is not automatically a failed comparison.

A reread showing the same holder name can refer to an earlier/later grant or stale state.
Even a strong reread showing another holder does not prove this attempt never committed:
it may have succeeded and then expired or been replaced. Distinguish historical application
from currently valid authority, preserve the unique grant token and enforce it at the external
resource. If the store cannot reconcile history, retain UNKNOWN and use the operation's
idempotency/recovery policy. The general classification is `failure-models`.

## When the store is unreachable

Decide this per consumer, before it happens.

```text
Fail closed (stop doing the work) when:
- a required fresh decision or current grant authority cannot be established, especially for
  effects whose duplication or execution by a stale owner is unacceptable
Serve the last known decision with a staleness bound when:
- the consumer accepts that versioned snapshot and its freshness/recovery policy; ordinary
  configuration need not be a lease. Enforce the accepted validity bound, not "until reconnect"
Fail open (proceed without coordination) when:
- the work is idempotent and safe to run on every replica, so the coordination was an
  optimisation rather than a correctness control
```

An unstated default is the worst option, and "log the exception and continue" is fail-open
chosen by accident.

A cached holder name or locally calculated lease-expiry time does not establish current authority:
a lease can be revoked or regranted before that local bound. Follow the actual grant/expiry and
resource-enforcement contract (`distributed-locks-and-leases`), including any required clock
assumptions. Permission to display stale configuration is not permission to perform stale-owner
effects; conversely, a still-valid authorized operation need not stop solely because a lookup fails.

## Operational checklist

- [ ] Voter count/placement survives each stated failure domain; asymmetric two-domain outcomes are explicit.
- [ ] Backend size and lease/session counts are monitored, with an alert well below the quota.
- [ ] Every read call site has declared linearizable or stale.
- [ ] Watch consumers test snapshot/stream continuity, fully applied checkpoints where supported,
      and recovery after disconnection, compaction or lost local state.
- [ ] Every CAS call site distinguishes rejection from timeout.
- [ ] Every consumer has a documented behaviour for "store unreachable", tested by blocking the
      client's network path rather than by mocking the client.

## Sources

- [ZooKeeper 3.8.4 consistency and sync limitations](https://zookeeper.apache.org/doc/r3.8.4/zookeeperInternals.html)
- [ZooKeeper 3.8.4 watch modes](https://zookeeper.apache.org/doc/r3.8.4/zookeeperProgrammers.html)
- [Consul consistency modes](https://developer.hashicorp.com/consul/api-docs/features/consistency)
- [etcd 3.6 space-quota recovery](https://etcd.io/docs/v3.6/op-guide/maintenance/)
- [etcd 3.6 lease grant/revoke and operation guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/)
- [etcd 3.6 Range, Watch and progress fields](https://etcd.io/docs/v3.6/dev-guide/api_reference_v3/)
- [etcd v3.6.0 watch fragmentation contract](https://github.com/etcd-io/etcd/blob/v3.6.0/api/etcdserverpb/rpc.proto)
