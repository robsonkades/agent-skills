---
name: java-tell-dont-ask
description: >
  Decision ownership: the type that owns an invariant or policy makes the decision. Use when a service
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
moves such decisions to the type that owns the invariant and has enough authoritative state
to enforce it — and, just as deliberately, refuses to move the ones that do not belong there.
Possessing data is not sufficient ownership: pricing, authorization and cross-aggregate policy
often belong to a policy object or application service. An anemic model over simple CRUD data is a
legitimate architecture; anemia is a problem only when invariants exist and no type owns
them.

## Workflow

1. **Find ask–decide–mutate sequences**: getters on an object, a branch on the result,
   then a setter or mutation on the same object. Each is a candidate, not a verdict.
2. **Name the invariant.** If the branch protects a rule the object must never violate,
   the decision and the mutation move into the object as one command, and the setter that
   enabled the bypass is removed. If there is no invariant — the code just shovels data —
   leave it; a transaction script over data is fine.
3. **Identify the authority and change owner.** A rule spanning aggregates may belong to
   a domain policy, process manager or application service; no participating entity becomes
   the owner merely because it holds one input. Use `references/placement-decision.md`.
4. **Apply an explicit command/query convention.** Strict CQS makes mutating commands
   return `void`; pragmatic command-query separation permits a command to return its own
   outcome. Queries must be observationally side-effect-free. Private, thread-safe memoization
   may preserve that contract; touching externally visible state on read does not.
5. **Verify**: the invariant is unenforceable to bypass through the public API, the rule
   exists in exactly one type, and its tests target that type directly.

## Rules

- Put a decision with the type that owns its invariant or policy and can enforce it from
  authoritative state. Callers express intent; data proximity alone does not establish ownership.
- Public queries expose information that callers can couple policy to. Keep queries needed for
  boundaries, observability and legitimate decisions; remove raw mutation paths and duplicated
  external derivations instead of treating every getter as a defect.
- Under strict CQS, commands return `void`. If the codebase adopts the pragmatic variant, a
  command may return its own result or updated representation; document that convention and do
  not mix unrelated answers or externally visible read effects into it.
- A record may be a boundary DTO, a value object or an immutable domain type with behavior.
  Tell-don't-ask applies according to ownership and invariant, not the `record` keyword.
- Moving a decision in-process does not serialise concurrent writers by itself. The
  check-then-act race narrows but persistence still needs its own concurrency control
  (optimistic locking, constraints). Say so in the refactoring, or someone will delete the
  version column.
- Keep infrastructure clients and ambient mechanisms out of entities. Pass a validated policy
  input when it is merely data; use a domain policy interface/value object when the behavior has
  its own domain ownership. A long list of fetched inputs is evidence the decision may belong
  outside the entity.
- Asking is correct at boundaries — mappers, serialisation, rendering — in queries and
  reports, and in orchestration across aggregates where no single object can own the rule.

## References

- [Placement decision](references/placement-decision.md) — read when it is unclear whether
  a decision belongs in the object, or the code pattern-matches ask–decide–mutate but is
  correct as it stands: heuristics, false positives, and the costs of moving.
- [Worked example: withdrawal against a limit](references/worked-example.md) — read before
  moving an invariant-bearing decision out of a service: before, analysis, after, what
  stays in the service, trade-offs, verification.
