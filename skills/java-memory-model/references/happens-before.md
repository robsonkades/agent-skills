# Happens-before and publication proofs

## Build the graph

For each execution sketch:

1. Name actions: ordinary/volatile reads/writes, locks/unlocks, start/join, interrupts, external
   actions, and API synchronization actions.
2. Add program-order edges within each thread.
3. Add only synchronization edges guaranteed by JLS or exact API documentation.
4. Take transitive closure where needed.
5. For every read, enumerate candidate writes under JLS allowed-to-see rules.
6. Check the state invariant, not only individual values.

Do not infer an edge from real time, thread names, executor choice, CPU coherence, safepoints, method
calls, logging, exceptions, or “the writer finished first” unless a specified lifecycle action
communicates that fact.

## Publication patterns

### Volatile immutable snapshot

```java
private volatile State state = State.empty();

void replace(Input input) {
    State next = buildImmutable(input);
    state = next;
}

Result read() {
    State snapshot = state;
    return snapshot.result();
}
```

One volatile read selects one internally consistent immutable version. This can replace a lock for
read-dominated replace-whole-state semantics; writes may still need serialization/CAS to avoid lost
updates.

### Lock-guarded invariant

```java
synchronized (lock) {
    balance -= amount;
    sequence++;
}
```

Every access participating in the invariant—including reads—must follow the same guard protocol.
Escaping a mutable reference allows access outside the lock and breaks the proof.

### Concurrent handoff

Queues, futures, executors and concurrent collections publish according to their documented
memory-consistency effects. Quote the exact API clause and ensure the operations used are the ones
forming the handoff. For example, a side channel that reads a field before obtaining the queued
element does not benefit retroactively.

### Class initialization

Static holder initialization is synchronized by JVM class-initialization rules. It is useful for
lazy static state when initialization failure/recursive initialization/class-loader scope are
acceptable. “No hot-path lock” is not “zero cost”; class init and first use still have lifecycle
cost/failure semantics.

## Double-checked initialization

```java
private volatile Resource resource;

Resource resource() {
    Resource r = resource;
    if (r == null) {
        synchronized (lock) {
            r = resource;
            if (r == null) {
                r = create();
                resource = r;
            }
        }
    }
    return r;
}
```

The volatile publication is required. Also define initialization exception/retry, reentrancy,
shutdown and whether duplicate speculative construction is permitted in alternative CAS designs.
Prefer eager or holder initialization when lifecycle permits.

## Final-field freeze versus publication

Final-field semantics provide special visibility for correctly constructed objects even in some
racy publication executions. They do not create a generic synchronizes-with/happens-before edge.
They do not guarantee non-final fields, later mutations, or that a reader sees a non-null reference.

Review reachable mutable objects separately:

```java
final List<String> values;
```

The final reference is fixed. If the list mutates after construction, those mutations need a
concurrency protocol. Use an immutable copy when immutable semantics are intended.

## Common litmus shapes

### Message passing

```text
Writer: data = 1; volatileReady = true
Reader: if (volatileReady) observe data
```

With volatile access on the anchor and order as shown, observing ready true establishes the chain to
the earlier data write. Plain anchor accesses do not.

### Store buffering

```text
T1: x = 1; r1 = y
T2: y = 1; r2 = x
```

Allowed outcomes depend on access modes and JMM rules. Acquire/release operations that do not pair
through an observed synchronization may not establish the total ordering the algorithm expects.
Use `varhandles-and-memory-ordering` and a jcstress test; do not reason solely from x86 instructions.

### Check-then-act

```java
if (!map.containsKey(k)) map.put(k, create());
```

Thread-safe individual methods do not make the sequence atomic. Use an operation whose contract
matches the semantics (`putIfAbsent`, `computeIfAbsent`, lock, immutable update), noting that mapping
functions may run under library-specific contention/retry constraints and must obey their contract.

## Authoritative references

- [JLS 17.4.5: Happens-before order](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4.5)
- [JLS 17.5: Final field semantics](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.5)
- [Java concurrency package memory-consistency properties](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html#MemoryVisibility)
- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
