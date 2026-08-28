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

| Form        | Client that only computes | Client that manipulates structure | Adding a node type              |
| ----------- | ------------------------- | --------------------------------- | ------------------------------- |
| Transparent | Clean                     | Clean, but may throw at runtime   | Silent — nothing breaks         |
| Safe        | Clean                     | `instanceof` + cast at every site | Silent                          |
| Sealed      | Clean                     | Exhaustive `switch`, no cast      | Every `switch` fails to compile |

The last column is the decisive one. In a transparent or safe composite, adding a `SymlinkNode`
compiles everywhere and is silently unhandled by every traversal written before it. In a sealed
one the compiler enumerates the sites.

Use transparent only when node types are contributed by code you do not compile — then the open
interface is the point, and leaves must implement structural operations as documented no-ops
rather than throwing.

## Depth: the failure that reaches production

Recursive traversal of a tree whose depth comes from data will overflow. A JVM default stack
handles a few thousand frames; a nested-JSON payload, a pathological directory structure or a
generated expression tree reaches that easily.

```java
// iterative: depth-independent
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
standard denial-of-service technique against recursive parsers, and the JVM's response —
`StackOverflowError` — can leave a request thread in an indeterminate state, since it may be
thrown anywhere, including inside a `finally`.

## Cycles, identity and parent pointers

A parent pointer turns a tree into a cyclic graph, and three methods then recurse forever:

```java
record Branch(String name, List<Node> children, Branch parent) { }
// equals -> compares parent -> compares its children -> compares this -> ...
```

Rules:

- **Records auto-generate `equals`, `hashCode` and `toString` over every component.** A record
  with a parent component is a stack overflow waiting for its first log statement. Either do not
  use a record, or exclude the parent by writing the three methods by hand.
- **Prefer not to store the parent.** Pass it down during traversal, or keep an external
  `Map<Node, Node>` for the rare operation that needs it. Most parent pointers exist for one
  method that could have taken a path instead.
- **If the parent must be stored**, define equality by identity (`==`) or by a stable id, and
  document that structural equality is not available.
- **Detect cycles when the structure is built from input**, with an identity set on the path.
  Discovering a cycle during traversal is too late; the traversal is where it hangs.

## `equals` and `hashCode` on a recursive structure

Even without cycles, structural equality on a tree is O(n) and recursive, and `hashCode` is worse
because it is called on every map insertion. A large tree used as a `HashMap` key computes its
hash over the whole structure each time unless it is cached.

```java
record Branch(String name, List<Node> children) implements Node {
    // cache is safe only because Branch is deeply immutable
    private static final ClassValue<?> ignored = null;
    ...
}
```

The practical guidance: give tree nodes an identity (an id) and key maps by that; reserve
structural equality for tests and for small trees. If structural equality is genuinely needed on
a large immutable tree, cache the hash in a field computed once at construction — which is only
safe if the tree is deeply immutable, including its `List`.

## Mutation and traversal

```java
// the failure
for (Node child : branch.children()) {
    if (shouldRemove(child)) branch.remove(child);   // ConcurrentModificationException
}
```

That one is loud. The quiet ones are worse: another thread adding a child during a `size()` walk
produces a total that no state of the tree ever had, and a `List` resized mid-iteration can skip
elements without any exception at all.

Options, best first:

1. **Immutable nodes, copy-on-write root.** Mutation produces a new tree sharing unchanged
   subtrees; readers hold a consistent snapshot with no locking, and aggregates can be cached on
   each node at construction.
2. **Copy the children list before iterating.** Cheap and correct for small branches; still
   yields a stale view.
3. **A lock around the whole tree.** Correct, and it serialises every reader — acceptable for
   configuration trees, not for hot data.

`ConcurrentHashMap`-style per-node concurrency is almost always the wrong answer here: the
invariant is over the whole structure, not over one node, so per-node atomicity buys nothing.

## Sharing and double counting

If the same node instance may appear under two parents, the structure is a DAG. Then:

- Aggregations double-count. `size()` over a DAG is not the size of the distinct content.
- Identity-based caches and visited sets are mandatory, not optional.
- "Remove this node" becomes ambiguous — from which parent?

Decide explicitly. If sharing is not intended, enforce it at insertion (a node may have at most
one parent, checked when added). If it is intended, say so and make every operation
identity-aware.

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
