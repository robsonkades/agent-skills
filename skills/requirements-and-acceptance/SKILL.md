---
name: requirements-and-acceptance
description: >
  Turning a request into something buildable and checkable before writing code: separating the
  requirement from the implementation someone already chose, finding the ambiguities that
  change the work, naming assumptions where they can be contradicted, writing acceptance
  criteria that a test can be derived from, and surfacing contradictions instead of resolving
  them silently. Use before implementing a ticket whose edge cases are unstated, when a
  request names a solution rather than a need, when "fast", "secure" or "reliable" appears
  without a number, when two requirements cannot both hold, when a change is rejected in
  review for doing the wrong thing, or when deciding whether to ask or to proceed on a stated
  assumption. Does not cover how long it will take (estimation-under-uncertainty), how to
  deliver the message (engineering-communication), the test level
  (java-testing-strategy), or the order of work (clean-delivery-workflow).
---

# Requirements and Acceptance

## Purpose

Most rework is not caused by bad code. It is caused by building a correct implementation of a
requirement nobody had actually agreed, where the gap only becomes visible once the work is
done and expensive to change.

The cheap moment to find that gap is before the first line. This skill is the set of questions
that finds it, and the artefacts — assumptions and acceptance criteria — that make the answer
durable enough that the next person can check it.

## Workflow

1. **Separate the four things.** A request usually mixes them:
   - **Requirement** — what must become true, in the domain's terms.
   - **Implementation** — a solution someone already picked. Often reasonable; still not the
     requirement, and holding it fixed hides cheaper options.
   - **Assumption** — something you filled in. Legitimate, provided it is written down.
   - **Acceptance criterion** — how anyone will know it is done.
2. **Restate the requirement without the solution.** "Add a Redis cache to the customer
   endpoint" restates as "the customer endpoint must respond within X at Y requests/second".
   Now caching is one option, and the number is the thing to agree.
3. **Run the ambiguity checklist** (`references/ambiguity-checklist.md`). Most tickets have
   three or four unstated cases; the ones that matter are the ones where two readings produce
   different code.
4. **Sort what you found**: ask about anything where different answers mean materially
   different work; assume the rest and write the assumption down where it will be read.
5. **Write acceptance criteria** at the behaviour level, one per rule, each derivable into a
   test (`references/acceptance-criteria.md`).
6. **Say what is out of scope**, explicitly. Scope is defined as much by the exclusions as by
   the inclusions, and unstated exclusions are where "but obviously it should also…" lives.

## Rules

- Never invent a requirement silently. If you filled a gap, the assumption goes in the ticket,
  the pull request description or the commit message — somewhere the person who knows can
  contradict it. An assumption that lives only in the code is indistinguishable from a defect.
- Ask when the answers diverge, not when you are merely uncertain. If both readings lead to
  the same code, pick one and note it; if they lead to different data models, ask. This is the
  whole test for "should I ask or proceed".
- Adjectives are not requirements. Fast, scalable, secure, robust, user-friendly and real-time
  each need a number, a scenario, or a named standard before they can be built or verified.
- Surface contradictions; do not resolve them by choosing. "Every action is audited" and
  "personal data is erased on request" conflict, and the resolution is a decision someone with
  authority makes — implementing one and hoping is the failure mode.
- The failure behaviour is part of the requirement. What happens when the dependency is down,
  the input is malformed, the operation is retried, or two users act at once — an unstated
  answer here becomes an incident, not a feature request.
- Non-functional requirements are stated as scenarios with numbers, or they are decoration:
  "p99 under 200 ms at 500 rps with a 20 ms database" is checkable; "must be performant" is not.
- Acceptance criteria describe observable behaviour, not implementation. A criterion mentioning
  a class, a table or a framework has stopped describing what the user gets and started pinning
  how it is built.
- "Done" includes the things nobody puts in the ticket: tests, migration, rollback, logging,
  documentation the next person needs. Agree the standing list once rather than negotiating it
  per change.

## References

- **The ambiguity checklist** — `references/ambiguity-checklist.md`. Categories of unstated
  requirement — quantity, boundary, concurrency, failure, authority, lifecycle, scope — each
  with the question that exposes it, plus a worked example turning a two-line ticket into eight
  answerable questions and three recorded assumptions. Read before implementing anything whose
  edges are unstated.
- **Writing acceptance criteria** — `references/acceptance-criteria.md`. Criteria at the right
  level of abstraction, the Given/When/Then form and where it misleads, deriving tests from
  criteria, non-functional scenarios, and a definition of done that is a checklist rather than
  a sentiment. Read when writing or reviewing criteria.
