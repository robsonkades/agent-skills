# Java snapshot resolver

Read when a cache implementation or contract test must distinguish fresh membership,
bounded stale membership, authoritative empty and unavailable state. Prefer the maintained
provider/client implementation when it already meets the contract. The example teaches
publication and expiry decisions; adopting it is not a production recommendation.

## Executable example and exact limits

[SnapshotResolverExample.java](../assets/SnapshotResolverExample.java) is executable,
dependency-free Java 21 code. It resolves one fixed service/authority epoch into an
immutable set; it performs no network I/O, endpoint selection or background refresh.
No preview flags or external libraries are required. Compile with a JDK supporting
`--release 21`; run on Java 21 or newer. For example, from this skill's directory:

```text
javac --release 21 -d .validation assets/SnapshotResolverExample.java
java -cp .validation SnapshotResolverExample
```

`.validation` is disposable compiler output; do not include it in the package. The
authoring check used javac 25.0.3 with `--release 21` and Temurin runtime 25.0.3. This checks
Java 21 language/API compatibility and the exercised behavior on runtime 25, not execution
on runtime 21. The main method throws on failed checks; it does not depend on `-ea`.

The custom source contract is deliberately narrow:

- The constructor fixes the authority epoch. Migration creates a new resolver and retires
  old callbacks; changing an epoch string is an explicit owner action, not automatic
  acceptance of an unknown source.
- `accept` receives a complete, validated snapshot with a nonnegative, ordered `long`
  revision from that source. It rejects older revisions and conflicting membership at the
  same revision. These are not wall-clock timestamps, DNS serials or Kubernetes tokens.
- `revalidated=true` means a successful authoritative re-read has confirmed that exact
  snapshot under the source's consistency contract. Only then may an identical revision
  renew its age. A replay, watch reconnect or cached `DiscoveryClient` result is not such
  evidence. The adapter must bound/serialize revalidation and account for source/transport
  age; this local cache cannot verify provenance from a boolean.
- An authoritative empty snapshot replaces positive membership and uses a separate
  negative TTL. It is never served stale here; after expiry, the answer is unavailable,
  not proof that the service still has no members. Lookup failure calls no update method.
- Freshness uses elapsed monotonic time. `resolve` takes an explicit operation policy,
  allowing fresh-only and bounded-stale callers to share one snapshot without confusing
  their requirements. A hard authorization/revocation deadline also requires a source
  and identity mechanism that enforce it; even a locally fresh snapshot is not that proof.
- `staleAllowance` is additional time after `positiveTtl`; maximum positive age is their
  sum. This is the example's own contract. Java's DNS stale-cache property has different
  semantics; use [Source and client semantics](source-and-client-semantics.md) when mapping
  a freshness requirement to actual resolver configuration.

`synchronized` serializes compare-and-publish and reads, and defensive copies prevent
caller mutation. The critical section contains no source I/O. The supplied URI predicate
must be pure, bounded and nonblocking. Timers must be monotonic with intervals below
half the signed-long range; elapsed subtraction follows the
[System.nanoTime contract](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/System.html#nanoTime()>).
No throughput claim follows from this implementation; concurrency checks exercise racing
updates, not a performance benchmark or exhaustive scheduling proof.

The example enforces a maximum endpoint count and uses a strict test destination allowlist.
That rejects hostile records but does not implement TLS, DNS-rebinding defenses,
redirect policy, registry authentication or per-operation authorization. A real source
adapter must enforce those boundaries and limit payload size before materializing a list.
For many service keys, additionally bound key count and lifecycle; this fixture has one key.

## What the checks demonstrate

The executable covers unavailable bootstrap, defensive copies, expiry at exact boundaries,
policy-dependent stale use, repeated failure without age extension, duplicate/reordered
updates, explicit same-revision revalidation, authoritative removal and recovery, rejection
of an old authority, conflicting revisions and hostile endpoints, and concurrent updates
whose maximum accepted revision must win. These checks validate this local state machine.

For a real integration, additionally verify cancellation of source I/O, scheduler/watch
shutdown, refresh coalescing under load, provider freshness, DNS negative-cache recovery,
and established-connection behavior. Keep those unexecuted results separate from the
example's checks and from evaluations of an agent applying this skill.
