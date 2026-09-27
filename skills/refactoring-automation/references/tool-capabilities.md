# Tool capabilities and blind spots

Every tool operates on a model of the code. What it can safely change is bounded by what
that model contains — and what it silently misses is bounded by the same thing.

## What each tool sees

| Tool                                     | Model                                                     | Sees types?                        | Sees the whole repo?  | Blind to                                                                                       |
| ---------------------------------------- | --------------------------------------------------------- | ---------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| IDE refactoring                          | Resolved AST + project index                              | Yes                                | One project/workspace | Unindexed consumers; strings/config outside enabled rename checks or framework support         |
| OpenRewrite                              | LST — AST with type attribution, formatting, comments     | Yes, if the classpath resolved     | Yes, module by module | Anything outside the source set it was pointed at                                              |
| Error Prone / Refaster                   | javac AST during compilation                              | Yes                                | Whatever compiles     | Non-compiling code, generated sources excluded from the build                                  |
| IntelliJ Structural Search/Replace       | Resolved AST, pattern-matched                             | Yes                                | One project           | Same as the IDE; also easy to write an over-broad pattern                                      |
| JavaParser / Spoon                       | AST, type attribution only if configured                  | Optional                           | What you feed it      | Formatting fidelity; types when the classpath is not supplied                                  |
| Formatter (Spotless, google-java-format) | Tool/parser dependent; Spotless composes configured steps | Not generally semantic refactoring | Configured file set   | Language level, configured steps and tool defects; formatting is not automatic proof of safety |
| sed / regex                              | Bytes                                                     | No                                 | Anything              | Scope, shadowing, imports, overloads, comments, strings, generics                              |

The column that matters is the last one. A tool is chosen by what it is blind to, not by
what it advertises.

## The IDE

An existing IDE can be a practical choice for Rename, Move, Change Signature, Extract and
Inline within an indexed project. Inspect its preview for callers, overrides and Javadoc
references. String/config searches and framework-aware updates depend on options, installed
integrations, source sets and the specific refactoring; indexed metadata is not a guarantee
that every framework binding will be updated.

Two limits worth internalising. First, capture the preview/diff and settings; replay/export
support depends on the tool. Repeated work benefits from a tested transformation artifact.
Second, its guarantees end at the indexed project
boundary — a rename in a library module updates the consumers _in the workspace_ and no
others.

## OpenRewrite

Useful when a repeatable semantic transformation earns the setup and test cost. Its LST
carries formatting and comments, which helps make diffs readable when recipes preserve them.
Repository size alone does not justify it over a bounded literal edit or an existing indexed
IDE refactoring. `openrewrite-recipes.md` covers running and authoring.

Compare it with the existing IDE's actual scope and replay support when a change spans modules
or repositories, must run in CI, or is complex enough that the _rule_ deserves a test.

## Generated sources and authoritative inputs

Inspect generation tasks, headers, processor configuration and build source roots. A checked-in
file is not necessarily maintained by hand, and a directory name alone does not establish ownership.
Trace a generated match back to its schema, template, processor, generator options or upstream
artifact. Fix the owned input that controls the change, then regenerate with recorded versions
and configuration. Changing a schema can also change a wire contract; prefer an appropriate
generator naming option or template when only the Java representation should change.

For example, renaming a method in a generated client and all its callers can compile today;
the next generation restores the old method and breaks those callers. Re-running a recipe on
that edited output tests the recipe's idempotence, not the generation pipeline's durability.
Validate from a fresh isolated output directory: generate, apply any declared post-generation
step, compile the consumers and check affected contracts. Repeat from the same inputs and
explain output drift, including generator timestamps, rather than claiming reproducibility.

Prefer supported generator configuration or templates over an output patch. A versioned,
tested post-generation transformation can be appropriate when those inputs cannot express the
required change, provided every relevant generation path runs it before consuming the output.
Include that ordering and the supported generator version in its tests. If the generator/input
is externally owned or unavailable, record the owner, affected symbols and required output
contract for a handoff; a compatible adapter or retaining the current API may allow local work
to proceed. Do not report the generated portion migrated merely because it was excluded.

## Error Prone and Refaster

Refaster can perform a one-time cleanup or support a recurring check. A template
expresses "wherever this shape appears, replace it with that shape", and Error Prone runs
it with explicitly configured patching/checks. Producing a patch does not fail CI by itself;
configure a reliable blocking check if recurrence must be prohibited. It sees the compilation model, and
it costs build time, so it earns its place for patterns with real defect history, not for
style preferences.

## Structural search

IntelliJ's SSR is the fastest way to answer "how many places match this shape?" during
planning, and a reasonable way to apply a narrow change interactively. Its risk is that
patterns are easy to write too broadly and the results scroll past. Use it to _count_ and
to _find_; prefer a tested recipe to apply.

## Regex and sed on Java source

Legitimate for non-Java files — YAML keys, `.properties`, licence headers, a version
string in a POM. On Java source it is only defensible when the target is genuinely textual
and unambiguous, and even then the review must assume misses.

What a regex cannot distinguish, and every one of these has shipped a bug: an identifier
from the same word inside a string literal, a comment, or a Javadoc block; a field from a
local that shadows it; one overload from another; a type from a same-named type in a
different package; a generic type argument from a comparison operator. An agent proposing
`sed` for a rename is proposing an unbounded change.

## Where rename coverage must be checked

Java string literals and annotations are present in the AST, but their external meaning may
not be resolved. Framework-aware IDEs/recipes can update some of these; inspect actual support,
configured source sets and results instead of assuming either full coverage or total blindness.

- **String-named framework wiring** — `@Qualifier("…")`, `@Named`, bean names,
  `@Value("${property.key}")`, `@ConfigurationProperties` prefixes, SpEL expressions,
  `@Scheduled(cron = "${…}")`.
- **Persistence** — JPQL and native queries in strings or `orm.xml`, `@Query`, Criteria
  metamodel strings, column and table names, `@NamedQuery`, Flyway/Liquibase SQL,
  discriminator values.
- **Serialisation** — `@JsonProperty` values, implicit JSON property names derived from
  accessors, XML element names, protobuf/Avro field names, `serialVersionUID`
  consequences, anything persisted in a cache or a message queue in the old shape.
- **Reflection and service loading** — `Class.forName`, `META-INF/services`, annotation
  processors, `@SpringBootApplication` scan bases in strings, module `provides`/`uses`.
- **Tests and doubles** — reflective/string-based test helpers, JSON fixture
  files, approval/golden files, WireMock stubs, contract-test pact files.
- **Operations** — log messages an alert greps for, metric and span names, feature-flag
  keys, dashboard queries. These break silently and are discovered during an incident.
- **Documentation and IaC** — README snippets, OpenAPI specs written by hand, Kubernetes
  manifests, Helm values.

The workflow is the same for all of them: before a rename, search for the **string form**
of the old name across relevant Java/non-Java sources, then classify hits as bindings, data,
documentation or compatibility aliases. Search after transformation and explain residuals;
do not rewrite unrelated text just to achieve zero hits. Also inspect generated/derived names
and external consumers: they may have no literal occurrence in this repository.

Primary references: [Error Prone Refaster patch generation and application](https://errorprone.info/docs/refaster),
[IntelliJ rename scope, options and preview](https://www.jetbrains.com/help/idea/rename-refactorings.html),
[google-java-format parser and language requirements](https://github.com/google/google-java-format),
[Maven compiler annotation-processing output](https://maven.apache.org/plugins/maven-compiler-plugin/compile-mojo.html#generatedSourcesDirectory),
[OpenAPI Generator configuration and template customization](https://openapi-generator.tech/docs/customization/).
