# Dependency-breaking catalogue

Feathers, _Working Effectively with Legacy Code_ (2004), chapter 25, regrouped by the obstacle
that sends you looking (the book's own order is alphabetical), with page numbers from its table of
contents. The one-line descriptions and the Java verdicts are
this skill's; the technique names and pages are the book's.

Every technique **in chapter 25** is meant to be applied without tests (p. xxi) — the chapter-6
techniques at the end of this file are a different thing. That is exactly why each row carries a
cost. Apply the cheapest one that removes the obstacle, and no more.

## Constructor and parameter techniques

| Technique                    | p.  | What it does                                                                                                        | Cost / caveat                                                                                                        |
| ---------------------------- | --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Parameterize Constructor** | 379 | The collaborator the constructor `new`s becomes a constructor parameter                                             | One parameter. Keep a delegating old constructor and no caller moves — this is the safest step in the catalogue      |
| **Parameterize Method**      | 383 | Same move at method level: the object the method creates internally becomes an overload parameter                   | An extra overload to delete later                                                                                    |
| **Adapt Parameter**          | 326 | The parameter's type is untestable (`HttpServletRequest`, a vendor SDK type); wrap it in a narrow interface you own | An interface plus a thin adapter, and the adapter itself is untested — keep it free of logic so that does not matter |
| **Primitivize Parameter**    | 385 | Add a free function operating on primitive data, so new logic is testable even though the class is not              | Feathers labels it "ugly, but temporary" himself. Use only with a deletion ticket                                    |

## Hierarchy techniques

| Technique                               | p.  | What it does                                                                                                     | Cost / caveat                                                                                                              |
| --------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Subclass and Override Method**        | 401 | Subclass the class under test _in the test_, overriding whatever is untestable                                   | The general-purpose move. Blocked by `final` classes and methods, and by `sealed` types                                    |
| **Extract and Override Call**           | 348 | Move an untestable call into its own method, then override that method in a test subclass                        | Creates a `protected` member that exists only for the test. Ticket its removal                                             |
| **Extract and Override Factory Method** | 350 | The `new` in the constructor moves to an overridable `protected` method                                          | Same, plus the initialisation order is now partly the subclass's business                                                  |
| **Extract and Override Getter**         | 352 | The field becomes reachable only through a getter the test subclass overrides                                    | **Feathers flags this as the riskier variant**: the field stays null in production initialisation order until first access |
| **Pull Up Feature**                     | 388 | Pull the testable cluster of methods into a new abstract superclass, leaving the untestable dependencies below   | A new type in the hierarchy that exists for testing                                                                        |
| **Push Down Dependency**                | 392 | The inverse: push the problematic dependency down into a new subclass, making the original abstract and testable | The original class becomes abstract — a source-compatible change only if nothing instantiated it directly                  |

## Interface techniques

| Technique               | p.  | What it does                                                                                       | Cost / caveat                                                                                                                                                                                                                             |
| ----------------------- | --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extract Interface**   | 362 | Extract **the subset of methods the client actually uses** into an interface the client depends on | Extracting the whole class surface produces an interface that documents nothing — the subset is the whole point. Java-specific cost: a package-private method must widen to `public` to implement the interface                           |
| **Extract Implementer** | 356 | Rename the _class_ to `…Impl` and make the original name an interface                              | Use when the good name belongs to the class. Every `new` site stops compiling — a Lean-on-the-Compiler job. Imports keep resolving, because the interface inherits the original name, which is what makes the cost easy to under-estimate |

## Static and global techniques

| Technique                                | p.  | What it does                                                                                    | Cost / caveat                                                                                                                   |
| ---------------------------------------- | --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Expose Static Method**                 | 345 | Logic touching no instance state becomes `static`, testable without constructing the class      | The cheapest entry in the catalogue when it applies, and it applies more often than people expect                               |
| **Introduce Instance Delegator**         | 369 | Add an instance method forwarding to the static, so callers can be given a substitutable object | One extra type; the static remains for every other caller                                                                       |
| **Encapsulate Global References**        | 339 | Wrap a global or static in a class, so references go through one replaceable object             | Every reference site changes                                                                                                    |
| **Replace Global Reference with Getter** | 399 | Every read of a global becomes a `protected` getter call, overridable in a test subclass        | Another test-only `protected` member                                                                                            |
| **Introduce Static Setter**              | 372 | `static void setInstanceForTesting(...)` on a singleton                                         | **Feathers presents this as a last resort, not a pattern.** It creates a mutable global. Ticket it or do not do it              |
| **Supersede Instance Variable**          | 404 | A setter replacing an already-constructed collaborator                                          | **Feathers says he dislikes it in Java, and he is right**: it reintroduces a mutable field. Superseded by constructor injection |

## Method-body techniques

| Technique                   | p.  | What it does                                                                                                  | Cost / caveat                                                                                                                               |
| --------------------------- | --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Break Out Method Object** | 330 | A long method with tangled locals becomes a class whose fields are those locals and whose `run()` is the body | The result is still a mutable field-bag, because the locals must mutate. Records help the _parameters_, not the method object               |
| **Link Substitution**       | 377 | Swap the implementation at link/classpath time                                                                | In Java: classpath shadowing, a test-scoped dependency, a different `ServiceLoader` provider. No enabling point in the source — last resort |

## No Java equivalent

`Definition Completion` (337) and `Template Redefinition` (408) are C/C++. `Text Redefinition`
(412) is for dynamic languages. `Replace Function with Function Pointer` (396) is C — the Java
analogue is a `Supplier<T>`, `Function<A,B>` or `IntUnaryOperator` field or parameter, which since
Java 8 gives a single-method behaviour seam with no interface declaration at all.

## When there is no time — chapter 6

These four are not in chapter 25 and are not dependency-breaking. They are the "I have two days"
answer.

| Technique         | p.  | What it does                                                                                                  | When                                            |
| ----------------- | --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Sprout Method** | 59  | Write the new behaviour as a new, fully tested method; call it from one line inside the untested body         | The new behaviour fits inside the existing flow |
| **Sprout Class**  | 63  | Same, when the new behaviour needs state, or the host class cannot be instantiated at all                     | The host is beyond reach today                  |
| **Wrap Method**   | 67  | Rename the original; the new method takes the old name and calls both the original and your new tested method | The new behaviour must happen _around_ the old  |
| **Wrap Class**    | 71  | A decorator implementing the same interface, holding the legacy object, adding behaviour before or after      | The new behaviour applies to every caller       |

Feathers's own caveat on all four (ch. 6 summary, p. 76): they leave the legacy body untested and
the class slightly worse-shaped. They buy safety for the **new** code, not improvement of the old.

## Sources

Technique names and page numbers: Michael Feathers, _Working Effectively with Legacy Code_
(Prentice Hall, 2004, ISBN 0-13-117705-2), chapters 6 and 25, pages read from the publisher's
sample front matter. The one-line descriptions, cost columns and Java verdicts are this skill's,
not the book's.
