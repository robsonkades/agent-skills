# Coordination stores in practice

etcd, ZooKeeper and Consul are the same shape of thing: a replicated state machine behind a
consensus protocol (Raft for etcd and Consul, Zab for ZooKeeper), exposing a tiny key space
with strong ordering. Treat them as **a distributed `compareAndSet` with expiry and change
notification**, not as a database.

## The four primitives, and what each is for

| Primitive                       | Role                                                            | Correct uses                                                  |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| Versioned key + compare-and-set | Make one decision single-valued; the version is a fencing token | Shard-map generation, config generation, "who holds the role" |
| Lease / session with TTL        | A grant that expires without the holder's cooperation           | Liveness of a member, ephemeral registration, leader lease    |
| Watch                           | Learn that something changed                                    | Invalidate a local cache of the decision; trigger a re-read   |
| Ordered / sequential keys       | Impose a total order on claimants                               | Queueing for a role so that failover is not a thundering herd |

A lease is the **ensemble's** liveness opinion, not the holder's: the cluster may expire a
session the holder still believes is alive, because a renewal was lost or the process paused.

## Operations these stores are wrong for

- **Application data.** The keyspace is expected to fit in memory on every voter, and both
  families cap what you can store — a znode is capped around a megabyte (`jute.maxbuffer`) and
  etcd enforces a backend quota (`--quota-backend-bytes`) after which the cluster goes
  read-only until it is defragmented and the alarm is cleared. Discovering this limit in
  production means the store stops accepting writes, including the ones your leases need.
- **A queue.** Every enqueue and dequeue is a consensus decision, the whole queue lives in the
  replicated state machine, and the degenerate form — one key per item, everyone watching the
  parent — is a herd on every change. Use a broker (`task-queues-and-competing-consumers`).
- **A job table or a lock per request.** Write rate then scales with traffic, which is exactly
  what a consensus store cannot do.
- **High-cardinality state.** Watch and revision bookkeeping is per key.
- **Anything on the synchronous request path without a cached fallback.** A store that needs a
  majority for a linearizable read is unavailable during every leader election.

## Throughput and failure characteristics

- Write throughput is bounded by **one majority round trip per decision** plus a durable write
  on each voter. It does not scale with cluster size — it degrades.
- A leader election is a window with **no writes at all**. Sizing the election timeout is the
  same trade as sizing any lease: short means false elections under GC pause or a network blip,
  long means a longer stall.
- A voter's disk latency _is_ write latency — the log write is on the commit path. A slow disk
  on one node of five is invisible until that node joins the fastest majority.
- Reads split into two classes and you must pick per call site: **linearizable** (confirmed
  against the leader, costs a round trip) or **local/serializable** (served by the contacted
  member, may be arbitrarily stale — a partitioned member can serve an old value indefinitely).
  ZooKeeper reads are served by the connected member and are stale unless the client issues a
  sync first; etcd's v3 read path is linearizable unless a serializable read is requested.

## A watch is not a delivery guarantee

Four properties that catch people:

1. **Coalescing.** Several changes may be reported as one. You learn the key changed, not the
   sequence it went through, so a consumer needing every intermediate state cannot use a watch.
2. **Gaps after disconnection.** History is compacted; a client reconnecting at a revision
   already compacted away must re-read from scratch. ZooKeeper watches are one-shot — after
   firing they must be re-registered, and changes in the gap appear only in the re-read.
3. **Herd on a shared key.** Every watcher of one key wakes on every change to it. With N
   instances watching the leader key, a failover wakes N clients simultaneously.
4. **No ordering against your own writes** unless you compare revisions. The event you receive
   may predate the write you just made.

The consequence is one rule: **a watch triggers a re-read; it never carries the state.** Every
watch handler must be correct when it fires spuriously, fires late, or never fires at all —
which means a periodic full re-read as a backstop, not only the watch.

## Compare-and-set has three outcomes, not two

```java
// Conceptual: claim a role by CAS on a versioned key. Omits retry budget and metrics.
record Claim(long revision, String holder) {}

boolean tryClaim(String key, String me, Claim seen) {
    try {
        // Succeeds only if the key is still at seen.revision().
        return store.compareAndSet(key, seen.revision(), me);   // false = someone else won
    } catch (TimeoutException e) {
        // UNKNOWN: the CAS may have been applied and only the response lost.
        // Never treat this as "I lost". Re-read the key and compare the holder.
        Claim now = store.read(key);
        return me.equals(now.holder());
    }
}
```

The `false` path and the `TimeoutException` path mean different things and the mistake is
collapsing them: a lost response after a _successful_ CAS, treated as a loss, produces a
process that has the role and does not know it. The general classification is `failure-models`.

## When the store is unreachable

Decide this per consumer, before it happens.

```text
Fail closed (stop doing the work) when:
- the decision gates a non-idempotent side effect whose duplicate is expensive — a payment
  run, an outbound notification batch, a destructive reconciliation
Serve the last known decision with a staleness bound when:
- the decision changes rarely, the cached value is stamped with its lease expiry, and acting
  on a stale value is recoverable. Stop acting when the cached lease expires — not when the
  store comes back
Fail open (proceed without coordination) when:
- the work is idempotent and safe to run on every replica, so the coordination was an
  optimisation rather than a correctness control
```

An unstated default is the worst option, and "log the exception and continue" is fail-open
chosen by accident.

## Operational checklist

- [ ] Cluster size is odd; voters sit in at least three failure domains.
- [ ] Backend size and lease/session counts are monitored, with an alert well below the quota.
- [ ] Every read call site has declared linearizable or stale.
- [ ] Every watch consumer re-reads on fire and has a periodic full re-read as a backstop.
- [ ] Every CAS call site distinguishes rejection from timeout.
- [ ] Every consumer has a documented behaviour for "store unreachable", tested by blocking the
      client's network path rather than by mocking the client.
