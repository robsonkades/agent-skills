# Taxonomy, ISO 25010, and What the Critiques Reach

Read this when someone cites "the book's three categories", when a quality model is offered as the
driving list, or when a compliance requirement names ISO/IEC 25010. It exists because three different
vocabularies are routinely merged into one imaginary super-list, and because the two ISO versions in
circulation disagree with each other in ways that change what a requirement means.

## The 2020 taxonomy — what a reader will meet elsewhere

`[notes — _Fundamentals_ 1st ed. ch. 4; the book text returned 403 to every fetch, so this is
reconstructed from three independent note sets that list identical members]`

**Operational (runtime)**

| Characteristic       | The authors' gloss                                     |
| -------------------- | ------------------------------------------------------ |
| Availability         | how long the system needs to be continuously available |
| Continuity           | disaster recovery capability                           |
| Performance          | response times, capacity, peak and stress behaviour    |
| Recoverability       | business-continuity time to restore after failure      |
| Reliability / Safety | fail-safe or mission-critical, and the cost of failure |
| Robustness           | handling of error and boundary conditions              |
| Scalability          | behaviour as user or request count increases           |

**Structural (code)** — configurability, extensibility, installability, leverageability/reuse,
localization, maintainability, portability, supportability, upgradeability.

**Cross-cutting (fits neither box)** — accessibility, archivability, authentication, authorization,
legal, privacy, security, usability/achievability.

### Three drifts worth naming

- **The ch. 4 tables do not contain**: observability, deployability, testability, agility, elasticity,
  concurrency, data integrity, data consistency, feasibility, interoperability, adaptability,
  workflow, abstraction, responsiveness. Several of those appear **elsewhere in the same book** —
  elasticity and interoperability in ch. 5's worked examples; testability, deployability and agility
  in the composite discussion and ch. 6 — but they are not in the three tables. Practitioner posts
  routinely present a merged super-list as "the book's taxonomy". It is not.
- **Richards' own current tool abandoned the split.** `[PRIMARY]` The _Architecture Characteristics
  Worksheet_ (revised **March 2024**) drops operational/structural/cross-cutting entirely for one flat
  list of "Common Architecture Characteristics": performance, responsiveness, availability, fault
  tolerance, scalability, elasticity, data integrity, data consistency, adaptability, extensibility,
  interoperability, concurrency, deployability, testability, abstraction, workflow, configurability,
  recoverability — plus a separate box of four **implicit** ones (feasibility (cost/time), security,
  maintainability, observability) and a **Composite** box.
- **The 2nd edition's position is unknown.** `[2nd-ed status unverified]` The 2nd ed. (March 2025)
  retains a chapter titled "Architecture Characteristics Defined" at ch. 4 and "Identifying
  Architectural Characteristics" at ch. 5, and still lists a chapter on the scope of architectural
  characteristics. Whether the three-part test was reworded, whether the ch. 4 tables gained members,
  whether the ≤7/top-3 numbers changed, and whether the quantum definition moved to the _Hard Parts_
  wording are **all unverified**. Ford's own page for the 2nd ed. mentions changes to the star ratings
  "to add sections and a few new categories", which is about architecture-style ratings and does not
  settle the ch. 4 question. Do not claim either way.

**How to use this in practice:** work from the 2024 worksheet, and recognise the three-way split when
a colleague cites it, because it is what most secondary writing still teaches. The authors themselves
never claimed the split was ontologically true — "cross-cutting" is explicitly the bucket for things
that fit neither of the other two, and they say the categories overlap. It is an elicitation prompt
made searchable, not a classification.

## ISO/IEC 25010 — the two versions are materially different

**Say which version you mean, every time.** A requirement that cites "ISO 25010 portability" means
something that does not exist under that name in the current version.

**2011** — eight product-quality characteristics: Functional Suitability, Performance Efficiency,
Compatibility, **Usability**, Reliability, Security, Maintainability, **Portability**.

**2023** — nine. The changes, as reported by arc42 quoting ISO's own abstract (`iso.org` returned 403
to every fetch, so the standard text was never read for this skill):

- **Safety added** as a ninth top-level characteristic.
- **Usability → Interaction Capability**; **Portability → Flexibility**.
- New sub-characteristics: inclusivity and self-descriptiveness under Interaction Capability;
  resistance under Security; **scalability under Flexibility**.
- User interface aesthetics → user engagement; maturity → faultlessness; accessibility split into
  inclusivity and user assistance.
- Scope extended beyond software to ICT products and information systems generally.

The 2023 model as listed by arc42:

| #   | Characteristic         | Sub-characteristics                                                                                                                                    |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Functional Suitability | completeness, appropriateness, correctness                                                                                                             |
| 2   | Performance Efficiency | time behaviour, capacity, resource utilisation                                                                                                         |
| 3   | Compatibility          | co-existence, interoperability                                                                                                                         |
| 4   | Interaction Capability | appropriateness recognisability, learnability, operability, user error protection, user engagement, inclusivity, user assistance, self-descriptiveness |
| 5   | Reliability            | faultlessness, fault tolerance, availability, recoverability                                                                                           |
| 6   | Security               | confidentiality, integrity, non-repudiation, accountability, authenticity, resistance                                                                  |
| 7   | Maintainability        | modularity, reusability, analysability, modifiability, testability                                                                                     |
| 8   | Flexibility            | adaptability, scalability, installability, replaceability                                                                                              |
| 9   | Safety                 | operational constraint, risk identification, fail safe, hazard warning, safe integration                                                               |

**One conflict left unresolved, deliberately.** On two separate fetches the arc42 page rendered
**testability under Flexibility**, not Maintainability. Independent secondary sources place it under
Maintainability, which is also its 2011 home, and that is where the table above puts it — but the
standard text is paywalled and was never read. **No clause number is cited anywhere in this skill, for
this or anything else.** If the placement matters to your compliance argument, buy the standard; do
not resolve it from this file.

## Where the two vocabularies line up, and where they do not

| Richards & Ford term    | 25010:2023 location                     | Fit                                                                                           |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Availability            | Reliability → availability              | clean                                                                                         |
| Fault tolerance         | Reliability → fault tolerance           | clean                                                                                         |
| Recoverability          | Reliability → recoverability            | clean                                                                                         |
| Performance             | Performance Efficiency → time behaviour | clean                                                                                         |
| Interoperability        | Compatibility → interoperability        | clean                                                                                         |
| Maintainability         | Maintainability                         | clean                                                                                         |
| Security                | Security (top-level, six subs)          | ISO is finer-grained; their authentication and authorization are separate entries in the book |
| Scalability             | Flexibility → scalability               | **new in 2023**; absent by name from 2011, so "ISO says scalability" must cite 2023           |
| Portability             | renamed **Flexibility**                 | name-collision hazard                                                                         |
| Usability               | renamed **Interaction Capability**      | name-collision hazard                                                                         |
| Reliability             | Reliability (top-level with four subs)  | **structural mismatch** — see below                                                           |
| Elasticity              | —                                       | no ISO equivalent; ISO's scalability does not separate burst semantics                        |
| Deployability           | —                                       | not in ISO at any level                                                                       |
| Agility                 | —                                       | not in ISO, and one of its three primitives is not either                                     |
| Observability           | —                                       | not in ISO                                                                                    |
| Feasibility (cost/time) | —                                       | not in ISO; a project constraint, not a quality                                               |
| Data consistency        | partially Security → integrity          | poor fit; ISO's integrity is a security property, not cross-store agreement                   |
| Legal, archivability    | —                                       | not 25010 characteristics                                                                     |

**The most useful single insight: the two vocabularies disagree about reliability.** Richards treats
it as a **composite that decomposes into** availability, testability, data integrity, data consistency
and fault tolerance. ISO treats Reliability as a **top-level parent** of faultlessness, fault
tolerance, availability and recoverability. They agree it is not primitive; they disagree about what
it contains, and about direction of use — ISO's tree evaluates a finished product, Richards'
decomposition makes a composite measurable during design.

**Do not substitute 25010 for the driving-characteristics exercise.** ISO's own framing is a product
quality model used with the SQuaRE evaluation series: a completeness checklist, not a prioritisation
method. Its tree is exhaustive by construction, and exhaustiveness is precisely the failure mode the
cap exists to prevent. The two artefacts answer different questions and are constantly conflated.

## The critiques, and what each actually reaches

**Gernot Starke (INNOQ / arc42), February 2023, on ISO 25010's shortcomings.** The standard
taxonomies "lack pragmatism", have "overly many terms with a lot of overlap", and their strict
hierarchical tree **cannot represent qualities that belong in more than one place** — his examples:
testability fits both reliability and maintainability; availability belongs under both reliability and
usability. He also attacks the terminology directly (changeability versus adaptability; functional
suitability versus functional adequacy). His prescription: use 25010 "as a checklist for specific
quality requirements", not as architecture guidance.

**Martin Glinz, RE'07, "On Non-Functional Requirements."** Three structural problems with existing NFR
definitions: a **definition problem** (terminology inconsistent across definitions), a
**classification problem** (the definitions produce very different sub-classifications), and a
**representation problem** (whether something counts as an NFR depends on how it is represented).
`[The primary paper could not be fetched; this three-problem summary is taken from Eckhardt, Vogelsang
& Méndez Fernández's literature review, which was read directly.]`

**Eckhardt, Vogelsang & Méndez Fernández, ICSE 2016 — the empirical attack on the split itself.** They
classified **530 NFRs from 11 industrial requirements specifications across 5 companies** and found
**74.7% describe system behaviour** (black-box or glass-box), only 25.3% describe representation.
Their conclusion: most "non-functional" requirements "are misleadingly declared as such because they
actually describe behavior of the system", and can therefore be handled with the same machinery as
functional requirements. Their distribution, aggregated to ISO 9126 classes: Functionality 27.2%,
Security 19.6%, Reliability 16.2%, Usability 12.8%, Efficiency 10.9%, Portability 8.7%,
Maintainability 4.5% — and it is **domain-dependent**, with embedded systems at 54% Reliability. That
last point is the strongest empirical support for the ch. 5 claim that characteristics come from the
domain.

**What these do and do not reach.** Starke and Glinz attack **ISO-style hierarchical taxonomies**.
Richards and Ford's list is a flat elicitation prompt with an explicit "doesn't fit" escape hatch, and
their own current tool has dropped the hierarchy altogether. Presenting the -ility critique as though
it demolished the Richards & Ford approach is a misattribution. Eckhardt et al. reach further — they
question the FR/NFR split itself, and by extension any taxonomy premised on it — but their remedy is
"treat behavioural NFRs like functional requirements", which is a specification argument, not an
argument against having a short list of design drivers.
