# Worked example: an organisational permission tree

Permissions are granted at any level of an org unit tree and inherited downward, with an explicit
deny overriding an inherited grant. The client asks one question — "may this user do X on this
unit?" — and does not care whether the answer came from the unit itself or from six levels up.

Partial Java 21 sketches: imports, rule implementations, path lookup and testing-library fixtures
are omitted. Here explicit deny is sticky across all ancestors; that is this example's chosen
policy, not a universal authorization rule. Child names are unique within each division.

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
        var segments = List.copyOf(path.segments());
        if (segments.size() > MAX_DEPTH) throw new StructureTooDeep(MAX_DEPTH);
        Decision effective = Decision.DENY;          // closed by default
        OrgNode current = root;

        for (String segment : segments) {
            if (effective != Decision.EXPLICIT_DENY) {
                effective = current.ownDecision(user, action).orElse(effective);
            }
            current = childNamed(current, segment)
                    .orElseThrow(() -> new UnknownOrgUnit(segment));
        }
        return effective == Decision.EXPLICIT_DENY ? effective
                : current.ownDecision(user, action).orElse(effective);
    }
}
```

Three deliberate choices:

- **Iterative, over a path.** The question is about one unit, so the walk is a single descent —
  no recursive call-stack growth. Lookup cost is O(depth) only with bounded/constant-time child
  lookup; linear child-list searches also pay fan-out at each level. Where
  a full-tree operation is genuinely needed, use an explicit `ArrayDeque`, not recursion.
- **Default deny.** The composite's uniform interface makes "no rule found" easy to overlook; an
  authorisation walk that returns `GRANT` for an unmatched path is the classic failure.
- **Explicit deny stays sticky.** Rule evaluation can stop, but this example still validates the
  full path. Excessive depth and missing units are rejected even beneath a denied ancestor.

## Caching an aggregate, safely

Caching needs more than an immutable tree. Snapshot the tree and all decision-relevant subject
attributes; tenant, roles/membership, resource attributes, policy revision and time-based rules
can change independently of user ID. Cache only when the key/invalidation policy covers them:

```java
private final Map<CacheKey, Decision> cache = new ConcurrentHashMap<>();

public Decision decide(PolicySnapshot policy, Path path, SubjectSnapshot subject, Action action) {
    var key = new CacheKey(policy.tenant(), policy.version(), path, subject.id(),
                           subject.authorizationVersion(), action);
    return cache.computeIfAbsent(key, k -> compute(policy.root(), path, subject, action));
}
```

`PolicySnapshot` is a wrapper containing tenant, version and immutable root; version is not a
method on the `Division` record above. Publish the wrapper atomically and read it once per decision:

```java
private volatile PolicySnapshot policy; // replace snapshot on reload
```

Had the tree been mutable, this cache would serve decisions from a structure that no longer
exists. Deep immutability plus complete versioned inputs permits caching; bound retention and
invalidate on revocation. Include expiry for time-dependent decisions, or do not cache them.

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
