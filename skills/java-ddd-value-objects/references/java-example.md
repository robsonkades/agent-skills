# Executable reference examples

Use the [complete source routes](../SKILL.md#conditional-references) when implementing
an identifier, media value, resource or enum. All 12 production types owned by this skill
are bundled; their `ValueObject`, `Identifier` and `IdUtils` imports are supplied by the
java-ddd assets. For focused behavioral checks, use these existing examples:

- [CategoryID](../assets/java/CategoryID.java) reproduces the reference implementation,
  including its hierarchy, private constructor, factories and exact-class equality.
- [IdentifierTest](../assets/java/IdentifierTest.java) checks preservation of arbitrary
  nonnull strings, type separation, hash lookup, generation and the VideoID case exception.
- [MediaValueObjectsTest](../assets/java/MediaValueObjectsTest.java) checks source media
  equality, replacement behavior, Resource aliases, wrapper identity and enum lookup.

The source of these contracts is listed in [semantic contracts](semantic-contracts.md).
The tests use real objects, the reference's `UnitTest` tag, JUnit `Assertions` and
given/when/then organization. Every test has `@DisplayName`, as explicitly required by
the user; no mocking library or application context is needed. Small direct values make
the behavior visible without a fixture framework. The production assets are complete
implementations; the JUnit files are executable tests, not pseudocode.

The isolated compile below uses the bundled production sources, including CategoryID
at its existing `assets/java/CategoryID.java` path, and the bundled
[UnitTest tag base](../../java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain/UnitTest.java).
No reference checkout is required for this compile. Keep one definition of each class.
When generating a new aggregate ID, adapt the package and name only after identifying
its source analogue and case-handling requirement.

## Isolated execution

The example is checked with Java 17 source/API compatibility. This is the fixture's
validation target; the source repository's `buildSrc` Java 17 setting does not establish
a compiler-release setting for the domain module. Inspect the actual target toolchain
before applying the skill. No language upgrade, new build system or preview option is
required for these examples.

Prerequisites: a JDK supporting `javac --release 17`, a runtime supporting those class
files, this skill's source assets, java-ddd's shared production assets, java-ddd-testing's
`UnitTest.java`, and an existing JUnit Platform Console Standalone 1.9.2 JAR (includes
JUnit Jupiter 5.9.2, matching the reference test dependency). The two other skills are
optional suggestions; obtain their matching assets when compiling this example if they
are not already available. They are not installed automatically by this skill.
Supply the JAR path explicitly; this example does not install or resolve dependencies.
Other JUnit versions require their own compatibility check.

Run the following PowerShell from the catalog root after setting `$voJunitJar` to that
JAR. The only output is compiled classes in a new temporary directory; no source, build,
registry or agent configuration is changed.

```powershell
$voAssets = Join-Path (Get-Location) 'skills/java-ddd-value-objects/assets/java'
$voProduction = Join-Path (Get-Location) 'skills/java-ddd-value-objects/assets/domain/src/main/java'
$voShared = Join-Path (Get-Location) 'skills/java-ddd/assets/domain/src/main/java/com/robsonkades/admin/catalogo/domain'
if (-not $voJunitJar -or -not (Test-Path -LiteralPath $voJunitJar)) {
    throw 'Set $voJunitJar to an existing junit-platform-console-standalone-1.9.2.jar'
}
$voTest = Join-Path (Get-Location) 'skills/java-ddd-testing/assets/domain/src/test/java/com/robsonkades/admin/catalogo/domain'
$voOutput = Join-Path ([IO.Path]::GetTempPath()) ('ddd-vo-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $voOutput | Out-Null
$voSources = @(
    'ValueObject.java', 'Identifier.java', 'utils/IdUtils.java'
) | ForEach-Object { Join-Path $voShared $_ }
$voSources += Get-ChildItem -LiteralPath $voProduction -Recurse -Filter '*.java' |
    ForEach-Object { $_.FullName }
$voSources += Join-Path $voTest 'UnitTest.java'
$voSources += Get-ChildItem -LiteralPath $voAssets -Filter '*.java' |
    ForEach-Object { $_.FullName }
javac --release 17 -encoding UTF-8 -cp $voJunitJar -d $voOutput $voSources
if ($LASTEXITCODE -ne 0) { throw 'Value-object example compilation failed' }
java -jar $voJunitJar --class-path $voOutput --include-tag unitTest --fail-if-no-tests --select-class com.robsonkades.admin.catalogo.domain.IdentifierTest --select-class com.robsonkades.admin.catalogo.domain.video.MediaValueObjectsTest
if ($LASTEXITCODE -ne 0) { throw 'Value-object example tests failed' }
```

Inspect the output for 19 executed tests, with no skipped or failed tests. This checks
the exercised Java contracts against the selected source. It does not run the complete
reference suite, validate every constructor argument or locale, establish immutability
where the source lacks it, or prove generated IDs can never collide. No timing or
random uniqueness assertion is used. A source change may legitimately require updating
the documented evidence and tests before reusing the fixture.

## Reproducible skill behavior cases

These are written evaluation inputs and criteria, not executed agent evaluations or
evidence that the revision improves model performance. They are also known teaching
cases, so an independent evaluation should retain a separate held-out task.

| Input and supplied context                                                                       | Expected decision/output                                                                                                                       | Failure conditions                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Implement CategoryID using the reference; retain an existing stored ID `"123"`.                  | Use Identifier, private String constructor, from/unique/getValue and class-plus-value equality; preserve the supplied String.                  | UUID parser, invented blank prohibition, record ID, new shared equality framework or missing DisplayName in added tests. |
| Reconstruct `"ABC"` as CategoryID; repeat the task changing only the type to VideoID.            | Category preserves case; Video lowercases using its actual factory. This paired case changes the decisive source type.                         | One normalization policy applied to both, or locale policy silently changed.                                             |
| Convert ImageMedia to a full-field record as a cleanup; source equality tests are supplied.      | Explain the equality change, preserve checksum/location semantics and existing API within the authorized reference pattern.                    | Equality gains ID/name, or tests are weakened to accept it.                                                              |
| Add tests for completed audio/video media.                                                       | Real instances; assert completed status/path and unchanged original; acknowledge unchanged value equality. Each test has DisplayName.          | Equality-only state assertion, mocks, Spring startup or invented transition restriction.                                 |
| Describe Resource as deeply immutable and add byte-content equality without another requirement. | Report actual aliasing and inherited identity equality; retain the source contract.                                                            | Copy arrays, add structural equality, or claim immutability as an incidental style fix.                                  |
| Create a Money value object; the only technical source is this domain module.                    | Identify absence of an approved money contract and ask for the missing reference/rules while preserving known domain patterns.                 | Invent scale, currencies, rounding, error policy or import the former synthetic invoice example.                         |
| Reuse these exact resource records in a target explicitly pinned to Java 8.                      | State the compatibility conflict and request the required target/source decision; do not claim that the Java 17 fixture proves Java 8 support. | Upgrade the target silently or promise an unchanged Java 8 implementation.                                               |
