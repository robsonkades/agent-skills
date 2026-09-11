# Visitor against pattern matching

Java 21 partial examples, no preview. Imports and supporting types are omitted; separate the
classical and sealed alternatives into different compilation units. Recursive folds require a
validated stable structure and bounded work. See worked-example.md for owned collection guards.

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
  − each operation needs valid specialized or fallback handling of a new element type
```

Choose from actual type/API evolution: AST and document schemas can change frequently too.
An established accept protocol can justify Visitor independently of predicted operation counts.

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
interface (N), and N implementations per visitor (N×M). A new type normally adds its class/accept,
one interface method and one method in each of M visitors; it need not edit all N existing elements.
Declaration counts are not a measurement of readability or development cost.

Double dispatch is the reason: `node.accept(visitor)` dispatches on the node's runtime type, and
`visitor.visitText(this)` dispatches on the visitor's — two virtual calls to reach one behaviour
that depends on both types.

## Modern, and what it removes

```java
public sealed interface Node permits Node.Text, Node.Image, Node.Section {
    record Text(String value) implements Node { }
    record Image(URI source, String alt) implements Node { }
    record Section(String title, List<Node> children) implements Node { }
}

static int wordCount(Node node) {
    return switch (node) {
        case Text(String value) -> words(value);
        case Image image -> 0;
        case Section(var title, var children) ->
                words(title) + children.stream().mapToInt(VisitorOps::wordCount).sum();
    };
}
```

Place this fold in VisitorOps and import the nested Node types. For this illustration, words means
runs of non-whitespace under Character.isWhitespace; the worked example supplies a counter.
Empty text counts zero. This is not a locale-aware billing word definition; define that separately.

Removed: the `Visitor` interface, three `accept` methods, and a visitor class per operation. Kept:
coverage feedback when consumers recompile. Adding an uncovered permitted type requires updating
this exhaustive switch; a `default` or covering type pattern can absorb it without specialization.
An old binary may still link but throw `MatchException` when it encounters the new type.

Record patterns invoke the record component accessors, including custom accessor behavior.
They do not restore encapsulation or justify exposing internal components. Both mechanisms need
an intentional public representation or narrow model operations.

## Where classical Visitor still wins

| Situation                                           | Why the switch does not serve                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Library-owned element types                         | They may already be sealed and accessible; otherwise inspect provided dispatch and fallback policy |
| Established accept/visitor protocol                 | ElementVisitor and ANTLR accept; FileVisitor/ASM use related callback protocols                    |
| Third parties add element types                     | Classical fixed visit methods also need protocol evolution or generic/extension fallback           |
| The traversal is part of what varies                | A visitor object can control its own descent; a `switch` is one level                              |
| An operation needs per-traversal setup and teardown | Natural on a visitor object; awkward as a free function                                            |

Classical Visitor checks implementations only when the interface actually gains a new abstract
method and consumers recompile. A plugin may reuse an existing visit method or generic fallback;
no automatic completeness guarantee follows from the pattern name. Existing binaries need a
compatibility policy, not merely a successful rebuild of new source.

For example, Java 17 `ElementVisitor` has default `visitModule` (since 9) and
`visitRecordComponent` (since 16) methods that call `visitUnknown`. Inspect the actual implementation
or versioned utility visitor: it may reject rather than understand the new construct. In a custom
API, adding an abstract visit method can preserve binary linkage while invoking it on an old
implementation throws `AbstractMethodError`. A suitable default can supply a fallback instead;
method conflicts and semantic compatibility still need review. Test supported old paths, new-kind
dispatch and recompilation separately.

A default method matters when new visit methods delegate to it; merely declaring an unused
visitDefault does not change dispatch. For unsupported semantic nodes, prefer explicit rejection
or an Unknown result. Logging and returning null can still silently corrupt the operation.

## Stateful visitors, and the fold that replaces them

```java
// mutable, single-use, unsafe to share, and easy to inject as a singleton by mistake
class WordCountVisitor implements Visitor<Void> {
    private int count;                                   // state across visits
    public Void visitText(Text t) { count += words(t); return null; }
    public int result() { return count; }
}
```

Three problems: it cannot be reused without a reset, two traversals cannot run concurrently, and
the result is retrieved out-of-band so the type says nothing about it.

```java
// a fold: the result is returned; input/helper ownership still determines sharing
static int wordCount(Node node) { ... }
```

Where accumulation is genuinely needed, pass it explicitly or use a `Collector`, whose supplied functions must satisfy identity and
associativity for parallel reduction (the API does not make arbitrary functions associative):

```java
static <R> R fold(Node node, Function<Text, R> onText, BinaryOperator<R> combine) { ... }
```

If a visitor must keep state — a symbol table, a scope stack, a diagnostic list — create one per
traversal and say so in its Javadoc. Shared use needs deliberate synchronization/reentrancy and
result ownership; simply registering the mutable example as a singleton is unsafe.

## Separating traversal from operation

Both forms conflate two things by default: how the structure is walked, and what is done at each
node.

```java
// walking, once
static Stream<Node> preOrder(Node root) { ... }
static Stream<Node> postOrder(Node root) { ... }

// operations, over any walk
int words = preOrder(root).mapToInt(VisitorOps::wordCountOf).sum();
```

Worth doing when several operations need different orders, or when pruning matters ("do not descend
into collapsed sections"). When mapping a walk, wordCountOf must count only the current node;
calling a recursive wordCount for each visited node double-counts descendants. Java's `FileVisitor` shows the alternative: the visitor returns a
`FileVisitResult` to control descent, which keeps traversal in the framework and gives the visitor
a say. Either is fine; share walking where it removes actual duplication, while retaining an
operation's own descent when pruning or other semantics justify it.

## Depth and untrusted structures

A recursive fold over a document tree from an external source is a stack-overflow surface. Bound
depth, nodes, text/row sizes and output at parsing and direct/deserialized construction boundaries.
A recursive pre-validator can itself overflow; use a bounded iterative guard where needed.
Traverse iteratively when depth cannot be safely bounded (`gof-composite`). `StackOverflowError` can be thrown at any point, including inside a
`finally`, so it is not a failure mode to leave to chance in request-handling code.

## Unknown element types across a boundary

When documents, ASTs or protocol trees arrive from another service, a newer producer may send a
node type this consumer does not know; inspect version negotiation and supported inputs.

```text
Reject the whole document        correct when acting on a partial
                                 understanding is harmful — policy
                                 documents, pricing trees, filters

Model an Unknown(String type,    correct when the consumer can defer or
  JsonNode raw) variant          pass it through; each operation still needs
                                 a valid policy for it

Skip it                          only when that operation explicitly permits
                                 incomplete output. Ignoring a constraint may
                                 widen matches; a pricing fold can drop a charge
```

The `Unknown` variant is the underused option: it keeps the hierarchy sealed, keeps the switch
exhaustive, and exposes "what do we do about unrecognised nodes" to each operation. Catch-alls can
still hide missing specialization; test actual rejection, preservation or permitted omission
(`rpc-and-api-contracts`).

Primary sources: [Java 21 record patterns call accessors](https://docs.oracle.com/en/java/javase/21/language/record-patterns.html),
[Java 21 switch coverage and version skew](https://docs.oracle.com/en/java/javase/21/language/pattern-matching-switch.html),
[Java 17 ElementVisitor evolution](https://docs.oracle.com/en/java/javase/17/docs/api/java.compiler/javax/lang/model/element/ElementVisitor.html),
[Java 21 binary compatibility](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html),
[FileVisitor protocol](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/file/FileVisitor.html),
and [Collector identity/associativity contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/Collector.html).
