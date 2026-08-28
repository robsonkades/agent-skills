# Eliciting and Capping

Two things the body only asserts: how the list is actually produced with stakeholders in the room,
and what the two traditions do differently once you have a first pick.

Provenance markers used throughout. `[PRIMARY]` — Mark Richards' _Architecture Characteristics
Worksheet_ PDF (last revised **March 2024**), read directly. `[notes]` — reconstructed from
independent public note sets on _Fundamentals of Software Architecture_ 1st ed. (2020); the book text
itself returned 403 to every fetch, so no sentence attributed to the book here is a verified
quotation. `[SEI]` — CMU/SEI-2000-TR-004 (August 2000), read directly.

## The translation table

`[notes — reproduced identically by four independent note sets, _Fundamentals_ ch. 5]`

| Domain concern, in the stakeholder's own words | Architecture characteristics it translates to                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Mergers and acquisitions                       | interoperability, scalability, adaptability, extensibility                                |
| Time to market                                 | agility, testability, deployability                                                       |
| User satisfaction                              | performance, availability, fault tolerance, testability, deployability, agility, security |
| Competitive advantage                          | agility, testability, deployability, scalability, availability, fault tolerance           |
| Time and budget                                | simplicity, feasibility                                                                   |

**The mappings are not the point; the translation duty is.** Nobody says "interoperability". They say
they are buying three regional competitors. Two consequences follow:

- **One concern maps to many characteristics**, so a stakeholder priority is not a characteristic
  priority. "User satisfaction is our top concern" yields seven candidates and settles nothing.
- **Doing the translation out loud is the test.** A driver survives the stakeholder hearing you say
  "so you need the system to keep running when one region's data feed dies" and agreeing. A wish does
  not survive it. This is the cheapest discriminator available and it costs one meeting.

Note also that agility, testability and deployability appear in three of the five rows. That is a
symptom of the composite problem, not a finding: agility decomposes into exactly those, so any row
containing it contains them.

## Explicit, implicit, and the third source

`[notes]` The authors name three sources: **requirements**, **implicit domain knowledge**, **domain
concerns**. The kata worked in ch. 5 (Silicon Sandwiches) separates the first two:

| Source                 | Example from the kata                                                         | Characteristic                      |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| Explicit requirement   | "thousands of users, potentially millions"                                    | scalability                         |
| Explicit requirement   | ordering bursts at peak hours                                                 | elasticity                          |
| Explicit requirement   | per-location and promotional variation                                        | customizability                     |
| Implicit               | nobody wrote it down and its absence is fatal                                 | availability, reliability, security |
| Implicit, from context | the **company's stated expansion plan**, which is in no requirements document | internationalization                |

The last row is the one worth teaching. The characteristic came from something the architect knew
about the business, not from anything they were handed. That is what "implicit domain knowledge"
means, and it is also why a list produced by one architect alone is not evidence of anything: the
same private knowledge that produces the good implicit characteristic produces the invented one, and
neither is distinguishable afterwards.

`[PRIMARY]` The worksheet carries a standing implicit set — **feasibility (cost/time), security,
maintainability, observability** — and one rule about it, verbatim: _"Implicit characteristics can
become driving characteristics if they are **critical** concerns."_ They are assumed on by default.
Promoting one into a driving slot is a claim that it is critical here, and that claim needs the same
evidence any other slot needs.

## The two caps, in order

`[PRIMARY]` The worksheet's Instructions block, verbatim and complete:

> - Identify no more than 7 driving characteristics.
> - Pick the top 3 characteristics (in any order).
> - Implicit characteristics can become driving characteristics if they are _critical_ concerns.
> - Add additional characteristics identified that weren't deemed as important as the list of 7 to
>   the _Others Considered_ list.

So the sequence is: translate everything → reduce to **≤7 driving** → pick **3** of those → write the
rest into **Others Considered**. The header of the same form has a `Domain/Quantum:` field beside
System/Project, so all of this happens once per quantum.

One discrepancy to know about. One note set reports ch. 5 as saying "reduce until there is a list of
no more than **7**", which matches the worksheet exactly; another reports "3–5". Treat **7 driving /
3 top** as the rule — it is the number on the authors' own artefact — and treat "3–5" as a
note-taker's paraphrase.

### The stated rationale

`[notes]` In the authors' own logic, in the order the argument runs:

1. Every characteristic supported **complicates the design**, producing "greater and greater
   complexity before you've even started addressing the core business problem."
2. Supporting everything yields a **generic architecture**: "too many architecture characteristics
   lead to generic solutions that are trying to solve every business problem, and those architectures
   rarely work because the design becomes unwieldy."
3. No architecture maximises everything — _"never shoot for the best architecture, but rather the
   least worst architecture."_ This is the load-bearing sentence. **The cap is a corollary of it, not
   an independent rule**, which is why arguing about the number 3 misses the point.
4. Therefore, once you have a list, **actively try to drop one (or two)**.
5. Three is chosen because ranking a full list does not converge and choosing three does: it "makes
   it much easier to reach consensus and allows for meaningful discussions about trade-offs."

The prioritisation mechanic the authors explicitly **reject** is handing stakeholders the translated
list and asking them to rank it. Ranking the full list fails; choosing three from a short list works.

## Others Considered is an artefact, not a bin

The discarded characteristics are written down. This matters for one reason the worksheet does not
spell out but the failure records do: an exclusion nobody recorded is indistinguishable, eighteen
months later, from an oversight. When capacity was not planned for HealthCare.gov (GAO-15-238), no
document exists in which someone decided capacity was not a driving concern — so there is no decision
to re-open, only an absence. Others Considered converts "we did not build for this" into "we decided
not to build for this, on this date, for this reason", which is the only form a future team can argue
with.

## The SEI procedure to re-check the pick against

`[SEI]` ATAM prioritises, but never over attribute names and never in one pass. What it does that the
worksheet does not:

- **Prioritise scenarios, not names.** The unit is the six-part quality attribute scenario — source of
  stimulus, stimulus, environment, artifact, response, **response measure**. The response measure is
  described as the critical part, because it is what makes the scenario evaluable at all.
- **Two dimensions, not one.** Utility-tree leaves carry a pair: importance to success **and**
  perceived risk or difficulty of achieving it — the (H,M) / (M,L) annotations. A characteristic that
  is important and easy is not where the architecture effort goes.
- **Coarse granularity, deliberately.** Verbatim: _"This prioritization may be on a 0-1 scale, or
  using relative rankings such as High, Medium, and Low; we typically prefer the latter approach as we
  find that the stakeholders cannot reliably and repeatably make finer distinctions than High, Medium,
  and Low."_
- **A vote budget and a cutoff.** In scenario prioritisation, _"each stakeholder is allocated a number
  of votes equal to 30% of the number of scenarios, rounded up"_, after which a team "might only
  consider the top five scenarios." Two traditions independently arriving at single digits is weak
  corroboration for the _shape_ of a cap. It is not evidence for the number three.

### The finding that forces the re-check

`[SEI]` From the same section, on a real engagement:

> "in the example given in Figure 3, security and modifiability were initially designated by the
> stakeholders as the key attributes driving quality requirements. The subsequent elicitation and
> refinement of the quality attribute requirements via the utility tree resulted in determining that
> performance and availability were also important."

The stakeholders' first pick missed two of the four attributes that mattered. Read against the
worksheet, this does not invalidate "pick three" — it invalidates **stopping** there. The combined
procedure, which is what this skill teaches:

1. Translate domain concerns into candidates, out loud, with the stakeholder.
2. Reduce to ≤7 driving; record the rest under Others Considered.
3. Have domain stakeholders pick 3, in any order.
4. **Concretise each of the 3 into a scenario with a response measure** — this is
   `architecture-decision-making`'s work, not this skill's.
5. **Re-check the list against what step 4 exposed**, because that is the step in which SEI's
   engagements discovered the missing attributes. Expect the list to change here; if it never does,
   step 4 was not done properly.

### When the re-check returns a fourth characteristic

On SEI's evidence this is the **expected** outcome, not the edge case — and note that in their Figure 3
engagement **two** arrived together, performance and availability, not one. The rule below is written
for one because that is the smallest case; it survives n=2 unchanged, but only as a **re-run, not a
swap**: with two new candidates you have five names and three slots, so you go back to the trade-off
table with all five in it rather than displacing twice in sequence. Displacing one at a time gives a
different answer depending on the order you do it in, which is the sign you were not running the
comparison at all. Three answers are defensible and this skill takes one.

**Take it: the fourth displaces one of the three, and the displaced one goes to Others Considered.**
The re-check produced evidence the original pick did not have — a scenario with a response measure —
and evidence beats a first impression. Displacing is also the only answer that keeps the cap doing its
work, and the cap is a corollary of "never shoot for the best architecture, but rather the least worst
architecture": a fourth slot is not a small concession, it is the abandonment of the reason there was
a limit. Which one is displaced is decided the same way the original three were: run the trade-off
table again with the new candidate in it, and drop whichever candidate it now places last.

**Send the fourth to Others Considered instead** when — and only when — step 4 could not produce a
response measure for it. A characteristic nobody could concretise has not been shown to matter; it has
been shown to be popular. That is a different finding and it belongs in Others Considered with the
reason written next to it.

**Let the cap bend to four** only under a condition you can state in advance and revisit on a date: a
regulated characteristic that cannot be traded away (data residency, an audit obligation) sitting
alongside three genuine drivers. Bending it because the argument was hard is how a list of four
becomes a list of nine, which is the failure the cap exists to prevent. If you bend it, record in the
ADR that you did, and what would let you go back to three.

**The signal you are in the wrong branch:** if the re-check returns a fourth characteristic every time
you run it, the problem is not the cap — step 1 is under-translating and step 2 is cutting the ≤7 on
the wrong criterion. Fix the elicitation, not the arithmetic.

## What the consensus claim rests on

Be able to say this when the procedure is challenged. The nearest thing to supporting evidence is
indirect and is about consensus, not outcomes: an industrial study on building consensus around
software architectures and quality attributes (Falessi et al., _Journal of Systems and Software_) and
an experiment reported alongside it in which **113 students** using a prescribed group-decision
approach reached higher consensus than unstructured group decision making. Neither paper was read in
full for this skill — treat both as pointers. They support _"structure the decision"_. They do not
support _"three"_, and nothing located does.
