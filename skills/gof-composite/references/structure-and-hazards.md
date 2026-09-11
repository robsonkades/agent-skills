# Structure and hazards of a composite

## Transparent, safe, sealed — the same tree three ways

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
    public long size() { return bytes; }
}
record Branch(String name, List<Node> children) implements Node {
    Branch { children = List.copyOf(children); }
    public long size() { return children.stream().mapToLong(Node::size).sum(); }
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
            case Leaf leaf -> total += leaf.bytes();
            case Branch branch -> branch.children().forEach(stack::push);
        }
    }
    return total;
}
```

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
  structural methods or choose explicit identity/ID semantics where appropriate.
- **Prefer not to store the parent.** Pass it down during traversal, or keep an external
  identity-keyed `IdentityHashMap<Node, Node>` or stable-ID map for operations that need it;
  a structural HashMap key can recursively hash the same tree. Most parent pointers exist for one
  method that could have taken a path instead.
- **If the parent must be stored**, exclude the back-reference from structural operations or
  use identity (`==`)/stable-ID semantics, according to the consumer contract. Document that choice.
- **Reject forbidden cycles at construction**, using active-path identity rather than equality
  or a global set that also rejects legal sharing. Mutable/external graphs may change later;
  operation-specific visited/path guards and work limits must then prevent hangs at traversal too.

## `equals` and `hashCode` on a recursive structure

Even without cycles, structural equality on a tree is O(n) and recursive, and `hashCode` is worse
because it is called on every map insertion. A large tree used as a `HashMap` key computes its
hash over the whole structure each time unless it is cached.

The practical guidance: give tree nodes an identity (an id) and key maps by that; reserve
structural equality for tests and for small trees. If structural equality is genuinely needed on
a large immutable tree, cache the hash in a field computed once at construction — which is only
safe if the tree is deeply immutable, including its `List`. A record cannot declare an extra
instance cache field: use an ordinary immutable class or an external identity-based cache.

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
