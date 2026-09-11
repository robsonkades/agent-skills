# OpenRewrite: running, composing, authoring

OpenRewrite parses source into an LST — an AST that additionally carries type attribution,
formatting and comments — applies visitors to it, and prints it back. The type attribution
is what separates it from text tooling, and the fidelity is what makes its diffs
reviewable.

## Running a published recipe

Prefer a maintained recipe over anything hand-written: the migration recipe sets
(`jakarta` namespace, JUnit 4 to 5, Spring Boot major versions, Java version upgrades) have
absorbed years of edge cases nobody rediscovers voluntarily.

Inspect Java/Maven toolchains, resolved framework versions, repositories and recipe prerequisites.
Pin both plugin and recipe artifact before the preview; use versions verified for that project.
This Bash template requires those exact versions in the named variables and an isolated input copy:

```bash
: "${REWRITE_PLUGIN_VERSION:?set a verified exact plugin version}"
: "${REWRITE_RECIPE_VERSION:?set a verified exact recipe version}"
mvn "org.openrewrite.maven:rewrite-maven-plugin:${REWRITE_PLUGIN_VERSION}:dryRun" \
  "-Drewrite.recipeArtifactCoordinates=org.openrewrite.recipe:rewrite-migrate-java:${REWRITE_RECIPE_VERSION}" \
  -Drewrite.failOnInvalidActiveRecipes=true \
  -Drewrite.activeRecipes=org.openrewrite.java.migrate.jakarta.JavaxMigrationToJakarta
```

`dryRun` does not apply recipe source edits, but writes reports and forks Maven lifecycle goals
that can generate artifacts or run configured plugins. Inspect those effects first. `dryRunNoFork`
avoids that lifecycle fork when prerequisite state is already prepared. Record logs, matched
modules and the fresh patch before applying `run`; missing artifacts/runner failure are not success.
The explicit validation flag makes invalid active recipe configuration fail instead of relying on
the plugin's default. Confirm option support in the pinned version; treat validation failures as
configuration defects to resolve, not a reason to disable the check.

## The type-attribution trap

This is the failure mode to expect. Recipes that match on a type — most useful recipes —
need the dependency classpath to have resolved when the LST was built. When it did not,
the matchers silently fail to match, the run reports no changes, and the output looks
exactly like a clean codebase.

Read "0 files changed" in context. Confirm scope and attribution first:

- Run with `-X` (or `--info` on Gradle) and look for `Failed to resolve` / unresolved
  dependency warnings during parsing.
- Verify on a known-positive: point the recipe at one file you are certain matches. If
  that file is untouched, inspect attribution, recipe prerequisites/options and exclusions.
- Inspect the normal build and parser diagnostics. Compilation failure can cause missing
  attribution, but does not universally mean every parsed file lacks types.

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
  - org.openrewrite.java.ChangePackage:
      oldPackageName: com.example.orders.legacy
      newPackageName: com.example.orders.internal
      recursive: true
  - org.openrewrite.java.ChangeMethodName:
      methodPattern: com.example.orders.internal.OrderClient submitOrder(..)
      newMethodName: submit
```

This recipe changes only the package/method contract shown. Java/framework upgrades are separate
authorized migrations; inspect composed recipes because some include dependency/build changes.

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
  It narrows applicability/cost; absence of a precondition does not itself rewrite every file.
- **Build new code with `JavaTemplate`**, not by assembling LST nodes. The template
  must be configured with the needed parser classpath/import context; add/remove source imports
  deliberately. Templates do not automatically make unresolved types correct, and manually built
  nodes require the same attribution discipline.

Return the tree unchanged — the same instance — when nothing applies. Returning an equal
but new instance marks the file as changed and produces diff noise.

## Testing a recipe

A recipe is code, and this is why it is worth choosing over an IDE session: it can be
tested. `RewriteTest` asserts a before/after pair, and the two cases that matter are the
negative ones.

```text
RewriteTest fixture specification (adapt APIs to the pinned rewrite-test/rewrite-java versions):
Recipe: ChangeMethodName("com.example.OrderClient submitOrder(..)", "submit", ...options)
Before source 1: package com.example;
                public class OrderClient { public void submitOrder(String x) {} }
After source 1:  package com.example;
                public class OrderClient { public void submit(String x) {} }
Before source 2: class A { void go(com.example.OrderClient c) { c.submitOrder("x"); } }
After source 2:  class A { void go(com.example.OrderClient c) { c.submit("x"); } }
Provide both sources to the parser so the receiver type resolves. Validate both outputs.
```

Write at least: one positive case; one **near-miss** that must not change (a same-named
method on a different type — the test that proves the recipe is type-aware rather than
name-aware); and one idempotence case, running the recipe on its own output and asserting
no further change. A non-idempotent recipe is a recipe that will fight the next run.

Supply the types the test needs via the spec's classpath, or the test itself falls into the
attribution trap and passes for the wrong reason.
Alternatively supply companion source fixtures as above. Check that the positive case actually
changes and negative cases do not; do not disable type validation to obtain a pass. Test a fresh
second invocation against the transformed project, not only repeated visitor cycles in one run.

## What a recipe still does not make safe

A recipe that applies perfectly can still change behaviour — it is a mechanism for
applying a step, not an argument that the step preserves behaviour. Migration recipes in
particular do change behaviour by design: a Spring Boot upgrade recipe alters defaults, a
JUnit 4 to 5 migration changes how assumptions and expected-exception semantics behave, and
`javax`→`jakarta` changes which implementation is on the classpath. Those are upgrades with
a recipe attached, and they need the upgrade's testing, not a refactoring's.

Primary references: [Maven plugin goals and lifecycle](https://docs.openrewrite.org/reference/rewrite-maven-plugin),
[recipe testing](https://docs.openrewrite.org/authoring-recipes/recipe-testing).
