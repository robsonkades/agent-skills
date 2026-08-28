# Writing the Record

## The worked record

An architecture decision record is short, and — on the majority position, which is not unanimous (see "Supersede, or edit?" below) —
immutable once accepted, and superseded rather than edited. Nygard's five parts — title, status, context, decision, consequences —
carry everything that matters; the record below adds the alternatives, which is where re-litigation usually starts.

```markdown
# ADR-014: Enforce order invariants in the domain model, not in SQL

Status: accepted (2026-03-11) · supersedes ADR-006

## Context

Order pricing rules changed 9 times in 12 months. They currently live in three places:
a stored procedure, `OrderService`, and a trigger on `order_line`. Two of the last four
production incidents were a rule applied in one place and not the others. Peak load is
12k orders/hour. The ledger schema is owned by Finance and cannot change.

## Decision

Order pricing invariants are enforced in the `Order` aggregate. Persistence is a Data
Mapper over the existing schema. The trigger is dropped; the stored procedure is
retained read-only for the Finance report until ADR-015 replaces it.

## Alternatives considered

- Keep the rules in SQL, add a test harness. Cheapest. Rejected: rule changes need a
  DBA-owned deploy window, which is why they arrive in batches and diverge.
- Transaction Script in the service layer. Adequate today. Rejected: 7 pricing rules,
  4 of them conditional on each other — that interaction is the specific condition
  under which scripts stop being cheaper.

## Consequences

- Pricing an order costs one aggregate load (4 queries) where the procedure did one.
  Measured 40 ms p95 on production-shaped data, against an 800 ms budget. Accepted.
- The Finance report still reads the schema directly, duplicating the discount rule.
  Known, accepted until ADR-015, listed in the risk register.
- New engineers must learn the aggregate boundary before touching pricing.

## Compliance

ADR010 and ADR013 on the pull-request check for `docs/adr`; the `supersedes ADR-006` link is set
in this same change, not later.
```

Note what the consequences section does: it names costs that are already known to be unpleasant, with numbers. **A record whose
consequences are all positive has not been reviewed; it has been advertised.** Nygard's own instruction says the same thing and is
worth quoting at anyone who resists it: "All consequences should be listed here, not just the 'positive' ones."

Two more things the record above does, both of which the majority of real records skip. It states a **rejected alternative in terms
its advocate would recognise** — "adequate today" is a concession, and a record that cannot make one gets re-fought. And it names an
**organisational constraint** as a constraint: the ledger schema is owned by Finance, not "the schema is legacy".

**Placeholders and coaching are not the same thing, and only one of them belongs inside the record.** An unknown stays in, marked, so
that the gap is visible to the next reader and to whoever reviews it — `Peak load is «measured peak at month-end, owner: Priya»`.
Advice to the author — what still needs checking, what to delete before committing — goes outside the fenced record. A record that
instructs its own author has not been finished, and the instruction ships when nobody deletes it.

## Classifying reversibility

Ask what undoing the decision would cost **after** six months of code has been written on top of it.

| Class               | Test                                                        | Examples                                                                           | Proportionate effort              |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------- |
| Trivial             | A refactor inside one module                                | Mapper library, package layout, validation style                                   | Just decide                       |
| Cheap               | A refactor plus its tests; one team, one deploy             | Transaction Script to Domain Model in one module; adding a Query Object            | An afternoon                      |
| Expensive           | Data migration, or a coordinated deploy with another team   | Inheritance mapping strategy; splitting an aggregate; session state placement      | Prototype the risky part          |
| Effectively one-way | Published contract, datastore engine, or a process boundary | Public API shape; synchronous to asynchronous between services; service extraction | Full comparison; delay if you can |

These four map onto the record classes **N**, **S**, **F** and **O** in `SKILL.md` — the class is what the record costs, this table is
what the mistake costs. Two consequences follow, and they pull in opposite directions:

- **For one-way decisions, delay is a strategy.** Keeping a boundary in-process today costs little and keeps extraction available;
  extracting today forecloses the in-process option (`distribution-boundaries`).
- **For cheap decisions, delay is pure cost.** Deliberation over a reversible choice burns the budget the one-way decisions need.
  Deciding quickly and correcting later is the cheaper path, and saying so explicitly is part of the decision.

**Provenance, kept separate.** The reversibility framing is Fowler's (_IEEE Software_, 2003), and Fowler credits _irreversibility_ as
a driver of complexity to the economist Enrico Zaninotto, from a talk at XP 2002; Fowler's own contribution is the next move — that an
architect's job includes finding ways to eliminate irreversibility. **One-way and two-way doors is a different framing from a
different author**: Bezos, 2015 shareholder letter, under "Invention Machine", with its own warning that firms habitually applying the
light-weight Type 2 process to Type 1 decisions "go extinct before they get large". Both are useful; blending them into one attributed
idea is wrong, and common.

## Drivers versus wishes

A driver has at least one of these properties:

- **A requirement with a stakeholder** who will notice its absence.
- **A constraint** — a fixed database, a regulated retention period, a team boundary, a deployment window, an existing client you
  cannot change.
- **A measured fact** about the current system: this query takes 900 ms, this table has 400M rows, this endpoint is called 40 times
  per page render.

Everything else is a wish. Wishes are not worthless, but they are not evidence, and they do not belong in the record's Context as
though they were.

**Watch for drivers that are actually organisational.** "Two teams must deploy independently" is one of the strongest architectural
drivers in enterprise systems and one of the least often written down; it is usually laundered into a technical justification. Write
it as what it is. It survives scrutiny better than the technical proxy, and it changes when the organisation changes — which is
precisely the signal you want. MADR 4.0.0's `decision-makers` / `consulted` / `informed` fields are the record-side of the same idea,
and are the only mainstream template fields that admit an organisation exists.

**What this section is not.** Ranking drivers, striking the ones on which the options do not differ, and reading a comparison matrix
are `architecture-trade-off-analysis`' method, not this skill's. Collect the drivers, write them down, hand the comparison over.

## The scenario form

One characteristic — already named, capped and agreed by `architecture-characteristics` — enters the record as an observable scenario.
The naming is theirs; the sentence below is what the record carries.

> **When** _stimulus_ **in** _context_, **the system** _response_ **within** _measure_.

| Written as                                        | The record carries instead                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| no load, no dimension, no limit                   | When order volume reaches 12k/hour at month-end, p99 checkout stays under 800 ms with 8 app instances     |
| no change named                                   | When a payment method is added, no file under `pricing/` is modified and no schema migration runs         |
| no failure named                                  | When one database replica is lost, reads continue with staleness under 5 s and writes fail for under 30 s |
| no operation, no percentile                       | When the catalogue page is requested, at most 3 database round trips and p95 under 200 ms server-side     |
| no asset, no adversary                            | When a support user queries an order, fields marked PII are absent from the response payload              |
| a promise of flexibility, neither free nor scalar | When a tenant needs a custom tax rule, it ships as configuration without a deploy                         |

If a scenario cannot be written, one of two things is true: the characteristic does not matter here, or nobody has decided what it
means. Both are worth discovering **before** the record is written around it — and the first belongs back with
`architecture-characteristics`, as an Others Considered line rather than a slot.

## Risk, stated so it can be tracked

For each accepted decision, record the assumption most likely to be wrong and the observation that would disprove it:

> **Assumption:** peak order volume stays below 20k/hour.
> **Trigger:** sustained 15k/hour for three consecutive days.
> **Then:** re-open ADR-014 — aggregate load per order becomes the constraint.

This separates a considered decision from a bet. It also converts the perennial "but what if we need to scale?" objection from
speculative design work into a monitored condition (`architecture-and-performance`). **Nothing in the literature reviewed for this
skill writes this three-line form down.** Fowler's 2026 bliki entry comes closest — "it's handy to record the confidence level of the
decision. This is a good place to mention any changes in the product context that should trigger the team to reevaluate the decision"
— and MADR's optional "More Information" section allows it without asking for it. Treat the form as this package's own construction,
useful and unvalidated.

Note the word "confidence" is a collision risk: this is a self-assessment attached to a reversal trigger, not an estimate with a
confidence interval (`estimation-under-uncertainty`).

## The rejected record

**Record the decisions not to do something.** "We did not split billing into a service, and here is why" is the record that stops the
question being re-asked every six months, and it is the one most often missing. AWS Prescriptive Guidance is the clearest named source
for the mechanism: the owner adds a reason for the rejection "to prevent future discussions on the same topic", and moves the state to
`Rejected`.

Two boundaries on this. **The status value is an accretion** — `rejected` is not in Nygard's four (proposed, accepted, deprecated,
superseded); it comes from MADR, from AWS, and from the Joel Parker Henderson collection. And **the act of refusing is not this
skill's** — delivering the no, handling the escalation, leaving a yes on the table, all belong to `engineering-communication`. What
belongs here is the artefact: a status, a reason, a date, and a number the next proposal can be pointed at.

## Keeping the set alive

- **Supersede, never edit.** An amended record loses the thing that makes the set valuable: what people believed at the time, and why.
  **This is the majority position, not a settled one** — Nygard, Fowler, Microsoft's Well-Architected Framework and AWS all say
  immutable; MADR 4.0.0's template ships a `date` field meaning "when the decision was last updated", which is a mutation affordance.
  Nothing has tested either. Pick, and say so.
- **Link decisions to code.** A one-line comment naming the ADR number at the boundary it governs is the only mechanism that reliably
  reaches whoever is about to violate it.
- **Review triggers, not the whole set.** Quarterly re-reading of 60 records does not happen. Reviewing the eight with live triggers
  does. Zimmermann's ceiling is the same observation with a number attached: over 100 entries, an AD log "will probably put you
  readers (and you) to sleep, and be really hard to maintain".
- **Record the decisions not to do something** — above.

## Failure modes

- **The record as ceremony.** Written after implementation to satisfy a process gate, with alternatives invented afterwards.
  Detectable: the rejected alternatives are strawmen.
- **The record as design document.** Twelve pages of class diagrams. The record answers _why_; the code answers _how_, and stays true
  when the code changes. Nygard's own limit is "one or two pages"; Fowler's is "typically a single page".
- **Status never changes.** Everything is "accepted", nothing superseded or deprecated, and the set no longer describes the system. An
  ADR set with more than two years of history and no superseded entries is unmaintained — read it as archaeology, not as constraint.
  Backstage is the counter-instance and shows the honest rate: 15 records over about five and a half years, with a real ADR013 →
  ADR014 supersession nearly three years apart.
- **Consequences written as benefits.** The single most reliable indicator that the decision was announced rather than compared.
- **One giant record.** Name the decision in one sentence, in the form "we must choose how X"; a decision that took a paragraph to
  state was several decisions, with different drivers and different reversibility. They will need re-opening at different times and
  cannot be superseded independently. Microsoft's Well-Architected Framework says this independently: "Break one decision into
  multiple if an architectural decision is going to result in multiple phases … Log each phase as its own decision record."

## Anti-patterns in driver collection

- **Retrofitted drivers.** Requirements discovered after the design, which happen to be exactly what the design satisfies. Symptom:
  one option meets every driver perfectly.
- **Aggregated stakeholders.** "The business wants real-time." Which person, which decision do they make with it, and what does
  real-time mean in seconds?
- **Load figures with no distribution.** An average request rate hides the month-end peak that determines the architecture. Ask for
  the peak and its shape (`littles-law-and-queueing`).
- **Attributes borrowed from a reference architecture.** Multi-region, multi-tenancy and polyglot persistence appear in decisions for
  systems with one region, one tenant and one database, because they appeared in the document being copied.
- **Drivers with no owner.** If no named person will be unhappy when the scenario is missed, the scenario is decoration; it will not
  be defended in the first schedule squeeze, so do not build for it now.
