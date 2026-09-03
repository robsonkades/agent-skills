# Worked Analysis

One decision carried end to end. The subject is the authors' own payment-granularity example
from _The Hard Parts_ ch. 15, run in the order the method prescribes. Read it for the shape of
each step's output, not for the answer — the answer is theirs, for their system.

## Step 0 — refuse the generic question

Not "are microservices better for payments?" but: **"should this application process payments
through one service, or one service per payment type?"** Generic solutions _"are rarely useful in
real-world architectures without applying additional situation-specific context."_ The authors'
conference framing puts every question in the same form — _should **I** use queues or topics_,
_should **I** use a strict or loose contract_ — because the pronoun is where the analysis lives.

Deliverable: one sentence naming this system and the options.

## Step 1 — find the entangled dimensions

_"Discover what dimensions are entangled, or braided, together. This is unique within a
particular architecture but discoverable by experienced developers, architects, operations folks,
and other roles familiar with the existing overall ecosystem and its capabilities and
constraints."_

Note what that sentence licenses and what it forbids. It licenses a room of people who know the
system. It forbids importing a dimension list from a book, this one included. For the payment
decision the entangled set came out as **extensibility, data consistency, performance,
maintainability, testability, deployability** — six, because those are the ones that move when
granularity moves.

Deliverable: a list of dimensions, each with the name of the person who said it moves.

## Step 2 — map the coupling

The test is single: _"if someone changes X, will it possibly force Y to change?"_ Coupling is not
badness — the book quotes Paracelsus, _"the dosage alone makes it so a thing is not a poison"_,
and warns that everything can be _"so decoupled that nothing can communicate with anything else."_

**Static coupling** — how the parts are wired. Build the picture from the five things the book
lists for one service: operating system and container dependencies; dependencies arriving through
transitive dependency management (frameworks, libraries); persistence dependencies on databases,
search engines and cloud environments; architecture integration points required to bootstrap; and
messaging infrastructure required to talk to other quanta. There is no tool: _"no generic tool
exists to build this because each architecture is unique."_

**Dynamic coupling** — how they call one another at runtime, along three axes: communication
(synchronous / asynchronous), consistency (atomic / eventual), coordination (orchestrated /
choreographed).

Deliverable: for each candidate, a static diagram and a position on the three dynamic axes.

## Step 3 — enumerate, then drop the infeasible

_"Model the possible combinations in a lightweight way. Some of the combinations may not be
feasible, allowing the architect to skip modeling those combinations."_ The purpose is stated
plainly: _"to determine what forces the architect needs to study — in other words, which forces
require trade-off analysis?"_

Then make the survivors comparable and decision-complete. MECE is the source method's aspiration;
in an open market, document credible exclusions rather than claiming literal exhaustiveness. Two
failures to check for by name:

- **Not mutually exclusive** — _"it is invalid to compare a message queue to an entire ESB because
  they aren't really the same category of thing."_
- **Not collectively exhaustive** — evaluating high-performance message queues while considering
  _"only an ESB and simple message queue but not Kafka."_

And re-date the list: _"an architect should make sure a new capability hasn't just arrived that
changes the criteria."_

## Step 4 — rate in isolation, consolidate, read for correlation

_"When building these ratings lists, we considered each design solution (our named patterns) in
isolation, combining them only at the end to see the differences."_ The book's own consolidated
table rates eight patterns on four dimensions using **Very low / Low / Medium / High / Very high**
— words, on a five-point ordinal scale, with no arithmetic anywhere.

What it is read for is stated explicitly: _"notice the direct inverse correlation between coupling
level and scale/elasticity: the more coupling present in the pattern, the worse its scalability"_,
plus a second, weaker correlation between coupling and responsiveness/availability.

```text
The product of a consolidated matrix is a sentence of the form
  "in this system, X and Y move against each other"
It is never a sentence of the form
  "option 3 scored 17"
```

If your matrix cannot produce the first sentence, you have a scorecard, not an analysis.

## Step 5 — delete the dimensions your context makes irrelevant

The authors' shared-service versus shared-library example starts with eight dimensions:
heterogeneous code, high code volatility, ability to version changes, dependency management,
overall change risk, performance, fault tolerance, scalability. On the generic matrix the shared
library wins — _"the architect seems justified in choosing the shared library approach, as the
matrix clearly favors that solution … overall."_

Then the actual context arrives, verbatim from their deck: _"We leverage polyglot programming and
have services written in 4 different languages in our application ecosystem. Performance and fault
tolerance aren't concerns for us — it's all about managing change to shared functionality."_

Five of the eight dimensions are now irrelevant, and the apparent winner no longer holds. The
general form: _"when the extra context for the problem becomes clear, the decision criteria
changes."_ The compensation is real — _"finding the best context for a decision allows the
architect to consider fewer options, greatly simplifying the decision process."_

## Step 6 — model domain scenarios until one inverts the answer

A scenario here is a **change applied to both candidate topologies**, not a user story. Three were
modelled for payments:

| Scenario                                      | Which option gains                                              |
| --------------------------------------------- | --------------------------------------------------------------- |
| Update credit card processing                 | separate services — maintainability, testability, deployability |
| Add a new payment type (reward points)        | separate services — extensibility                               |
| Use several payment types in a single payment | single service — performance and data consistency               |

After the first two the book says _"so far, separate services look appealing."_ The third inverts
it. The example demonstrates why analysis should seek scenarios that challenge the current
preference. There is no universal minimum count or guarantee of an inversion; stop using a
documented saturation/value-of-information criterion rather than a round number.

Their conclusion, verbatim: _"the real trade-off analysis comes down to which is more important:
performance and data consistency (a single payment service) or extensibility and agility (separate
services)."_

## Step 7 — reduce to one question in business language

_"Rather than show all the information they have gathered, an architect should reduce the trade-off
analysis to a few key points."_ The reason is not simplification for its own sake: _"eliminating
confusing technical details allows the nontechnical domain stakeholders to focus on outcomes rather
than design decisions."_

Their second worked reduction — synchronous versus asynchronous kick-off of credit approval:

```text
Sync    + credit approval guaranteed to start before the customer request ends
        - customer waits; application rejected if the orchestrator is down
Async   + no wait; submission does not depend on the orchestrator
        - no guarantee the process has started

Put to the business as one question:
  "Which is more important, a guarantee that the credit approval process
   starts immediately, or responsiveness and fault tolerance?"
```

Four technical rows collapse into one business decision. Technology names may remain when vendor,
regulatory or operational constraints are themselves decision-relevant; the test is whether the
accountable stakeholder can see consequences and authority, not whether jargon count is zero.

## Step 8 — fix the fundamental dimension, iterate, stop

_"We focused on synchronous versus asynchronous communication, a choice that creates a host of
possibilities and restrictions … choosing a fundamental dimension like synchronicity first limits
future choices. With that dimension now fixed, perform the same kind of iterative analysis on
subsequent decisions encouraged or forced by the first."_

Termination is explicit: _"an architect team can iterate on this process until they have solved the
difficult decisions — in other words, decisions with entangled dimensions. What's left is design."_

When you run out of entangled dimensions you are finished analysing. Continuing past that point is
mode D wearing mode B's clothes.
