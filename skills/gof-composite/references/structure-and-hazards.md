# Structure and hazards of a composite

## Transparent, safe, sealed — the same tree three ways

Alternative partial Java 21 sketches: the repeated declarations are separate designs, and imports
are omitted. The sealed size example counts nonnegative bytes once per path and rejects a total
outside `long`; its recursive method is for validated, bounded-depth input.

```java
// Transparent: one type, leaves throw
interface Node {
    long size();
    void add(Node child);       // Leaf: throw new UnsupportedOperationException()
}

// Safe: honest types, clients cast
interface Node { long size(); }
final class Branch implements Node { void add(Node child) { ... } }

// Sealed: honest types, no cast, exhaustive dispatch
sealed interface Node permits Leaf, Branch {
    long size();
}
record Leaf(String name, long bytes) implements Node {
    Leaf {
        if (bytes < 0) throw new IllegalArgumentException("negative byte size");
    }
    public long size() { return bytes; }
}
record Branch(String name, List<Node> children) implements Node {
    Branch { children = List.copyOf(children); }
    public long size() {
        long total = 0;
        for (Node child : children) total = Math.addExact(total, child.size());
        return total;
    }
}
```

| Form        | Client that only computes | Client that manipulates structure | Adding a node type                |
| ----------- | ------------------------- | --------------------------------- | --------------------------------- |
| Transparent | Clean                     | Optional mutation may refuse      | Depends on operation contract     |
| Safe        | Clean                     | Branch/capability access          | Depends on operation contract     |
| Sealed      | Clean                     | Exhaustive `switch`, no cast      | Recheck exhaustiveness on rebuild |

An interface-based traversal may already handle a new subtype through its shared operation;
manual type enumeration can miss it. With a sealed hierarchy, recompilation rejects switches whose
coverage is no longer exhaustive, while fallback/total patterns may still compile. Old binaries
are not updated automatically and may throw `MatchException` for a new unmatched subtype.

Choose transparent mutation only when the consumer contract deliberately permits optional
operations and handles refusal; Java's collection interfaces demonstrate that distinction.
Plugin extensibility does not require mutation on leaves. A separate mutable-branch capability
often avoids runtime refusal; silently ignoring a requested add/remove can lose work.

## Depth: the failure that reaches production

Data-controlled depth can exceed the available call stack. There is no portable safe frame count:
the build, thread kind, method shape and stack configuration matter. An enforced small depth bound
may make recursion adequate; otherwise use an iterative walk with explicit resource bounds.

```java
// For validated, bounded, acyclic input; shared nodes contribute once per path.
// Iterative: no recursive call stack; pending nodes still consume memory.
static long size(Node root) {
    long total = 0;
    Deque<Node> stack = new ArrayDeque<>();
    stack.push(root);
    while (!stack.isEmpty()) {
        switch (stack.pop()) {
            case Leaf leaf -> total = Math.addExact(total, leaf.bytes());
            case Branch branch -> branch.children().forEach(stack::push);
        }
    }
    return total;
}
```

Both size implementations reject overflow with `ArithmeticException` through
[`Math.addExact`](<https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Math.html#addExact(long,long)>).
Depth and node-count limits alone do not establish a safe numeric range: two nonnegative leaves
can already overflow `long`. Preserve the application's chosen failure contract or use a wider
representation when larger exact totals are required.

And bound the depth where the tree is built from input you do not control:

```java
static final int MAX_DEPTH = 64;

static Node parse(JsonNode json, int depth) {
    if (depth > MAX_DEPTH) throw new StructureTooDeep(MAX_DEPTH);
    ...
}
```

A depth limit at the boundary is a security control, not a nicety: deeply nested documents are a
denial-of-service input against recursive parsers. `StackOverflowError` aborts the affected
operation and can also disrupt cleanup code that requires more stack; it is not an input-validation
strategy or proof the entire JVM must terminate.

The `JsonNode` sketch checks domain construction only after JSON parsing. Configure limits in the
actual parser before building that tree, and bound bytes, node count and fan-out as well as depth.
An explicit deque avoids call-stack overflow but does not bound total work or pending-node memory.

## Cycles, identity and parent pointers

Traversable child-to-parent back-references create cycles in the object graph. Methods that
recursively follow both directions can fail to terminate:

```java
record Branch(String name, List<Node> children, Branch parent) { }
// equals -> compares parent -> compares its children -> compares this -> ...
```

Rules:

- **Record methods include every component by default.** The failure requires a cycle actually
  followed by the component operations; a parent field alone is not proof. Self-equality may
  short-circuit even when structural hashing or rendering overflows. Omit cyclic components from
  structural methods only when that preserves the required equality contract; see the record
  invariant below.
- **Prefer passing the current path when it supplies the needed parent.** An external
  identity-keyed `IdentityHashMap<Node, Node>` can index a single-parent tree without recursively
  hashing its keys. It cannot retain multiple parents of a shared node: a later `put` replaces
  the earlier mapping. For shared structures, retain the required parent/edge occurrences or
  pass the path for this traversal. Stable-ID keys are another option when their uniqueness and
  lifetime are defined. See the [identity-map contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/IdentityHashMap.html).
- **If the parent must be stored**, exclude the back-reference from structural operations or
  use stable-ID semantics only as allowed by the consumer contract. Identity-based traversal
  bookkeeping does not require replacing node equality with `==`.
- **Reject forbidden cycles at construction**, using active-path identity rather than equality
  or a global set that also rejects legal sharing. Mutable/external graphs may change later;
  operation-specific visited/path guards and work limits must then prevent hangs at traversal too.

## `equals` and `hashCode` on a recursive structure

Generated structural methods may visit descendants recursively even when the business traversal
is iterative. An acyclic tree can still overflow the stack during equality, hashing or rendering.
Equality may short-circuit; an uncached structural hash may traverse the entire tree on each
lookup/insertion. For shared DAGs, repeated descendant expansion can cost far more than the number
of distinct nodes. Assess the actual method and structure rather than ranking hashing as always worse.

Preserve required value equality: replacing it with IDs can change map lookup, set membership and
deduplication behavior. Use identity-keyed maps for traversal metadata, or stable-ID keys for
entity-oriented operations whose contract calls for them. When large value trees need structural
comparison, use bounded/iterative algorithms and test equal-but-distinct instances, required
sharing semantics and deep inputs. A cached hash is not proof of equality; collisions still need
comparison. The [Object contracts](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html)
govern equality and hashing together.

Cache a structural hash only while equality-relevant state remains immutable. Bound external cache
retention and avoid structural keys that recursively compute the hash being cached. Records cannot
declare an extra instance cache field; an ordinary immutable class or external identity-keyed cache
can hold it. A record must also preserve its copy invariant: reconstructing it from its component
accessors produces an equal value. Overriding a record's `equals` with reference-only `==` violates
that invariant; see [Record](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Record.html).

## Mutation and traversal

```java
// the failure
for (Node child : branch.children()) {
    if (shouldRemove(child)) branch.remove(child);   // ConcurrentModificationException
}
```

That one is loud. The quiet ones are worse: another thread adding a child during a `size()` walk
can produce a total that no state of the tree ever had, and a `List` resized mid-iteration can skip
elements without any exception at all.

Choose according to the operation's consistency contract:

1. **Immutable nodes, copy-on-write root.** Mutation produces a new tree sharing unchanged
   subtrees; safely publish the deeply immutable root and read it once per operation. Pure
   snapshot aggregates can be cached; external inputs need their own version/invalidation contract.
2. **Copy under the same synchronization used by writers.** This gives a branch snapshot,
   not automatically a coherent whole-tree snapshot; independently copied branches can mix versions.
3. **Synchronization covering the tree invariant.** A mutex serializes access; an appropriate
   read/write lock can permit multiple readers while excluding writers. Account for contention,
   callbacks and lock ordering rather than rejecting locks by workload label alone.

Per-node concurrency alone does not preserve a whole-tree invariant. It can be adequate for an
explicitly weak view, or participate in a version/retry protocol that establishes the required
consistency. Fail-fast exceptions are best-effort diagnostics, not synchronization guarantees.

## Sharing and double counting

If the same node instance appears under two parents, it is shared structure; it is a DAG only if
acyclicity also holds. Then:

- Per-path aggregation repeats shared contributions intentionally; distinct-node aggregation
  needs a different traversal. Equal values and identical node instances are not interchangeable.
- For distinct-node aggregation, use an identity visited set. For per-path aggregation, a global
  visited set would suppress legitimate repeated contributions; use a path-active set for cycles.
- "Remove this node" becomes ambiguous — from which parent?

Decide explicitly. If sharing is not intended, enforce it at insertion (a node may have at most
one parent, checked when added). If it is intended, say so and make every operation
identity-aware.

A compact acyclic shared graph can still have exponentially many paths. Bound the work appropriate
to the selected semantics; node-count and depth bounds alone may not bound a per-path walk.

## Lazy children and the database

A composite whose `children()` triggers a query is an N+1 generator: a walk over a thousand
nodes is a thousand round trips, and the code that causes it looks like a harmless loop.

```text
Options
  load the whole subtree in one query and build the composite in memory
  store a materialised path or nested-set encoding and query by range
  use a recursive CTE and map the result set to nodes
  do not model it as a composite; expose the operations the domain needs
```

The last one is often correct. "Total permissions for this user" is a query, and answering it by
walking an object tree is a design that chose a shape before a workload
(`orm-behavioral-patterns`).

Primary contract checks: [MatchException on Java 21](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/MatchException.html)
describes separate-compilation anomalies; [Collection](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collection.html)
defines optional operations; [ArrayList](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html)
qualifies fail-fast behavior. These do not establish a particular application's graph policy.
