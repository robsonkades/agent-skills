# Research brief — `architecture-coupling-and-quanta`

**Researcher's role:** evidence supplier. Nothing here is a recommendation. Where I write "the authors
say X", that is a report of what a named person published, not a claim that X is true.

**Date of research:** 2026-08-28. Every URL was fetched or search-verified on that date unless a
different date is stated inline.

**Sourcing constraint that shapes this whole document:** I do not have the books. Neither
_Fundamentals of Software Architecture_ (either edition), _Software Architecture: The Hard Parts_,
nor _Building Evolutionary Architectures_ was readable end to end. O'Reilly's `learning.oreilly.com`
and `oreilly.com/library/view/...` chapter pages return **HTTP 403** to this tool, so I could confirm
**chapter titles and numbers from publisher page titles** but not body text. Every book quotation
below therefore comes from a **secondary source** — reader notes, blog summaries, or search-engine
snippets of the O'Reilly page — and is marked accordingly. **No page numbers are claimed anywhere in
this brief, and none should appear in the skill.** I deliberately avoided pirate full-text mirrors
(`dokumen.pub`, `sciarium`) that surfaced repeatedly in search results; nothing here is sourced from
them.

---

## 1. Summary — the claims the skill can rest on

| #   | Claim                                                                                                                                                                                                                                                                                                                                        | Source                                         | Confidence                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Connascence is Page-Jones', published in CACM 35(9), Sept 1992, pp. 147–151, and expanded in his 1996 book. Its taxonomy is five static forms (name, type, meaning, position, algorithm) and four dynamic (execution, timing, value, identity).                                                                                              | §2.1; Crossref metadata; connascence.io        | **High** on provenance and the nine forms. **Medium** on the exact 1992 wording |
| 2   | The strength ordering (name weakest → identity strongest) is a **heuristic asserted by its authors, never validated**. Even sympathetic practitioners decline to commit to a precise order.                                                                                                                                                  | §2.1, §3.1; Weirich (ETE 2012)                 | **High** that no validation exists; **High** that the ordering is contested     |
| 3   | The architecture quantum definition **changed between books**: _Fundamentals_ (1st ed., 2020) says "high functional cohesion and synchronous **connascence**"; _Hard Parts_ (2021) and _Building Evolutionary Architectures_ (2nd ed., 2022) say "high functional cohesion, **high static coupling**, and **synchronous dynamic coupling**". | §2.3                                           | **High** that they differ; **Medium** on exact wording (secondary sources only) |
| 4   | Static coupling ≈ how the parts are wired (dependencies, contracts, database, infrastructure); dynamic coupling ≈ how they call each other at runtime. The authors credit Page-Jones' static/dynamic split as the origin.                                                                                                                    | §2.2                                           | **Medium-high** on substance; **Low-medium** on verbatim wording                |
| 5   | The quantum concept has **no empirical literature at all**. A bibliographic search returns quantum-computing papers, not software-architecture ones. It lives entirely in practitioner books.                                                                                                                                                | §3.2 (OpenAlex, 2026-08-28)                    | **High**                                                                        |
| 6   | **Change coupling** (files/modules that change together in VCS history) _is_ empirically associated with defects, in both open-source and industrial studies — but the association is conditional, not universal.                                                                                                                            | §3.3; D'Ambros et al. 2009; Kirbas et al. 2017 | **High**                                                                        |
| 7   | Structural OO coupling metrics largely **stop predicting defects once class size is controlled for** — 4 of 24 metrics survived in the canonical study.                                                                                                                                                                                      | §3.4; El Emam et al., IEEE TSE 2001            | **High**                                                                        |
| 8   | Independent deployability as a capability **does** have survey-grade evidence behind it (DORA), which is evidence for the _question_ the quantum asks, not for the quantum construct itself.                                                                                                                                                 | §3.5; dora.dev                                 | **Medium-high** (self-reported survey data)                                     |

---

## 2. Definitions, with attribution

### 2.1 Connascence — Page-Jones

**Primary publication, verified metadata (Crossref, DOI `10.1145/130994.131004`, queried 2026-08-28):**

> Meilir Page-Jones, "Comparing techniques by means of encapsulation and connascence",
> _Communications of the ACM_, vol. 35, no. 9, pp. 147–151, September 1992.
> <https://dl.acm.org/doi/10.1145/130994.131004>

The 1992 PDF at `dl.acm.org` returned **403**; I could not read the paper. The book is _What Every
Programmer Should Know About Object-Oriented Design_ (Dorset House, 1996); the taxonomy is also
carried into _Fundamentals of Object-Oriented Design in UML_ (Addison-Wesley, 1999). I could not read
either.

**The taxonomy** (source: <https://connascence.io/> and its About page, fetched 2026-08-28 — a
community-maintained, open-source reference site, **not** an authored primary source; it attributes
the term to the 1992 article and the expansion to the 1996 book):

| Kind        | Forms, in the order the site lists them                      |
| ----------- | ------------------------------------------------------------ |
| **Static**  | Name, Type, Meaning (a.k.a. Convention), Position, Algorithm |
| **Dynamic** | Execution (order), Timing, Value, Identity                   |

**The three properties** — quoted from connascence.io, which is a secondary source paraphrasing
Page-Jones:

- **Strength** — "Stronger connascences are harder to discover, or harder to refactor."
- **Degree** — "An entity that is connascent with thousands of other entities is likely to be a larger
  issue than one that is connascent with only a few."
- **Locality** — "Connascent elements that are close together in a codebase are better than ones that
  are far apart."

**The strength ordering.** The commonly published ordering, weakest to strongest, is: Name → Type →
Meaning → Position → Algorithm → Execution → Timing → Value → Identity (i.e. all static forms are
weaker than all dynamic forms). This ordering is reproduced in reader notes on _Fundamentals_ ch. 3
(<https://github.com/pkardas/notes/blob/master/books/fundamentals-of-architecture.md>) and across
practitioner sites.

**Whether the ordering is total or partial — this is the single most important nuance for the skill.**
I found **no source in which Page-Jones asserts a total order** with a justification. What I did find:

- Wikipedia's own hedge: "connascence of name typically considered weaker than connascence of meaning"
  and connascence types "exhibit a natural hierarchy of strength" —
  <https://en.wikipedia.org/wiki/Connascence>. "Typically" and "natural" are doing load-bearing work.
- Jim Weirich, in the reference talk practitioners cite (_Connascence Examined_, Emerging Technologies
  for the Enterprise conference, Philadelphia, 2012 — <https://www.youtube.com/watch?v=HQXVKHoUQxY>,
  writeup at <https://chariotsolutions.com/screencast/ete-2012-jim-weirich-connascence-examined/>),
  is reported as feeling the connascences form a hierarchy **but declining to assign a precise
  ordering**. I am reporting the writeup's characterisation; I did not watch the full talk.

**Honest statement the skill can make in its own voice:** the ordering is a teaching heuristic
published without validation; the static-before-dynamic split is the part that is robust, and the
fine-grained ranking _within_ each half is asserted, not established.

**The two operative rules** attributed to Page-Jones and repeated everywhere (secondary sourcing —
connascence.io and practitioner blogs, e.g.
<https://thoughtbot.com/blog/connascence-as-a-vocabulary-to-discuss-coupling>):

1. Minimise overall connascence by breaking the system into encapsulated elements.
2. Minimise remaining connascence that crosses encapsulation boundaries — i.e. **as locality
   decreases, only weaker forms should be tolerated**.

Rule 2 is what makes connascence relevant at architecture scale, and it is the only part of the
apparatus that transfers cleanly to a distributed system.

### 2.2 Static vs dynamic coupling — _Software Architecture: The Hard Parts_ (2021)

**Book:** Neal Ford, Mark Richards, Pramod Sadalage, Zhamak Dehghani, _Software Architecture: The Hard
Parts: Modern Trade-Off Analyses for Distributed Architectures_, O'Reilly, 2021, ISBN 9781492086888.
**One edition only** as of 2026-08-28 — I found no second edition.

**Chapter, verified from the publisher's own page title:** ch. 2 is "Discerning Coupling in Software
Architecture" — <https://www.oreilly.com/library/view/software-architecture-the/9781492086888/ch02.html>
(page title read from search index; the page body returns 403).

**The definitions.** The following wording recurs verbatim across independent secondary sources and
search-engine snippets of the O'Reilly page. **Treat it as a reported quotation whose exact fidelity
to the printed text I could not verify.** The author must attribute it as "as widely quoted" or
paraphrase it, and must **not** present it as a checked quotation:

> Static coupling refers to the way architectural parts (classes, components, services, and so on) are
> wired together: dependencies, coupling degree, connection points, and so on.

> Dynamic coupling refers to how architecture parts call one another at runtime: what kind of
> communication, what information is passed, strictness of contracts, and so on.

Two riders that _are_ well corroborated across sources:

- Static coupling is generally **measurable at build/compile time**; it "represents the static
  dependencies within the architecture."
- The authors explicitly credit **Page-Jones' static/dynamic connascence split** as the origin of the
  distinction — i.e. the _Hard Parts_ terminology is a re-basing of connascence at architecture scale,
  not an independent invention. (Reported in multiple summaries; I could not verify the acknowledgment's
  wording.)

**Where secondary sources garble it.** Two garblings are common and the author should avoid both:

1. "Static coupling = compile-time dependency between classes." Wrong scope. In _Hard Parts_, static
   coupling for a quantum explicitly includes **the database, the operating system, the runtime, and
   shared infrastructure** — anything the service needs in order to boot and be correct. This is why
   a shared database is a static-coupling fact, not a runtime one. (Corroborated by every summary I
   read; e.g. <https://danlebrero.com/2022/03/30/software-architecture-the-hard-parts-book-summary/>.)
2. "Dynamic coupling = coupling that changes at runtime." Wrong sense. It is coupling _expressed_ at
   runtime: the call.

**The three dimensions of dynamic coupling** (ch. 2, reported by
<https://danlebrero.com/2022/03/30/software-architecture-the-hard-parts-book-summary/>, secondary):
**communication** (synchronous / asynchronous), **consistency** (atomic / eventual), **coordination**
(orchestration / choreography). These three form the matrix the rest of the book indexes patterns
against.

### 2.3 The architecture quantum — and the fact that the definition moved

This is the highest-value finding in the brief, and the author must get it right.

| Book                                                                         | Year       | Reported definition                                                                                                                                                |
| ---------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _Building Evolutionary Architectures_, 1st ed. (Ford, Parsons, Kua)          | 2017       | "an independently deployable **component** with high functional cohesion"                                                                                          |
| _Fundamentals of Software Architecture_, 1st ed. (Richards, Ford)            | 2020       | "an independently deployable **artifact** with high functional cohesion **and synchronous connascence**"                                                           |
| _Software Architecture: The Hard Parts_ (Ford, Richards, Sadalage, Dehghani) | 2021       | "independently deployable artifact**s** with high functional cohesion, **high static coupling, and synchronous dynamic coupling**"                                 |
| _Building Evolutionary Architectures_, 2nd ed.                               | 2022       | Same structure as _Hard Parts_: section headings are Independently Deployable, High Functional Cohesion, High Static Coupling, Dynamic Quantum Coupling, Contracts |
| _Fundamentals of Software Architecture_, 2nd ed.                             | March 2025 | **Unverified.** See below.                                                                                                                                         |

**Sourcing for each row:**

- 2017 and the "component → artifact" change: reported by a single secondary blog,
  <https://iam.slys.dev/p/architecture-quantum> (fetched 2026-08-28). **Flagged: single secondary
  source.** Corroborating but weaker: reader notes at <https://lethain.com/building-evolutionary-architectures/>
  and <https://spaceout.pl/building-evolutionary-architectures/> both render the 2017 definition as
  "independently deployable component with high functional cohesion".
- 2020 (_Fundamentals_ ch. 7): two independent reader-note sets give the same wording —
  <https://bagerbach.com/books/fundamentals-of-software-architecture/> and
  <https://github.com/pkardas/notes/blob/master/books/fundamentals-of-architecture.md>. Both render
  it as "an independently deployable artifact with high functional cohesion and synchronous
  connascence". **Two independent secondaries agreeing is the strongest evidence I have for any book
  quotation in this brief.**
- 2021 (_Hard Parts_ ch. 2): the four-part form is quoted identically by
  <https://danlebrero.com/2022/03/30/software-architecture-the-hard-parts-book-summary/>,
  <https://newsletter.techworld-with-milan.com/p/what-i-learned-from-the-software>, and the O'Reilly
  Part I page title/snippet.
- 2022 (_BEA_ 2nd ed.): section headings visible in O'Reilly search results for ISBN 9781492097532.

**Why this matters for the skill:** if the skill quotes "high static coupling and synchronous dynamic
coupling" and attributes it to _Fundamentals_, it is wrong. The connascence-flavoured wording is
_Fundamentals_' and the coupling-flavoured wording is _Hard Parts_'/_BEA 2e_'s.

**Chapter/edition discipline for _Fundamentals_:**

- 1st ed.: Richards & Ford, O'Reilly, 2020, ISBN 9781492043447. Ch. 3 "Modularity" (connascence);
  ch. 7 "Scope of Architecture Characteristics" (quantum). Verified from publisher page titles:
  <https://www.oreilly.com/library/view/fundamentals-of-software/9781492043447/ch07.xhtml>.
- 2nd ed.: _Fundamentals of Software Architecture: A Modern Engineering Approach_, published
  **March 2025** (Mark Richards dates it "March 2025" and his lesson page is dated **3 March 2025** —
  <https://developertoarchitect.com/lessons/lesson205.html>). ISBN 9781098175504 (ebook) /
  9781098175511 (print). Neal Ford on his own site: _"What started as a minor update turned into
  basically a rewrite — we went from about 450 pages to almost 600 in the new edition"_
  (<https://nealford.com/books/SAF2e.html>, fetched 2026-08-28). Publisher blurb says **five new
  chapters**.
- **Chapter numbers survive into the 2nd ed. for the two chapters we care about**: O'Reilly's own page
  titles for ISBN 9781098175504 give `ch01.html` = "1. Introduction", `ch02.html` = "2. Architectural
  Thinking", `ch03.html` = "3. Modularity", and ch. 7 = "The Scope of Architectural Characteristics"
  (note the slightly changed title vs. 1st ed.). Ford's own TOC listing renders an extra "Foundations"
  entry, which is the **Part I heading**, not a chapter — do not be misled by it, as I initially was.
- **Unverified, and must be written as unverified:** whether the _text_ of ch. 3 or ch. 7 changed in
  the 2nd edition; specifically whether the 2nd ed. quantum definition was updated to the _Hard Parts_
  wording. I could not read either edition. The skill must not assert continuity or change.

**Why a shared database collapses many services into one quantum** (the argument as the authors give
it, reported by secondary sources): the database is part of each service's **static coupling** — a
service cannot boot or be correct without it, and a schema change obliges every service reading that
schema. Since a quantum is bounded by static coupling, all services sharing the schema fall inside
one quantum. Corroborating characterisation from
<https://concurrentflows.com/understanding-architectural-coupling> (fetched via search snippet; the
page itself 403s): tight static coupling "forms a single Quantum that must be deployed as a unit",
which is the definitional route to "distributed monolith".

**Quantum is not a synonym for "service" or "deployment unit".** The distinguishing content is that a
quantum is a **maximal** region under static coupling, whereas a deployment unit is whatever the
pipeline happens to ship. Three services with three pipelines and one schema are three deployment
units and one quantum. Conversely a monolith with one pipeline is one quantum trivially — as multiple
summaries put it, "a monolithic architecture deployed as a single unit is by definition a single
quantum architecture." The concept only earns its keep in the first case.

**Does asynchronous communication create a quantum boundary?** The reported position is: **only if
static coupling is also severed.** Async communication removes the _synchronous dynamic coupling_ leg
of the definition, so two services that talk only by events can be separate quanta — but if they also
share a database, a shared domain library, or a schema contract with no compatibility policy, the
static coupling holds them in one quantum regardless. The worked illustration I found
(<https://iam.slys.dev/p/architecture-quantum>, **single secondary source, treat as illustrative
only**) derives "three quanta from six declared services" in a checkout example, with the async edges
splitting quanta and a shared-schema edge refusing to. The same source notes that event schemas keep
publisher and subscriber statically coupled "unless a schema registry with compatibility mode
enforces versioning" — a claim I could not trace to the books.

### 2.4 The Martin metrics

Formulas, uncontroversial and consistently reported
(<https://en.wikipedia.org/wiki/Software_package_metrics>,
<https://www.codeproject.com/Articles/1007524/Object-oriented-metrics-by-Robert-Martin>):

- Afferent coupling **Ca** — number of things outside the component that depend on it.
- Efferent coupling **Ce** — number of things outside that the component depends on.
- Instability **I = Ce / (Ce + Ca)**, range 0 (maximally rigid) to 1 (freely changeable).
- Abstractness **A = abstract types / total types**, range 0 to 1.
- Distance from the main sequence **D = |A + I − 1|**.

Source books: Robert C. Martin, _Agile Software Development: Principles, Patterns, and Practices_
(Prentice Hall, 2002) and _Clean Architecture_ (Prentice Hall, 2017). _Hard Parts_ ch. 4 reuses them
at component level. **Unverified:** exactly what _Hard Parts_ ch. 4 says about them; I have only the
chapter's existence.

**What actually changes above the package — the honest list.**

| Metric       | Above the package (services / quanta)                                                                                                                                                                 | Verdict                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Ca / Ce      | Still computable, but the edges change meaning: an HTTP call, a shared table and a shared jar all become "one edge" while having wildly different blast radius                                        | Survives as a graph shape, degrades as a number                        |
| Instability  | Ce/(Ce+Ca) still arithmetically defined, but "stable" meant _hard to change_ because consumers must recompile; across a process boundary with a versioned contract, a consumer need not change at all | Becomes a proxy for a proxy                                            |
| Abstractness | Requires counting abstract types, which requires a **nominal type system to count**. Across a wire, "abstract" has no referent at all                                                                 | **Undefined** above the deployable — this is the sharpest of the three |
| Distance D   | Inherits both problems, and had no empirical grounding to begin with                                                                                                                                  | Not usable at this level                                               |

The abstractness criticism is not exotic: it is why the metric is implemented for Java/C#/PHP and
essentially nowhere in dynamically-typed or structurally-typed ecosystems. The `pyscn` project's
open feature request to implement A-vs-I for Python is a live illustration that people want it and
that the definition has to be reinvented per language
(<https://github.com/ludo-technologies/pyscn/issues/166>).

---

## 3. The evidence base — measured, asserted, contradicted

### 3.1 Connascence: asserted, essentially unstudied

**A hard bibliometric datum, gathered 2026-08-28.** OpenAlex, searching `connascence software`,
returns **16 works in total** — and the list includes false positives (a French-language thesis, an
Indonesian dependency-analysis paper, a paper on children's problem-solving teams). The original 1992
CACM article shows **23 citations in OpenAlex** and **11 in Crossref** (`is-referenced-by-count`).

For comparison: the CK metrics suite and its validations are cited in the thousands, and D'Ambros
et al. 2009 alone has **147 citations** (Semantic Scholar, 2026-08-28).

**What follows, and what does not.** It follows that there is no empirical literature testing whether
connascence strength predicts anything — not defects, not change effort, not comprehension time. It
does **not** follow that connascence is wrong; it follows that nobody has checked. The skill may say
"there is no empirical support for the strength ordering" and be exactly correct.

**No tooling exists either.** I searched for connascence linters/analysers for Java and Python and
found none in general use; the curated `analysis-tools.dev` catalogues (137 Java tools, 135 Python
tools) surface nothing connascence-specific. This is a governance fact, not just trivia: **connascence
cannot be a fitness function.** It is a vocabulary for review conversations.

### 3.2 The architecture quantum: asserted, unstudied

Searching OpenAlex for `architecture quantum microservices deployability` returns quantum-computing
literature (quantum-computing-as-a-service reference architectures, quantum neural architecture
search) and nothing on the Ford/Richards construct. The term has **zero traction in the academic
literature** and lives entirely in practitioner books and the talks/courses around them
(DeveloperToArchitect, O'Reilly training, conference talks).

The InfoQ podcast with both authors (<https://www.infoq.com/podcasts/software-architecture-hard-parts/>)
does **not** contain them defining quantum, static coupling or dynamic coupling — I checked. It does
contain Ford's general coupling definition, which is quotable and useful:

> **Neal Ford:** "our definition of coupling is I'm coupled to something, if that thing changes, if I
> might have to change because of that, we are coupled to one another."

(Transcript quotation extracted from the InfoQ page, 2026-08-28. Note this is essentially Page-Jones'
connascence definition restated.) Ford also draws a distinction in that episode between **semantic
coupling** and **implementation coupling** — a separate axis from static/dynamic, and one the skill
should be careful not to conflate.

### 3.3 Change / temporal coupling: this is where the evidence is

Two studies worth citing precisely.

**D'Ambros, Lanza & Robbes, "On the Relationship Between Change Coupling and Software Defects",
WCRE 2009, pp. 135–144, IEEE CS Press.** DOI `10.1109/WCRE.2009.19`. 147 citations (Semantic Scholar,
2026-08-28). Three large systems; asks whether change coupling correlates with defects and whether
adding change-coupling information improves metric-based bug prediction. **I could not read the paper**
— IEEE and the authors' PDF at `inf.usi.ch` both returned 403, and Semantic Scholar reports the
abstract as elided by the publisher. So: cite it for the research question and its standing, **not for
a specific effect size.** Author must not invent a number here.

**Kirbas, Caglayan, Hall, Counsell, Bowes, Sen & Bener, "The relationship between evolutionary
coupling and defects in large industrial software", _Journal of Software: Evolution and Process_,
29(4), 2017.** DOI `10.1002/smr.1842`. Open access (CC-BY). Abstract retrieved in full via the
Semantic Scholar API, 2026-08-28 — this one I can quote:

> "We analysed 2 large industrial systems: a legacy financial system and a modern telecommunications
> system. We collected historical data for 7 years from 5 different software repositories containing
> 176 thousand files. […] Our results indicate that there is generally a positive correlation between
> EC and defects, but the correlation strength varies. Evolutionary coupling is less likely to have a
> relationship to software defects for parts of the software with fewer files and where fewer
> developers contributed. […] Although EC measures may be useful to explain defects, the explanatory
> power of such measures depends on defect types, size, and process metrics."

**This is the best empirical anchor the skill has, and it cuts both ways.** It supports "files that
change together are a real signal". It also says, in the authors' own words, that the signal **weakens
in small parts of the system with few contributors** — which is directly the scale-honesty point in §7,
sourced rather than asserted.

### 3.4 Structural coupling metrics: contradicted once size is controlled

**Khaled El Emam, Saïda Benlarbi, Nishith Goel & Shesh Nath Rai, "The Confounding Effect of Class Size
on the Validity of Object-Oriented Metrics", _IEEE Transactions on Software Engineering_, 27(7), 2001,
pp. 630–650.**

Reported findings (secondary — I could not retrieve the paper text; summary corroborated across
<https://neverworkintheory.org/2011/07/07/the-confounding-effect-of-class-size-on-the-validity-of-object-oriented-metrics.html>
and the Semantic Scholar record): of 24 OO metrics examined, **only four remained associated with
faults after controlling for class size, and only two were useful for prediction models.** The authors
recommended that prior validation studies be re-examined and that future ones always control for size.

There is a published rebuttal — "Comments on 'The confounding effect of class size…'", IEEE TSE
(<https://ieeexplore.ieee.org/document/1214331/>) — which I did not read. **The author must note the
rebuttal exists rather than presenting El Emam as settled.** There is also a later meta-analysis on
size confounding and change-proneness
(<https://www.researchgate.net/publication/281769881>), likewise unread.

**Note the asymmetry that makes this useful:** El Emam's target is _structural_ metrics on classes.
The change-coupling evidence in §3.3 is a different measurement family (process/history, not
structure) and survives independently. The skill can honestly say: **history-based coupling has better
evidence than structure-based coupling.**

### 3.5 Independent deployability: survey evidence, not experiment

DORA's "loosely coupled teams" capability page (<https://dora.dev/capabilities/loosely-coupled-teams/>,
fetched 2026-08-28) frames the architectural criterion as teams being able to

> "make large-scale changes to the design of their systems without the permission of somebody outside
> the team or depending on other teams"

and lists as component criteria: complete work without fine-grained cross-team coordination; deploy and
release independently of service dependencies; test on demand without an integrated test environment;
deploy during business hours with negligible downtime. The page cites the 2017 State of DevOps report
plus 2021–2023.

**Epistemic status, stated honestly:** DORA is cross-sectional survey research with self-reported
measures. It is real evidence that the _capability_ correlates with delivery and organisational
outcomes. It is **not** evidence for the quantum construct, for connascence, or for any specific
coupling metric. It supports the skill's framing question — "what is the unit of independent
deployability here?" — as a question worth asking.

### 3.6 Summary table

| Claim family                          | Status                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Connascence taxonomy (the nine forms) | Asserted; useful as vocabulary; unstudied                                         |
| Connascence strength ordering         | Asserted; explicitly hedged even by advocates; unstudied                          |
| Static/dynamic coupling distinction   | Asserted; derived from connascence; unstudied under that name                     |
| Architecture quantum                  | Asserted; zero academic literature                                                |
| Shared DB ⇒ one quantum               | A definitional consequence, not an empirical finding                              |
| Change/temporal coupling ↔ defects    | **Measured**, positive but conditional (D'Ambros 2009; Kirbas 2017)               |
| Structural coupling metrics ↔ defects | **Contradicted** once size is controlled (El Emam 2001), with a rebuttal          |
| Martin main sequence                  | No empirical validation found; validation attempts describe themselves as partial |
| Loose coupling ↔ delivery performance | **Survey-measured** (DORA), self-reported                                         |

---

## 4. Live disagreements

Each stated with both sides and who holds them. I found real published positions for the first three;
the fourth is weaker and I say so.

### 4.1 Is a shared database really "one quantum"?

- **Ford/Richards/Sadalage/Dehghani (_Hard Parts_, 2021):** yes, by definition — the database is part
  of static coupling, so everything bound to it is one quantum, whatever the pipelines say.
- **Sam Newman (_Building Microservices_, 2nd ed., O'Reilly, 2021):** agrees the coupling is severe but
  places it in a **different taxonomy**. Newman's ch. 2 taxonomy is domain coupling → pass-through
  coupling → common coupling → content coupling, ordered loosest to tightest. A shared database is
  **common coupling** ("two services using the same data"), which he explicitly says is **tolerable for
  read-only, low-change reference data**; a service reaching into another's database is **content
  coupling**, the worst kind. (Definitions quoted from reader notes at
  <https://danlebrero.com/2023/01/24/building-microservices-second-edition-designing-fine-grained-systems-summary/>
  — **secondary source**.) Newman's position is therefore graded where the quantum definition is binary.
- **The practitioner counter-position, which is real:** teams do in fact deploy independently against a
  shared schema, every day, using expand/contract migrations, per-service database roles and grants, and
  schema-owning services. TechTarget's survey of the argument
  (<https://www.techtarget.com/searchapparchitecture/tip/Can-you-really-use-a-shared-database-for-microservices>)
  and microservices.io's own **"Shared database" pattern** page
  (<https://microservices.io/patterns/data/shared-database.html>) both treat it as a legitimate pattern
  with named forces, not simply an antipattern.
- **The steelman of each:** "one quantum" is a claim about the _worst case blast radius_ of a schema
  change; "we deploy independently" is a claim about the _observed frequency_ of that worst case. Both
  can be true. The disagreement is about whether an architectural unit should be defined by its worst
  case. The skill should present it that way rather than picking a winner.

### 4.2 Is the architecture quantum operationally useful, or a relabelling of "deployment unit"?

- **For:** it names something a deployment unit does not — the transitive closure under static coupling.
  Under that reading, "how many quanta do we have?" is answerable and "how many deployment units do we
  have?" is a different, usually larger, number. The gap between the two numbers is the diagnosis.
- **Against:** in the overwhelmingly common case where each service owns its data, quantum count equals
  deployment unit count exactly, and the term adds a word without adding information. Its diagnostic
  value is concentrated in exactly the situations everyone already has a name for (distributed monolith,
  shared database).
- **Honest state of the argument: I found no published critique making the "against" case.** I searched
  for it directly. What exists is silence — the academic literature ignores the term (§3.2) and the
  practitioner literature that uses it is largely downstream of the same four authors. The author should
  present the "against" case as **this skill's own reasoning, explicitly unattributed**, not as a
  reported debate. Manufacturing a named opponent here would be a fabrication.

### 4.3 Do coupling metrics predict anything once you control for size?

- **Against (El Emam et al., IEEE TSE 2001):** 4 of 24 survived; prior validations should be re-examined.
- **For, with qualification (Kirbas et al., JSEP 2017):** process/history-based coupling retains a
  positive relationship with defects, though its explanatory power "depends on defect types, size, and
  process metrics" — i.e. size is a moderator here too, not a refutation.
- **A published rebuttal to El Emam exists** (IEEE TSE, <https://ieeexplore.ieee.org/document/1214331/>)
  which I have not read; the skill must not present El Emam as the last word.
- **What both sides agree on:** size must be controlled for. A skill that recommends any coupling
  threshold without normalising for size is on the wrong side of a twenty-five-year-old result.

### 4.4 Is connascence used by practitioners, or is it a teaching device?

- **Used:** it is taught in a bestselling architecture book (_Fundamentals_ ch. 3), has a dedicated
  community reference site, and recurs in Ruby/Rails and DDD community writing (thoughtbot, Alchemists,
  practicingruby).
- **Teaching device:** 16 works in the entire indexed literature; 23 citations for the founding paper;
  no analyser implements it; and its central ranking is hedged by the people who promote it. Nothing
  in a build pipeline can enforce it.
- **I found no published critic** arguing "connascence is not used in practice". The evidence for that
  side is circumstantial (bibliometric and tooling absence), and the skill should present it as
  circumstantial. The defensible synthesis: **connascence is a review vocabulary with real
  discriminating power and no governance surface.** That is a claim about what it is for, not a
  criticism.

---

## 5. Failure records — dated, sourced, numbered

### 5.1 Segment — shared-library version hell inside a distributed monolith (2018)

**Source:** Alexandra Noonan, "Goodbye Microservices: From 100s of problem children to 1 superstar",
Segment engineering blog, **10 July 2018**. Now hosted at
<https://www.twilio.com/en-us/blog/developers/best-practices/goodbye-microservices> (Twilio acquired
Segment). **Verified live 2026-08-28.** Independent contemporaneous coverage: InfoQ,
<https://www.infoq.com/news/2018/07/segment-microservices/>.

Numbers extracted from the post:

| Datum                                                                           | Value                  |
| ------------------------------------------------------------------------------- | ---------------------- |
| Destinations (integrations), at migration time                                  | 140+, growing ~3/month |
| Services consolidated back into one                                             | 140+                   |
| Repos                                                                           | one per destination    |
| **Distinct versions of the shared libraries in production**                     | **120**                |
| Engineers whose time went to keeping it alive                                   | 3 full-time            |
| Shared-library improvements, microservices era vs. one year after consolidation | 32 vs. 46              |

The mechanism, quoted from the post: _"Testing and deploying changes to these shared libraries impacted
all of our destinations. It began to require considerable time and effort to maintain."_ Engineers then
stopped upgrading uniformly, and _"over time, the versions of these shared libraries began to diverge
across the different destination codebases."_

**Why this is the best available record for the skill:** it is a first-party engineering write-up, with
a date, with a count of the version spread, describing the exact failure mode — a shared library is
static coupling; static coupling does not stop being static coupling because you made 140 repos. It
also honestly reports what was lost: _"Fault isolation is difficult"_, and degraded in-memory caching
across 3000+ processes. The skill should carry the cost side too.

### 5.2 Uber — the term "networked monolith", with a service count (2020)

**Source:** Adam Gluck, "Introducing Domain-Oriented Microservice Architecture", Uber engineering blog,
**23 July 2020**, <https://www.uber.com/en-SE/blog/microservice-architecture/>. **Verified live
2026-08-28.**

Quoted directly from the post:

> "Networked monoliths can form, where services that appear to be independent all have to be deployed
> together to safely perform any change."

> "In order to build a simple feature an engineer often has to work across multiple services, all of
> which are owned by different individuals and teams"

> "understanding dependencies between services can become quite difficult, as calls between services
> can go many layers deep"

Numbers from the post: **2,200 critical microservices**, grouped into **~70 domains** (~50% implemented
at time of writing); a **1.5-year half-life** for a microservice; and, as an illustration of dynamic
coupling depth, one root-cause investigation touching **50 services across 12 teams**. Reported
outcomes after the extensions architecture: onboarding time down 25–50%; new-feature integration from
3 days to 3 hours.

This is the strongest first-party record of **deployment coupling** specifically — a company with a
named architecture, a service count, and a sentence that is the definition of a distributed monolith
written by someone living inside one.

### 5.3 DoorDash — shared database as the constraint (multiple posts, 2020–2023)

**Sources:** DoorDash engineering blog,
<https://careersatdoordash.com/blog/how-doordash-transitioned-from-a-monolith-to-microservices/>
(the page returned **403** to my fetch; content below is from search-index snippets and from
<https://www.cockroachlabs.com/blog/aurora-postgres-to-cockroachdb/>, a **vendor** source — discount
accordingly).

Reported facts: a **single-master PostgreSQL instance remained the source of most data** even after
domain databases were carved out; vertical and read-replica scaling hit limits; **"as the database
model grew, coupling was a major concern and migrations of data to separate domain-specific databases
became more difficult"**; and DashPass was among the heaviest users of a shared database "on which
almost all of DoorDash relied", such that its failure would stop orders.

**Sourcing caveat the author must respect:** I could not read the first-party post, and the strongest
numeric framing came from a database vendor with an interest in the conclusion. Use this as an
illustration of the mechanism (one schema = one quantum's worth of blast radius), **not** as a
quantified case.

### 5.4 Amazon Prime Video — a widely-repeated story that is poorly sourced today

The "Prime Video moved from microservices to a monolith and cut costs 90%" story (Marcin Kolny, Prime
Video Tech blog, **22 March 2023**) is the most-cited architecture anecdote of the decade and the skill
should handle it carefully or not at all.

**Two problems, both verified 2026-08-28:**

1. **The primary source is gone.** `https://www.primevideotech.com/video-streaming/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90`
   now returns **HTTP 301 to `aboutamazon.com/what-we-do/entertainment/`**. The post survives only in
   the Internet Archive; a snapshot exists at
   `https://web.archive.org/web/20231230202019/https://www.primevideotech.com/video-streaming/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90`
   (HTTP 200, verified). **Any citation must go to the archive, with the note that the original was
   withdrawn.**
2. **The popular retelling is contested by a credible insider.** Adrian Cockcroft — formerly VP of
   Cloud Architecture Strategy at AWS and, before that, the architect most associated with Netflix's
   microservices — published "So many bad takes — What is there to learn from the Prime Video
   microservices to monolith story", **6 May 2023**,
   <https://adrianco.medium.com/so-many-bad-takes-what-is-there-to-learn-from-the-prime-video-microservices-to-monolith-story-4bd0970423d4>.
   His position: this was one internal component (the Video Quality Analysis monitoring service), the
   team followed a "serverless first" path and optimised as expected, and the result is not a monolith.
   Quoted in The New Stack: _"This definitely isn't a microservices-to-monolith story. It's a Step
   Functions-to-microservices story. And I think one of the problems is the wrong labeling."_
   (<https://thenewstack.io/amazon-prime-videos-microservices-move-doesnt-lead-to-a-monolith-after-all/>)

**Recommendation for handling (evidence, not opinion):** if the skill cites it at all, it should cite
it as an example of **how architecture anecdotes decay** — withdrawn primary source, contested framing,
scope inflated from one component to a company — not as evidence about coupling. It is also, on
Cockcroft's reading, a story about **dynamic** coupling cost (per-frame S3 round-trips) rather than
static coupling, which is a different axis from the one this skill owns.

### 5.5 "Distributed monolith" — the term itself is folklore-sourced

I tried to find a coinage. The earliest reference surfaced is ~November 2014, and no source attributes
it to a named person. The oldest dated blog post I found using it as an established term is
<https://thoughts.derekgottlieb.com/blog/2015/06/07/distributed-monoliths/> (7 June 2015). **The skill
should not attribute the term to anyone.** The best-sourced formulation of the _concept_ is Uber's
"networked monolith" sentence in §5.2, which has an author, a date and an employer.

---

## 6. Governance / fitness functions

All versions and maintenance facts verified **2026-08-28** via the GitHub REST API, Maven Central
metadata, and vendor docs. Method stated per row so the validator can re-run it.

### 6.1 Tool currency table

| Tool                         | Latest version                      | Released   | Maintained?                                                                                                    | How verified                                                                                                                |
| ---------------------------- | ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **ArchUnit**                 | **1.5.0**                           | 2026-08-04 | **Yes** — last push to `main` 2026-08-28; 3,815 stars                                                          | `gh api repos/TNG/ArchUnit/releases`; `repo1.maven.org/.../archunit/maven-metadata.xml` lists 1.5.0, `lastUpdated=20260804` |
| **code-maat**                | v1.0.4                              | 2023-02-20 | **Barely** — last commit 2025-07-03, not archived, 2,626 stars; README itself points at CodeScene as successor | `gh api repos/adamtornhill/code-maat`                                                                                       |
| **CodeScene** (commercial)   | docs at 7.0.3+                      | current    | **Yes**, actively sold and documented                                                                          | `docs.enterprise.codescene.io` versioned docs                                                                               |
| **jQAssistant**              | 2.9.1                               | 2026-02-17 | **Yes**                                                                                                        | `gh api repos/jqassistant/jqassistant/releases/latest`                                                                      |
| **OWASP Dependency-Track**   | 5.1.0                               | 2026-08-27 | **Yes** — released the day before this brief                                                                   | `gh api repos/DependencyTrack/dependency-track/releases/latest`                                                             |
| **OpenTelemetry DB semconv** | stable since semconv v1.33.0 (2025) | —          | **Yes**                                                                                                        | <https://opentelemetry.io/docs/specs/semconv/db/database-spans/>                                                            |

**Maven Central index caveat worth passing on:** `search.maven.org`'s Solr index still reported 1.4.1
as `latestVersion` for the `archunit-junit5-*` artefacts on 2026-08-28 while `maven-metadata.xml` for
`com.tngtech.archunit:archunit` already listed **1.5.0**. Verify against `maven-metadata.xml`, not the
search UI.

### 6.2 ArchUnit — governing static coupling inside a deployable

**Verified API surface (ArchUnit user guide, <https://www.archunit.org/userguide/html/000_Index.html>,
read 2026-08-28).** All names below were read from the guide, not guessed.

**Component-level Martin metrics — this is the one genuinely underused capability**:

```java
ComponentDependencyMetrics metrics = ArchitectureMetrics.componentDependencyMetrics(components);
metrics.getEfferentCoupling("com.example.component");
metrics.getAfferentCoupling("com.example.component");
metrics.getInstability("com.example.component");
metrics.getAbstractness("com.example.component");
metrics.getNormalizedDistanceFromMainSequence("com.example.component");
```

Also available: `ArchitectureMetrics.lakosMetrics(components)` (CCD/ACD/RACD/NCCD — Lakos' cumulative
component dependency; note ArchUnit 1.5.0's release notes record that `lakosMetrics` "is computed much
more performantly", issue #1629) and `ArchitectureMetrics.visibilityMetrics(components)` (Dowalil's RV,
ARV, GRV).

**Cycle freedom between slices**, the closest thing to a directly enforceable coupling rule:

```java
SlicesRuleDefinition.slices().matching("..myapp.(*)..").should().beFreeOfCycles()
```

Configuration knobs: `cycles.maxNumberToDetect` (default 100),
`cycles.maxNumberOfDependenciesPerEdge` (default 20). Lower-level API:
`com.tngtech.archunit.library.cycle_detection.CycleDetector.detectCycles(nodes, edges)`.

**Ratcheting onto legacy code — `FreezingArchRule`, confirmed present and current:**

```java
ArchRule rule = FreezingArchRule.freeze(classes().should()./* … */);
```

Properties in `archunit.properties`: `freeze.store.default.path`,
`freeze.store.default.allowStoreCreation`, `freeze.store.default.allowStoreUpdate`, `freeze.refreeze`.
Extension points `com.tngtech.archunit.library.freeze.ViolationStore` and `…ViolationLineMatcher`
(configured with `freeze.store` / `freeze.lineMatcher`). **1.5.0-specific fact worth citing:**
`TextFileBasedViolationStore` "is now thread-safe under parallel test execution" (issue #1656) — a
real bug class if the skill recommends freezing on a parallel suite.

Other 1.5.0 facts that affect an example's validity: Java 27 / class file major version 71 support;
new `archunit-junit6` module for JUnit 6.

**Threshold guidance, honestly framed.** ArchUnit gives numbers; it does not give thresholds, and
**none of the Martin metrics has a defensible universal threshold** (§3.4, §2.4). The only rules here
with a justification that survives review are **relational**, not absolute:

- **Cycle count between slices = 0.** Justification: a cycle is a definitional loss of independent
  releasability between the slices in it — no statistical claim required. This is enforceable and
  should be frozen, not thresholded.
- **An edge from a low-instability component to a high-instability one is a finding.** Justification:
  a rigid component has taken a dependency on something designed to churn. Note this rule is
  **already owned by `component-and-release-boundaries`** — see §8.
- **Absolute thresholds ("instability must stay under 0.6") should be rejected.** Justification: §3.4;
  and the repo's existing skills already say so.

### 6.3 Change / temporal coupling from git history

**How it is computed.** For a pair of artefacts (A, B), over a window of revisions: coupling degree =
(shared revisions) / (revisions of the more-frequently-changed of the two), expressed 0–100. Filters
are needed because the raw statistic is dominated by noise.

**code-maat** (`java -jar code-maat-1.0.4-standalone.jar -l logfile.log -c git -a coupling`), defaults
read from the project README (<https://github.com/adamtornhill/code-maat>, 2026-08-28):

| Option                  | Default | Meaning                                          |
| ----------------------- | ------- | ------------------------------------------------ |
| `-n, --min-revs`        | 5       | minimum revisions for an entity to be considered |
| `-m, --min-shared-revs` | 5       | minimum revisions the pair must share            |
| `-i, --min-coupling`    | 30      | minimum coupling degree (%) to report            |
| `-x, --max-coupling`    | 100     | upper cut-off                                    |

README's own gloss on the output: "each time it's modified, it's a 78% risk/chance that we'll have to
change our `Page.java` module too."

**CodeScene** (commercial successor, docs at `docs.enterprise.codescene.io`) publishes stricter
defaults: ignore files with **fewer than 10 revisions** ("the coupling may be accidental"); ignore
pairs with **fewer than 10 shared commits**; ignore pairs below **50% coupling strength**; ignore
**changesets touching more than 50 files** (to suppress false positives from sweeping renames and
formatting commits). A separate fixed **20%** threshold appears in one of its graph views.

**Recommended shape of the fitness function** (evidence-based, thresholds justified rather than
invented):

- **Metric:** change coupling between **modules/repos**, not files — the architecture-scale question is
  which deployables co-change, and file-level coupling belongs to the code-level skills.
- **Threshold:** report a pair only at **≥10 shared commits** and **≥50% coupling degree**, excluding
  commits touching **>50 files**. Justification: these are CodeScene's published production defaults,
  and they are strictly stricter than code-maat's, so they under-report rather than over-report.
- **Where it runs:** not in the build. Change coupling is a **trend**, computed over a window (90 days
  or one release train) on a schedule, reviewed by humans. Wiring it to a build failure would fail on
  history, which no commit can fix.
- **Known limitation to state:** the Kirbas 2017 result — the signal is weak "for parts of the software
  with fewer files and where fewer developers contributed". A two-person module will produce noise.

**Maintenance honesty:** code-maat's last release is **2023-02-20** and its last commit **2025-07-03**.
It is not archived and not dead, but it is not actively developed, and its own README directs users to
the commercial product. A skill that names it must say this. (This is the Simian Army lesson: name the
date, not just the tool.)

### 6.4 Deployment coupling — measuring "must release together"

**There is no off-the-shelf tool for this.** I looked. What exists is DORA's capability framing
(§3.5), which is a survey instrument, not a measurement. So the honest offering is a **computation the
team runs on data it already has**, and the skill should present it as such.

**Data source:** the deployment/release record every CI/CD system already keeps — GitHub Actions
deployment events, Argo CD `Application` sync history, Spinnaker/Harness pipeline executions, or a
change-management table.

**Computation:** treat each production deployment as an event `(service, timestamp, change-ref)`. For
each ordered pair (A, B), compute **confidence**: of the deployments of A in the window, the fraction
followed by a deployment of B within a coordination window (a few hours, or the same release train).
This is the same association statistic as change coupling, applied to deploy events instead of commits.

**Threshold with justification:** confidence ≥ 0.8 over ≥10 deployments of A means A and B are, in
practice, one deployment unit — the pair should be either merged or genuinely decoupled. The
justification is definitional rather than statistical: at 0.8 the claim "these deploy independently"
is false four times in five. **Say that it is definitional.** There is no study establishing 0.8.

**Two confounders the skill must name or the metric will lie:**

1. A **release train** (everything ships Thursday) drives every pair's confidence toward 1.0 and
   measures the process, not the architecture. Fix: compute over change-refs, not wall-clock — pairs
   that ship together **because the same change touched both**.
2. **Deploy-on-merge in a monorepo** produces the same artefact. Fix: exclude no-op deployments where
   the service's own inputs did not change.

**Cheaper leading indicator, same data:** count **cross-repo pull requests that must merge together**
(linked/"depends on" PRs). One shared library upgrade forcing N coordinated PRs is Segment's 120
versions in embryo (§5.1).

### 6.5 Shared-library version drift

**Tool: OWASP Dependency-Track 5.1.0** (released **2026-08-27** — the most current tool in this brief).
Ingests CycloneDX SBOMs from every service and maintains a portfolio-wide inventory. The relevant
query is not "are we vulnerable?" but **"how many distinct versions of _our own_ internal library are
in production right now?"** — which is exactly Segment's 120 (§5.1) and is answerable from the
portfolio inventory.

**Metric:** version spread per internal shared artefact = count of distinct versions deployed.
**Threshold:** the only non-arbitrary values are **1** (a genuine single version — usually unrealistic)
and **N + a stated policy** (e.g. at most two minor versions behind latest). Justification is
definitional again: every extra live version is a separate compatibility surface the library owner must
keep working. **No study establishes a number.** Say so.

**Where it runs:** on SBOM upload at release time, reported per artefact; a policy violation in
Dependency-Track can gate a release, but the more useful placement is a weekly report to the library
owner.

### 6.6 Detecting shared-database coupling automatically

Three techniques, in increasing order of reliability. **None is a product; all are implementable.**

1. **Static — scan for datasource configuration.** Grep every service repo for JDBC/connection URLs and
   group by `host + database + schema`. Cheap, and catches the common case. Fails on
   config-server/secret-manager indirection, which is exactly where the interesting cases hide.
2. **Runtime, from the database — the most reliable.** Every connecting application declares itself,
   and the database records it:
   - PostgreSQL: `pg_stat_activity` exposes `datname`, `usename`, `client_addr` and
     **`application_name`**, which the client sets in its connection string. Group distinct
     `application_name` per `datname` — more than one is shared-database coupling, on the record.
     (<https://www.enterprisedb.com/blog/getting-most-out-applicationname>)
   - SQL Server: the equivalent is `program_name` in `sys.dm_exec_sessions`.
   - **Precondition and the reason this often fails:** if services do not set `application_name` /
     `Application Name=`, everything shows up as the driver's default and the query returns nothing
     useful. Setting it is a one-line change per service and should be treated as a prerequisite for the
     fitness function, not an afterthought.
3. **Runtime, from tracing — cross-service and cross-database.** OpenTelemetry's **database client span
   conventions are Stable as of semantic conventions v1.33.0 (2025)**
   (<https://opentelemetry.io/docs/specs/semconv/db/database-spans/>). The attributes to group on are
   **`db.system.name`** (values include `postgresql`, `microsoft.sql_server`, `mysql`, `oracle.db`, …)
   and **`db.namespace`** (for SQL Server: the database name, or `{instance_name}|{database_name}` on a
   named instance). Query: distinct `service.name` per (`db.system.name`, `db.namespace`) — and, if
   statement-level attributes are collected, per table. **Migration warning for the skill:** these names
   are the _new_ stable ones; older instrumentation emits `db.system` and `db.name`, and OTel publishes a
   migration guide (<https://opentelemetry.io/docs/specs/semconv/non-normative/db-migration/>). An
   example citing the old names would be wrong as of today.

**Threshold:** **more than one service writing to a schema is the finding.** Read-only consumers are a
graded case (this is Newman's "common coupling is tolerable for read-only reference data", §4.1) and
should be reported separately from writers. Justification is definitional and matches both taxonomies.

**Where it runs:** a scheduled query against the observability backend or the database itself, not a
build gate — the fact being measured is production topology, which no build can see.

### 6.7 What cannot be governed

State this plainly in the skill, because it is the honest boundary of the topic:

- **Connascence has no analyser** (§3.1). It is a review vocabulary. Any claim that a pipeline enforces
  connascence is false.
- **Quantum count has no analyser.** It can be _derived_ by hand from the outputs of §6.4 and §6.6, but
  nothing computes it.
- **Abstractness and distance-from-main-sequence stop at the deployable** (§2.4) — no tool computes them
  across a process boundary because the definition does not extend there.

---

## 7. Scale honesty

**The direct question — below what team and system size is this vocabulary net-negative overhead? — has
no empirical answer. I looked and there is none.** What exists:

- **The one piece of real evidence that bears on it** is Kirbas et al. 2017 (§3.3): evolutionary
  coupling "is less likely to have a relationship to software defects **for parts of the software with
  fewer files and where fewer developers contributed**." That is a peer-reviewed, industrial finding
  that the measurement itself degrades at small scale. It is about a measurement, not about vocabulary,
  and it gives no threshold — but it is real and the skill should use it rather than asserting.
- **Everything else is assertion by respected people.** Martin Fowler's "MicroservicePremium"
  (<https://martinfowler.com/bliki/MicroservicePremium.html>) and his "you must be this tall to use
  microservices" line are arguments, published without data. They are worth citing as _positions_, with
  their nature stated.
- **DORA (§3.5) does not help here.** It measures the outcomes of loose coupling; it does not identify a
  size below which the analysis costs more than it returns.
- **The repo's own existing position is more specific than anything published.**
  `java-cohesion-coupling` already tells the reader: _"A 15-kloc service owned by three people does not
  need instability analysis; it needs clear names."_ That is the house voice, it is unattributed, and
  the new skill should be consistent with it rather than inventing a different number.

**A defensible construction the author may use, provided it is marked as the skill's own reasoning:**
the vocabulary starts paying when there is **more than one team** and **more than one deployable**,
because that is the first moment "who must I coordinate with to ship?" has a non-trivial answer. Below
that, quantum count is 1, static coupling is total and uninteresting, and the whole apparatus reduces to
"keep the packages tidy" — which two other skills already cover. **No source states this. Do not
attribute it.**

---

## 8. Boundary notes — where the line falls

I read the frontmatter of every named neighbour in `C:\git\agent-skills\skills\<name>\SKILL.md`, plus
the relevant reference files. The overlap is **much larger than the topic brief implies** and the
author must design around it.

| Neighbour                          | What it already owns (verbatim from its own files)                                                                                                                                                                                                                                           | What that forbids here                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `java-cohesion-coupling`           | `references/metrics-and-limits.md` defines **Ca, Ce, and `I = Ce / (Ca + Ce)`** and states the rule "an edge from a low-I package to a high-I package means something"; also owns package dependency graphs and JPMS                                                                         | **Do not re-derive Ca/Ce/I.** Do not teach package-level coupling. Reference it.                                                                                                                                                                                     |
| `component-and-release-boundaries` | `references/component-principles.md` owns **abstractness, the main sequence diagram, the zone of pain and the zone of uselessness**, and already says instability as a target is "numerology, and a review should reject it". Also owns shared-jar coupling and cycles between Maven modules | **This is the biggest collision.** The Martin metrics at module/release level are wholly taken, including the criticism. What is left for this skill is only §2.4's table — what breaks _above_ the deployable — and only if stated as a boundary, not a re-teaching |
| `distribution-boundaries`          | Frontmatter explicitly triggers on "when two services share a database", "when a 'service' cannot be deployed without another being deployed too", and on choosing sync vs messaging vs replication                                                                                          | **Very sharp collision.** Distribution-boundaries owns the **decision** (should this become a process boundary, and what does it cost). This skill can only own the **diagnosis vocabulary** — naming what unit exists today and which coupling crosses it           |
| `layering-and-boundaries`          | In-process boundaries, hexagonal/clean/modular monolith, enforcement of a boundary                                                                                                                                                                                                           | Nothing in-process. No layering discussion.                                                                                                                                                                                                                          |
| `architecture-characteristics`     | Frontmatter already includes "**scoping each list to one quantum**" and "when an estate shares one list"                                                                                                                                                                                     | **The word "quantum" is already in use in this suite**, as the scope unit for a characteristics list. The new skill must define it compatibly and must not re-litigate characteristic scoping                                                                        |
| `architecture-trade-off-analysis`  | "entanglement and coupling", MECE option sets, resisting evangelism                                                                                                                                                                                                                          | No trade-off method. If the skill finds itself scoring options, it has crossed over                                                                                                                                                                                  |
| `architecture-fitness-functions`   | The governance **decision** — what to govern, at what threshold, what happens when it goes red; the objectivity test; marking something explicitly ungoverned                                                                                                                                | §6 must supply **candidate metrics and verified tool facts**, not the governance decision procedure. Hand off for "should we govern this at all"                                                                                                                     |
| `architecture-testing`             | Writing the test                                                                                                                                                                                                                                                                             | No ArchUnit tutorials                                                                                                                                                                                                                                                |
| `enterprise-architecture-smells`   | Frontmatter names **"distributed monoliths"** explicitly as one of its smells                                                                                                                                                                                                                | **Collision on §5.** The smell catalogue owns "you have a distributed monolith". This skill can own "here is the unit, here is the coupling that crosses it" — the measurement, not the verdict                                                                      |

**Precise statement of the line, for the author to argue with:** every neighbour above owns either a
**level** (class/package, module/release, in-process layer, process boundary) or an **activity**
(deciding, testing, governing, smelling). What is genuinely unclaimed is the **cross-level question**:
_given a system that already spans packages, jars, services and databases, what is the actual unit that
can ship on its own, and which coupling — static or dynamic, and of which connascence form — crosses
that unit's edge?_ If the skill cannot keep itself to that question, the honest conclusion is that it
overlaps too much to exist separately, and the author should say so rather than padding.

---

## 9. Open questions the author must not paper over

1. **The 2nd-edition text of _Fundamentals_ ch. 3 and ch. 7 is unverified.** Chapter numbers and titles
   are confirmed; the content is not. If the skill quotes either chapter it must say which edition the
   quotation is from and that the other edition was not checked. Do not write "unchanged in the 2nd
   edition" — I did not verify that.
2. **Every book quotation in this brief is secondary.** The strongest is _Fundamentals_' quantum
   definition (two independent reader-note sets agreeing). The weakest is the _Hard Parts_ static/dynamic
   coupling wording, which I only have from search snippets and blogs, and which the author should
   paraphrase rather than quote. **Never present any of these as a checked quotation.**
3. **No page numbers exist anywhere in this research.** Any page number in the skill would be invented.
4. **Whether Page-Jones himself claims a total strength ordering is unresolved.** I could not read the
   1992 paper or the 1996 book. Both the "total order" and "partial order" readings circulate. The safe
   formulation is: the ordering is published as a heuristic and its advocates hedge it.
5. **The "against" case on the architecture quantum has no published proponent** (§4.2). If the skill
   argues it, it must own it in its own voice.
6. **The 0.8 deployment-coupling threshold and the version-spread threshold in §6 are definitional, not
   empirical.** They are constructed here to be defensible in a review, not derived from data. The skill
   must label them that way or a validator will correctly call it invented rigour.
7. **The El Emam rebuttal is unread** (<https://ieeexplore.ieee.org/document/1214331/>). Do not present
   the size-confound result as settled.
8. **The D'Ambros 2009 effect sizes are unknown** — the paper is paywalled and its abstract elided.
   Cite it for the question and its standing; do not attribute a number to it.
9. **The DoorDash record is thin** (§5.3): first-party page 403'd, best numbers came from a database
   vendor. Either strengthen it or use Segment and Uber, which are solid.
10. **The overlap with `component-and-release-boundaries` and `distribution-boundaries` may be fatal.**
    Both already cover shared jars, shared databases, cycles, and "cannot deploy without the other". The
    author should test early whether a genuinely distinct skill remains, and report honestly if it does
    not.

---

## 10. Source list

Primary / first-party (fetched or API-verified 2026-08-28 unless noted):

- Crossref, DOI `10.1145/130994.131004` — Page-Jones 1992 bibliographic record.
- <https://connascence.io/> and `/pages/about.html` — taxonomy and provenance (community site).
- <https://en.wikipedia.org/wiki/Connascence>
- <https://nealford.com/books/SAF2e.html> — Ford on the 2nd edition, page count, TOC.
- <https://developertoarchitect.com/lessons/lesson205.html> — Richards, 2nd edition, 3 March 2025.
- <https://www.oreilly.com/library/view/fundamentals-of-software/9781492043447/ch07.xhtml> (1st ed. ch. 7 title),
  `…/9781098175504/ch03.html` (2nd ed. ch. 3 title) — page titles only; bodies 403.
- <https://www.oreilly.com/library/view/software-architecture-the/9781492086888/ch02.html> — _Hard Parts_ ch. 2 title.
- <https://www.infoq.com/podcasts/software-architecture-hard-parts/> — Ford's coupling definition, transcript.
- <https://www.twilio.com/en-us/blog/developers/best-practices/goodbye-microservices> — Noonan, 10 July 2018.
- <https://www.uber.com/en-SE/blog/microservice-architecture/> — Gluck, 23 July 2020.
- <https://adrianco.medium.com/so-many-bad-takes-what-is-there-to-learn-from-the-prime-video-microservices-to-monolith-story-4bd0970423d4> — Cockcroft, 6 May 2023.
- `web.archive.org/web/20231230202019/…primevideotech.com/…` — archived Prime Video post (original URL now 301s).
- <https://dora.dev/capabilities/loosely-coupled-teams/>
- <https://www.archunit.org/userguide/html/000_Index.html> — ArchUnit API surface.
- `gh api repos/TNG/ArchUnit/releases/tags/v1.5.0` — 1.5.0 release notes, 2026-08-04.
- `repo1.maven.org/maven2/com/tngtech/archunit/archunit/maven-metadata.xml`
- <https://github.com/adamtornhill/code-maat> — options, defaults, successor statement.
- `docs.enterprise.codescene.io` — temporal-coupling thresholds.
- `gh api repos/DependencyTrack/dependency-track/releases/latest` — 5.1.0, 2026-08-27.
- <https://opentelemetry.io/docs/specs/semconv/db/database-spans/> and `…/non-normative/db-migration/`
- <https://microservices.io/patterns/data/shared-database.html>
- OpenAlex API (`api.openalex.org/works?search=connascence software`) — 16 results, 2026-08-28.
- Semantic Scholar API — Kirbas 2017 abstract; D'Ambros 2009 record (abstract elided).

Secondary (reader notes, summaries, journalism) — every claim taken from these is flagged inline:

- <https://bagerbach.com/books/fundamentals-of-software-architecture/>
- <https://github.com/pkardas/notes/blob/master/books/fundamentals-of-architecture.md>
- <https://danlebrero.com/2022/03/30/software-architecture-the-hard-parts-book-summary/>
- <https://danlebrero.com/2023/01/24/building-microservices-second-edition-designing-fine-grained-systems-summary/>
- <https://newsletter.techworld-with-milan.com/p/what-i-learned-from-the-software>
- <https://iam.slys.dev/p/architecture-quantum> — single-source claims flagged in §2.3.
- <https://chariotsolutions.com/screencast/ete-2012-jim-weirich-connascence-examined/>
- <https://thoughtbot.com/blog/connascence-as-a-vocabulary-to-discuss-coupling>
- <https://www.infoq.com/news/2018/07/segment-microservices/>
- <https://thenewstack.io/amazon-prime-videos-microservices-move-doesnt-lead-to-a-monolith-after-all/>
- <https://neverworkintheory.org/2011/07/07/the-confounding-effect-of-class-size-on-the-validity-of-object-oriented-metrics.html>
- <https://www.techtarget.com/searchapparchitecture/tip/Can-you-really-use-a-shared-database-for-microservices>
- <https://www.cockroachlabs.com/blog/aurora-postgres-to-cockroachdb/> — vendor source, discounted in §5.3.

Fetched and returned HTTP 403 (recorded so the validator does not repeat the attempt): `oreilly.com`
book and chapter pages; `dl.acm.org` PDF; `ieeexplore.ieee.org`; `onlinelibrary.wiley.com`;
`papers.ssrn.com`; `inf.usi.ch` PDF; `concurrentflows.com`; `careersatdoordash.com`;
`docs.enterprise.codescene.io/latest/…`.
