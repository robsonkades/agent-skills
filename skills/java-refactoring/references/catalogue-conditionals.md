# Catalogue: conditional logic

Conditionals are where refactorings change behaviour without changing a single value —
almost always through operand order, short-circuit evaluation, or null. Each entry names
the precondition that keeps the step honest.

Order matters when several apply to one method: guard clauses first, then extract the
remaining conditions into named predicates, then consolidate what duplicates. Consolidating
before extracting hides the duplication you were trying to see.

The technique not here is Replace Conditional with Polymorphism and its sealed-switch
alternative: that is a design choice with two defensible answers, and it lives in
`techniques.md`.

## Decompose Conditional

A condition or an arm that does not read at the method's abstraction level becomes a named
method: `if (isEligibleForVolumeDiscount(order))` instead of the expression, and
`applyVolumePrice(order)` instead of six lines in the arm.

**Precondition:** the extracted expression has no side effect, and — relevant only when the
extraction also moves the evaluation point — no operand's value can change between where
the condition is evaluated today and where the extracted method evaluates it. A boolean
expression that needs a comment is the signal to act on: the comment is the method name.

**Cost:** a name and a hop per extraction. Extracting a two-term condition that already
reads cleanly buys nothing.

## Replace Nested Conditional with Guard Clauses

When some branches handle exceptional or trivial cases, return from those early and leave
the main path unindented.

**Precondition:** one arm returns or throws with no shared code after the `if` — that arm
becomes the guard. Where both arms fall through into common code, `if/else` is the honest
shape and a guard clause lies about it.

**Mechanics, and the trap.** Convert **one** condition at a time, compile, run tests. The
silent break is the inversion. De Morgan preserves short-circuiting _positionally_ —
`!(a && b)` is `!a || !b`, and `!b` is still evaluated only when `a` held — so the danger is
not inverting but **reordering the operands while inverting**, which people do because the
other order "reads better":

```java
// before: getProfile() is never called when customer is null
if (customer != null && customer.getProfile().isVerified()) { … }

// CORRECT — operand order preserved, so the null check still runs first
if (customer == null || !customer.getProfile().isVerified()) return DENIED;

// BROKEN — operands swapped while negating; getProfile() runs on a null customer
if (!customer.getProfile().isVerified() || customer == null) return DENIED;
```

**Cost:** multiple exit points. Fine in a short method, a liability in a sixty-line one —
split the method first (java-clean-code owns that call). A guard inside a loop is
`continue`, not `return`; conflating the two is the second common break.

## Consolidate Conditional Expression

Sequential checks producing the same result merge into one expression, which then extracts
into a named predicate.

**Preconditions:** each branch must end the flow — `return` or `throw`. Where the arms fall
through (`if (a) doX(); if (b) doX();`), merging turns two executions into one whenever both
hold, which is a behaviour change, not a consolidation. Nothing may run between the checks,
and no operand may have a side effect. Combining with `||` preserves short-circuit order and
is safe where the sequential form was; combining conditions that each threw a _different_
exception is not a consolidation, because the exception type is observable.

## Introduce Special Case

When many call sites check for the same missing value and respond the same way, give the
absence a type that answers those calls. In Java 25 that is a `Missing`/`None` record in a
sealed interface, or a named constant instance.

**Preconditions, both required.** The default must be statable as a rule by someone who
does not read the code ("an unknown customer pays list price"). And the special-case type
must have a defined answer for _every_ method on the interface — if any method has to no-op
or return a dummy, the absence is not a special case and the `NullPointerException` was
telling the truth. A special case that absorbs operations turns a loud failure into quiet
wrong data, discovered later and further from the cause.

**Prefer `Optional` at method-return boundaries**; a special-case type pays when the value
flows through many collaborators that would each otherwise unwrap it. Never put an
`Optional` in a record component or an entity field to model this — java-optional owns that
boundary.

## Introduce Assertion

**In Java this is two different changes, and only one is a refactoring.**

`assert` is a no-op unless the JVM starts with `-ea`, and both mainstream build tools turn
it on for tests: Maven Surefire's `enableAssertions` defaults to `true` (since 2.3.1) and
Gradle's `Test` task sets it in its constructor. Gradle's `JavaExec`, `bootRun`, a plain
`main` and a container entrypoint do **not** — which is exactly the asymmetry being relied
on. Verify rather than assume only where a project has overridden it.

**Precondition:** the asserted expression reads only — no mutation, no I/O, no iterator
advance, no collection copy on a hot path. Under `-ea` it runs and in production it does
not, so a side-effecting assertion makes test and production genuinely different programs,
and the divergence only ever surfaces in production. Check the expression and every method
it calls for writes.

A newly red test is then information — the assumption was already false — not a regression
to patch away, and never a reason to disable assertions.

Adding a **throwing** check (`Objects.requireNonNull`, an explicit `throw`) is the other
change: inputs that previously worked by accident now fail. That is the other hat, and it
gets its own commit whose message says the contract was tightened.

## Replace Conditional Chain with Pattern Matching

An `if`/`else if` chain of `instanceof` tests over a closed hierarchy becomes a `switch`
with type patterns and, over a sealed type, an exhaustiveness guarantee.

**The precondition is null.** An `instanceof` chain is null-safe — `null instanceof X` is
`false`, so a null argument falls through to the final `else`. A `switch` on a reference
throws `NullPointerException` unless it has a `case null`, and a `default` label alone does
not match null. Converting therefore changes behaviour for null input unless the null path
is carried across explicitly:

```java
return switch (payment) {
    case null -> Result.rejected("no payment");
    case Card(_, var expiry) when expiry.isBefore(today) -> Result.rejected("expired");
    case Card card -> authorise(card);
    case Transfer transfer -> settle(transfer);
};
```

Second precondition: the chain's order is preserved. Pattern cases are tested in order, and
the compiler now rejects a case dominated by an earlier one — a dominance error usually
means the original chain had an unreachable branch, which is a finding rather than an
obstacle.

Do not add `default` over a sealed type: it converts every future "you missed a case" from a
compile error into a silent wrong branch. The single documented exception — a deliberately
partial handler stating why all unknown variants share one behaviour — is in
`techniques.md`. Note also that the exhaustiveness proof is a compile-time one: a sealed
switch with no `default` compiles to an implicit `MatchException` throw, so a permitted
subtype added in a **separately compiled** module surfaces at runtime rather than at build
time (`compatibility.md`).
