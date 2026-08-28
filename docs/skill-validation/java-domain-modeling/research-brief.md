# Research brief — `java-domain-modeling`

Researcher output. Source-backed; not a skill. Every JEP quote below was fetched from
`openjdk.org` during this session (via `curl`, because `WebFetch` gets 403 from that host).
Every Java behaviour claim marked **[compiled]** was verified by compiling and running on
Temurin **JDK 25.0.3** with `javac --release 21 -Xlint:all`. Anything I could not verify is
marked `UNVERIFIED:`.

---

## 1. Canonical sources with citations

### 1.1 Evans, _Domain-Driven Design_ — verbatim from the official _DDD Reference_ (Evans, Domain Language Inc., 2015, CC-BY 4.0)

Source: `https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf`,
pp. 11, 12, 16. These are Evans' own pattern summaries, extracted by him from the 2004 book —
authoritative and freely quotable.

**ENTITIES** (p. 11):

> Many objects represent a thread of continuity and identity, going through a lifecycle,
> though their attributes may change.
>
> Some objects are not defined primarily by their attributes. They represent a thread of
> identity that runs through time and often across distinct representations. Sometimes such
> an object must be matched with another object even though attributes differ. An object
> must be distinguished from other objects even though they might have the same attributes.
> Mistaken identity can lead to data corruption.
>
> Therefore:
>
> **When an object is distinguished by its identity, rather than its attributes, make this
> primary to its definition in the model. Keep the class definition simple and focused on
> life cycle continuity and identity.**
>
> **Define a means of distinguishing each object regardless of its form or history. […]
> This means of identification may come from the outside, or it may be an arbitrary
> identifier created by and for the system, but it must correspond to the identity
> distinctions in the model.**
>
> **The model must define what it means to be the same thing.**
>
> (aka Reference Objects)

**VALUE OBJECTS** (p. 12):

> Some objects describe or compute some characteristic of a thing.
>
> Many objects have no conceptual identity.
>
> Tracking the identity of entities is essential, but attaching identity to other objects
> can hurt system performance, add analytical work, and muddle the model by making all
> objects look the same. […]
>
> Therefore:
>
> **When you care only about the attributes and logic of an element of the model, classify
> it as a value object. Make it express the meaning of the attributes it conveys and give
> it related functionality. Treat the value object as immutable. Make all operations
> Side-effect-free Functions that don't depend on any mutable state. Don't give a value
> object any identity and avoid the design complexities necessary to maintain entities.**

The classic book-phrasing, widely quoted and consistent with the above, is: _"An object that
represents a descriptive aspect of the domain with no conceptual identity is called a VALUE
OBJECT."_ (Evans 2004, ch. 5). I could not fetch the book text itself, so treat that exact
sentence as **secondary**; prefer the Reference wording above, which is primary and licensed.

**AGGREGATES** (p. 16):

> Therefore:
>
> **Cluster the entities and value objects into aggregates and define boundaries around
> each. Choose one entity to be the root of each aggregate, and allow external objects to
> hold references to the root only (references to internal members passed out for use
> within a single operation only). Define properties and invariants for the aggregate as a
> whole and give enforcement responsibility to the root or some designated framework
> mechanism.**
>
> Use the same aggregate boundaries to govern transactions and distribution.
>
> Within an aggregate boundary, apply consistency rules synchronously. Across boundaries,
> handle updates asynchronously.

Also worth having, because it is the direct answer to "should this be a service?" — **SERVICES**
(p. 14):

> When a significant process or transformation in the domain is not a natural responsibility
> of an entity or value object, add an operation to the model as a standalone interface
> declared as a service.

### 1.2 Vernon, _Implementing Domain-Driven Design_ (2013), ch. 6 — when a concept is a value

Vernon's six characteristics of a Value Object. I verified the list of names and their gloss
from secondary sources only (Pearson catalogue listing, DevIQ, several summaries); I do not
have the book text. **Treat the names as reliable, the wording as paraphrase, not quotation:**

1. **Measures, quantifies, or describes** a thing in the domain.
2. **Immutable.**
3. **Conceptual whole** — related attributes combined into a single unit that is meaningless
   when split (an amount without its currency; a street without its postcode).
4. **Replaceability** — when the measurement or description changes, you replace the whole
   object rather than mutate it.
5. **Value equality** — equal when all attributes are equal.
6. **Side-effect-free behaviour** — operations return new values and mutate nothing.

Vernon's practical rule, also paraphrase: _prefer a Value Object to an Entity when you can_ —
values are cheaper to create, test, optimise and maintain than identity-bearing objects, so
the burden of proof sits on the Entity, not on the value. `UNVERIFIED:` exact wording.

The operational test for item 1/3 is the useful one for a skill: **a concept is a value when
you would not ask "which one?"** — you ask "how much / what kind / what shape". If replacing
the object wholesale with an equal one loses nothing the business cares about, it is a value.

### 1.3 Fowler, _AnemicDomainModel_ (bliki, 25 November 2003) — verbatim, fetched in full

Source: `https://martinfowler.com/bliki/AnemicDomainModel.html`

His actual objection, in full:

> The basic symptom of an Anemic Domain Model is that at first blush it looks like the real
> thing. There are objects, many named after the nouns in the domain space, and these objects
> are connected with the rich relationships and structure that true domain models have. The
> catch comes when you look at the behavior, and you realize that there is hardly any
> behavior on these objects, making them little more than bags of getters and setters.
> Indeed often these models come with design rules that say that you are not to put any
> domain logic in the the domain objects. Instead there are a set of service objects which
> capture all the domain logic, carrying out all the computation and updating the model
> objects with the results. These services live on top of the domain model and use the
> domain model for data.

The economic argument, which is the one that actually persuades:

> In essence the problem with anemic domain models is that they incur all of the costs of a
> domain model, without yielding any of the benefits. The primary cost is the awkwardness of
> mapping to a database, which typically results in a whole layer of O/R mapping. This is
> worthwhile iff you use the powerful OO techniques to organize complex logic. By pulling all
> the behavior out into services, however, you essentially end up with Transaction Scripts,
> and thus lose the advantages that the domain model can bring. As I discussed in P of EAA,
> Domain Models aren't always the best tool.

**The clarification that is routinely misquoted** — it is not an argument against a service
layer, and it is not about DTOs:

> One source of confusion in all this is that many OO experts do recommend putting a layer of
> procedural services on top of a domain model, to form a Service Layer. But this isn't an
> argument to make the domain model void of behavior, indeed service layer advocates use a
> service layer in conjunction with a behaviorally rich domain model.

And what he means by "domain logic":

> The logic that should be in a domain object is domain logic - validations, calculations,
> business rules - whatever you like to call it.

Closing:

> In general, the more behavior you find in the services, the more likely you are to be
> robbing yourself of the benefits of a domain model. If all your logic is in services,
> you've robbed yourself blind.

He quotes Evans in the same article:

> Now, the more common mistake is to give up too easily on fitting the behavior into an
> appropriate object, gradually slipping toward procedural programming.

Note carefully: Fowler concedes _"Domain Models aren't always the best tool"_ in the same
paragraph as the objection. Anyone citing this article as "anemic is always wrong" is
misreading it. It says: _if you are paying for a domain model, use one._

### 1.4 Bloch, _Effective Java_, 3rd ed. (2018) — item numbers and titles verified

Verified against the item list at `https://gist.github.com/jkmcl/532eb1e453eedb390fc7973a2680e2f9`
and the O'Reilly / InformIT tables of contents. 90 items, 11 chapters.

| Item | Title (exact)                                            | Relevance here                                                                                                                                                                                           |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10   | Obey the general contract when overriding `equals`       | Value equality: reflexive, symmetric, transitive, consistent, `x.equals(null)` false. The `getClass` vs `instanceof` problem is why value types should be `final` — and records are.                     |
| 11   | Always override `hashCode` when you override `equals`    | The entity-in-a-`HashSet` failure below is exactly this contract breaking under mutation.                                                                                                                |
| 17   | Minimize mutability                                      | The five rules: no mutators; class not extendable; all fields `final`; all fields `private`; exclusive access to mutable components. A record satisfies the first four structurally and _not_ the fifth. |
| 50   | Make defensive copies when needed                        | "You must program defensively, with the assumption that clients of your class will do their best to destroy its invariants." The `List` component gap.                                                   |
| 60   | Avoid `float` and `double` if exact answers are required | Money is `BigDecimal` or `long` minor units — never `double`.                                                                                                                                            |
| 62   | Avoid strings where other types are more appropriate     | The canonical citation for `String customerId`. Bloch: strings are poor substitutes for other value types, for enums, for aggregate types, and for capabilities.                                         |

`UNVERIFIED:` I quote no sentence from the book itself; the titles are verified, the glosses
above are my summary. If the skill wants a Bloch quotation, get it from the book.

### 1.5 JEP 395: Records — delivered **JDK 16**, final

Source: `https://openjdk.org/jeps/395`. Status: Closed / Delivered, Release 16. Owner Gavin
Bierman. Preview history: JEP 359 (JDK 14), JEP 384 (JDK 15).

> **Summary** — Enhance the Java programming language with records, which are classes that
> act as transparent carriers for immutable data. Records can be thought of as nominal tuples.

> **Goals**
>
> - Devise an object-oriented construct that expresses a simple aggregation of values.
> - Help developers to focus on modeling immutable data rather than extensible behavior.
> - Automatically implement data-driven methods such as equals and accessors.
> - Preserve long-standing Java principles such as nominal typing and migration compatibility.

> **Non-Goals**
>
> - While records do offer improved concision when declaring data carrier classes, it is not
>   a goal to declare a "war on boilerplate". In particular, it is not a goal to address the
>   problems of mutable classes which use the JavaBeans naming conventions.
> - It is not a goal to add features such as properties or annotation-driven code generation,
>   which are often proposed to streamline the declaration of classes for "Plain Old Java
>   Objects".

The design-intent sentence worth putting in a skill:

> While it is superficially tempting to treat records as primarily being about boilerplate
> reduction, we instead choose a more semantic goal: modeling data as data.

And the give-up that people forget:

> This means that record classes give up a freedom that classes usually enjoy — the ability
> to decouple a class's API from its internal representation — but, in return, record class
> declarations become significantly more concise.

### 1.6 JEP 409: Sealed Classes — delivered **JDK 17**, final

Source: `https://openjdk.org/jeps/409`. Status: Closed / Delivered, Release 17. Preview
history: JEP 360 (JDK 15), JEP 397 (JDK 16). _"This JEP proposes to finalize Sealed Classes in
JDK 17, with no changes from JDK 16."_

> **Summary** — Enhance the Java programming language with sealed classes and interfaces.
> Sealed classes and interfaces restrict which other classes or interfaces may extend or
> implement them.

> **Goals**
>
> - Allow the author of a class or interface to control which code is responsible for
>   implementing it.
> - Provide a more declarative way than access modifiers to restrict the use of a superclass.
> - Support future directions in pattern matching by providing a foundation for the
>   exhaustive analysis of patterns.

> **Non-Goals**
>
> - It is not a goal to provide new forms of access control such as "friends".
> - It is not a goal to change `final` in any way.

The domain-modelling motivation, in the JEP's own words:

> Using enum classes to model fixed sets of values is often helpful, but sometimes we want to
> model a fixed set of _kinds_ of values. We can do this by using a class hierarchy not as a
> mechanism for code inheritance and reuse but, rather, as a way to list kinds of values.

### 1.7 JEP 441: Pattern Matching for switch — delivered **JDK 21**, final

Source: `https://openjdk.org/jeps/441`. Status: Closed / Delivered, Release 21. Preview
history: JEP 406 (17), 420 (18), 427 (19), 433 (20).

> **Goals**
>
> - Expand the expressiveness and applicability of switch expressions and statements by
>   allowing patterns to appear in case labels.
> - Allow the historical null-hostility of switch to be relaxed when desired.
> - Increase the safety of switch statements by requiring that pattern switch statements
>   cover all possible input values.
> - Ensure that all existing switch expressions and statements continue to compile with no
>   changes and execute with identical semantics.

**JEP 441 has no Non-Goals section.** I grepped the full rendered page for "non-goal" and it
does not appear. Do not invent one. (JEP 395, JEP 409 and JEP 456 do have them; 441 and 440 do
not.)

The passage a domain-modelling skill actually needs, on `default`:

> Manually writing a `default` clause in this situation is not only irritating but actually
> pernicious, since the compiler can do a better job of checking exhaustiveness without one.
> […] More importantly, what happens if someone later adds another constant to the `Color`
> enum? If we have an explicit match-all clause then we will only discover the new constant
> value if it shows up at run time. […] A match-all clause risks sweeping exhaustiveness
> errors under the rug.
>
> In conclusion: An exhaustive switch without a match-all clause is better than an exhaustive
> switch with one, when possible.

And on sealed types specifically:

> If the type of the selector expression is a sealed class (JEP 409) then the type coverage
> check can take into account the `permits` clause of the sealed class to determine whether a
> switch block is exhaustive. This can sometimes remove the need for a `default` clause […]

### 1.8 JEP 440: Record Patterns — delivered **JDK 21**, final

Source: `https://openjdk.org/jeps/440`. Status: Closed / Delivered, Release 21. Preview
history: JEP 405 (JDK 19), JEP 432 (JDK 20).

> **Goals**
>
> - Extend pattern matching to destructure instances of record classes, enabling more
>   sophisticated data queries.
> - Add nested patterns, enabling more composable data queries.

No Non-Goals section. Note the removal in the final version:

> the main change since the second preview is to remove support for record patterns appearing
> in the header of an enhanced `for` statement.

So `for (Point(int x, int y) : points)` **does not compile** on any released JDK.

---

## 2. Verified API reality

Everything in this section marked **[compiled]** was run. Working files:
`…/scratchpad/jdm/{Verify,Neg,Neg2,Neg3,Neg4}.java`.

### 2.1 Feature → exact JDK in which it became final

| Feature                            | JEP       | Final in      | Notes                                                       |
| ---------------------------------- | --------- | ------------- | ----------------------------------------------------------- |
| Records                            | 395       | **JDK 16**    | previewed 14, 15                                            |
| Sealed classes/interfaces          | 409       | **JDK 17**    | previewed 15, 16                                            |
| Pattern matching for `switch`      | 441       | **JDK 21**    | previewed 17–20                                             |
| Record (deconstruction) patterns   | 440       | **JDK 21**    | previewed 19, 20                                            |
| Unnamed variables & patterns (`_`) | 456       | **JDK 22**    | previewed 21 as JEP 443                                     |
| Primitive types in patterns        | 455 / 507 | **not final** | preview in 23, still preview in 25 (JEP 507, third preview) |
| Flexible constructor bodies        | 513       | **JDK 25**    | statements before `this()`/`super()`; previewed 22–24       |

**[compiled]** `case Pending _ ->` under `--release 21` fails with:

```
error: unnamed variables are not supported in -source 21
  (use -source 22 or higher to enable unnamed variables)
```

This matters for a Java-21-baseline skill: **write `case Pending p ->`, not `case Pending _ ->`,
in any example claimed to compile on 21.** All the JEP 441 examples with `_` in circulation are
JDK 22+.

### 2.2 Canonical vs compact constructor (JEP 395, verbatim)

> a record class without any constructor declarations is automatically given a **canonical
> constructor** that assigns all the private fields to the corresponding arguments of the
> `new` expression which instantiated the record.

> The canonical constructor may be declared explicitly with a list of formal parameters which
> match the record header […]. It may also be declared more compactly, by eliding the list of
> formal parameters. In such a **compact canonical constructor** the parameters are declared
> implicitly, and the private fields corresponding to record components cannot be assigned in
> the body but are automatically assigned to the corresponding formal parameter (`this.x = x;`)
> at the end of the constructor. The compact form helps developers focus on validating and
> normalizing parameters without the tedious work of assigning parameters to fields.

Consequences the skill must state precisely:

- In a compact constructor you assign **the parameter**, not the field. `amount = amount.setScale(…)`
  normalises; `this.amount = …` is a compile error. **[compiled]** — the `Money` example below
  normalises via the parameter and works.
- Access: if implicit, the canonical constructor's access modifier matches the record's; if
  explicit, it _"must provide at least as much access as the record class"_ (JEP 384 refinement,
  restated in JEP 395's History).
- A record cannot declare instance fields or instance initialisers, cannot `extend`, is
  implicitly `final`, cannot be `abstract`, and cannot declare `native` methods (JEP 395,
  "Rules for record classes"). Nested and local records are implicitly `static`.

### 2.3 What the generated `equals` / `hashCode` / `toString` actually do

JEP 395:

> `equals` and `hashCode` methods which ensure that two record values are equal if they are
> of the same type and contain equal component values; and a `toString` method that returns a
> string representation of all the record components, along with their names.

And the copy invariant:

> If an instance `r1` of `R` is copied in the following way: `R r2 = new R(r1.c1(), r1.c2(), …, r1.cn());`
> then, assuming `r1` is not the null reference, it is always the case that the expression
> `r1.equals(r2)` will evaluate to true.

Measured edge cases **[compiled]**:

| Case                                                                  | Result                  | Why                                                    |
| --------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `new WithArray(new int[]{1,2}).equals(new WithArray(new int[]{1,2}))` | **`false`**             | array components compare by reference identity         |
| `new WithDouble(Double.NaN).equals(new WithDouble(Double.NaN))`       | **`true`**              | records use `Double.compare`-style semantics, not `==` |
| `Double.NaN == Double.NaN`                                            | `false`                 | contrast                                               |
| `new WithDouble(0.0).equals(new WithDouble(-0.0))`                    | **`false`**             | `+0.0` and `-0.0` are distinct components              |
| `new CustomerId("C-9").toString()`                                    | `CustomerId[value=C-9]` | name, then `[component=value, …]`                      |

JEP 395 confirms the floating-point behaviour is deliberate: _"the implicitly declared `equals`
method is implemented so that it is reflexive and that it behaves consistently with `hashCode`
for record classes that have floating point components."_

The array result is a real domain-modelling hazard: an "immutable value object" holding a
`byte[]` silently loses value equality. Use `List<Byte>`, or a wrapper that copies and overrides
both methods.

### 2.4 Records are **shallowly** immutable — nothing is defensively copied

**[compiled]**, with `record Basket(String id, List<String> lines) {}`:

```
List<String> lines = new ArrayList<>(List.of("a"));
Basket b = new Basket("B1", lines);
lines.add("SMUGGLED");
b.lines()              // -> [a, SMUGGLED]      inbound route open
b.lines().add("VIA ACCESSOR");
b.lines()              // -> [a, SMUGGLED, VIA ACCESSOR]   outbound route open
```

The canonical constructor assigns the reference. **There is no copy, in either direction.**
JEP 395's only claim is _"The fields derived from the record components are final. This
restriction embodies an immutable by default policy"_ — final reference, not immutable graph.
The fix is `List.copyOf` in the compact constructor. (This is `java-immutability`'s territory —
see §7.)

### 2.5 `record` + sealed interface, exhaustiveness, `default`, `case null`

JEP 395 explicitly blesses the combination:

> A record class can implement interfaces. A record class cannot specify a superclass since
> that would mean inherited state […]. Just as for classes, an interface can usefully
> characterize the behavior of many records. The behavior may be domain-independent (e.g.,
> `Comparable`) or domain-specific, in which case records can be part of a sealed hierarchy
> which captures the domain.

JEP 409: _"(Record classes are implicitly declared `final`.)"_ — so a record satisfies the
"exactly one of `final`, `sealed`, `non-sealed`" constraint on permitted subtypes without saying
anything.

**When is `default` required?** Never, for a `switch` whose selector is a sealed type all of
whose permitted subtypes are covered — that is the whole point. It **is** required (or the
switch fails to compile) when coverage is incomplete. **[compiled]**, omitting `case C`:

```
error: the switch expression does not cover all possible input values
```

Exhaustiveness is enforced for _statements_ too, not just expressions, once you use patterns —
JEP 441: _"exhaustiveness is required of any switch statement that uses pattern or null labels
or whose selector expression is not one of the legacy types."_

**The silent-swallow hazard is real and unlinted. [compiled]:** a `switch` over `sealed
interface S permits A, B, C` with `case A`, `case B`, `default -> 0` compiles with **zero
warnings under `-Xlint:all`** on JDK 25 javac, and `withDefault(new C())` returns `0` at
runtime. There is no compiler diagnostic for "you have a `default` over a sealed type". Only a
review rule or a static-analysis rule catches it.

**`case null`. [compiled]:** `switch (s)` where `s` is `null` and no `case null` label exists
throws `NullPointerException` — even for an exhaustive sealed switch. JEP 441:

> A switch block without a `case null` label is treated as if it has a `case null` rule whose
> body throws `NullPointerException`.

> If you see a `null` label in a switch block then that label will match a `null` value. If
> you do not see a `null` label in a switch block then switching over a `null` value will
> throw `NullPointerException`, as before.

`case null, default -> …` is legal and combines the two; it is a compile-time error to have
both a `null` label and a separate `default` in the illegal combination the JEP describes. For
domain modelling this argues for **making absence a variant** (`record NoPayment() implements
Payment`) rather than allowing `null` to reach the switch at all.

Runtime safety net, per JEP 441: because of separate compilation the compiler inserts a
synthetic `default` that throws when a sealed hierarchy or enum changes without recompilation —
so an unrecompiled caller gets an exception, not silent misbehaviour. That is only true if you
_did not_ write your own `default`.

### 2.6 Record deconstruction patterns

**[compiled]** on `--release 21`:

```java
case Settled(OrderId oid, Money m) -> "settled " + m.amount();
```

Nested patterns and `var` in a component position both work on 21 (JEP 440, final in 21).
`_` for an unused component requires **22+** (§2.1). Record patterns in an enhanced-`for`
header were **removed** before finalisation and do not compile anywhere.

### 2.7 `@Entity` on a record — forbidden by the specification, not merely awkward

Jakarta Persistence 3.2, §2.1 "The Entity Class" (fetched from
`https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2`):

> The entity class must be non-final. Every method and persistent instance variable of the
> entity class must be non-final.

> The entity class must have a public or protected constructor with no parameters, which is
> called by the persistence provider runtime to instantiate the entity.

> An enum, record, or interface may not be designated as an entity.

A record is implicitly `final` and has no no-arg constructor, so it violates two rules before
the explicit prohibition. `UNVERIFIED:` I did not run Hibernate to confirm the exact failure
message; the spec text above is verified. Records **are** usable as `@Embeddable` in Hibernate
6.2+ and as JPA query projections (`select new com.x.Dto(...)`) — `UNVERIFIED:` in this session;
`orm-structural-mapping` owns that ground anyway.

### 2.8 Records as HTTP request bodies

Jackson binds records via the canonical constructor (2.12+). Consequence: a compact constructor
that throws `IllegalArgumentException` surfaces during _deserialisation_, not during _validation_
— in Spring MVC that is `HttpMessageNotReadableException`, which by default maps to 400 but with
a deserialisation-shaped message rather than a field-level validation error.
`UNVERIFIED:` exact exception type and status in Spring 6/Boot 3 — I did not run it.
Bean Validation constraints on record components work (Gunnar Morling's write-up,
`morling.dev/blog/enforcing-java-record-invariants-with-bean-validation/`), **but** the known
caveat is that if you declare the canonical constructor explicitly to add cross-parameter
constraints, component annotations are not propagated to the constructor parameters and the
component constraints are lost. `UNVERIFIED:` which Hibernate Validator version introduced record
support.

The design point survives the unverified mechanics: **a record used as a wire type and a record
used as a domain value are different types with different lifetimes.** Collapsing them makes the
domain invariant a function of what a hostile client posts.

---

## 3. Live disagreements

Present these as genuine disagreements; the skill's job is to give a decision rule, not a side.

**3.1 A value type for every primitive vs. pragmatic selectivity.**
The maximalist position (widespread in the DDD/F# community, "make illegal states
unrepresentable"): every domain concept gets a type, including ones with no invariant, because
the type prevents argument transposition and documents intent for free. The pragmatic position
(Bloch item 62 is narrower than it is usually cited as — _"avoid strings where other types are
**more appropriate**"_, not "always"): a wrapper with no rule and no behaviour is a rename with
allocation and mapping cost. My reading of the evidence: the type earns its place when it
carries **a rule, a behaviour, or a confusion risk with another type of the same primitive**.
`CustomerId`/`OrderId` qualify on the third even with no rule. `record Description(String value)`
qualifies on none.

**3.2 Records as domain entities.**
Records give value equality; entities need identity equality (Evans, §1.1: _"The model must
define what it means to be the same thing"_). A record whose only component is the id gives you
identity equality for free and is a defensible entity representation for immutable/event-sourced
models. Against: JPA forbids it outright (§2.7), and an entity that must change state cannot be
a record without a full-copy `with` on every transition. The pragmatic split most teams land on —
**entities are classes with id-based `equals`; values are records** — is not a law, and an
immutable event-sourced aggregate expressed as a record has real defenders.

**3.3 May a domain type validate in its constructor?**
For: an object that can be constructed invalid pushes the check to every caller, and Bloch item
50 / Evans' side-effect-free-function guidance both point at construction-time enforcement.
Against, from the framework camp: ORMs and deserialisers reconstitute objects from persisted
state that was valid when written; re-running validation on reconstitution can reject rows that
a rule change made "invalid", and constructors that throw break lazy proxies and no-arg
requirements. The honest resolution is that these are two different constructors — a
domain-facing one that validates and a persistence-facing reconstitution path that does not —
and the disagreement is really about whether that split is worth its cost. `UNVERIFIED:` I have
not surveyed how many teams do it.

**3.4 Anemic model: anti-pattern or legitimate choice.**
Fowler's own article concedes _"Domain Models aren't always the best tool"_ and his objection is
explicitly economic — you pay for O/R mapping and get Transaction Script. Greg Young and others
have argued the anemic model is simply Transaction Script mislabelled, and that the anti-pattern
label is a purity complaint. The synthesis, which the repo already holds in
`domain-logic-organization`: anemia is a cost _only where a domain model was the right choice_.
Over five CRUD screens it is not anemia, it is correct minimalism.

**3.5 Sealed ADT `Result` types vs exceptions.**
For `Result`: expected outcomes (validation failure, insufficient funds, not found) are domain
information, not exceptional control flow; an exhaustive switch forces the caller to handle
every outcome, which `catch` never does. Against: Java has no `?`/`do`-notation, so composing
`Result`-returning calls degenerates into nested switches or a hand-rolled monad; the language,
libraries and frameworks are all exception-shaped; and `@Transactional` rollback is driven by
thrown exceptions, so a `Result` failure silently commits. This is the sharpest of the five and
the repo already assigns it to `java-exception-design` ("when a sealed result type beats an
exception").

---

## 4. Field failure modes

Concrete, ordered roughly by frequency.

1. **`String customerId` passed where `String orderId` was expected.** Compiles, runs, corrupts.
   **[compiled]** the typed version fails at compile time with
   `error: incompatible types: CustomerId cannot be converted to OrderId`. This is the single
   most defensible reason for a value type — no invariant needed, just distinguishability.
2. **`BigDecimal amount` with no currency.** A "conceptual whole" (Vernon char. 3) split in two.
   Symptoms: a `sum` that adds GBP to EUR; a currency parameter that drifts out of sync with the
   amount it describes; `equals` on `BigDecimal` returning `false` for `10.0` vs `10.00`
   (scale-sensitive — that belongs to `java-numeric-types`).
3. **Record with a mutable `List` component that callers mutate.** §2.4, measured. The object is
   labelled immutable in code review and is not.
4. **`@Entity` on a record.** Forbidden by Jakarta Persistence 3.2 §2.1 (§2.7). The reason people
   try is that they correctly noticed the entity is a data carrier — which is usually a signal
   the concept is a _value_ and belongs `@Embeddable` inside an entity, not that the entity
   should be a record.
5. **Record as an HTTP request body with no validation.** The wire type and the domain type
   collapse; the invariant is now whatever the client posted. Two failure shapes: no validation
   at all, or validation in the compact constructor that surfaces as a deserialisation error
   rather than a field-level 400 (§2.8).
6. **Value object explosion.** Forty one-line wrapper records, none with a rule, each requiring
   a converter for JSON and a converter for JPA. The mapping layer triples; nobody reads the
   types; the next developer adds `getValue()` everywhere and the wrappers become noise with
   allocation. This is `Speculative Generality` / `Lazy Element` in `java-code-smells` terms.
7. **Entity whose `equals` uses business fields, in a `HashSet`. [compiled]:**
   ```
   Customer c = new Customer("a@x.com");
   Set<Customer> set = new HashSet<>(); set.add(c);
   c.changeEmail("b@x.com");
   set.contains(c)   // -> false
   set.size()        // -> 1     (the object is in there, unreachable)
   ```
   Bloch item 11's contract broken by mutation. The object is lost in its own set, iteration
   still yields it, and `remove` cannot find it.
8. **Sealed hierarchy with a `default` branch. [compiled]:** adding variant `C` to
   `sealed interface S permits A, B, C` compiles clean under `-Xlint:all` and returns the
   default value at runtime. No warning exists. This converts the entire benefit of sealing
   into nothing.
9. _(Additional, worth including)_ **`null` reaching an exhaustive sealed switch. [compiled]** —
   `NullPointerException`, not a missing-case error, because a switch without `case null` is
   _defined_ to throw (JEP 441). Model absence as a variant instead.

---

## 5. Before/after material

Both compile on **JDK 21** and later. Verified with Temurin JDK 25.0.3 using
`javac --release 21 -Xlint:all` — clean, no warnings. Note the `_` restriction in §2.1: these
avoid unnamed patterns deliberately so they compile on 21.

### 5.1 (a) Primitive obsession → value objects, with a bug the compiler now catches

**Before** — every parameter is a `String` or a `BigDecimal`; the invariants live in the
callers' heads.

```java
class Shipping {
    void ship(String orderId, String customerId, BigDecimal amount, String currency) { … }
}

// the call site, six months later
shipping.ship(customer.getId(), order.getId(), total, "GBP");   // compiles. wrong.
```

Two bugs are invisible: the transposed ids, and an `amount` whose currency is a separate,
unenforced parameter that any caller can get wrong.

**After** — three value types, one of which (`Money`) carries a real rule:

```java
record CustomerId(String value) {
    CustomerId {
        Objects.requireNonNull(value);
        if (value.isBlank()) throw new IllegalArgumentException("blank customer id");
    }
}

record OrderId(String value) {
    OrderId { Objects.requireNonNull(value); }
}

record Money(BigDecimal amount, Currency currency) {
    Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        amount = amount.setScale(currency.getDefaultFractionDigits(), RoundingMode.UNNECESSARY);
    }
    Money plus(Money other) {
        if (!currency.equals(other.currency)) throw new IllegalArgumentException("currency mismatch");
        return new Money(amount.add(other.amount), currency);
    }
}

class Shipping {
    void ship(OrderId order, CustomerId customer, Money total) { … }
}
```

The transposition is now **`error: incompatible types: CustomerId cannot be converted to OrderId`**
— verified. `Money` normalises scale in the compact constructor (assigning the _parameter_, per
JEP 395) so `equals` is meaningful, and cross-currency addition throws rather than producing a
number. Note the honest cost: `OrderId` carries no rule beyond non-null and exists purely for
distinguishability — that is a legitimate reason, and the skill should say so rather than
pretend every wrapper has an invariant.

### 5.2 (b) `int status` + `if` chain → sealed interface + exhaustive switch

**Before** — the states are integers, the data each state needs is smeared across nullable
fields, and every consumer re-implements the mapping:

```java
class Payment {
    int status;              // 0 pending, 1 authorised, 2 settled, 3 refused
    String authCode;         // only when status == 1 or 2
    BigDecimal captured;     // only when status == 2
    String refusalReason;    // only when status == 3
}

String describe(Payment p) {
    if (p.status == 0) return "awaiting authorisation";
    else if (p.status == 1) return "authorised " + p.authCode;
    else if (p.status == 2) return "settled " + p.captured;
    else if (p.status == 3) return "refused: " + p.refusalReason;
    return "unknown";                         // reachable. always reachable.
}
```

**After** — each state is a type carrying exactly the data that state has:

```java
sealed interface Payment permits Pending, Authorised, Settled, Refused {}

record Pending(OrderId order)                    implements Payment {}
record Authorised(OrderId order, String authCode) implements Payment {}
record Settled(OrderId order, Money captured)     implements Payment {}
record Refused(OrderId order, String reason)      implements Payment {}

static String describe(Payment p) {
    return switch (p) {                       // no default — exhaustive over `permits`
        case Pending pending          -> "awaiting authorisation";
        case Authorised a             -> "authorised " + a.authCode();
        case Settled(OrderId oid, Money m) -> "settled " + m.amount();   // record pattern
        case Refused r                -> "refused: " + r.reason();
    };
}
```

Three things changed, and the skill should name all three: illegal combinations (`status == 0`
with a non-null `authCode`) are now unrepresentable; the "unknown" fallback is gone because it
cannot be reached; and adding `record Chargeback(...) implements Payment` **breaks the build at
every switch** — verified, `error: the switch expression does not cover all possible input
values`. Add a `default` and you throw all three away silently (§4.8).

Both files, with runnable `main`, are at
`C:\Users\robso\AppData\Local\Temp\claude\C--git-agent-skills\757fc763-fc07-45e5-9698-ab4411102402\scratchpad\jdm\`.

---

## 6. Over-application counter-example

The dogmatic version, and why each part is worse than what it replaced.

**6.1 A value type per field, including fields with no invariant.**

```java
record FirstName(String value) {}
record LastName(String value) {}
record MiddleName(String value) {}
record Nickname(String value) {}
record DisplayName(String value) {}
record Notes(String value) {}
record Slug(String value) {}
// … 33 more
```

Nothing is prevented — no two of these are ever confused at a call site, and none carries a
rule. What is added: 40 files, 40 Jackson serialisers or `@JsonValue` annotations, 40 JPA
`AttributeConverter`s, 40 entries in every mapper, and a call site that reads
`new DisplayName(new FirstName(f).value() + " " + new LastName(l).value())`. The developer's
next move is `getValue()` at every use, at which point the wrapper is a rename with allocation.
**Test that separates the good wrapper from the bad one:** could this value be passed to a
parameter expecting a _different_ concept of the same primitive, or does it have a rule? If
neither, delete the type.

**6.2 A sealed hierarchy for something genuinely open.**

```java
sealed interface PaymentMethod permits Card, BankTransfer, PayPal, ApplePay, GooglePay { }
```

This is right if you own every method and the set changes with your release cycle. It is wrong
the moment a plugin, a partner integration, or a customer-specific extension must add one:
JEP 409 requires permitted subtypes to be _"in the same module (if the superclass is in a named
module) or in the same package"_ — so an external implementor is structurally impossible, and
you will add `non-sealed class Other` to escape, which restores the `default` branch you sealed
the type to remove. Sealing an open set converts a runtime extension point into a source-level
edit of a type you may not own. Enums have the same failure and `java-enums` already documents
it.

**6.3 A rich domain model imposed on a CRUD screen where Transaction Script is correct.**

Five admin screens over five tables, one validation rule each ("name is required"). The
dogmatic version produces an aggregate root per table, a value object per column, a repository
per aggregate, a factory, a domain event per save, and a mapping layer from the JPA entity to
the domain object and back — to protect invariants that do not exist. Fowler's own sentence is
the argument: _"Domain Models aren't always the best tool"_, and the cost he names —
_"the awkwardness of mapping to a database, which typically results in a whole layer of O/R
mapping"_ — is precisely what you have just paid for nothing. The correct design is a
`@RestController` → service → repository script with `@NotBlank`, and it will be shorter,
faster, and easier to delete.

**The unifying diagnosis for all three: the technique was applied where the force that
motivates it (confusion risk / closed set / interacting invariants) does not exist.**

---

## 7. Boundary check — honest verdict

`ls C:\git\agent-skills\skills` → 208 directories. I read the frontmatter and, where relevant,
the full body of every plausible neighbour. Here is what is **already owned**, precisely.

| Topic in the commissioned brief                                                                                                                                          | Already owned by                                                                                                                                                                             | How completely                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record mechanics; shallow immutability; `List` component not copied; `List.copyOf` in the compact constructor; array-component `equals`; withers; accessor leaks         | **`java-immutability`**                                                                                                                                                                      | **Completely.** Its Workflow steps 1–3 and its first two Rules are verbatim this material, including the array-`equals` trap. References include `records-and-copies.md`.                                       |
| `equals`/`hashCode` contract; value equality vs entity identity; entity `equals` on a database id; records' generated implementations and edge cases; `HashSet` breakage | **`java-object-contracts`**                                                                                                                                                                  | **Completely**, and explicitly — its description names "records' generated implementations and their edge cases, entity identity under JPA and Hibernate proxies".                                              |
| Sealed interface + record variants + exhaustive `switch` with no `default`                                                                                               | **`java-composition-over-inheritance`** (Workflow step 2 and a Rule: _"Records compose but never extend […] A family of record variants is expressed as a sealed interface they implement"_) | **Completely** for the mechanism.                                                                                                                                                                               |
| `default` branch hiding a new variant                                                                                                                                    | **`java-code-smells`** (its description names "when a switch over a sealed type carries a default branch") **and `java-enums`**                                                              | **Completely.**                                                                                                                                                                                                 |
| Anemic domain model; Transaction Script vs Domain Model vs Table Module; CRUD; when anemia is legitimate                                                                 | **`domain-logic-organization`**                                                                                                                                                              | **Completely, and better than the brief asks.** It already carries the Fowler nuance: _"The anaemic domain model is a real cost, not a purity complaint — but only where a domain model was the right choice."_ |
| Invariant ownership; getters exporting decisions; "anemia is a problem only when invariants exist and no type owns them"                                                 | **`java-tell-dont-ask`**                                                                                                                                                                     | **Completely.** Its Purpose paragraph states this position outright.                                                                                                                                            |
| Primitive Obsession as a detection; `String cpf`, `long cents`, `amount`+`currency` travelling separately                                                                | **`java-code-smells`** (`references/catalogue-within.md` § Primitive Obsession, with those exact examples)                                                                                   | **Completely** for detection; `java-refactoring` owns Replace Primitive with Object.                                                                                                                            |
| `BigDecimal`, money, scale, no `double`                                                                                                                                  | **`java-numeric-types`**                                                                                                                                                                     | Completely.                                                                                                                                                                                                     |
| `String` standing in for a type                                                                                                                                          | **`java-strings-and-text`**                                                                                                                                                                  | Completely.                                                                                                                                                                                                     |
| Constructor validation; "invariants as types that cannot represent invalid states"; compact-constructor validation                                                       | **`java-design-by-contract`** (names both verbatim) + **`java-defensive-programming`**                                                                                                       | Completely.                                                                                                                                                                                                     |
| Sealed `Result` vs exceptions                                                                                                                                            | **`java-exception-design`** ("when a sealed result type beats an exception")                                                                                                                 | Completely.                                                                                                                                                                                                     |
| Value type → columns; `@Embeddable`; Embedded Value                                                                                                                      | **`orm-structural-mapping`**                                                                                                                                                                 | Completely.                                                                                                                                                                                                     |
| Record as request body / DTO vs domain object crossing a boundary                                                                                                        | **`remote-facade-and-dto`**                                                                                                                                                                  | Completely.                                                                                                                                                                                                     |
| Value-object explosion as over-abstraction                                                                                                                               | **`java-code-smells`** (Speculative Generality, Lazy Element) + **`java-dry-kiss-yagni`**                                                                                                    | Completely.                                                                                                                                                                                                     |

### What is actually left

Three things, and only three:

1. **The classification decision.** Given a domain concept, is it an **entity** (identity,
   lifecycle, "which one?"), a **value** (equality, replaceability, "how much / what kind?"),
   or **neither** (a parameter that needs no type at all)? Evans' and Vernon's vocabulary for
   making that call appears **nowhere in this repo.** `domain-logic-organization` decides _where
   the logic lives_; `repository-pattern` treats aggregates as an access abstraction; there is
   no `ddd-value-objects` or `ddd-aggregates-and-invariants` here (those exist in the user's
   _other_ repo, `C:\git\java-skills`, and are not neighbours of this one).
2. **The selectivity budget for value types.** Which primitives earn a wrapper.
   `java-code-smells` detects Primitive Obsession; `java-refactoring` names the fix; **neither
   gives a rule for when _not_ to wrap**, and §6.1 is the failure that rule prevents. This is a
   genuine gap but a small one.
3. **The construct-selection table.** Concept → `enum` | `record` | sealed interface + records |
   plain class with id-`equals` | no type. The fragments exist in five different skills and
   nothing joins them.

### Verdict

**Marginal — justified only as a narrow routing/decision skill, and it must be written that way.**

Roughly **75–80% of the commissioned brief is already covered**, and covered well, by seven
existing skills. If `java-domain-modeling` is written as a content skill — explaining record
mechanics, defensive copies, `equals` contracts, sealed switch exhaustiveness and the anemic
model — it will duplicate `java-immutability`, `java-object-contracts`,
`java-composition-over-inheritance`, `domain-logic-organization` and `java-tell-dont-ask`
substantially, and under this repo's own rule ("nothing that a capable agent already does
correctly", §6 of the suite spec) it should not ship.

The residue is real: **nobody in this repo owns the entity/value/neither classification, or the
budget for how many value types a model should have.** That is a legitimate 70–110-line skill —
built around a `## Decision rules` block, roughly one-third original content and two-thirds
explicit hand-offs, with negative scope stated aggressively in the body ("the mechanics of the
record you decided on are `java-immutability`; the `equals` contract is `java-object-contracts`;
where the logic lives is `domain-logic-organization`").

If the suite cannot accept a skill that is mostly routing, **do not write this one.** The better
alternative is two small additions to existing skills: a "when _not_ to wrap a primitive"
section in `java-code-smells`' Primitive Obsession entry, and an entity/value classification
paragraph in `domain-logic-organization`'s `references/domain-model.md`. I would rate that
option roughly equal in value and cheaper to maintain. My recommendation, weakly held: **write
it, but only as the narrow decision skill described above; reject any draft that re-explains
record or sealed mechanics.**

---

## Sources

- [JEP 395: Records](https://openjdk.org/jeps/395)
- [JEP 409: Sealed Classes](https://openjdk.org/jeps/409)
- [JEP 440: Record Patterns](https://openjdk.org/jeps/440)
- [JEP 441: Pattern Matching for switch](https://openjdk.org/jeps/441)
- [JEP 456: Unnamed Variables & Patterns](https://openjdk.org/jeps/456)
- [JEP 455: Primitive Types in Patterns (Preview, JDK 23)](https://openjdk.org/jeps/455) ·
  [JEP 507 (Third Preview, JDK 25)](https://openjdk.org/jeps/507) ·
  [JEP 513: Flexible Constructor Bodies (JDK 25)](https://openjdk.org/jeps/513)
- [Eric Evans, _Domain-Driven Design Reference_, 2015 (CC-BY 4.0)](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
- [Martin Fowler, _AnemicDomainModel_, 25 Nov 2003](https://martinfowler.com/bliki/AnemicDomainModel.html)
- [Effective Java 3rd ed. — full item list](https://gist.github.com/jkmcl/532eb1e453eedb390fc7973a2680e2f9) ·
  [publisher ToC](https://www.oreilly.com/library/view/effective-java-3rd/9780134686097/)
- [Jakarta Persistence 3.2 specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
- [Gunnar Morling, _Enforcing Java Record Invariants With Bean Validation_](https://www.morling.dev/blog/enforcing-java-record-invariants-with-bean-validation/)
- Vaughn Vernon, _Implementing Domain-Driven Design_ (2013), ch. 6 — characteristics list
  corroborated via [Pearson eLibrary listing](https://elibrary.pearson.de/book/99.150005/9780133039924)
  and [DevIQ](https://deviq.com/domain-driven-design/value-object/); **no primary text obtained**.
