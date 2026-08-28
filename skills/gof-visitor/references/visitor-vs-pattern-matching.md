# Visitor against pattern matching

## The two directions, worked through

Element types: `Text`, `Image`, `Section`. Operations: `render`, `wordCount`, `validate`.

```text
Methods on elements
    Text.render()      Text.wordCount()      Text.validate()
    Image.render()     Image.wordCount()     Image.validate()
    Section.render()   Section.wordCount()   Section.validate()

  + a new element type (Table) is one new class
  − a new operation (toPlainText) edits all three classes, and adds a
    concern to a model that should be about documents

Visitor / exhaustive switch
    render(Node)       wordCount(Node)       validate(Node)
      switch over three cases, each

  + a new operation is one new function; the model is untouched
  − a new element type must be handled by all three functions
```

The choice is a bet on which change arrives. Element sets in ASTs, protocol messages and document
models are stable for years while operations accumulate — which is why those domains use Visitor
and most business domains do not.

## Classical, and its boilerplate count

```java
public interface Node {
    <R> R accept(Visitor<R> visitor);
}

public interface Visitor<R> {
    R visitText(Text text);
    R visitImage(Image image);
    R visitSection(Section section);
}

public record Text(String value) implements Node {
    public <R> R accept(Visitor<R> v) { return v.visitText(this); }
}
public record Image(URI source, String alt) implements Node {
    public <R> R accept(Visitor<R> v) { return v.visitImage(this); }
}
public record Section(String title, List<Node> children) implements Node {
    public <R> R accept(Visitor<R> v) { return v.visitSection(this); }
}
```

For N element types and M operations: one `accept` per element (N), one `visit` per element on the
interface (N), and N implementations per visitor (N×M). Adding an element type touches N + M + 1
places.

Double dispatch is the reason: `node.accept(visitor)` dispatches on the node's runtime type, and
`visitor.visitText(this)` dispatches on the visitor's — two virtual calls to reach one behaviour
that depends on both types.

## Modern, and what it removes

```java
public sealed interface Node permits Text, Image, Section {
    record Text(String value) implements Node { }
    record Image(URI source, String alt) implements Node { }
    record Section(String title, List<Node> children) implements Node { }
}

static int wordCount(Node node) {
    return switch (node) {
        case Text(String value) -> value.split("\\s+").length;
        case Image image -> 0;
        case Section(var title, var children) ->
                title.split("\\s+").length + children.stream().mapToInt(Visitor::wordCount).sum();
    };
}
```

Removed: the `Visitor` interface, three `accept` methods, and a visitor class per operation. Kept:
the compile-time guarantee — no `default`, so `case Table t` is required the moment `Table` joins
the `permits` clause, at every `switch`.

Record deconstruction removes something else that matters: the pressure to expose internals.
Classical Visitor forces elements to publish accessors for everything any visitor might need;
`case Text(String value)` binds the component without an accessor call.

## Where classical Visitor still wins

| Situation                                            | Why the switch does not serve                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Element types come from a library you do not compile | You cannot seal them, so a `switch` needs a `default`                             |
| The library's API **is** `accept(Visitor)`           | `FileVisitor`, `ElementVisitor`, ASM's `ClassVisitor`, ANTLR's generated visitors |
| Third parties add element types at runtime           | No closed set exists to be exhaustive over                                        |
| The traversal is part of what varies                 | A visitor object can control its own descent; a `switch` is one level             |
| An operation needs per-traversal setup and teardown  | Natural on a visitor object; awkward as a free function                           |

For an open hierarchy, the classical form with a `default`-free visitor interface is still the best
available completeness check: adding an element type breaks every visitor implementation at
compile time, provided nobody adds a default `visit`.

```java
// this line converts a compile error into a silent gap for every future element type
default R visitDefault(Node node) { return null; }
```

Add it only when third parties implement your visitor interface and a breaking change is genuinely
unacceptable — and then log the default case rather than returning silently.

## Stateful visitors, and the fold that replaces them

```java
// order-dependent, single-use, unsafe to share, and easy to inject as a singleton by mistake
class WordCountVisitor implements Visitor<Void> {
    private int count;                                   // state across visits
    public Void visitText(Text t) { count += words(t); return null; }
    public int result() { return count; }
}
```

Three problems: it cannot be reused without a reset, two traversals cannot run concurrently, and
the result is retrieved out-of-band so the type says nothing about it.

```java
// a fold: the result is the return value, nothing is shared
static int wordCount(Node node) { ... }
```

Where accumulation is genuinely needed, pass it explicitly or use a `Collector`, which also gives
associativity for parallel traversal:

```java
static <R> R fold(Node node, Function<Text, R> onText, BinaryOperator<R> combine) { ... }
```

If a visitor must keep state — a symbol table, a scope stack, a diagnostic list — create one per
traversal and say so in its Javadoc. Registering it as a singleton bean is a live bug.

## Separating traversal from operation

Both forms conflate two things by default: how the structure is walked, and what is done at each
node.

```java
// walking, once
static Stream<Node> preOrder(Node root) { ... }
static Stream<Node> postOrder(Node root) { ... }

// operations, over any walk
int words = preOrder(root).mapToInt(Visitor::wordCountOf).sum();
```

Worth doing when several operations need different orders, or when pruning matters ("do not descend
into collapsed sections"). Java's `FileVisitor` shows the alternative: the visitor returns a
`FileVisitResult` to control descent, which keeps traversal in the framework and gives the visitor
a say. Either is fine; duplicating the traversal inside every operation is not.

## Depth and untrusted structures

A recursive fold over a document tree from an external source is a stack-overflow surface. Bound
the depth where the structure is parsed, and traverse iteratively where depth is genuinely
unbounded (`gof-composite`). `StackOverflowError` can be thrown at any point, including inside a
`finally`, so it is not a failure mode to leave to chance in request-handling code.

## Unknown element types across a boundary

When documents, ASTs or protocol trees arrive from another service, a node type you do not know
will eventually appear.

```text
Reject the whole document        correct when acting on a partial
                                 understanding is harmful — policy
                                 documents, pricing trees, filters

Model an Unknown(String type,    correct when the consumer can defer or
  JsonNode raw) variant          pass it through; forces every switch to
                                 decide what to do about it

Skip it                          almost never. A filter that ignores an
                                 unknown node matches more than it should;
                                 a pricing fold drops a charge
```

The `Unknown` variant is the underused option: it keeps the hierarchy sealed, keeps the switch
exhaustive, and turns "what do we do about unrecognised nodes" into a decision every operation must
state (`rpc-and-api-contracts`).
