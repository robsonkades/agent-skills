# Evidence and disagreements

What is measured, what is asserted, what is contradicted — and the arguments that are genuinely open, with both sides.
Read this when someone cites a number, when someone cites a case study, or when two people disagree and you need to know
whether the disagreement is empirical or definitional. Mostly it is definitional, and saying so ends the argument faster
than either side wants.

## 1. The evidence base, claim by claim

| Claim family                          | Status                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| Connascence taxonomy (the nine forms) | Asserted; useful as vocabulary; unstudied                          |
| Connascence strength ordering         | Asserted; hedged by its own advocates; unstudied                   |
| Static / dynamic coupling distinction | Asserted; derived from connascence; unstudied under that name      |
| Architecture quantum                  | Asserted; no academic literature at all                            |
| Shared database ⇒ one quantum         | A definitional consequence, not an empirical finding               |
| Change / temporal coupling ↔ defects  | **Measured**; positive but conditional                             |
| Structural coupling metrics ↔ defects | **Contradicted** once size is controlled — with an unread rebuttal |
| Martin main sequence                  | No empirical validation found                                      |
| Loose coupling ↔ delivery performance | **Survey-measured** (DORA), self-reported, cross-sectional         |

**Connascence, in numbers.** OpenAlex returns **16 works** for `connascence software` — and that list includes false
positives, among them a French-language thesis and a paper about children's problem-solving teams. The founding 1992 CACM
article shows **23 citations** in OpenAlex and **11** in Crossref. For scale, the CK metrics suite and its validations run
to thousands of citations, and D'Ambros et al. 2009 alone has 147. What follows from that is precise: **nobody has checked
whether connascence strength predicts anything** — not defects, not change effort, not comprehension time. It does **not**
follow that connascence is wrong. Absence of study is not refutation, and the skill should never present it as one.

**The architecture quantum, in numbers.** There are none. A bibliographic search for the construct returns
quantum-computing papers — quantum-computing-as-a-service reference architectures, quantum neural architecture search —
and nothing on the Ford/Richards concept. It lives entirely in practitioner books and the training around them. The InfoQ
podcast with two of the authors does not contain them defining quantum, static coupling or dynamic coupling; it does
contain Ford's general coupling definition, which `SKILL.md` quotes.

**Change coupling — where the evidence actually is.** Two studies, cited precisely and no further.

- **D'Ambros, Lanza & Robbes, "On the Relationship Between Change Coupling and Software Defects", WCRE 2009** (DOI
  `10.1109/WCRE.2009.19`). Three large systems; asks whether change coupling correlates with defects and whether adding
  change-coupling information improves metric-based bug prediction. **The paper was not readable for this skill** —
  publisher and author PDFs both refused — and its abstract is elided in the indexes. Cite it for the research question
  and its standing. **Do not attribute an effect size to it**; anyone who quotes one is quoting something else.
- **Kirbas, Caglayan, Hall, Counsell, Bowes, Sen & Bener, "The relationship between evolutionary coupling and defects in
  large industrial software", _Journal of Software: Evolution and Process_ 29(4), 2017** (DOI `10.1002/smr.1842`), open
  access. Two large industrial systems — a legacy financial system and a modern telecommunications system — seven years of
  history from five repositories containing 176 thousand files. From the abstract: _"our results indicate that there is
  generally a positive correlation between EC and defects, but the correlation strength varies. Evolutionary coupling is
  less likely to have a relationship to software defects for parts of the software with fewer files and where fewer
  developers contributed. […] Although EC measures may be useful to explain defects, the explanatory power of such
  measures depends on defect types, size, and process metrics."_ This cuts both ways, which is why it is the anchor: it
  supports the measurement and it bounds where the measurement works.

**Structural metrics — the size confound.** El Emam, Benlarbi, Goel & Rai, "The Confounding Effect of Class Size on the
Validity of Object-Oriented Metrics", _IEEE TSE_ 27(7), 2001. Of 24 OO metrics examined, **4 remained associated with
faults after controlling for class size, and 2 were useful in prediction models**; the authors recommended re-examining
prior validation studies and always controlling for size in future ones. **A published rebuttal exists in the same journal
and was not read for this skill.** Present El Emam as serious and unsettled, never as the last word. Note the asymmetry
that makes it useful rather than nihilistic: its target is _structural_ metrics on classes, while the change-coupling
evidence above is a different measurement family — process and history rather than structure — and survives independently.
**History-based coupling has better evidence than structure-based coupling**, and that is the defensible summary.

**DORA.** Its loosely-coupled-teams capability is cross-sectional survey research with self-reported measures, drawing on
the 2017 State of DevOps report and 2021–2023. It is real evidence that the _capability_ — teams changing their systems
without permission from outside, deploying independently of service dependencies, testing without an integrated
environment — correlates with delivery and organisational outcomes. It is **not** evidence for the quantum, for
connascence, or for any threshold in this package. It supports the framing question and nothing beyond it.

## 2. Four live disagreements

### 2.1 Is a shared database really "one quantum"?

- **The _Hard Parts_ authors:** yes, by definition. The database is part of each service's static coupling, so everything
  bound to it is one quantum whatever the pipelines say.
- **Sam Newman** (_Building Microservices_, 2nd ed., 2021) agrees the coupling is severe but grades it in a different
  taxonomy: domain → pass-through → common → content coupling, loosest to tightest. A shared database is **common
  coupling**, which he explicitly calls tolerable for read-only, low-change reference data; a service reaching into
  another service's database is **content coupling**, the worst kind. (Definitions here come from reader notes, not the
  book.)
- **The practitioner counter-position, which is real:** teams do deploy independently against a shared schema, daily,
  using expand/contract migrations, per-service database roles and grants, and schema-owning services. microservices.io
  carries "Shared database" as a pattern with named forces rather than an antipattern, and industry surveys of the
  argument treat it as legitimate.
- **The steelman of each, which is the useful part:** "one quantum" is a claim about the **worst-case blast radius** of a
  schema change; "we deploy independently" is a claim about the **observed frequency** of that worst case. Both can be
  true at once. The real disagreement is whether an architectural unit should be defined by its worst case. Present it
  that way; do not pick a winner, and do not let a room believe it has an empirical dispute when it has a definitional
  one.

### 2.2 Is the architecture quantum operationally useful, or a relabelling of "deployment unit"?

- **For:** it names something "deployment unit" does not — the closure over static coupling and synchronous calls. Under
  that reading "how many quanta?" and "how many deployment units?" are different questions with usually different
  answers, and the gap between the two numbers is the diagnosis.
- **Against:** wherever no edge survives either leg — each service owning its data is the common case, not the whole
  condition — quantum count equals deployment unit count exactly, and the term adds a word without adding information. Its diagnostic
  value is concentrated in precisely the situations everybody already has names for.
- **The honest state of this argument: no published critique making the "against" case was found.** It was searched for
  directly. The academic literature ignores the term and the practitioner literature that uses it is largely downstream of
  the same authors. So the "against" case above is **this skill's own reasoning, deliberately unattributed**.
  Manufacturing a named opponent would be a fabrication, and a reader who wants the counter-argument attributed should be
  told there is nobody to attribute it to.

### 2.3 Do coupling metrics predict anything once you control for size?

- **Against:** El Emam et al. 2001, above — 4 of 24 survived.
- **For, with qualification:** Kirbas et al. 2017, above — process and history-based coupling retains a positive
  relationship with defects, though its explanatory power depends on defect types, size and process metrics. Size is a
  moderator here too, not a refutation.
- **Unresolved:** the published rebuttal to El Emam was not read, and a later meta-analysis on size confounding and
  change-proneness was likewise not read.
- **What both sides agree on, and the operative rule:** size must be controlled for. **A coupling threshold quoted without
  normalising for size is on the wrong side of a twenty-five-year-old result**, and that is the single most useful thing
  to say when a number arrives in a review.

### 2.4 Is connascence used by practitioners, or is it a teaching device?

- **Used:** it is taught in a bestselling architecture book, has a dedicated community reference site, and recurs in Ruby,
  DDD and consultancy writing.
- **Teaching device:** 16 works in the entire indexed literature, 23 citations for the founding paper, no analyser in any
  curated catalogue, and a central ranking hedged by the people who promote it. Nothing in a pipeline can enforce it.
- **No published critic** arguing "connascence is not used in practice" was found; the evidence on that side is
  circumstantial — bibliometric and tooling absence — and should be presented as circumstantial. **The defensible
  synthesis: connascence is a review vocabulary with real discriminating power and no governance surface.** That is a
  statement about what it is for, not a criticism of it.

## 3. Failure records, in full

### Uber — "networked monolith", with a service count (2020)

Adam Gluck, "Introducing Domain-Oriented Microservice Architecture", Uber engineering blog, **23 July 2020**. First-party,
dated, live. The sentence that is the definition of the problem, written by someone inside it:

> "Networked monoliths can form, where services that appear to be independent all have to be deployed
> together to safely perform any change."

Also from the post: _"In order to build a simple feature an engineer often has to work across multiple services, all of
which are owned by different individuals and teams"_, and _"understanding dependencies between services can become quite
difficult, as calls between services can go many layers deep"_. Numbers: **2,200 critical microservices** grouped into
about **70 domains** (roughly half implemented at the time of writing); a **1.5-year half-life** for a microservice; one
root-cause investigation touching **50 services across 12 teams**. Reported outcomes after their extensions architecture:
onboarding time down 25–50%, new-feature integration from three days to three hours.

This is the strongest first-party record of deployment coupling specifically. Note what it is _not_: it is not a
controlled comparison, and the reported outcomes are the company's own.

### Segment — shared-library version hell inside a distributed monolith (2018)

Alexandra Noonan, "Goodbye Microservices: From 100s of problem children to 1 superstar", Segment engineering blog, **10
July 2018** (now hosted by Twilio; contemporaneous independent coverage in InfoQ). Numbers from the post: **140+
destinations** at migration time growing about three a month, one repo each, **120 distinct versions of the shared
libraries in production**, **3 engineers full-time** keeping it alive, and shared-library improvements of **32** in the
microservices era against **46** in the year after consolidation.

The mechanism, in the post's words: _"Testing and deploying changes to these shared libraries impacted all of our
destinations. It began to require considerable time and effort to maintain."_ Engineers stopped upgrading uniformly and
_"over time, the versions of these shared libraries began to diverge across the different destination codebases."_

**Why it is the best available record for this skill:** a shared library is static coupling, and it does not stop being
static coupling because you made 140 repositories. **Carry the cost side too, or the citation is dishonest:** the post
reports that fault isolation became difficult after consolidating, and that in-memory caching degraded across the 3,000+
processes the split had allowed. Consolidation bought back releasability and sold something real to get it.

### Prime Video — a case for how citations decay

The "Prime Video moved from microservices to a monolith" story (March 2023) is the most-repeated architecture anecdote of
its decade, and this skill uses it only as an example of evidence hygiene.

1. **The primary source no longer resolves.** The original post URL now redirects to a general Amazon corporate page. It
   survives in the Internet Archive; any citation must go there and must say the original was withdrawn.
2. **The popular retelling is contested by a credible insider.** Adrian Cockcroft — formerly VP of Cloud Architecture
   Strategy at AWS, and before that the architect most associated with Netflix's microservices — published a rebuttal on
   **6 May 2023** arguing that this was one internal component, that the team followed a serverless-first path and
   optimised as expected, and that the result is not a monolith. As quoted in The New Stack: _"This definitely isn't a
   microservices-to-monolith story. It's a Step Functions-to-microservices story. And I think one of the problems is the
   wrong labeling."_

On Cockcroft's reading it is also a story about **dynamic** coupling cost, not static — a different axis from the one this
skill is about. Withdrawn source, contested framing, scope inflated from one component to a company: that is the pattern
to check for before any case study is allowed to decide an architecture argument, including the two above.

### DoorDash — mechanism only, and the sourcing says so

DoorDash's engineering writing describes a single-master PostgreSQL instance remaining the source of most data even after
domain databases were carved out, coupling becoming a major concern as the database model grew, and DashPass depending on
a shared database on which almost all of DoorDash relied. **The first-party post was not readable for this skill and the
strongest numeric framing came from a database vendor with an interest in the conclusion.** Use it to illustrate the
mechanism — one schema is one quantum's worth of blast radius — and never as a quantified case. If you need numbers, use
Segment or Uber.

### "Distributed monolith" — the term itself

No coinage could be found. The earliest references surface around late 2014 and no source attributes the term to a named
person. **Do not attribute it.** The best-sourced formulation of the concept is Uber's "networked monolith" sentence
above, which has an author, a date and an employer — and the verdict it names belongs to `enterprise-architecture-smells`,
not here. This skill supplies the measurement that would establish it.
