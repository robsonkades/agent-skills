# Worked example: an organisational permission tree

Permissions are granted at any level of an org unit tree and inherited downward, with an explicit
deny overriding an inherited grant. The client asks one question — "may this user do X on this
unit?" — and does not care whether the answer came from the unit itself or from six levels up.

## Before — transparent composite with a throwing leaf

```java
public interface OrgNode {
    Decision decide(User user, Action action);
    void add(OrgNode child);          // Team cannot do this
    List<OrgNode> children();         // Team returns emptyList
}

public final class Team implements OrgNode {
    @Override public void add(OrgNode child) {
        throw new UnsupportedOperationException("a team has no children");
    }
    @Override public List<OrgNode> children() { return List.of(); }
}
```

Two problems. The interface promises what a `Team` cannot deliver, so the failure is a runtime
exception in whatever generic code trusted the type. And when `Contractor` was later added as a
third node kind, every existing traversal compiled and silently ignored it.

## After — sealed nodes

```java
public sealed interface OrgNode permits Team, Division {

    String name();

    /** The node's own explicit rules, without inheritance. */
    Optional<Decision> ownDecision(User user, Action action);
}

public record Team(String name, List<Rule> rules) implements OrgNode {
    public Team { rules = List.copyOf(rules); }
    public Optional<Decision> ownDecision(User user, Action action) { ... }
}

public record Division(String name, List<Rule> rules, List<OrgNode> children) implements OrgNode {
    public Division {
        rules = List.copyOf(rules);
        children = List.copyOf(children);
    }
    public Optional<Decision> ownDecision(User user, Action action) { ... }
}
```

The shared operation is on the interface; `children` exists only where it means something.
Structural code switches exhaustively:

```java
static Stream<OrgNode> childrenOf(OrgNode node) {
    return switch (node) {
        case Team t -> Stream.of();
        case Division d -> d.children().stream();
    };
}
```

Adding `Contractor` now breaks this method at compile time, which is the point.

## The resolver — iterative, depth-bounded, deny-wins

```java
public final class PermissionResolver {

    private static final int MAX_DEPTH = 32;

    /** Walks from the root down to the target, applying inheritance; deny beats grant. */
    public Decision decide(Division root, Path path, User user, Action action) {
        Decision effective = Decision.DENY;          // closed by default
        OrgNode current = root;
        int depth = 0;

        for (String segment : path.segments()) {
            if (++depth > MAX_DEPTH) throw new StructureTooDeep(MAX_DEPTH);
            effective = current.ownDecision(user, action).orElse(effective);
            if (effective == Decision.EXPLICIT_DENY) return effective;
            current = childNamed(current, segment)
                    .orElseThrow(() -> new UnknownOrgUnit(segment));
        }
        return current.ownDecision(user, action).orElse(effective);
    }
}
```

Three deliberate choices:

- **Iterative, over a path.** The question is about one unit, so the walk is a single descent —
  no recursion, no stack risk, and the cost is the depth rather than the size of the tree. Where
  a full-tree operation is genuinely needed, use an explicit `ArrayDeque`, not recursion.
- **Default deny.** The composite's uniform interface makes "no rule found" easy to overlook; an
  authorisation walk that returns `GRANT` for an unmatched path is the classic failure.
- **Explicit deny short-circuits.** The precedence rule lives in the walk, in one place, rather
  than being distributed across node types where it would be re-implemented differently.

## Caching an aggregate, safely

Resolution is on the request path, so the effective rule set per (unit, user) is cached. That is
only sound because the nodes are deeply immutable:

```java
private final Map<CacheKey, Decision> cache = new ConcurrentHashMap<>();

public Decision decide(Division root, Path path, User user, Action action) {
    return cache.computeIfAbsent(new CacheKey(root.version(), path, user.id(), action),
                                 k -> compute(root, path, user, action));
}
```

`root.version()` is in the key because the tree is replaced wholesale on change:

```java
private volatile Division root;      // reassigned on reload; never mutated in place
```

Had the tree been mutable, this cache would serve decisions from a structure that no longer
exists — an authorisation bug that is invisible until an audit. Immutability plus a versioned
root is what makes the cache correct; it is not an optimisation bolted onto a mutable design.

## What was rejected

- **Parent pointers on nodes.** They were proposed so a node could resolve its own inheritance.
  Records with a parent component make `equals`, `hashCode` and `toString` recurse forever, and
  the first `log.debug("{}", node)` would have taken the process down. Passing the accumulated
  decision down the walk gives the same answer with no cycle.
- **Lazy children from the database.** `children()` hitting a repository would have turned each
  authorisation check into a chain of queries. The whole tree is small — thousands of nodes —
  and is loaded once per version in a single query.
- **A generic `visit(Visitor)` on the interface.** There is one operation over this tree, and it
  is the one the interface already exposes. Visitor becomes worth its cost at three or four
  distinct operations (`gof-visitor`).

## Property tests

```java
@Property
void inherited_grant_is_overridden_by_an_explicit_deny(@ForAll("orgTrees") Division root,
                                                       @ForAll Path path) { ... }

@Property
void decision_is_deny_when_no_rule_matches(@ForAll("orgTrees") Division root) { ... }

@Test
void a_chain_deeper_than_the_limit_is_rejected_rather_than_overflowing() {
    var deep = chainOfDepth(MAX_DEPTH + 1);
    assertThatThrownBy(() -> resolver.decide(deep, pathOfDepth(MAX_DEPTH + 1), user, READ))
            .isInstanceOf(StructureTooDeep.class);
}
```

The last test is the one that matters most and is written least often: it asserts that the
pathological shape produces a domain error rather than a `StackOverflowError` — the difference
between a rejected request and an unpredictable failure somewhere inside the request thread.
