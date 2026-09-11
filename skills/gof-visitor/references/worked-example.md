# Worked example: a document model with four operations

Illustrative Java 21 alternatives (no preview), not a measured migration. Imports and domain helpers
are omitted. Use URI, List, Objects, Stream and import Node nested types; compile alternatives
separately. Row, ColumnSpec, Dimensions and other shared values must be immutable or defensively copied.

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
knowledge. Another external operation would require editing each implementation; whether that
cost warrants changing a public API must be evaluated against actual callers.

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
8 dispatch/interface declarations + 16 operation method bodies
```

Operation bodies still need an API to the relevant document data. Records already expose their
components; assess whether derived operations or narrow methods avoid extra representation exposure.

## After — sealed nodes and folds

```java
public sealed interface Node permits Node.Text, Node.Image, Node.Table, Node.Section {

    record Text(String value, Emphasis emphasis) implements Node {
        public Text { Objects.requireNonNull(value); Objects.requireNonNull(emphasis); }
    }
    record Image(URI source, String alt, Dimensions dimensions) implements Node { }
    record Table(List<Row> rows, ColumnSpec spec) implements Node {
        public Table { rows = List.copyOf(rows); Objects.requireNonNull(spec); }
    }
    record Section(String title, List<Node> children) implements Node {
        public Section { Objects.requireNonNull(title); children = List.copyOf(children); }
    }
}
```

```java
public final class WordCount {
    public static int of(Node node) {
        return switch (Objects.requireNonNull(node)) {
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
Classical Visitor      accept/visit protocol + operation implementations
Sealed + switch         no accept protocol; operation cases remain
```

The sketch omits inRow and countWords; define locale/tokenization and overflow policy before billing.
This simple helper counts non-whitespace runs, with empty/whitespace-only input producing zero:

```java
static int countWords(String text) {
    Objects.requireNonNull(text);
    int count = 0;
    boolean inWord = false;
    for (int i = 0; i < text.length();) {
        int cp = text.codePointAt(i);
        boolean word = !Character.isWhitespace(cp);
        if (word && !inWord) count++;
        inWord = word;
        i += Character.charCount(cp);
    }
    return count;
}
```

Bound total document text so int sums cannot overflow, or choose checked/wider accumulation.
Tables contribute cell text through the omitted inRow helper. No performance or line-count benefit
has been measured.

**Representation remains an API choice.** Record patterns call accessors for rows/spec;
removing an extra accessor is justified only if callers can use an appropriate existing interface,
not because deconstruction bypasses the accessor or hides the components.

**Coverage is checked on recompilation.** In this example, adding `CodeBlock` to `permits` would
make the four exhaustive operations fail when rebuilt without matching cases or a covering fallback.
Adding an abstract Visitor method similarly exposes missing implementations on recompilation.
Neither mechanism proves semantics or makes separately compiled old consumers understand the new kind.

## The traversal, separated once

Three of the four operations walk the tree the same way; `validate` needs to prune (it does not
descend into sections marked `verbatim`).

```java
public static Stream<Node> preOrder(Node root) {
    return switch (Objects.requireNonNull(root)) {
        case Section(var title, var children) ->
                Stream.concat(Stream.of(root), children.stream().flatMap(Visitors::preOrder));
        case Text t -> Stream.of(t);
        case Image i -> Stream.of(i);
        case Table t -> Stream.of(t); // Rows/cells are values here, not child Nodes
    };
}
```

This recursive stream sketch explicitly treats Table rows/cells as non-Node values. If they contain
Nodes, define and traverse those edges too. No default hides a future branch type: recompile this
helper when the node set changes and test encounter order and reachability. Per-node operations
must not recursively revisit descendants already supplied by this walk.

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

A chosen depth limit is not a portable proof of stack safety: frame size, stream composition and
runtime stack settings matter. Enforce limits before recursive descent and cover direct AST creation
as well as JSON parsing. Bound nodes, text/row sizes, work and output; JSON decoder nesting limits
also matter before this stub runs. Prefer an iterative walk/guard when depth is not safely bounded.
No parser or depth test implementation is supplied here
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
// Extension sketch: nest this record inside Node and add Node.Unknown to permits.
record Unknown(String type, JsonNode raw) implements Node { }
```

The Unknown sketch needs null/type/size checks and owned or immutable raw data: a JsonNode is not
made immutable by wrapping it in a record. Do not render raw markup or load referenced resources.
Preserving an unknown node for editing/forwarding does not authorize incomplete billing or validation.

The consequence is the point: rebuilding these exhaustive operations after adding `Unknown`
requires coverage; each operation must also decide what an unknown node means semantically.

```java
// render: placeholder helper must escape the untrusted type for its output context
case Unknown(String type, var raw) -> renderPlaceholder(type);

// revised count fold returns Count(value, estimateOnly), not the int signature above
case Unknown unknown -> new Count(0, true);

// validate: an unknown element is a style issue, not silence
case Unknown(String type, var raw) -> List.of(StyleIssue.unknownElement(type));

// plainText: omit, and record a metric so the gap is visible
case Unknown unknown -> { metrics.counter("document.unknown_node", "type", "unknown")
                                 .increment(); yield ""; }
```

Count is an omitted immutable result; all branches/combination must propagate estimateOnly with OR.
Billing must reject or defer estimates; resetting a shared external flag is not an adequate result
contract. Keep metric labels bounded; raw unknown types belong only in bounded/sanitized diagnostics.

Four different, deliberate answers where blanket skipping would have given four silent ones.
Exhaustive switches without covering fallbacks expose the missing type cases on recompilation;
the operation contracts and tests establish whether each answer is valid
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
        var name = dir.getFileName(); // filesystem root can have no filename
        return name != null && name.toString().startsWith(".") ? SKIP_SUBTREE : CONTINUE;
    }
});
```

Files.walkFileTree owns traversal and delivers callbacks with FileVisitResult control; Path does
not implement accept(visitor). This is an established visitor-style protocol, not an example of
classical element double dispatch. Define IOException, failed-visit and symbolic-link policy;
SimpleFileVisitor defaults propagate visit failures. The omitted assets.ingest contract determines
whether callback methods must declare IOException.

## Suggested semantic tests (not executed framework tests)

For each node kind, assert expected word count, escaped rendering, validation issues and plain text;
a doesNotThrow assertion cannot detect zeroed results or missed descendants. Include empty/blank
text, nested sections, table cells, null rejection and input-list mutation. Assert traversal order
and exact visit counts, with branch-node additions included in the inventory.

For Unknown, assert estimate propagation through nested parents, refusal to bill partial results,
placeholder escaping and bounded metric labels. For depth/work limits test every construction path.
A controlled compile-negative fixture adding a new permitted node without updating a switch can
verify type coverage, but semantic and binary-compatibility tests remain separate. A fixed permitted-
subclass count alone is not a useful correctness test.
