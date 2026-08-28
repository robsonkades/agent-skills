---
name: technical-debt-decisions
description: >
  Deciding when a shortcut is a legitimate trade and when it is just damage: separating
  deliberate debt from mess, the things that are never tradeable at any deadline, containing a
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

"Technical debt" is used for two entirely different things: a trade someone made deliberately
to get value sooner, and code that is simply bad. The first has a return and can be managed;
the second has no upside and calling it debt makes it sound like it did.

The decision this skill serves is the one made under pressure, in a few minutes, when a
deadline or an incident is pushing something to be cut. Made well it is professional
engineering; made badly it is the thing everyone will be paying for in eighteen months without
knowing why.

## Workflow

1. **Name what is being traded away.** Not "quality" — which test, which abstraction, which
   migration step, which error path. A trade you cannot name is not a trade, it is an omission.
2. **Check it against the never-tradeable list** (`references/deciding.md`). Some things are
   not shortcuts, they are defects with a schedule attached: silent data loss, an unauthorised
   path, money computed wrongly, a migration that cannot be reversed.
3. **Price both sides.** What does taking it buy — days, a deadline, information? What does
   carrying it cost, per week, in slowed changes and in risk? A shortcut that buys two days and
   costs an hour a week has repaid nothing after a month.
4. **Contain it.** Put the shortcut behind one interface, in one module, under one flag — so
   that repaying it later is a bounded change rather than an excavation. Containment is what
   separates debt from mess.
5. **Record it where it will be found** (`references/recording-and-repaying.md`): what, why,
   what it costs, what triggers repayment, who owns it.
6. **Say it out loud to whoever is buying the time.** A trade the business does not know it
   made is not a trade; it is a surprise scheduled for later (engineering-communication).

## Rules

- Deliberate and recorded, or it is not debt. The same shortcut taken silently is
  indistinguishable from a mistake, and it will be treated as one — by the next reader, and by
  you in six months.
- Some things are never traded, at any deadline: correctness of money and data, authorisation
  on a new path, silent data loss, an unreversible migration without a tested rollback, and
  logging a secret. If the deadline requires one of these, the deadline is what gives.
- Contain before you cut. An uncontained shortcut spreads: three callers depend on it, a second
  feature is built on it, and the bounded change becomes a rewrite. The containment is usually
  the cheap part of the whole decision.
- A shortcut with no repayment trigger will not be repaid. "Later" is not a trigger; "before
  the second tenant is onboarded", "when this endpoint exceeds 100 rps", "at the next migration
  of this table" are triggers, because someone will notice them happening.
- Debt that costs nothing to carry is not worth repaying. Ugly code in a stable module nobody
  touches has zero interest — repaying it spends real risk to buy an aesthetic. Prioritise by
  carrying cost, not by how much the code offends you.
- Never call a rewrite a debt repayment. Rewrites discard the accumulated behaviour that the
  ugly code encodes, most of it undocumented, some of it load-bearing. Incremental repayment
  under test is the mechanism (java-refactoring); a rewrite is a separate decision with a
  separate risk profile (architecture-refactoring-paths).
- Test debt is the most expensive kind and the first to be proposed. Skipping the test for the
  path you changed removes the mechanism that would have caught the shortcut going wrong; if
  something must be cut, cut scope instead.
- During an incident, mitigate first and record second — but record within the day, while you
  still remember what you actually did and why (debugging).
- Do not fix debt you notice while doing something else, beyond what the change touches. The
  opportunistic improvement is real, and it is bounded by the diff a reviewer can hold in their
  head (code-review).

## References

- **Deciding** — `references/deciding.md`. The deliberate/inadvertent × prudent/reckless
  quadrant and why attribution matters, the never-tradeable list with the reason each is on it,
  a containment checklist, and three worked decisions — a deadline, an incident, and a spike
  about to become production code. Read when a shortcut is being proposed.
- **Recording and repaying** — `references/recording-and-repaying.md`. The debt record and
  where it lives, writing a trigger that fires, estimating carrying cost, repayment strategies
  (opportunistic, scheduled, strangled), and how to decide that a debt will never be repaid and
  say so. Read after the decision, and when planning repayment.
