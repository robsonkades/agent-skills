---
name: technical-debt-decisions
description: >
  Deciding when a shortcut is a legitimate trade and when it is just damage: separating
  deliberate and inadvertent debt, constraints delivery pressure does not waive, containing a
  shortcut so it can be undone, recording it where someone will find it, and choosing which
  debt to repay by its carrying cost rather than by how much it annoys you. Use when a
  deadline or an incident is pushing work to be cut, when someone proposes shipping now and
  cleaning up later, when a spike is about to become production code, when "technical debt" is
  being used to justify a rewrite, when a debt backlog has grown into a list nobody reads, or
  when deciding whether to fix something you have just noticed. Does not cover the refactoring
  mechanics of repaying it (java-refactoring), how to detect the problem
  (java-code-smells), how to communicate the trade (engineering-communication), or which
  gates may be skipped (quality-gates).
---

# Technical Debt Decisions

## Purpose

Technical debt describes future cost from a design compromise, whether deliberate or discovered
through learning. Recording a trade makes it manageable; an unrecorded or reckless choice can
still create debt. Classify consequences rather than using the label to excuse damage.

The decision this skill serves is the one made under pressure, in a few minutes, when a
deadline or an incident is pushing something to be cut. Made well it is professional
engineering; made badly it is the thing everyone will be paying for in eighteen months without
knowing why.

## Workflow

1. **Name what is being traded away.** Not "quality" — which test, which abstraction, which
   migration step, which error path. A trade you cannot name is not a trade, it is an omission.
2. **Check it against non-delegable constraints** (`references/deciding.md`). Security,
   correctness, privacy, safety, legal and recovery requirements need authorization from the
   accountable owner and compensating controls; delivery pressure does not silently waive them.
3. **Price both sides.** What does taking it buy — days, a deadline, information? What does
   carrying it cost over the relevant horizon? Distinguish initial benefit, ongoing cost,
   repayment effort and change risk; use ranges and comparable units.
4. **Contain it.** Use an existing boundary, local guard or flag where useful — so
   that repaying it later is a bounded change rather than an excavation. Containment is what
   separates debt from mess.
5. **Record it where it will be found** (`references/recording-and-repaying.md`): what, why,
   what it costs, what triggers repayment, who owns it.
6. **Make the trade visible to the accountable owner.** Team-local reversible debt need not become
   executive ceremony; risk crossing product, security, compliance or operational boundaries does
   require the person authorized to accept it (engineering-communication).

## Rules

- Record deliberate debt; for inherited/inadvertent debt, capture what is known without inventing
  original intent. Missing evidence of cost or benefit is unknown, not zero.
- Do not silently trade correctness, authorization, privacy, safety, legal records or recoverability.
  Some changes are legitimately forward-only; they require rehearsed recovery/forward-fix, backups
  with proven restore objectives and explicit risk acceptance rather than a fictional rollback.
- Contain before you cut. An uncontained shortcut spreads: three callers depend on it, a second
  feature is built on it, and the bounded change becomes a rewrite. The containment is usually
  the cheap part of the whole decision.
- A shortcut with no repayment trigger will not be repaid. "Later" is not a trigger; "before
  the second tenant is onboarded", "when this endpoint exceeds 100 rps", "at the next migration
  of this table" are triggers, because someone will notice them happening.
- Debt with negligible carrying risk, no foreseeable change and no blocked option is usually not
  worth repaying. “Nobody touched it recently” is incomplete evidence: include security exposure,
  unsupported dependencies, recovery burden and concentration of knowledge.
- A rewrite can repay debt but adds migration and behavioral risk. Compare incremental repair
  with replacement using compatibility, data migration, cutover/recovery and expected value;
  the label is not justification (architecture-refactoring-paths).
- Test debt is dangerous when it removes the only evidence for changed or high-risk behavior.
  Deleting redundant, misleading or lower-value tests can improve the suite; record which risk is
  left uncovered and prefer cutting scope when essential evidence cannot be produced.
- During an incident, follow incident authority: stabilize impact and preserve perishable evidence
  in parallel where possible. Record the mitigation during handoff or post-incident follow-up while
  context remains available; a universal same-day deadline is not the control (debugging).
- Do not fix debt you notice while doing something else, beyond what the change touches. The
  opportunistic improvement is real, and it is bounded by the diff a reviewer can hold in their
  head (code-review).

## Application contract

Use existing authorization and delegated scope; escalate only an unresolved material trade
outside it. An owner cannot waive a non-exceptionable requirement merely by accepting risk.
Preserve Java/framework/toolchain constraints; debt review does not authorize an upgrade.
Return decision, evidence/uncertainty, owner and repayment/review trigger proportionately.
Implement authorized prerequisite fixes rather than stopping because an item is labelled debt.

## References

- **Deciding** — `references/deciding.md`. The deliberate/inadvertent × prudent/reckless
  quadrant and why attribution matters, the never-tradeable list with the reason each is on it,
  a containment checklist, and three worked decisions — a deadline, an incident, and a spike
  about to become production code. Read when a shortcut is being proposed.
- **Recording and repaying** — `references/recording-and-repaying.md`. The debt record and
  where it lives, writing a trigger that fires, estimating carrying cost, repayment strategies
  (opportunistic, scheduled, strangled), and how to decide that a debt will never be repaid and
  say so. Read after the decision, and when planning repayment.
