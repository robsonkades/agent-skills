# Tool capabilities and blind spots

Every tool operates on a model of the code. What it can safely change is bounded by what
that model contains — and what it silently misses is bounded by the same thing.

## What each tool sees

| Tool                                     | Model                                                 | Sees types?                    | Sees the whole repo?  | Blind to                                                                          |
| ---------------------------------------- | ----------------------------------------------------- | ------------------------------ | --------------------- | --------------------------------------------------------------------------------- |
| IDE refactoring                          | Resolved AST + project index                          | Yes                            | One project/workspace | Strings, most external config, other repositories                                 |
| OpenRewrite                              | LST — AST with type attribution, formatting, comments | Yes, if the classpath resolved | Yes, module by module | Anything outside the source set it was pointed at                                 |
| Error Prone / Refaster                   | javac AST during compilation                          | Yes                            | Whatever compiles     | Non-compiling code, generated sources excluded from the build                     |
| IntelliJ Structural Search/Replace       | Resolved AST, pattern-matched                         | Yes                            | One project           | Same as the IDE; also easy to write an over-broad pattern                         |
| JavaParser / Spoon                       | AST, type attribution only if configured              | Optional                       | What you feed it      | Formatting fidelity; types when the classpath is not supplied                     |
| Formatter (spotless, google-java-format) | Token stream                                          | No                             | Configured file set   | Meaning entirely — which is why it is safe and why it must be alone in its commit |
| sed / regex                              | Bytes                                                 | No                             | Anything              | Scope, shadowing, imports, overloads, comments, strings, generics                 |

The column that matters is the last one. A tool is chosen by what it is blind to, not by
what it advertises.

## The IDE

Highest value per unit of risk for a single project, and the right default for Rename,
Move, Change Signature, Extract and Inline. It updates callers, overrides, Javadoc `@link`
references and — for the major IDEs — Spring and JPA metadata it has indexed.

Two limits worth internalising. First, it is a **session**, not an artefact: nobody can
review, test or re-run what you did. For a one-off change in one repo that is fine; for
anything repeated it is the wrong tool. Second, its guarantees end at the project
boundary — a rename in a library module updates the consumers _in the workspace_ and no
others.

## OpenRewrite

The default for anything repeated, repo-wide, or worth reviewing as a recipe. Its model is
a lossless LST, so it preserves formatting and comments, which is what makes its diffs
readable. `references/openrewrite-recipes.md` covers running and authoring.

Choose it over the IDE when the change spans modules or repositories, must be re-runnable
in CI, or is complex enough that the _rule_ deserves a test.

## Error Prone and Refaster

Different job: not a one-time migration but a **standing** rule. A Refaster template
expresses "wherever this shape appears, replace it with that shape", and Error Prone runs
it during compilation, so the pattern cannot come back. Reach for this after a cleanup
lands — it is the mechanism behind "make it stick". It only sees code that compiles, and
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

## Where a rename never reaches

The AST does not contain these. A refactoring tool will report success having changed none
of them, and every one of them fails at runtime rather than at build time.

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
- **Tests and doubles** — Mockito argument matchers on string method names, JSON fixture
  files, approval/golden files, WireMock stubs, contract-test pact files.
- **Operations** — log messages an alert greps for, metric and span names, feature-flag
  keys, dashboard queries. These break silently and are discovered during an incident.
- **Documentation and IaC** — README snippets, OpenAPI specs written by hand, Kubernetes
  manifests, Helm values.

The workflow is the same for all of them: before a rename, search for the **string form**
of the old name across the whole repository including non-Java files, and treat every hit
as a caller the compiler will not find. After the rename, search again for the old string
and expect zero hits; a remaining hit is either a bug or a deliberate compatibility alias
that needs a comment saying so.
