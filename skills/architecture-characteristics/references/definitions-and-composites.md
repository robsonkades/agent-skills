# Definitions, Pairs and Composites

Every definition in this file is **verbatim from Mark Richards' _Architecture Characteristics
Worksheet_, last revised March 2024** `[PRIMARY]`, read directly. Where something is not from the
worksheet it says so. Use it when two people are using one word to mean two things, which in this
domain is the normal case rather than the exception.

## Why the exact words matter

A characteristic is a slot in a list of three. If two people hold different definitions of the word
in the slot, they have not agreed on anything — they have agreed on a token. The failure is not
pedantry; it is that the design consequences of "scalability" and "elasticity" are different pieces
of infrastructure with different bills, and the word does not say which one you bought.

## The five bracketed pairs

`[PRIMARY]` The worksheet brackets these five as `a`/`b` and annotates the bracket: _"denotes
characteristics that are related; some systems only need one of these, other systems may need both."_

### performance ↔ responsiveness

- **performance**: _"The amount of time it takes for the system to process a business request."_
- **responsiveness**: _"The amount of time it takes to get a response to the user."_

Two clocks: server-side work versus user-perceived latency. They move independently and sometimes
oppositely. Batching improves performance and degrades responsiveness. Acknowledging immediately and
doing the work asynchronously improves responsiveness, leaves performance unchanged, and makes your
consistency eventual — a third characteristic changed by a decision taken about the second.

### scalability ↔ elasticity

- **scalability**: _"A function of system capacity and growth over time; as the number of users or
  requests increase in the system, responsiveness, performance, and error rates remain constant."_
- **elasticity**: _"The system is able to expand and respond quickly to unexpected or anticipated
  extreme loads (e.g., going from 20 to 250,000 users instantly)."_

**The distinguishing variable is time, not size.** Scalability is growth over time with three things
held invariant — responsiveness, performance, error rate. Elasticity is a spike. A system can be
scalable and not elastic (it grows fine, and a ninety-second forty-fold burst kills it) or elastic and
not scalable. Note also that ISO/IEC 25010:2023 has `scalability` and has no elasticity at any level,
so an ISO-derived requirement set **cannot express this distinction** — see
`taxonomy-and-iso.md`.

### availability ↔ fault tolerance

- **availability**: _"The amount of uptime of a system; usually measured in 9's (e.g., 99.9%)."_
- **fault tolerance**: _"When fatal errors occur, other parts of the system continue to function."_

Availability is a number. Fault tolerance is a blast-radius property. They are traded in practice: a
design that degrades gracefully — partial function during a dependency failure — can report **lower**
availability under a strict all-or-nothing definition than a fragile design that either works
completely or is down. If the availability number is the only governed metric, it will select against
the fault tolerance you said you wanted.

### data integrity ↔ data consistency

- **data integrity**: _"data across the system is correct and there is no data loss."_
- **data consistency**: _"data across the system is in sync and consistent across databases and
  tables."_

Integrity is a per-datum truth property; consistency is a cross-store agreement property. The
distributed-systems trade — atomic versus eventual — is about **consistency**. A saga does not
threaten integrity. Saying "we need data integrity" when you mean "our two stores must agree" points
the design at the wrong problem.

### adaptability ↔ extensibility

- **adaptability**: _"ease with which a system can adapt to changes in environment and
  functionality."_
- **extensibility**: _"ease with which a system can be extended with additional features and
  functionality."_

Adapting to a world that changes around you, versus adding to a world that does not. Both are
modularity investments and they are not the same investment.

## One relationship the worksheet states outright

`[PRIMARY]` **concurrency**: _"The ability of the system to process simultaneous requests, in most
cases in the same order in which they were received; implied when scalability and elasticity are
supported."_

Read literally: if scalability or elasticity already holds a slot, concurrency is not a separate slot.
It goes in Others Considered with the note that it is implied, which is both honest and cheaper than
governing it twice.

## Composites

`[PRIMARY]` The worksheet has a dedicated **Composite Architecture Characteristics** box with exactly
two entries:

| Composite       | Decomposes into                                                              |
| --------------- | ---------------------------------------------------------------------------- |
| **agility**     | maintainability, testability, deployability                                  |
| **reliability** | availability, testability, data integrity, data consistency, fault tolerance |

`[PRIMARY]` Richards devoted a lesson to the concept — _Lesson 123, Composite Architecture
Characteristics_, 27 September 2021 — which confirms the concept name and that reliability and agility
are his two worked examples, and frames the problem as "how to define these composite characteristics
through measurements." (The page is a video landing page; the decompositions above come from the
worksheet, not from it.)

The governance consequence, from the same body of material `[secondary — ch. 6 text not fetched]`:
**you cannot measure a composite directly, you measure its primitives.** "There is no measure for
agility, so architects must ask: what is agility composed of? It includes things like deployability,
modularity, and testability, all of which are measurable."

Practical rule: a composite may be the word you use with stakeholders, and must never be the word in
the slot. If "reliability" is in the top three, the top three is really seven things, none of which
has a fitness function.

## Words routinely folded into "reliability" that are not it

- `[PRIMARY]` **recoverability**: _"The ability of the system to start where it left off in the event
  of a system crash."_ RPO/RTO territory — a **restart** property, not an uptime property.
- `[notes, 1st ed. ch. 4 operational table]` **continuity**: disaster recovery. Organisationally a
  level above recoverability: recoverability is this process coming back, continuity is the business
  running while it does not.
- `[notes]` **robustness**: handling of error and boundary conditions. Distinct from fault tolerance,
  which is about what survives when something has already failed fatally.

## The quantum wording drifts between books

Not a worksheet definition; a citation hazard.

- _Fundamentals_ 1st ed. `[notes — three note sets quote identical words]`: an architecture quantum is
  _"an independently deployable artifact with high functional cohesion and synchronous connascence."_
- _The Hard Parts_ (2021) `[secondary]`: "independently deployable, high functional cohesion, **high
  static coupling**, **synchronous dynamic coupling**" — the connascence clause replaced by the
  static/dynamic coupling vocabulary.

Same concept, re-expressed. Do not present them as interchangeable without saying which book you are
quoting, and do not assume the 2nd ed. of _Fundamentals_ (March 2025) uses either wording —
**that is unverified**.

The connascence apparatus behind the 1st-ed. wording is Page-Jones': static forms (name, type,
meaning/convention, position, algorithm), dynamic forms (execution, timing, values, identity),
measured by strength, locality and degree. "Synchronous connascence" in the definition is doing real
work — it is what makes a set of services one quantum rather than several.

## The distinction the worksheet cannot make for you

Nothing above tells you which member of a pair your system needs. That comes from a measurement in
your system, and the body's trade-off table lists which one per dimension: the 90-day peak-to-median
arrival ratio separates scalability from elasticity; a named tolerable disagreement window separates
"we need consistency" from "we said consistency"; the two clocks separate performance from
responsiveness only if both are instrumented, which is usually the finding rather than the input.
