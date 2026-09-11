# API evolution: binary, source and behavioural compatibility

Three distinct promises, breakable independently:

- **Binary**: clients compiled against the old version still link and run against the new
  one. Broken binary compatibility surfaces as linkage errors at run time
  (`NoSuchMethodError`, `AbstractMethodError`, `IncompatibleClassChangeError`,
  `IllegalAccessError`).
- **Source**: client source that compiled before still compiles. Binary and source
  compatibility do not imply each other.
- **Behavioural**: unchanged client code observes the same outcomes. The compiler and the
  linker verify nothing here; only tests and review do.

## Change-kind table

Use JLS chapter 13 for binary guarantees; source and behavioural columns also require
consumer evidence. The error columns describe affected old, not recompiled clients.
The table summarizes risks, not proof that every client fails.

| Change to a published API                                                               | Binary                                                                                                      | Source                                                                                                      | Behavioural                                                                   | Notes                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add a method to a non-final class                                                       | OK                                                                                                          | risk: accidental override/static/return/throws clashes                                                      | risk                                                                          | Existing subclass methods can become overrides or hide the addition after recompilation; scan downstream subclasses                                                                                                      |
| Add an abstract method to an interface                                                  | links, but `AbstractMethodError` when invoked on an old implementation                                      | breaks implementors                                                                                         | —                                                                             | The linkage succeeds; the error is deferred to the call                                                                                                                                                                  |
| Add a `default` method to an interface                                                  | binary-compatible by JLS, invocation may still throw `IncompatibleClassChangeError` on conflicting defaults | may fail on inherited/default clashes                                                                       | risk                                                                          | The body must be valid for every existing implementor; scan sibling interfaces and implementations                                                                                                                       |
| Add a `static` method to an interface                                                   | OK                                                                                                          | normally OK                                                                                                 | normally OK                                                                   | Not inherited by implementors; source imports/names can still collide                                                                                                                                                    |
| Add an overload                                                                         | OK                                                                                                          | may create ambiguity                                                                                        | **risk**                                                                      | Resolution of existing call sites can change: adding `process(long)` beside `process(Integer)` silently captures `process(1)`, because widening beats boxing                                                             |
| Add a parameter, remove one, or reorder differently-typed ones                          | **breaks** (`NoSuchMethodError`)                                                                            | breaks                                                                                                      | —                                                                             | A changed signature is a removal plus an addition                                                                                                                                                                        |
| Reorder parameters of the same type                                                     | OK                                                                                                          | OK                                                                                                          | **breaks**                                                                    | The worst kind: nothing fails except the results                                                                                                                                                                         |
| Widen a parameter type (`ArrayList` → `List`)                                           | **breaks** (`NoSuchMethodError`)                                                                            | OK for callers; existing overriders silently become overloads (`@Override` turns that into a compile error) | risk (a recompiled subclass that meant to override no longer does)            | The method descriptor changed; source-compatible changes can still be binary breaks                                                                                                                                      |
| Change a return type                                                                    | breaks if the old erased descriptor no longer resolves                                                      | depends on callers and overrides                                                                            | risk                                                                          | Same-erasure generic changes need not break linkage; covariant overrides may retain a bridge. A narrower return can preserve ordinary source callers while breaking overriding subclasses                                |
| Add a checked exception to `throws`                                                     | OK                                                                                                          | breaks callers                                                                                              | —                                                                             | `throws` has no linkage effect — it is checked only at compile time                                                                                                                                                      |
| Remove or rename a public member                                                        | **breaks**                                                                                                  | breaks                                                                                                      | —                                                                             | Rename = remove + add; deprecate-and-delegate instead                                                                                                                                                                    |
| Make a class `final`                                                                    | **breaks** existing subclasses (`IncompatibleClassChangeError` at load)                                     | breaks                                                                                                      | —                                                                             | Same for making it `sealed` against foreign subclasses                                                                                                                                                                   |
| Make an overridable instance method `final`                                             | **breaks** existing overriders (`IncompatibleClassChangeError` at load)                                     | breaks                                                                                                      | —                                                                             | A static method cannot be overridden; JLS treats adding `final` there differently                                                                                                                                        |
| Reduce visibility (`public` → package-private)                                          | **breaks** (`IllegalAccessError`)                                                                           | breaks                                                                                                      | —                                                                             | Increasing visibility preserves binary access but can create source-level override/hiding conflicts; inspect subclasses                                                                                                  |
| Change the value of a compile-time constant (`static final` primitive/String)           | links                                                                                                       | OK                                                                                                          | **breaks silently**                                                           | The old value was inlined into clients at their compile time; they keep it until recompiled. Do not publish constants whose values may change                                                                            |
| Add a component to a record                                                             | breaks unless old constructor/accessor needs are deliberately retained                                      | breaks old constructor calls unless retained; record patterns (Java 21+) change arity                       | changes generated equality/hash/toString; serialization needs separate review | Native record deserialization can supply defaults for missing components, subject to canonical-constructor validation; do not infer wire compatibility from constructor compatibility                                    |
| Add a constant to an enum / a variant to a sealed interface                             | OK                                                                                                          | can break switches required to be exhaustive without `default`                                              | risk                                                                          | Java 21+ compiled exhaustive switches can throw `MatchException` on unexpected variants; older enum switch-expression binaries use `IncompatibleClassChangeError`. Ordinary non-exhaustive enum switch statements differ |
| Strengthen a precondition, narrow accepted input, change ordering/nullability of output | OK                                                                                                          | OK                                                                                                          | **breaks**                                                                    | Compiles, links, and fails in production; a major version despite zero signature changes                                                                                                                                 |

## Deprecation policy

- Mark with `@Deprecated(since = "<version>", forRemoval = true)` only when removal is intended;
  leave `forRemoval` false for indefinite discouragement. Pair it with a Javadoc `@deprecated`
  tag naming the migration or explaining the absence of a direct replacement. The annotation
  drives tooling; the Javadoc tells the human what to do.
- Under stable SemVer, deprecate in a minor version and remove no earlier than the next
  major, subject to any longer published support window.
- A deprecated member keeps working — deprecation that changes behaviour is a behavioural
  break wearing a warning.

## Semantic versioning as a communication contract

For stable releases using Semantic Versioning (1.0.0 onward), the version number is a
machine-readable compatibility claim about the _published_ surface. Initial development
versions (0.y.z) and projects using another policy need their actual compatibility agreement;
neither a version label nor this skill authorizes breaking supported consumers.

- **Major**: any break in the table above — including purely behavioural ones. "Every
  caller still compiles" is not the test; "no caller can tell the difference, except for
  the fixes we documented" is.
- **Minor**: additive and compatible in all three senses (new methods, new types, new
  default methods you have checked against known implementors).
- **Patch**: behaviour changes only where the previous behaviour contradicted the
  documented contract.

Define the supported surface explicitly. Unexported JPMS packages are strongly hidden from normal
module consumers, but classpath use, reflection/open packages, service providers, serialization,
subclassing and public signatures can still create dependencies. “Internal” documentation reduces
the compatibility promise; it does not erase observed ecosystem coupling or operational risk.

Verification: run a binary-compatibility checker (japicmp or Revapi) against the previous
release in CI, and gate the version bump on its report rather than on memory of the table
above. Behavioural compatibility has no checker; it is guarded by keeping the old
version's test suite passing against the new implementation.

Also test source compatibility by compiling representative downstream source, and run old client
binaries without recompilation. A binary checker cannot prove overload resolution, reflection,
annotation-processing, serialization, JPMS access or behavioural compatibility.

## Authoritative references

- [JLS Chapter 13: Binary Compatibility](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html)
- [MatchException, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/MatchException.html)
- [Java SE 17 switch-expression execution](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.28.2)
- [Record deserialization, Java SE 25, step 11](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/input.html#the-objectinputstream-class)
- [Java Object Serialization compatibility](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/version.html)
- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)
