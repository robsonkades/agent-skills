# Worked example: a document model with four operations

A publishing service models documents as a tree: text runs, images, tables and sections. Four
operations run over it — render to HTML, count words for billing, validate against a house style,
and extract a plain-text summary for search indexing.

Four operations, four stable element types. The expression problem points clearly one way.

## Before — an operation per element class

```java
public interface Node {
    String renderHtml();
    int wordCount();
    List<StyleIssue> validate(StyleGuide guide);
    String plainText();
}
```

Every element class carried HTML knowledge, billing knowledge, style knowledge and indexing
knowledge. Adding "estimate print cost" meant editing four classes, and `Text` — a record wrapping
a `String` — had become a 200-line class that imported an HTML escaper and a style guide.

## Classical Visitor — the first refactor

```java
public interface Node {
    <R> R accept(Visitor<R> visitor);
}

public interface Visitor<R> {
    R visitText(Text text);
    R visitImage(Image image);
    R visitTable(Table table);
    R visitSection(Section section);
}
```

This worked and the model became clean again. The cost was visible immediately:

```text
4 accept methods
4 visit methods on the interface
4 visitor classes × 4 visit methods = 16 implementations
────────────────────────────────────────────────────────
24 methods of structure, plus the four operations' actual logic
```

and a subtler problem. Every visitor needed access to element internals, so the records grew
accessors for things nothing else used — `Table.rawCellSpans()` existed solely because the HTML
renderer needed it, and it was public.

## After — sealed nodes and folds

```java
public sealed interface Node permits Text, Image, Table, Section {

    record Text(String value, Emphasis emphasis) implements Node { }
    record Image(URI source, String alt, Dimensions dimensions) implements Node { }
    record Table(List<Row> rows, ColumnSpec spec) implements Node { }
    record Section(String title, List<Node> children) implements Node {
        public Section { children = List.copyOf(children); }
    }
}
```

```java
public final class WordCount {
    public static int of(Node node) {
        return switch (node) {
            case Text(String value, var emphasis) -> countWords(value);
            case Image image -> 0;
            case Table(var rows, var spec) -> rows.stream().mapToInt(WordCount::inRow).sum();
            case Section(var title, var children) ->
                    countWords(title) + children.stream().mapToInt(WordCount::of).sum();
        };
    }
}
```

```text
Classical Visitor      24 structural methods + 4 operations
Sealed + switch         0 structural methods + 4 operations
```

Two things improved beyond the line count.

**Encapsulation came back.** `case Table(var rows, var spec)` binds the components directly, so
`rawCellSpans()` was deleted along with three other accessors that existed only for visitors.

**Completeness is still enforced.** When `CodeBlock` was added to `permits`, all four operations
failed to compile — the same set of sites the classical visitor would have flagged, found by the
compiler with no interface to maintain.

## The traversal, separated once

Three of the four operations walk the tree the same way; `validate` needs to prune (it does not
descend into sections marked `verbatim`).

```java
public static Stream<Node> preOrder(Node root) {
    return switch (root) {
        case Section(var title, var children) ->
                Stream.concat(Stream.of(root), children.stream().flatMap(Visitors::preOrder));
        default -> Stream.of(root);
    };
}
```

Note the `default` here is safe and deliberate: this function is about structure, not about
semantics, and every non-`Section` node is a leaf for traversal purposes. That is the distinction
worth holding — a `default` in a traversal helper is fine; a `default` in an operation is where
new element types go unhandled.

`validate` keeps its own recursion because pruning is part of what it does, which is the honest
answer when traversal is an aspect of the operation.

## Depth, once documents came from elsewhere

Documents began arriving from a partner's editor rather than only from the in-house one, and depth
became input.

```java
public static Node parse(JsonNode json) { return parse(json, 0); }

private static Node parse(JsonNode json, int depth) {
    if (depth > MAX_DEPTH) throw new DocumentTooDeep(MAX_DEPTH);
    ...
}
```

The recursive folds were left recursive — with depth bounded at parse time, 64 levels cannot
overflow — and the bound is checked once, where the structure is built, rather than in four
operations. Bounding at the boundary rather than in every consumer is the pattern to copy
(`gof-composite`).

## The unknown node type

The partner's editor added a `Poll` node before our release supported it. Three options were on the
table:

```text
Skip unknown nodes        rejected. wordCount would under-bill, and
                          validate would pass a document containing an
                          element the house style forbids.

Reject the document       rejected for this domain: a whole publication
                          failing because of one unrecognised element is
                          worse than partial handling.

Model it explicitly       chosen.
```

```java
public sealed interface Node permits Text, Image, Table, Section, Unknown {
    record Unknown(String type, JsonNode raw) implements Node { }
}
```

The consequence is the point: all four operations failed to compile until each decided what an
unknown node means for it.

```java
// render: show a placeholder, and report it
case Unknown(String type, var raw) -> renderPlaceholder(type);

// wordCount: count nothing, but flag the document as an estimate
case Unknown unknown -> { estimateOnly.set(true); yield 0; }

// validate: an unknown element is a style issue, not silence
case Unknown(String type, var raw) -> List.of(StyleIssue.unknownElement(type));

// plainText: omit, and record a metric so the gap is visible
case Unknown unknown -> { metrics.counter("document.unknown_node", "type", unknown.type())
                                 .increment(); yield ""; }
```

Four different, deliberate answers where "skip it" would have given four silent ones. Sealing the
hierarchy is what forced the decision to be made four times rather than defaulted once
(`rpc-and-api-contracts`).

## Where the classical form stayed

The service also walks the file system to ingest assets, and there it uses `FileVisitor`:

```java
Files.walkFileTree(root, new SimpleFileVisitor<Path>() {
    @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
        assets.ingest(file);
        return CONTINUE;
    }
    @Override public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
        return dir.getFileName().toString().startsWith(".") ? SKIP_SUBTREE : CONTINUE;
    }
});
```

Two reasons this is not converted. The types are the JDK's, so they cannot be sealed. And the
`FileVisitResult` return is traversal control — pruning, skipping, terminating — which a plain
`switch` does not express. This is the shape classical Visitor still owns: someone else's types,
and traversal as part of the contract.

## Tests

```java
@ParameterizedTest
@MethodSource("everyNodeKind")
void every_operation_handles_every_node_kind(Node node) {
    assertThatCode(() -> {
        Render.html(node);
        WordCount.of(node);
        Validate.against(node, HOUSE_STYLE);
        PlainText.of(node);
    }).doesNotThrowAnyException();
}

@Test
void adding_a_node_kind_is_caught_by_the_compiler_not_this_test() {
    assertThat(Node.class.getPermittedSubclasses()).hasSize(5);   // a reminder, not the guarantee
}
```

The second test is deliberately weak, and its comment says so: the real guarantee is the absence of
`default` in the four switches. A test that enumerates types is worth having as documentation, and
believing it is the safety net is how a `default` gets added later without anyone noticing.
