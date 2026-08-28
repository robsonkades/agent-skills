---
name: java-tell-dont-ask
description: >
  Decision ownership: the object that has the data makes the decision. Use when a service
  reads state with getters, decides, and writes state back (if (acct.getBalance() > x)
  acct.setBalance(...)), when the same rule is re-derived from the same getters in several
  places, when an invariant exists but no type enforces it, when a domain model is all
  getters and setters with the logic in services, or when a getter has side effects. Covers
  command–query separation and when asking is correct: boundaries, reporting,
  cross-aggregate orchestration. Does not cover the navigation chains that often carry the
  asking — that is java-law-of-demeter.
---

# Java Tell, Don't Ask

## Purpose

`if (account.getBalance().compareTo(amount) >= 0) account.setBalance(...)` is a rule that
lives nowhere: the invariant "balance never goes below the limit" is enforced only at call
sites that remember to check, and the read–decide–write gap makes it race-prone. This skill
moves such decisions to the object that owns the data — and, just as deliberately, refuses
to move the ones that do not belong there. An anemic model over simple CRUD data is a
legitimate architecture; anemia is a problem only when invariants exist and no type owns
them.

## Workflow

1. **Find ask–decide–mutate sequences**: getters on an object, a branch on the result,
   then a setter or mutation on the same object. Each is a candidate, not a verdict.
2. **Name the invariant.** If the branch protects a rule the object must never violate,
   the decision and the mutation move into the object as one command, and the setter that
   enabled the bypass is removed. If there is no invariant — the code just shovels data —
   leave it; a transaction script over data is fine.
3. **Check the decision has a single owner.** A rule needing data from several aggregates
   has no single owner; it stays in the service, which asks each object questions the
   object can answer. Use `references/placement-decision.md` when ownership is unclear.
4. **Apply command–query separation.** Commands change state and return `void` or the
   outcome of the command; queries answer without side effects. A getter that mutates —
   lazily initialising a collection, touching a timestamp — is a bug factory: it makes
   reads unrepeatable and order-dependent.
5. **Verify**: the invariant is unenforceable to bypass through the public API, the rule
   exists in exactly one type, and its tests target that type directly.

## Rules

- The object with the data decides; callers say what they want done, not how.
- Every public getter exports a decision point. Add getters for boundaries, queries and
  reporting — never so a caller can decide something the object should decide.
- A command may return its own outcome (a result object, the new state it produced) —
  that is not a CQS violation. Answering an unrelated question while mutating is.
- Records and DTOs are data carriers: tell-don't-ask does not apply to them. Applying it
  turns contracts into objects and mappers into collaborators.
- Moving a decision in-process does not serialise concurrent writers by itself. The
  check-then-act race narrows but persistence still needs its own concurrency control
  (optimistic locking, constraints). Say so in the refactoring, or someone will delete the
  version column.
- Never inject services into domain objects to feed a moved decision; pass the needed
  values into the command method instead.
- Asking is correct at boundaries — mappers, serialisation, rendering — in queries and
  reports, and in orchestration across aggregates where no single object can own the rule.

## References

- [Placement decision](references/placement-decision.md) — read when it is unclear whether
  a decision belongs in the object, or the code pattern-matches ask–decide–mutate but is
  correct as it stands: heuristics, false positives, and the costs of moving.
- [Worked example: withdrawal against a limit](references/worked-example.md) — read before
  moving an invariant-bearing decision out of a service: before, analysis, after, what
  stays in the service, trade-offs, verification.
