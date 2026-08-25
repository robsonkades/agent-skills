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

Verified against JLS chapter 13 semantics; the error columns name what an old, not
recompiled client sees.

| Change to a published API                                                               | Binary                                                                  | Source                                                                                                        | Behavioural                                                        | Notes                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a method to a (non-sealed) class                                                    | OK                                                                      | usually OK                                                                                                    | OK                                                                 | Can clash with a subclass method that already used the name                                                                                                                                        |
| Add an abstract method to an interface                                                  | links, but `AbstractMethodError` when invoked on an old implementation  | breaks implementors                                                                                           | —                                                                  | The linkage succeeds; the error is deferred to the call                                                                                                                                            |
| Add a `default` method to an interface                                                  | OK                                                                      | OK, unless it collides with another interface's default                                                       | risk                                                               | The default body may be wrong for existing implementors — it is behaviour they never reviewed                                                                                                      |
| Add a `static` method to an interface                                                   | OK                                                                      | OK                                                                                                            | OK                                                                 | Not inherited; no clash with implementors                                                                                                                                                          |
| Add an overload                                                                         | OK                                                                      | may create ambiguity                                                                                          | **risk**                                                           | Resolution of existing call sites can change: adding `process(long)` beside `process(Integer)` silently captures `process(1)`, because widening beats boxing                                       |
| Add a parameter, remove one, or reorder differently-typed ones                          | **breaks** (`NoSuchMethodError`)                                        | breaks                                                                                                        | —                                                                  | A changed signature is a removal plus an addition                                                                                                                                                  |
| Reorder parameters of the same type                                                     | OK                                                                      | OK                                                                                                            | **breaks**                                                         | The worst kind: nothing fails except the results                                                                                                                                                   |
| Widen a parameter type (`ArrayList` → `List`)                                           | **breaks** (`NoSuchMethodError`)                                        | OK for callers; existing overriders silently become overloads (`@Override` turns that into a compile error)   | risk (a recompiled subclass that meant to override no longer does) | The method descriptor changed; source-compatible changes can still be binary breaks                                                                                                                |
| Change a return type                                                                    | **breaks** (`NoSuchMethodError`)                                        | breaks                                                                                                        | —                                                                  | The descriptor includes the return type                                                                                                                                                            |
| Add a checked exception to `throws`                                                     | OK                                                                      | breaks callers                                                                                                | —                                                                  | `throws` has no linkage effect — it is checked only at compile time                                                                                                                                |
| Remove or rename a public member                                                        | **breaks**                                                              | breaks                                                                                                        | —                                                                  | Rename = remove + add; deprecate-and-delegate instead                                                                                                                                              |
| Make a class `final`                                                                    | **breaks** existing subclasses (`IncompatibleClassChangeError` at load) | breaks                                                                                                        | —                                                                  | Same for making it `sealed` against foreign subclasses                                                                                                                                             |
| Make a method `final`                                                                   | **breaks** existing overriders (`IncompatibleClassChangeError` at load) | breaks                                                                                                        | —                                                                  |                                                                                                                                                                                                    |
| Reduce visibility (`public` → package-private)                                          | **breaks** (`IllegalAccessError`)                                       | breaks                                                                                                        | —                                                                  | Increasing visibility is safe                                                                                                                                                                      |
| Change the value of a compile-time constant (`static final` primitive/String)           | links                                                                   | OK                                                                                                            | **breaks silently**                                                | The old value was inlined into clients at their compile time; they keep it until recompiled. Do not publish constants whose values may change                                                      |
| Add a component to a record                                                             | **breaks** (canonical constructor signature changes)                    | breaks record-pattern deconstructions (`incorrect number of nested patterns`) and canonical-constructor calls | —                                                                  | Mitigate: keep the old signature as a non-canonical delegating constructor — old callers link and compile; pattern users still break                                                               |
| Add a constant to an enum / a variant to a sealed interface                             | OK                                                                      | breaks clients switching exhaustively without `default`                                                       | risk                                                               | For sealed types that break is the design's purpose — treat it as major anyway: it is still a break for clients. A stale exhaustive switch throws `MatchException` when the new variant reaches it |
| Strengthen a precondition, narrow accepted input, change ordering/nullability of output | OK                                                                      | OK                                                                                                            | **breaks**                                                         | Compiles, links, and fails in production; a major version despite zero signature changes                                                                                                           |

## Deprecation policy

- Mark with `@Deprecated(since = "<version>", forRemoval = true)` **and** a Javadoc
  `@deprecated` tag naming the replacement and the removal version. The annotation drives
  tooling; the Javadoc tells the human what to do instead.
- Deprecate in a minor version, remove no earlier than the next major.
- A deprecated member keeps working — deprecation that changes behaviour is a behavioural
  break wearing a warning.

## Semantic versioning as a communication contract

The version number is a machine-readable compatibility claim about the _published_
surface:

- **Major**: any break in the table above — including purely behavioural ones. "Every
  caller still compiles" is not the test; "no caller can tell the difference, except for
  the fixes we documented" is.
- **Minor**: additive and compatible in all three senses (new methods, new types, new
  default methods you have checked against known implementors).
- **Patch**: behaviour changes only where the previous behaviour contradicted the
  documented contract.

Internal packages (unexported under JPMS, or documented as internal) are outside the
claim — changes there are never a version event, which is the payoff for keeping the
exported surface minimal.

Verification: run a binary-compatibility checker (japicmp or Revapi) against the previous
release in CI, and gate the version bump on its report rather than on memory of the table
above. Behavioural compatibility has no checker; it is guarded by keeping the old
version's test suite passing against the new implementation.
