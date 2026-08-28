# OpenRewrite: running, composing, authoring

OpenRewrite parses source into an LST — an AST that additionally carries type attribution,
formatting and comments — applies visitors to it, and prints it back. The type attribution
is what separates it from text tooling, and the fidelity is what makes its diffs
reviewable.

## Running a published recipe

Prefer a maintained recipe over anything hand-written: the migration recipe sets
(`jakarta` namespace, JUnit 4 to 5, Spring Boot major versions, Java version upgrades) have
absorbed years of edge cases nobody rediscovers voluntarily.

Run without editing the build, so a trial leaves no trace:

```bash
mvn -U org.openrewrite.maven:rewrite-maven-plugin:dryRun \
  -Drewrite.recipeArtifactCoordinates=org.openrewrite.recipe:rewrite-migrate-java:RELEASE \
  -Drewrite.activeRecipes=org.openrewrite.java.migrate.jakarta.JavaxMigrationToJakarta
```

`dryRun` writes a patch file and changes nothing; read it before ever running `run`. Pin
the recipe artefact to an exact version once the change is real — `RELEASE` makes the run
non-reproducible, which forfeits the review model this whole skill rests on.

## The type-attribution trap

This is the failure mode to expect. Recipes that match on a type — most useful recipes —
need the dependency classpath to have resolved when the LST was built. When it did not,
the matchers silently fail to match, the run reports no changes, and the output looks
exactly like a clean codebase.

Never read "0 files changed" as success. Confirm the parse first:

- Run with `-X` (or `--info` on Gradle) and look for `Failed to resolve` / unresolved
  dependency warnings during parsing.
- Verify on a known-positive: point the recipe at one file you are certain matches. If
  that file is untouched, the model is broken, not the code.
- Build the project normally first. A module that does not compile parses without types.

The same trap hides in generated sources, in modules excluded from the reactor, and in
source sets the plugin was never pointed at.

## Composing a declarative recipe

Most real work is a YAML recipe in `rewrite.yml` composing existing ones plus a few
targeted rules — no Java, no build of your own:

```yaml
type: specs.openrewrite.org/v1beta/recipe
name: com.example.CleanUpLegacyOrders
displayName: Retire the legacy order client
recipeList:
  - org.openrewrite.java.migrate.UpgradeToJava21
  - org.openrewrite.java.ChangePackage:
      oldPackageName: com.example.orders.legacy
      newPackageName: com.example.orders.internal
      recursive: true
  - org.openrewrite.java.ChangeMethodName:
      methodPattern: com.example.orders.OrderClient submitOrder(..)
      newMethodName: submit
```

The building blocks worth knowing before writing a visitor: `ChangeType`, `ChangePackage`,
`ChangeMethodName`, `ChangeMethodTargetToStatic`, `AddDependency`, `RemoveUnusedImports`,
`UpgradeDependencyVersion`, and the `org.openrewrite.staticanalysis` set. Method patterns
use the `fully.Qualified.Type method(ArgTypes)` form with `..` as a wildcard, and they
match on resolved types — which is exactly why the trap above matters.

## Writing a visitor

Only when no combination of the above expresses the rule. Two constraints shape a
well-behaved recipe:

- **Guard with a precondition** so the visitor only runs on files that can match
  (`Preconditions.check(new UsesType<>("com.example.OrderClient", true), visitor)`).
  Without it, every file in the repository is visited and reprinted, and unrelated
  formatting churn creeps into the diff.
- **Build new code with `JavaTemplate`**, not by assembling LST nodes. The template
  carries imports and type attribution; hand-built nodes lose them, and the next recipe in
  the list then fails to match what you produced.

Return the tree unchanged — the same instance — when nothing applies. Returning an equal
but new instance marks the file as changed and produces diff noise.

## Testing a recipe

A recipe is code, and this is why it is worth choosing over an IDE session: it can be
tested. `RewriteTest` asserts a before/after pair, and the two cases that matter are the
negative ones.

```java
@Test
void renamesTheClientMethod() {
    rewriteRun(
        spec -> spec.recipe(new ChangeMethodName("com.example.OrderClient submitOrder(..)", "submit", null, null)),
        java(
            """
            class A { void go(com.example.OrderClient c) { c.submitOrder("x"); } }
            """,
            """
            class A { void go(com.example.OrderClient c) { c.submit("x"); } }
            """));
}
```

Write at least: one positive case; one **near-miss** that must not change (a same-named
method on a different type — the test that proves the recipe is type-aware rather than
name-aware); and one idempotence case, running the recipe on its own output and asserting
no further change. A non-idempotent recipe is a recipe that will fight the next run.

Supply the types the test needs via the spec's classpath, or the test itself falls into the
attribution trap and passes for the wrong reason.

## What a recipe still does not make safe

A recipe that applies perfectly can still change behaviour — it is a mechanism for
applying a step, not an argument that the step preserves behaviour. Migration recipes in
particular do change behaviour by design: a Spring Boot upgrade recipe alters defaults, a
JUnit 4 to 5 migration changes how assumptions and expected-exception semantics behave, and
`javax`→`jakarta` changes which implementation is on the classpath. Those are upgrades with
a recipe attached, and they need the upgrade's testing, not a refactoring's.
