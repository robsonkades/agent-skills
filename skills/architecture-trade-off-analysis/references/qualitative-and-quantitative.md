# Qualitative and Quantitative Analysis

Which mode is honest for the question in front of you, and what each one is allowed to claim.

## What "qualitative" means here

Not hand-waving. _Hard Parts_ ch. 15 uses it in the strict sense — _"measuring the quality of
something rather than the quantity"_ — and the ratings in the book's own tables are backed by a
survey of a large set of representative architectures, not by opinion in a room.

The claim about why it is usually the only option available:

> "You may have noticed that virtually none of our trade-off tables are quantitative—based on
> numbers—but are rather qualitative—measuring the quality of something rather than the quantity,
> which is necessary because two architectures will always differ enough to prevent true
> quantitative comparisons."

> "We recommend you hone the skill of performing qualitative analysis, as few opportunities for
> true quantitative analysis exist in architecture."

Read the first quotation precisely. It says **cross-architecture comparison** cannot be numeric.
It does not say your system cannot be measured. Those are different claims, and conflating them is
how teams end up either refusing to measure anything or benchmarking two things that are not
comparable.

## The route from qualitative to quantitative

There is exactly one sanctioned route, and it is not a better matrix:

> "Testing with objective outcomes allows our trade-off analyses to go from qualitative to
> quantitative—from speculation to engineering."

> "I've always said that testing is the engineering rigor of software development."

So a number becomes available when you **build the thing and test it** — a spike, a load test, a
fitness function that runs continuously. The number is then about your workload, your data and
your deployment, and it is valid for exactly those.

## Choosing between the modes

```text
The dimension that separates the options is a quantity
        AND you can build a version small enough to measure it
        AND being wrong costs more than the spike
                → measure it. Anything else is guessing with a table.

The dimension that separates the options is a quantity
        BUT measuring it requires building both architectures
                → you cannot measure it. Two architectures "will always differ
                  enough to prevent true quantitative comparisons". Model
                  domain scenarios instead and say the answer is ordinal.

The options differ on several dimensions at once, none dominant
                → qualitative. A number on one dimension would decide the
                  question by accident of what was measurable.

Someone asks for a benchmark and cannot say what result would change
their mind
                → the benchmark is theatre. Get the decision rule first.

The numbers exist but come from the vendor's configuration
                → they are the advocate's dimensions. See bias-and-evidence.md.
```

## When a number is dishonest

- **It measures the prototype.** A spike has none of the production data volume, none of the
  concurrent load, none of the operational surface. Say which of the three it lacks.
- **It over-fits one workload.** A number valid for the modelled workload is quoted for years
  after that workload changed. Date the number in the record.
- **It was chosen because it was measurable.** The dimension that decides the answer and the
  dimension that is easy to instrument are frequently not the same one.
- **It ends an argument it did not answer.** The most common failure: the benchmark is real, the
  question it settles is not the question that was being argued.

## Modelling relevant domain cases

The technique that converts a generic comparison into a decision.

> "Architects shouldn't make decisions in a vacuum, without relevant drivers that add value to the
> specific solution. Adding those domain drivers back to the decision process can help the
> architect filter the available options and focus on the really important trade-offs."

- A **scenario** is a change applied to both candidate topologies to see which dimensions move —
  "update credit card processing", "add a new payment type", "use several payment types in one
  payment". It is not a user story and not a use case.
- Model until a scenario **inverts** the apparent winner, or until new scenarios stop changing the
  ranking. In the authors' example the third scenario reverses the first two.
- Scenarios are also the cheap substitute for building: _"scenario analysis is one of an
  architect's most powerful tools to allow iterative design without building whole systems."_

The full run of the payment example is in `worked-analysis.md`.

## The out-of-context trap

> "When assessing trade-offs, architects must make sure to keep the decision in context;
> otherwise, external factors will unduly affect their analysis. Often, a solution has many
> beneficial aspects, but lacks critical capabilities that prevent success. Architects need to make
> sure they balance the correct set of trade-offs, not all available ones."

The mechanism is a matrix that is right in general and wrong here — the shared-service example
loses five of its eight dimensions once the real context is stated, and the apparent winner no
longer holds. Mark
Richards teaches the summed version of it as a named anti-pattern, the **Out-of-Context Scorecard
AntiPattern** (Developer to Architect, lesson 146, 10 Oct 2022).

The counter-intuitive payoff, verbatim: _"finding the correct narrow context for decisions allows
architects to think about less, in many cases simplifying design."_

## The static coupling checklist

For one service or quantum, enumerate:

1. Operating system and container dependencies.
2. Dependencies delivered through transitive dependency management — frameworks, libraries.
3. Persistence dependencies — databases, search engines, cloud environments.
4. Architecture integration points required to bootstrap.
5. Messaging infrastructure required to communicate with other quanta.

_"No generic tool exists to build this because each architecture is unique."_ Dynamic coupling is
the separate question of how they call one another at runtime: communication (sync/async),
consistency (atomic/eventual), coordination (orchestrated/choreographed).

## MECE, as two independent tests and a currency check

Borrowed by the authors from _"the technology strategy world"_; the McKinsey/Minto attribution is
common but is not what the book credits.

| Test                        | Question                                                | Typical failure                               |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| **Mutually exclusive**      | Are these the same category of thing?                   | comparing a message queue to an entire ESB    |
| **Collectively exhaustive** | Have we covered the space with no holes?                | evaluating queues without Kafka on the list   |
| **Currency**                | Has a new capability arrived since we drew up the list? | a two-year-old option set defended as settled |

Goal: _"to cover a category space completely, with no holes or overlaps."_ The slide version is three
words: **compare like things.** Most real matrices fail exclusivity, not exhaustiveness.

## Terminology, used as the authors use it

| Term                           | Loose usage            | What it actually means here                                                                                                                                         |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trade-off**                  | "downside", "cost"     | a pair — _"an advantage and disadvantage"_. A list of only costs is not a trade-off analysis                                                                        |
| **Coupling**                   | vague badness          | _"if someone changes X, will it possibly force Y to change?"_ — nothing more, and not inherently bad                                                                |
| **Qualitative**                | "no rigour"            | measuring quality rather than quantity, evidenced rather than felt                                                                                                  |
| **Best practice**              | "recommended default"  | the objection is epistemic — _"I can just turn my brain off … it brooks no compromise"_ (Ford). A default with stated exit conditions is not what is being attacked |
| **"Least worst"**              | pessimism              | an impossibility claim: "best" would require maximising factors that move against each other                                                                        |
| **Prioritise characteristics** | rank-order the list    | rejected as _"a fool's errand"_; the sanctioned move is an unordered top three                                                                                      |
| **Trade-off table**            | scorecard to be summed | read for correlations between dimensions, never totalled                                                                                                            |
| **Architecture** (Fowler)      | the diagram            | _"things that people perceive as hard to change"_ — and that perception is attackable                                                                               |

## Whose vocabulary is whose

If you present a dimension checklist, mark its provenance. Verified by full-text search of both
books:

| Term                           | Ford/Richards vocabulary?                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| coupling, performance          | yes, pervasive                                                                                                                               |
| deployability, testability     | yes                                                                                                                                          |
| cost                           | weak — appears as a driver in examples, not a named characteristic                                                                           |
| operational burden             | no — one hit in _Hard Parts_, none in _Fundamentals_ 1st ed.                                                                                 |
| cognitive load                 | no — zero hits in both; Team Topologies territory                                                                                            |
| reversibility, irreversibility | no — zero hits in both. It is Fowler's, "Who Needs an Architect?", _IEEE Software_ July/Aug 2003, crediting Enrico Zaninotto for the framing |

Their own position makes this matter: the book's four dimensions came from surveying hundreds of
architectures, not from a canon, and the instruction is to build your own list from your own
entanglements. Borrowed terms are fine; borrowed terms passed off as the authors' are not.
