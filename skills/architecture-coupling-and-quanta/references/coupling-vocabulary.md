# Coupling vocabulary

The distinctions that make "this is coupled" a checkable claim rather than a mood. Read this before
the first argument about the word; read `measuring-the-unit.md` before promising anyone a number.

**Sourcing note that governs the whole file.** None of the books discussed here was readable
while this skill was written. Every book wording below reaches it through reader notes, blog
summaries or publisher page titles, and is marked as such. Chapter numbers and titles come from
publisher page titles and are the sturdiest part. **No page numbers appear anywhere, because none
were available; a page number in this suite's architecture skills would be invented.**

## 1. Connascence — Page-Jones

Meilir Page-Jones, "Comparing techniques by means of encapsulation and connascence",
_Communications of the ACM_ 35(9), September 1992 (DOI `10.1145/130994.131004`), expanded in _What
Every Programmer Should Know About Object-Oriented Design_ (Dorset House, 1996). The bibliographic
record is verified; the paper itself was not readable.

Two components are connascent when a change in one would require a change in the other to keep the
system correct. That is the same test as Ford's coupling definition in `SKILL.md`, nearly thirty
years earlier — which is the point: the architecture-scale vocabulary in §2 is reported to be a re-basing
of this one, not an independent invention.

**The taxonomy**, as listed by connascence.io (a community-maintained reference site, not an authored
primary source; it attributes the term to the 1992 article and the expansion to the 1996 book):

| Kind        | Forms                                                        |
| ----------- | ------------------------------------------------------------ |
| **Static**  | Name, Type, Meaning (a.k.a. Convention), Position, Algorithm |
| **Dynamic** | Execution (order), Timing, Value, Identity                   |

Static forms are visible by reading the code; dynamic forms only manifest while it runs.

**The three properties**, quoted from connascence.io — itself paraphrasing Page-Jones:

- **Strength** — _"Stronger connascences are harder to discover, or harder to refactor."_
- **Degree** — _"An entity that is connascent with thousands of other entities is likely to be a
  larger issue than one that is connascent with only a few."_
- **Locality** — _"Connascent elements that are close together in a codebase are better than ones that
  are far apart."_

**The two operative rules**, attributed to Page-Jones and repeated across practitioner writing
(secondary sourcing throughout):

1. Minimise overall connascence by breaking the system into encapsulated elements.
2. Minimise the connascence that remains **across** encapsulation boundaries — as locality decreases,
   only weaker forms should be tolerated.

Rule 2 is the one that transfers to a distributed system, and it is the only part of the apparatus
this skill uses. Applied across a process boundary it reads: connascence of **name** across a wire is
ordinary (a field is called `orderId` on both sides). Connascence of **meaning** across a wire — both
sides know that status `3` means partially refunded, and neither document says so — is a finding.
Connascence of **algorithm** across a wire — two services independently computing the same tax rule
and expected to agree — is a stronger finding, and the one that survives every refactor of either
side. Connascence of **timing** or **execution order** across a wire is the reason "we made it
asynchronous" so often fails to buy what the team expected.

**The strength ordering, and how far to trust it.** The commonly published order, weakest to
strongest, is Name → Type → Meaning → Position → Algorithm → Execution → Timing → Value → Identity:
every static form ranked below every dynamic one. Treat the coarse split as the usable part and the
fine ranking as a teaching device. Wikipedia hedges it in its own text ("typically considered
weaker", "a natural hierarchy of strength"). Jim Weirich, in the talk practitioners cite
(_Connascence Examined_, Emerging Technologies for the Enterprise, Philadelphia, 2012), is reported
in the conference writeup as feeling the forms make a hierarchy while declining to assign a precise
ordering — a characterisation of the writeup, not of the talk, which was not watched. **Whether
Page-Jones himself claimed a total or a partial order could not be resolved**; both readings
circulate. The safe formulation, and the one this skill uses: the ordering is published as a
heuristic and its advocates hedge it.

**It cannot be automated.** See `measuring-the-unit.md` §4. Connascence is a review vocabulary. Its
value is that it lets two people locate a disagreement in one word instead of an afternoon.

## 2. Static and dynamic coupling — _The Hard Parts_

Neal Ford, Mark Richards, Pramod Sadalage and Zhamak Dehghani, _Software Architecture: The Hard
Parts_ (O'Reilly, 2021, ISBN 9781492086888). Ch. 2 is "Discerning Coupling in Software Architecture",
confirmed from the publisher's page title. One edition as of this writing.

**Paraphrased, deliberately not quoted** — this is the weakest-sourced wording in the whole research
behind this skill, available only through search snippets and summaries:

- **Static coupling** is how the parts are wired together: dependencies, connection points, the degree
  of coupling between them. It is generally visible at build or compile time and, at quantum scale,
  it includes everything the part needs in order to boot and be correct. **This states the scope of
  the term, not the test for an edge** — for that, see `SKILL.md` step 2 and the leg's definition
  above it.
- **Dynamic coupling** is how the parts call one another at runtime: the kind of communication, what
  is passed, how strict the contract is.

The authors are reported to credit Page-Jones' static/dynamic connascence split as the origin of the
distinction.

**Two garblings to refuse.** They are common in secondary writing and each destroys the concept:

1. _"Static coupling means compile-time dependency between classes."_ Wrong scope. At quantum scale
   static coupling includes **the database, the runtime, the operating system and shared
   infrastructure** — anything the service must have to start and be correct. This is exactly why a
   shared database is a static-coupling fact rather than a runtime one, and why the fix for it is
   never "make the call asynchronous". **Scope again, not the test:** a broker or cluster every part
   uses identically is inside this category and is still not an edge, because its change obligation
   runs to nobody. `SKILL.md` step 2 decides that; this sentence does not.
2. _"Dynamic coupling means coupling that changes at runtime."_ Wrong sense. It is coupling
   _expressed_ at runtime: the call itself.

**The three dimensions of dynamic coupling** reported for the same chapter — **communication**
(synchronous or asynchronous), **consistency** (atomic or eventual) and **coordination** (orchestrated
or choreographed) — form the matrix the rest of that book indexes its patterns against. This skill
uses only the first: whether the caller can complete its own work without the callee's answer. The
other two lead into distribution and transaction decisions that `distribution-boundaries` owns.

**A separate axis, easy to conflate.** In the InfoQ _Hard Parts_ podcast Ford also distinguishes
**semantic** coupling from **implementation** coupling. That is orthogonal to static/dynamic: semantic
coupling is what the domain forces two parts to share, and it does not go away by re-plumbing. Do not
let a conversation slide between the two axes without saying so.

## 3. The architecture quantum, and the fact that its definition moved

| Book                                                                | Year       | Reported definition                                                                                                                                                         |
| ------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Building Evolutionary Architectures_, 1st ed. (Ford, Parsons, Kua) | 2017       | an independently deployable **component** with high functional cohesion                                                                                                     |
| _Fundamentals of Software Architecture_, 1st ed. (Richards, Ford)   | 2020       | an independently deployable **artifact** with high functional cohesion **and synchronous connascence** (ch. 7)                                                              |
| _The Hard Parts_ (Ford, Richards, Sadalage, Dehghani)               | 2021       | independently deployable artifact**s** with high functional cohesion, **high static coupling** and **synchronous dynamic coupling** (ch. 2)                                 |
| _Building Evolutionary Architectures_, 2nd ed.                      | 2022       | same structure as _The Hard Parts_ — its section headings are Independently Deployable, High Functional Cohesion, High Static Coupling, Dynamic Quantum Coupling, Contracts |
| _Fundamentals of Software Architecture_, 2nd ed.                    | March 2025 | **unverified — see below**                                                                                                                                                  |

**Which sourcing carries which row.** The 2020 wording is the best supported: two independent reader-
note sets render it identically. The 2021 wording is quoted identically by two independent summaries
and the publisher's own page snippet. The 2017 wording rests on a single secondary blog with two
weaker corroborations. The 2022
row is section headings visible in publisher search results, not body text.

**Attribution discipline, which this skill treats as a blocker.** If you quote "high static coupling
and synchronous dynamic coupling" and attribute it to _Fundamentals_, you are wrong: the
connascence-flavoured wording is _Fundamentals_' and the coupling-flavoured wording is _The Hard
Parts_' and _BEA_ 2nd ed.'s. Say which book, and say which edition.

**_Fundamentals_ 2nd edition.** Published March 2025 (Richards dates it March 2025; his lesson page is
dated 3 March 2025). Ford describes it on his own site as having turned from a minor update
into effectively a rewrite, and the publisher blurb announces five new chapters. Chapter numbers and titles for
the two chapters that matter here are confirmed from publisher page titles: ch. 3 "Modularity" and
ch. 7 "The Scope of Architectural Characteristics" (the 1st ed. titled that one "Scope of Architecture
Characteristics"). **Whether the text of either chapter changed — in particular whether the quantum
definition was restated in the _Hard Parts_ form — is unverified.** Do not write "unchanged in the
2nd edition"; nobody checked.

## 4. Quantum, deployment unit, service, component — four words, four meanings

- A **deployment unit** is whatever a pipeline ships. It is an observation about your CI system. A
  **published library is not one**: it is a unit of release, and it enters the map as a static edge
  between its consumers rather than as a node in either count. Counting it inflates the gap.
- A **quantum** is a maximal region closed under static coupling _and_ synchronous dynamic coupling —
  the static leg because nothing in the region can boot or stay correct without the rest of it at a
  version it must track, the synchronous leg because a caller that cannot complete without its callee
  shares that callee's availability and load. It is a derived quantity, and deriving it is this
  skill's method.
- A **service** is an organisational and runtime label. It implies nothing about either of the above.
- A **component** in the Martin sense is the unit of release, and `component-and-release-boundaries`
  owns it, along with abstractness, the main sequence and shared-jar versioning.

The concept only pays where these numbers differ. Three services on one schema are three deployment
units and one quantum. A monolith on one pipeline is one quantum trivially, and saying so adds
nothing. Wherever no edge survives either leg — each service owning its own data is the common case,
not the whole condition — the two counts coincide exactly and the word is redundant. That is the
"against" case in `SKILL.md`'s honest standing, and is this skill's own reasoning rather than
anyone's published position.

**Does asynchronous communication create a quantum boundary?** Only if the static coupling is severed
too. Async removes the synchronous-dynamic leg of the definition, so two services that talk purely by
events _can_ be separate quanta — but a shared database, a shared domain library, or an event schema
with no compatibility policy holds them in one quantum regardless. The claim that a schema registry
with an enforced compatibility mode changes that verdict is plausible, widely repeated, and could not
be traced to any of the books; treat it as a practitioner position.
