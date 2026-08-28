# architecture-decision-making v2 — research brief

Research only. No recommendations, no edits under `skills/`. Every claim below is either sourced
with a URL and an access date, or explicitly marked as unverified.

**All web sources accessed 2026-08-28** unless a different date is given. **All tool
verification performed 2026-08-28** via the GitHub REST API (`gh api`) and the projects' own
raw files, not via search-engine summaries.

The subject after the rework: **the architecture decision as a durable record** — what is worth
recording, how it is written so it can be re-opened on evidence, the status lifecycle, and how a
refusal is recorded. Not the analysis method (that is `architecture-trade-off-analysis`), not the
derivation of the characteristic list (that is `architecture-characteristics`).

---

## 1. Summary — the claims the reworked skill can rest on

| #   | Claim                                                                                                                                                                                                               | Source                                                               | Confidence                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| C1  | Nygard's original template is five parts — Title, Status, Context, Decision, Consequences — and the widely-copied "What becomes easier or more difficult…" phrasing is **not his**; it is Joel Parker Henderson's   | Cognitect 2011 post + the JPH template file, both read verbatim      | **High.** Both texts read in full; the divergence is literal   |
| C2  | The status lifecycle Nygard actually wrote is proposed / accepted / deprecated / superseded. **"Rejected" is a later accretion**, added by MADR, AWS and the JPH rendering                                          | Nygard post; MADR 4.0.0 template; AWS Prescriptive Guidance          | **High.** Primary texts compared side by side                  |
| C3  | Immutability-after-accept is the majority institutional position (Nygard, Fowler 2026, Microsoft WAF 2026, AWS) but MADR's own template carries a `date … when the decision was last updated` field                 | Four primary texts, quoted in §4.1                                   | **High** for the positions; the conflict is in the artefacts   |
| C4  | Reversibility as the thing that sets proportionate rigour has **two separate provenances that must not be blended**: Fowler/Zaninotto (irreversibility, 2003) and Bezos (one-way/two-way doors, 2015)               | IEEE Software PDF read page by page; 2015 Amazon letter read in full | **High.** Both read verbatim from the primary PDFs             |
| C5  | The three decision anti-patterns are Richards and Ford's, but **"Groundhog Day" pre-dates them** (Peter Cripps, 2010) with a near-identical definition                                                              | Richards' own lesson page; Cripps' 2010 post; two book note sets     | **High** on existence and wording; **Medium** on book verbatim |
| C6  | ADR abandonment is measured, not folklore: ~50% of GitHub repos with ADRs hold 1–5 records                                                                                                                          | Buchgeher et al., IEEE Access 2023                                   | **High** on the number; reached via abstract, not full text    |
| C7  | **No study shows that recording decisions improves any system outcome.** The closest evidence is two rationale experiments — one positive on decision-making effectiveness, one positive on only one of two systems | Falessi et al. 2006; Bratthall et al. 2000 (§3.1)                    | **High** that no outcome study was found in six searches       |
| C8  | Decision-record governance is implementable today, but the ecosystem is thinner than its reputation: `adr-tools` has had no release since 2018, `log4brains` none since 2024                                        | GitHub API, verified 2026-08-28 — full table in §6                   | **High.** Machine-read, dates in §6                            |

---

## 2. Definitions and templates — verbatim, with attribution

### 2.1 Nygard, "Documenting Architecture Decisions" (2011)

Michael Nygard, 15 November 2011, published on the Relevance/Cognitect blog.
<https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>

Provenance note: the URL most citations use — `thinkrelevance.com/blog/2011/11/15/...` — **still
resolves**, via a 301 to `thinkrelevance.com` (https) and then to `cognitect.com`. Verified with
`curl -L` on 2026-08-28. Do not describe it as dead.

Nygard's own wording for the five parts (quoted from the post):

| Part             | Nygard's words                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Title**        | "short noun phrases" — his example is "ADR 1: Deployment on Ruby on Rails 3.0.10"                                                                                                                                                                            |
| **Context**      | "describes the forces at play, including technological, political, social, and project local"; the language is "value-neutral"                                                                                                                               |
| **Decision**     | "describes our response to these forces. It is stated in full sentences, with active voice. 'We will …'"                                                                                                                                                     |
| **Status**       | "A decision may be 'proposed' if the project stakeholders haven't agreed with it yet, or 'accepted' once it is agreed. If a later ADR changes or reverses a decision, it may be marked as 'deprecated' or 'superseded' with a reference to its replacement." |
| **Consequences** | "describes the resulting context, after applying the decision. All consequences should be listed here, not just the 'positive' ones."                                                                                                                        |

Also his, verbatim:

- On numbering: ADRs are "numbered sequentially and monotonically. Numbers will not be reused."
- On superseding: "If a decision is reversed, we will keep the old one around, but mark it as
  superseded. (It's still relevant to know that it _was_ the decision, but is _no longer_ the
  decision.)"
- On length and voice: documents should be "one or two pages long", written "as if it is a
  conversation with a future developer", with "good writing style, with full sentences organized
  into paragraphs."
- On scope: "a collection of records for 'architecturally significant' decisions: those that
  affect the structure, non-functional characteristics, dependencies, interfaces, or construction
  techniques."

**The most important negative finding in this section.** Michael Nygard **never wrote** the
sentences that are most often attributed to him. The widely-copied phrasing —

> "## Context — What is the issue that we're seeing that is motivating this decision or change?"
> "## Decision — What is the change that we're proposing and/or doing?"
> "## Consequences — What becomes easier or more difficult to do because of this change?"

— is from Joel Parker Henderson's `decision-record-template-by-michael-nygard/index.md`, read
verbatim on 2026-08-28 at
<https://raw.githubusercontent.com/joelparkerhenderson/architecture-decision-record/main/locales/en/templates/decision-record-template-by-michael-nygard/index.md>.
That file also renders Status as "What is the status, such as proposed, accepted, rejected,
deprecated, superseded, etc.?" — **"rejected" is JPH's, not Nygard's.** A rework that quotes the
"what becomes easier or more difficult" line and credits Nygard would repeat the suite's most
common ADR misattribution.

### 2.2 MADR 4.0.0

Repository <https://github.com/adr/madr>. Release **4.0.0, published 2024-09-17**; last commit on
`develop` **2026-08-28** (the repo is live). Full release history verified via GitHub API:
4.0.0 (2024-09-17), 4.0.0-beta (2024-09-02), 3.0.0 (2022-10-09), 2.1.2 (2019-02-17).

Template read verbatim from
<https://raw.githubusercontent.com/adr/madr/develop/template/adr-template.md>. Fields:

- YAML frontmatter, all optional: `status` (`"{proposed | rejected | accepted | deprecated | … |
superseded by ADR-0123}"`), `date` ("{YYYY-MM-DD when the decision was last updated}"),
  `decision-makers`, `consulted`, `informed` — the last three being a RACI-shaped split
  ("two-way communication" vs "one-way communication").
- Body: **Context and Problem Statement** · _Decision Drivers_ (optional) · **Considered Options**
  · **Decision Outcome** · _Consequences_ (optional, "Good, because …" / "Bad, because …") ·
  _Confirmation_ (optional) · _Pros and Cons of the Options_ (optional) · _More Information_
  (optional).
- The **minimal** template keeps only Context and Problem Statement, Considered Options, Decision
  Outcome, and optional Consequences.

**The Confirmation element is the single most useful field in any of these templates for this
suite**, because it is a fitness-function hook written into the template itself:

> "{Describe how the implementation / compliance of the ADR can/will be confirmed. Is there any
> automated or manual fitness function? If so, list it and explain how it is applied. … E.g., a
> design/code review or a test with a library such as ArchUnit can help validate this. Note that
> although we classify this element as optional, it is included in many ADRs.}"

Cost of the addition: seven more sections than Nygard, of which six are optional — so the format
cost is opt-in, but the "Pros and Cons of the Options" section is a per-option analysis whose
upkeep is real. Zimmermann, a MADR co-author, says so himself (§4.3).

MADR's own scope position, verbatim from its docs
(<https://raw.githubusercontent.com/adr/madr/develop/docs/index.md>): "Do not take the term
'architecture' too seriously or interpret it too strongly. … any decisions that might have an
impact on the architecture somehow are architectural decisions." And: "Since we believe that any
(important) decision should be captured in a structured way, we offer the MADR template to capture
any decision." Between 2022-05 and 2024-09 the acronym officially stood for "Markdown **Any**
Decision Records"; 4.0.0-beta reverted it to "Architectural". This is a live disagreement inside
the format's own history — see §4.2.

### 2.3 Y-statements (Zdun, Capilla, Tran, Zimmermann, 2013)

"Sustainable Architectural Design Decisions", U. Zdun, R. Capilla, H. Tran, O. Zimmermann,
_IEEE Software_ 30(6), pp. 46–53, DOI 10.1109/MS.2013.97. Note the author list: **Pautasso is not
an author** of this paper. Template, quoted from the InfoQ article derived from it
(<https://www.infoq.com/articles/sustainable-architectural-design-decisions/>):

> "In the context of `<use case/user story u>`, facing `<concern c>` we decided for `<option o>`
> to achieve `<quality q>`, accepting `<downside d>`."

What it adds: a single sentence that forces the downside into the same breath as the decision.
What it costs: no status, no alternatives, no consequences over time — it cannot be superseded as
a record because it carries no lifecycle. It is a capture format, not an archive format.

Zimmermann's stated reason for inventing it, from his own blog
(<https://ozimmer.ch/practices/2020/04/27/ArchitectureDecisionMaking.html>, published 2020-04-27,
updated 2026-03-23): the "maintenance effort of filled out, full-fledged decision records … became
rather high". _Reached through the page's own text via WebFetch; treat the inner phrase as
verified-on-that-page rather than as a book quotation._

The paper's five sustainability criteria for a decision — strategic, measurable and manageable,
achievable and realistic, rooted in requirements, timeless — are reported by InfoQ as the authors'.
_Paraphrase; the paper itself was not reached._

### 2.4 arc42

<https://docs.arc42.org/section-9/> and <https://docs.arc42.org/tips/9-5/>. Section 9 is
"Architecture Decisions". arc42's position is a routing rule rather than a template: use judgment
about whether a decision belongs in the central section 9 or locally in a building block's white
box; ADRs may be a list/table ordered by importance and consequences, or separate sections per
decision. arc42 then **defers to Nygard's format** (Tip 9-5, "Document decisions as Architecture
Decision Record (ADR)!"). What it adds over Nygard: placement guidance inside a wider document.
What it costs: it presumes the wider arc42 document exists.

### 2.5 Joel Parker Henderson collection

<https://github.com/joelparkerhenderson/architecture-decision-record>. A collection of templates
(Nygard's, MADR, Tyree/Akerman, business-case, planning, "alexandrian"), examples, and file-naming
conventions — MADR's own docs link to it for directory conventions and warn: "As a consequence,
some existing tooling might not be applicable." What it adds: breadth and worked examples. What it
costs: **it is the primary vector of the Nygard misattribution in C1**, and it is a menu, not a
method — it does not tell you which to pick.

### 2.6 Richards and Ford's additions

_Fundamentals of Software Architecture_ 1st ed. (2020), **ch. 19 "Architecture Decisions"**. Two
independent note sets agree that the authors add two sections to Nygard's five:

- **Compliance** — how the decision will be verified.
- **Notes** — metadata: author, approval date, etc.

Sources: <https://raw.githubusercontent.com/pkardas/notes/master/books/fundamentals-of-architecture.md>
and <https://danlebrero.com/2021/11/17/fundamentals-of-software-architecture-summary/>. **Both are
third-party note sets, not the book text.** Flag accordingly; the suite has an established
convention of citing "agreeing note sets".

The same note sets record two more of the authors' positions:

- Architecturally significant decisions are those affecting **structure, nonfunctional
  characteristics, dependencies, interfaces, construction techniques** — a list AWS reproduces and
  explicitly credits to "Richards and Ford 2020".
- The authors **"recommend storing ADRs in a wiki rather than Git"** (pkardas). This directly
  contradicts Fowler and the whole `doc/adr`-in-repo tradition. See §4.4.

### 2.7 Edition discipline — the 2nd edition

_Fundamentals of Software Architecture_ **2nd edition, March 2025**. The chapter is renumbered:
**ch. 21, "Architectural Decisions"** (1st ed. ch. 19). O'Reilly's own catalogue pages for the 2nd
edition returned HTTP 403 to direct fetch; the chapter number and its subsection list — "The
Covering Your Assets Antipattern", "Groundhog Day Antipattern", "Email-Driven Architecture
Antipattern", "Architectural Significance", "Architectural Decision Records" (with Basic
Structure, Example, Storing ADRs, ADRs as Documentation, Using ADRs for Standards, Using ADRs with
Existing Systems), and a new "Leveraging Generative AI and LLMs in Architectural Decisions" — were
recovered **through a search-engine reading of the O'Reilly TOC, not through the book or the
publisher page directly**. Treat as **unverified**: the three anti-patterns appear to survive and a
generative-AI section appears to be new, but nothing should rest on it.

Richards announced the 2nd edition in Developer to Architect Lesson 205, **3 March 2025**
(<https://developertoarchitect.com/lessons/lesson205.html>); the page announces the lesson but does
not enumerate the changes. Negotiation moves from ch. 23 (1st ed.) to **ch. 25** (2nd ed.) —
same unverified TOC route.

**The suite's standing rule applies: cite "1st ed., ch. 19" and mark the 2nd edition unverified.**

---

## 3. The evidence base — measured, asserted, contradicted

### 3.1 Measured

| Finding                                                                                                                                                                                                                                     | Study                                                                                                                                                                                                                       | Caveat                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ADR adoption in OSS "is still low"; the number of repos using ADRs grows year on year; **about 50% of repositories that use ADRs have just one to five ADRs**; systematic use correlates with "two or more users over a longer period"      | Buchgeher, Schöberl, Geist, Dorninger, Haindl, Weinreich, "Using Architecture Decision Records in Open Source Projects — An MSR Study on GitHub", _IEEE Access_ 11 (2023), pp. 63725–63740, DOI 10.1109/ACCESS.2023.3287654 | Reached via the JKU project page and the IEEE listing; **full text not read**. Nygard's template reported as predominant.        |
| Rationale documentation improves **effectiveness** of individual and team decision-making under requirement change; **efficiency unchanged**                                                                                                | Falessi, Cantone, Becker, ISESE/ESEM 2006, DOI 10.1145/1159733.1159755. 50 postgraduate students                                                                                                                            | Students; a rationale technique, not ADRs                                                                                        |
| Access to a retrospective design rationale gave "a significant improvement in correctness and speed" — **for one of the two systems studied, not both**                                                                                     | Bratthall, Johansson, Regnell, "Is a Design Rationale Vital when Predicting Change Impact?", PROFES 2000, LNCS, DOI 10.1007/978-3-540-45051-1_14. 17 subjects, industry + academia                                          | Small N; **the split result is the finding**, and it is the honest one to carry                                                  |
| Nygard's template beat MADR on an "Overall Score" in a controlled experiment (n = 33 undergraduates; Wilcoxon W = 84.0, p = 0.002; Cliff's delta 0.6364, large) — **after** expert screening had scored MADR higher (0.900 vs Nygard 0.868) | Nogueira, Silva, Conte, "One Size Fits All? An Empirical Comparison of ADR Templates…", arXiv:2604.27333, submitted 2026-04-30. <https://arxiv.org/abs/2604.27333>                                                          | Undergraduates; the authors name this as their external-validity threat. **The expert/novice reversal is the interesting part.** |
| Introducing ADRs in a microservice company addressed challenges of documentation culture, knowledge transfer and prioritisation; challenges specific to **distributed** systems remained open                                               | Ahmeti, Linder, Groner, Wohlrab, "Architecture Decision Records in Practice: An Action Research Study", ECSA 2024, DOI 10.1007/978-3-031-70797-1_22. 7 interviews, 3 months                                                 | Single company, three months, action research — no control                                                                       |

### 3.2 Asserted, not measured

- That capping, templating, or any particular field set improves anything. No evidence found.
- That immutability preserves value better than editing in place. Universally asserted (§4.1),
  never tested.
- Zimmermann's ceiling: "Do not document everything; an AD log with more than 100 entries will
  probably put you readers (and you) to sleep, and be really hard to maintain."
  (<https://ozimmer.ch/practices/2020/04/27/ArchitectureDecisionMaking.html>). A practitioner's
  number with no study behind it, but it is a **named, dated, falsifiable** number, which is more
  than the rest of the folklore offers.
- Spotify's trigger, from Josef Blake, 14 April 2020: "An ADR should be written whenever a
  decision of significant impact is made; it is up to each team to align on what defines a
  significant impact."
  (<https://engineering.atspotify.com/2020/04/when-should-i-write-an-architecture-decision-record/>).
  Note what this concedes: the significance test is delegated, not defined.

### 3.3 The honest standing sentence

**No study was found showing that recording an architecture decision improves any system outcome
— defect rate, change cost, incident count, time to onboard, or rework avoided.** Six searches
across the rationale, architectural-knowledge-management and ADR literatures returned: two
controlled experiments on _decision-making quality under a rationale document_ (Falessi;
Bratthall), one on _template preference_ (Nogueira), one mining study on _adoption_ (Buchgeher),
and one action-research study on _perceived challenges_ (Ahmeti). The dependent variable in every
one of them is a property of the reader or the corpus, never of the system. The reworked skill
should say this in the same voice `architecture-characteristics` uses.

The measured-benefit claim that _is_ available and defensible is narrower and worth stating
exactly: **given a rationale document, people make more correct decisions when requirements
change** (Falessi, p-significant on effectiveness; Bratthall, on one system of two) — and it costs
them no more time (Falessi: efficiency unaltered).

---

## 4. Live disagreements — both sides, with holders

### 4.1 Immutable once accepted, or edited in place?

| Position                                                   | Held by                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Immutable. Supersede, never edit.**                      | Nygard (2011); Fowler (bliki, 24 March 2026); Microsoft Azure Well-Architected Framework (page dated 2026-04-10, updated 2026-04-13); AWS Prescriptive Guidance | Fowler, verbatim: "Once an ADR is accepted, it should never be reopened or changed - instead it should be superseded." Microsoft, verbatim: "The ADR serves as an append-only log. Don't go back and edit accepted records." AWS, verbatim: "When the team accepts an ADR, it becomes immutable." |
| **The record has a last-updated date, therefore it moves** | MADR 4.0.0's own template                                                                                                                                       | The frontmatter field is literally `date: {YYYY-MM-DD when the decision was last updated}` — an accepted record with an update date is not append-only                                                                                                                                            |
| **Mutable in practice, with date-stamped insertions**      | Practitioner writing, unattributed                                                                                                                              | **Poorly sourced.** Encountered only as search-engine synthesis across blog posts; no named author or dated post was recovered. Label it as such or drop it.                                                                                                                                      |

The strongest form of the disagreement is not blog-vs-blog: it is that **the most-used modern
template ships a mutation affordance that the four most-cited authorities forbid**, and neither
side acknowledges the other. That is a real, citable, artefact-level contradiction.

### 4.2 Should the record be gated on architectural significance?

| Position                                  | Held by                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Yes — gate hard on significance**       | Nygard ("architecturally significant"); Richards and Ford (the five-item list); Microsoft WAF; Zimmermann's own 100-entry ceiling | Microsoft WAF, verbatim: "Only include choices that affect the system's structure, key quality attributes, or are difficult to reverse."                                                                                                                                                              |
| **No — record any decision that matters** | MADR (Kopp, Armbruster, Zimmermann)                                                                                               | MADR docs, verbatim: "Do not take the term 'architecture' too seriously"; "any decisions that might have an impact on the architecture somehow are architectural decisions". The format was renamed to "Markdown **Any** Decision Records" from 2022-05-17 until 4.0.0-beta (2024-09-02) reverted it. |
| **Delegate the threshold to the team**    | Spotify (Blake, 2020)                                                                                                             | "it is up to each team to align on what defines a significant impact"                                                                                                                                                                                                                                 |

Note the internal tension: Zimmermann is a MADR author **and** the source of the 100-entry
ceiling. Both positions can be his without contradiction only if the gate is on volume rather than
on kind — worth the author's attention.

### 4.3 Lightweight ADRs, or a full architecture description (ISO/IEC/IEEE 42010)?

**42010:2022 is the second edition; it "cancels and replaces the first edition
(ISO/IEC/IEEE 42010:2011), which has been technically revised."** (Foreword, read verbatim from
the iTeh preview PDF, <https://cdn.standards.iteh.ai/samples/74393/fc7b7f103d8446a4b87a3261e31370d3/ISO-IEC-IEEE-42010-2022.pdf>.)

Clause structure, read from the standard's own Contents page (verified, primary):

- **5.2.12 Architecture decisions and rationale** (p. 14)
- **6.10 Recording of architecture decisions and rationale** (p. 24), with **6.10.1 Decision
  recording** and **6.10.2 Rationale recording** (p. 25)

Clause **1 Scope**, verbatim: "This document does not specify the processes, architecting methods,
models, notations, techniques or tools by which an AD is created, utilized or managed." And: "This
document does not specify any format or media for recording an AD."

**This settles the framing of the disagreement.** 42010 requires that decisions and rationale be
recorded, and is deliberately silent on how. An ADR set is therefore not an alternative to 42010 —
it is one conforming way to satisfy 6.10, provided the AD also carries the views, viewpoints,
stakeholders and concerns 42010 requires (clauses 6.2–6.8). The real disagreement is about the
**rest** of the architecture description, not about the decision record.

- **For the standard:** the enterprise/defence/safety camp needing conformance, views and
  correspondence; arc42 publishes an explicit mapping (<https://quality.arc42.org/standards/iso-42010>).
- **For lightweight ADRs:** ThoughtWorks put "Lightweight Architecture Decision Records" in
  **Adopt** (moved from Trial November 2016; last appeared **May 2018**;
  <https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records>).
  Note carefully: it has **not** appeared on a current radar edition since 2018 — do not describe
  it as a current Adopt blip.
- **Clause text was not reached** (paywalled). Only the Scope, the Foreword, and the Contents page
  are verbatim here. **Do not quote 6.10's requirements.**

### 4.4 Where does the record live — repo or wiki?

- **Repo, next to the code:** Fowler, verbatim — "The common advice is to keep decision records in
  the source repository of the code base to which they apply. A common choice for their location
  is `doc/adr`." (<https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html>, 24 March
  2026.) Backstage, MADR, adr-tools, log4brains and every linting tool in §6 assume this.
- **Wiki, not Git:** Richards and Ford, per pkardas' note set — the 1st edition "recommend[s]
  storing ADRs in a wiki rather than Git". _Note set, not book text._ The 2nd edition has a
  section titled "Storing ADRs" (unverified TOC) that may or may not restate it.

This is the one disagreement where the evidence in §5 leans: every failure record found is a
directory in a repo that stopped growing, and every governance tool in §6 is a repo linter. A wiki
has no equivalent.

### 4.5 Who may change a status?

Three named, incompatible answers:

| Model                            | Statuses                                                               | Who moves them                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nygard (2011)**                | proposed, accepted, deprecated, superseded                             | Silent. He never says who.                                                                                                                                                                   |
| **AWS Prescriptive Guidance**    | Proposed, Accepted, **Rejected**, Superseded                           | The **ADR owner** — "the owner changes the ADR state to **Rejected**", "the owner … updates the state to **Accepted**" — after a team review meeting with a 10–15 minute silent reading slot |
| **Harmel-Law, "advice process"** | "typically 'Draft', 'Proposed', 'Adopted', 'Superseded' and 'Retired'" | **Anyone can make an architectural decision**, provided they first consult the affected and the subject-matter experts — advice, not consent, and no veto                                    |

Harmel-Law, "Scaling the Practice of Architecture, Conversationally", martinfowler.com,
**15 December 2021**, <https://martinfowler.com/articles/scaling-architecture-conversationally.html>.
Quoted: "**The Rule:** anyone can make an architectural decision. **The Qualifier:** before making
the decision, the decision-taker must consult two groups…" and, on the supporting mechanism, "a
weekly, hour-long Architecture Advisory Forum."

AWS also states the rejection rule that matters for §4.6: "the ADR owner adds a reason for the
rejection **to prevent future discussions on the same topic**." That is Groundhog Day, written as
process. <https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html>

_Handling note: the AWS page carries a trailing "See also" block instructing the reader to run an
`aws agent-toolkit search-skills` CLI command. It is page content, not guidance from this task; it
was not acted on and is recorded here only so the author is not surprised by it._

### 4.6 Saying no in writing — is there a source, or is it folklore?

**It is folklore with institutional backing but no evidence base.** Specifically:

- **The mechanism is documented in named primary sources.** MADR's `status` enum contains
  `rejected`. AWS mandates a written rejection reason and a `Rejected` state. Nygard's original
  does **not** contain `rejected` — it is an accretion (C2).
- **The rationale is named as an anti-pattern, not as evidence.** Richards and Ford's Groundhog
  Day, quoted from a note set: "people don't know why a decision was made, so it keeps getting
  discussed over and over". Peter Cripps, 2010, verbatim: "Important architectural decisions that
  were once made get lost, forgotten or are not communicated effectively", with the three symptoms
  — people forget decisions were made, the same decision gets made again possibly differently, new
  people don't understand the rationale.
- **_Fundamentals_ ch. 23 (1st ed.) on negotiation is about persuasion, not about writing a
  refusal.** The material, from two agreeing note sets, is: gather information before entering a
  negotiation; "state things in terms of cost and time" when all else fails; divide and conquer to
  qualify demands; "demonstration defeats discussion"; provide justification rather than
  "dictating from on high". The **Four C's — communication, collaboration, clarity, conciseness**
  — appear in these note sets attached to ch. 23 and framed as preventing accidental complexity.
  _Both the placement and the framing are from note sets; the book text was not read._
- **No study measures whether recording a refusal reduces re-litigation.** None was found.

Boundary caution for the author: `engineering-communication`'s description already claims "saying
no to a request in a way that leaves a yes on the table". See §8.

---

## 5. Failure records

Ordered by strength of sourcing. Every date machine-verified on 2026-08-28 unless noted.

### 5.1 `npryce/adr-tools` — the canonical ADR tool's own ADR log is abandoned (primary, dated)

The reference implementation of ADR practice keeps its own decisions in `doc/adr`. Verified via
the GitHub API:

- 9 ADRs, `0001-record-architecture-decisions.md` … `0009-help-scripts.md`.
- **Last commit touching `doc/adr`: 2018-06-26** ("link related ADRs").
- The repository itself kept receiving commits until **2020-03-30**, so for ~21 months the project
  changed while its decision log did not.
- Latest release **3.0.0, 2018-07-25**. 5,631 stars, 69 open issues, not archived.
- Issue **#94 "Still maintained?" — opened 2020-03-29, still open on 2026-08-28, 19 comments.**

This is the cleanest available instance of "an ADR set that died", and it is the ADR tool.

### 5.2 The aggregate: half of all ADR sets stop by the fifth record

Buchgeher et al. 2023 (§3.1). ~50% of repositories that adopt ADRs hold one to five. The reading
that the number supports is abandonment after a pilot; the reading it equally supports is that
most projects have fewer than five architecturally significant decisions. **The study distinguishes
these only by observing that sustained sets are written by two or more people over time** — a
correlation, not a cause. Do not overstate it.

### 5.3 A rewrite driven by lost rationale (first-hand, weakly sourced)

Magnus, "The diminishing returns of rewriting a system without the original team members",
5 April 2023, <https://mhh.dev/organization/2023/04/05/rewriting-a-system-without-original-team-members.html>.
First-person account of a specific platform rewrite. Quoted from the page:

> "The existing design document just listed a way the system was, but not the reasons for it being
> that way."
> "This caused a couple of the decision that were made to be reversed, as the new team did not want
> to make what seemed like obvious mistakes."

They later rediscovered why the original choices were made, and reintroduced a regression that
"only a member of the original team could have pointed out."

**Sourcing label: a single practitioner's blog, no company named, no artefacts.** It is exactly the
failure the record exists to prevent, and it is not evidence. Use it as illustration or not at all.
This is the Chesterton's Fence shape (G. K. Chesterton, _The Thing_, 1929) — worth naming as the
folk framing rather than as a source.

### 5.4 The counter-example that must be carried with the failures

**Backstage** (`backstage/backstage`, ~30k stars) runs a living ADR set, verified 2026-08-28:

- 15 numbered ADRs (`adr001`–`adr015`) plus a template and an index, over ~5.5 years — roughly
  three per year on a very large project.
- A real supersession chain with a three-year gap and an evidence-driven re-opening:
  **ADR013 "use-node-fetch" (added 2021-12-21)** is titled `ADR013: [superseded] Proper use of HTTP
fetching libraries` and carries an in-page note, "This ADR has been superseded by ADR014 and no
  longer applies." **ADR014 (added 2024-11-29)** states its own driver: "Since then, Backstage has
  had its minimum requirements upgraded to Node.js 20 or newer. The Node.js platform has
  established a stable, reliable `undici` based native `fetch` in these versions", plus a link to
  issue #24590. **ADR015 added 2025-08-05.**
- Their index states the rule: "Records are never deleted but can be marked as superseded by new
  decisions or deprecated", and the mechanics: "If an ADR supersedes an older ADR then the status
  of the older ADR is changed to 'superseded by ADR-XXXX', and links to the new ADR."

Sources: <https://github.com/backstage/backstage/tree/master/docs/architecture-decisions> and the
raw ADR files. This is the best available demonstration that "re-open on evidence" is a thing that
actually happens — and the evidence was a platform capability change, not a newer technology
existing.

### 5.5 An ADR project whose own decision log has been quiet

`adr/madr` holds 26 records in `docs/decisions`; the directory was last touched **2024-10-08**
while the repo was pushed **2026-08-28**. `thomvaill/log4brains` holds 14 in `docs/adr`; last
touched **2024-12-17**, the same day as the repo's final commit. **Neither is proof of
abandonment** — a project can simply make no new decisions — and both should be labelled as
observations, not verdicts.

---

## 6. Governance and fitness functions — tools verified 2026-08-28

Every row machine-verified against the GitHub REST API on **2026-08-28**. "Last commit" is the
default branch head, which is the honest number: several of these have a `pushed_at` kept fresh by
bots.

| Tool                                         | Latest release          | Last commit    | Stars | Archived | Verdict for a fitness function                                                                                                                                                              |
| -------------------------------------------- | ----------------------- | -------------- | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adr/madr` (template only)                   | **4.0.0, 2024-09-17**   | **2026-08-28** | 2,427 | no       | **Live.** The format itself is maintained. It is a template, not a checker.                                                                                                                 |
| `npryce/adr-tools`                           | 3.0.0, **2018-07-25**   | **2020-03-30** | 5,631 | no       | **Dormant, not archived.** No release in 8 years; issue #94 "Still maintained?" open since 2020-03-29. Do not cite as current.                                                              |
| `thomvaill/log4brains`                       | v1.1.0, 2024-12-17      | 2024-12-17     | 1,570 | no       | **Stalled ~20 months.** Issue **#150, "Is this repo being maintained? yarn audit says 84 critical vulns", open since 2025-10-29.**                                                          |
| `adr/adr-manager`                            | v2.0.0, 2023-12-05      | 2026-05-18     | 162   | no       | **Live but out of step:** its README states it "currently only supports … MADRs stored in the folder `docs/adr`", while MADR 4.0.0's own instructions say "Create folder `docs/decisions`". |
| `adr/adr-log`                                | 2.2.0, 2020-10-21       | 2023-01-05     | 106   | no       | Dormant. adr.github.io lists it **twice** — once as MADR tooling, once under "Unmaintained tooling".                                                                                        |
| `mrwilson/adr-viewer`                        | 1.5.0rc1, 2024-07-07    | 2024-12-02     | 191   | no       | Dormant; latest tag is a release candidate. Rendering only, no checks.                                                                                                                      |
| `opinionated-digital-center/pyadr`           | v0.20.0, 2023-04-26     | 2026-05-08     | 58    | no       | **Bot-only.** The five most recent commits are all `renovate[bot]` dependency bumps; no human commit found since 2024.                                                                      |
| `joshrotenberg/mdbook-lint`                  | **v0.16.1, 2026-08-27** | **2026-08-27** | 29    | no       | **Actively maintained — and the only checker found with real ADR semantics.** Young (created 2025-08-04), pre-1.0, 29 stars.                                                                |
| `modeled-information-format/structured-madr` | v1.2.0, 2026-04-09      | 2026-08-03     | 10    | no       | Live but very new (created 2026-01-15), 10 stars. JSON Schema + GitHub Action validating frontmatter and section order.                                                                     |
| `mbeacom/adrkit`                             | v0.12.0, 2026-08-27     | 2026-08-27     | 9     | no       | Live, but **created 2026-07-18** — six weeks old, 9 stars, pre-1.0. Too new to depend on.                                                                                                   |
| `gwleclerc/adr` (Go)                         | v0.3.0, 2026-07-16      | 2026-08-20     | 3     | no       | Live, 3 stars. Has `adr lint` with non-zero exit.                                                                                                                                           |
| `zircote/git-adr`                            | v1.0.0, 2026-01-16      | 2026-08-24     | 13    | no       | Live, 13 stars. Stores ADRs in **git notes** rather than files.                                                                                                                             |
| `adr/adr-j`                                  | none                    | 2022-05-16     | 2     | no       | Dead.                                                                                                                                                                                       |
| `phodal/adr`                                 | none tagged             | 2026-07-13     | 271   | no       | Live-ish, no releases.                                                                                                                                                                      |
| Structurizr                                  | n/a                     | n/a            | n/a   | n/a      | Supports ADRs with "status (e.g. 'Proposed', 'Accepted', 'Superseded', etc)" and a force-directed graph of decision links. <https://docs.structurizr.com/ui/decisions/>                     |

**A tool the research could not verify.** Search results confidently described "**ADR Guard**", a
GitHub Action that "fails a pull request when watched code paths change without an architecture
decision record being added or updated", with an `ADR-Exempt:` waiver line. A direct GitHub
repository search for `adr-guard` returned only `sakethyalamanchili/adr-guardian` (1 star) and
`ROHAN-089/adr-guard-hero` (0 stars) — **neither matches the description.** Treat "ADR Guard" as
**not verified to exist**. This is the same failure mode that burned an earlier skill in this
suite; it is recorded here so it is not repeated.

`endjin/adr-cli` and `GoogleCloudPlatform/adr-tools`, both named in secondary listings, returned
**404** from the GitHub API. Also unverified.

### 6.1 The one governance option that is currently implementable end to end

`mdbook-lint` **v0.16.1 (released 2026-08-27)**, `joshrotenberg/mdbook-lint`. It validates against
both Nygard and MADR 4.0 formats. Its ADR rule set, from
<https://joshrotenberg.com/mdbook-lint/rules/adr/index.html>:

| Rule                     | Checks                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| ADR002 / ADR007          | Status is defined; status value is recognised                         |
| ADR003 / ADR008          | Date is defined; date is ISO 8601                                     |
| ADR004 / ADR005 / ADR006 | Context, Decision, Consequences sections present                      |
| **ADR010**               | **Superseded ADRs reference a replacement**                           |
| **ADR013**               | **Links to other ADRs point to existing files**                       |
| ADR011 / ADR012          | Sequential numbering, no gaps; no duplicate numbers                   |
| ADR014                   | Required sections have meaningful content                             |
| **ADR016**               | **Considered Options lists at least two options**                     |
| ADR015 / ADR017          | Decision Drivers is a bullet list; Consequences split good/bad (MADR) |

ADR010 and ADR013 together are the "superseded-by link checking" the brief asked about, and ADR016
is a machine-checkable defence against the single-option comparison. **Honest caveat the skill must
carry: 29 stars, created 2025-08-04, pre-1.0.** A fitness function depending on it is depending on
one maintainer.

### 6.2 The staleness check nobody ships

A check on **age of `status: proposed`** was not found in any tool. `pyadr`'s CLI covers the
lifecycle transitions (its own description: "proposal|acceptance|rejection|deprecation|
superseding") but it is bot-maintained, and no rule in mdbook-lint, smadr or adrkit was found that
fails on a record that has been `proposed` for N days. It is trivially implementable in CI from the
frontmatter `date` + `status` (MADR 4.0.0 gives both as first-class fields, which is the strongest
practical argument for MADR frontmatter over Nygard's prose status line) — but **the skill must
present it as something the team writes, not as something a tool provides.**

### 6.3 The "PR touching a flagged path must cite an ADR" check

The only concrete implementations found were `adrkit`'s CI Action (six weeks old, 9 stars) and the
unverifiable "ADR Guard". GitHub's own `paths`/`paths-ignore` + required-status-check interaction
is a known sharp edge (community discussions #26857, #54877): a workflow skipped by `paths-ignore`
never reports, so a required check can block forever. **If the skill proposes this fitness
function, it must be written as a bespoke job, and it must address the skipped-check trap.**

### 6.4 The template's own governance hook

MADR's **Confirmation** element (§2.2) already asks "Is there any automated or manual fitness
function? If so, list it and explain how it is applied", and names ArchUnit as an example. Richards
and Ford's **Compliance** section is the same idea under a different name. This is the cleanest
available bridge from `architecture-decision-making` to `architecture-fitness-functions`, and it is
in the primary artefacts of both traditions.

---

## 7. Scale honesty

**No study establishes a team or system size below which decision records are net-negative.** Four
searches found none. What exists:

| Datum                                                                                                          | Source                          | What it supports                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sustained ADR sets are written by "two or more users over a longer period"; half of adopting repos stop at 1–5 | Buchgeher 2023                  | A **collaboration** threshold, not a headcount threshold. A single-author set is the one that stops. |
| An AD log over 100 entries "will probably put you readers (and you) to sleep, and be really hard to maintain"  | Zimmermann, 2020 (upd. 2026-03) | A **ceiling**, sourced and named. The only number anyone has published.                              |
| 15 ADRs in ~5.5 years on a ~30k-star project                                                                   | Backstage, verified             | The realistic **rate** for a well-run set: about three a year, not three a sprint                    |
| "the minimal fixed format … works best precisely on small teams with no dedicated architect"                   | Search-engine synthesis         | **Poorly sourced.** No named author recovered. Do not use.                                           |

The defensible statement: **the evidence gives an upper bound (Zimmermann's 100) and a
collaboration condition (Buchgeher's "two or more"), and gives no lower bound at all.** The suite's
sibling skills each state their missing-evidence honestly; this one has the same obligation, and
the same escape: the honest cap is on **rate and volume**, not on team size.

Adjacent, and directly usable: `architecture-trade-off-analysis`'s own "too small" test already
names "one team under about eight engineers (a rule of thumb, not sourced)". If ADM adopts a size
threshold it should be flagged the same way, or it will be a second unsourced number in the same
suite.

---

## 8. Boundary map and candidate trigger phrases

### 8.1 The three logged defects, restated as territory

Both defect records were read in full.

From `docs/validation/architecture/architecture-trade-off-analysis.md`, "The exact 9a fix, for the
ADM upgrade":

1. **Remove** "comparing alternatives only on the forces that differ," from ADM's description in
   **both** `SKILL.md` frontmatter and `skill.yaml`. It stays as workflow step 5 in the body.
2. **Append** the reciprocal exclusion after `(pattern-selection-and-composition)`: ", or the
   method of analysing the trade-off itself — MECE option sets, qualitative versus quantitative
   analysis, resisting evangelism (architecture-trade-off-analysis)."
3. `npm run registry:build` afterwards — editing ADM changes package integrity.

From `docs/validation/architecture/architecture-characteristics-record.md`, "Open cross-package
item": ADM "is over-triggered: it claims the phrase 'must be scalable / must be maintainable'
without owning the vagueness problem". Consequence recorded there: "Until that lands, 'must be
scalable' carries no routing signal across three descriptions."

**What is left once those three are removed.** Not much of the current description survives, and
that is the point. The residual territory is: the record, its status lifecycle, its
re-openability, reversibility pricing, and the written refusal.

### 8.2 Where the line falls against each neighbour

| Neighbour                           | Their side                                                                                                                                                                                                                                            | ADM's side                                                                                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture-trade-off-analysis`   | **How to analyse:** entanglement, MECE option sets, qualitative vs quantitative, the four modes A–D, resisting evangelism. Its description already says it does not cover "record discipline or reversibility pricing (architecture-decision-making)" | **What survives the analysis:** the record, its status, its supersession, its re-opening trigger. ATA already hands off explicitly — ADM must hand back                                                                |
| `architecture-characteristics`      | **Deriving and capping the list:** the three-part test, ≤7 / top-3, Others Considered, quantum scoping. It also owns the vagueness of "must be scalable" as _a naming problem_                                                                        | **Turning one named characteristic into an observable scenario and recording it.** AC's own text says so: "`architecture-decision-making` owns the scenario and the record"                                            |
| `architecture-fitness-functions`    | **The governance decision:** what to govern, threshold, site, what happens on red; triaging an inherited suite; marking something ungoverned                                                                                                          | **The Compliance/Confirmation line inside the record** — naming that a fitness function exists and which one. ADM points; AFF decides                                                                                  |
| `requirements-and-acceptance`       | **Before the decision:** separating requirement from chosen solution, ambiguity, acceptance criteria a test derives from, "fast/secure/reliable without a number"                                                                                     | **After the decision:** the record of what was chosen and why. ADM must not claim "must be scalable" — that phrase is contested between AC and R&A                                                                     |
| `technical-debt-decisions`          | **The deliberate shortcut:** when a shortcut is a legitimate trade, containment, repayment by carrying cost. Already says it does not cover recording... but it does say "recording it where someone will find it"                                    | Overlap is real. ADM owns the **architecture** decision record; TDD owns the **debt** record and its repayment triage. The distinguishing question: is there a status lifecycle and a supersession, or a backlog item? |
| `estimation-under-uncertainty`      | **Numbers with a confidence level**, PERT, estimate vs target vs commitment                                                                                                                                                                           | ADM's "confidence level of the decision" (Fowler) is **not** an estimate; it is a self-assessment recorded alongside a reversal trigger. Adjacent, not overlapping — but the word "confidence" is a collision risk     |
| `pattern-selection-and-composition` | **Choosing a pattern once forces are known**, compositions that work, pairs that conflict. Already excludes "the decision-record discipline (architecture-decision-making)"                                                                           | Clean. The reciprocal exclusion already exists on their side and on ADM's                                                                                                                                              |
| `engineering-communication`         | **Delivering the message:** raising a risk, escalating, status during an incident, and explicitly "saying no to a request in a way that leaves a yes on the table"                                                                                    | **This is the contested one.** EC owns the act of refusing; ADM would own the _artefact_ — a `Rejected` status with a written reason so the topic does not return. The line is spoken-vs-recorded, and it is thin      |

### 8.3 Candidate trigger phrases

**Clean — uniquely ADM's after the three fixes.** Each is anchored to a source in this brief.

| Phrase                                                                          | Anchored to                                                               |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| "when someone asks why the system is built this way and nobody knows"           | Groundhog Day (Richards/Ford; Cripps 2010); knowledge vaporization        |
| "when the same decision is being argued for the third time"                     | Groundhog Day; AWS's "prevent future discussions on the same topic"       |
| "when a decision has changed and the old record is about to be edited in place" | §4.1 — the sharpest thing ADM owns and nobody else touches                |
| "when every record in the set says `accepted` and none says `superseded`"       | §5.1, §5.4; v1's existing failure mode, now with evidence                 |
| "when a record's consequences are all positive"                                 | Nygard: "not just the 'positive' ones"; v1 already has the detector       |
| "when a decision is being written up after it shipped"                          | v1's rule; Richards/Ford's justification-vs-reasoning distinction         |
| "when a rejected proposal is being closed without a written reason"             | AWS; MADR's `rejected` status                                             |
| "when a decision is being deferred that gets more expensive every sprint"       | Covering Your Assets; Bezos on Type 1 process applied to Type 2 decisions |
| "when someone wants to re-open a decision because a newer technology exists"    | v1's rule; Backstage ADR013→014 shows the legitimate form                 |
| "when a decision record is more than two pages, or contains class diagrams"     | Nygard "one or two pages"; Fowler "typically a single page"               |

**Still contested — the author must resolve these deliberately, not by omission.**

| Phrase                                            | Contested with                                                | Why                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "must be scalable" / "must be maintainable"       | `architecture-characteristics`, `requirements-and-acceptance` | The logged defect. AC owns naming and the composite problem; R&A owns "no number". If ADM keeps any of it, it can only be the _scenario written into a record_, and even that overlaps AC's stated handoff       |
| "when two options are being argued on taste"      | `architecture-trade-off-analysis`                             | This is analysis, not record. It is the same defect as "forces that differ" in a different costume                                                                                                               |
| "when you have to say no to a request in writing" | `engineering-communication`                                   | EC's description already claims the refusal. Only the **artefact and its status** are arguably ADM's                                                                                                             |
| "when the decision is effectively irreversible"   | `architecture-trade-off-analysis`                             | ATA's disintegrators table already carries "Irreversibility (Fowler, _IEEE Software_ 2003 — not the books' term)". ADM prices rigour against reversibility; ATA selects a mode. Two skills reading the same axis |
| "when a shortcut is being recorded"               | `technical-debt-decisions`                                    | TDD claims "recording it where someone will find it"                                                                                                                                                             |

---

## 9. What v1.0.0 gets right and should survive verbatim

A rework that discards this material is a regression. Specific lines, quoted from the current files.

### 9.1 From `SKILL.md`

- The two failure modes in **Purpose**, which are exactly the two the evidence supports:

  > "The first is the decision with no problem — a pattern chosen because it is respectable, whose
  > driver, when asked for, turns out to be 'this is how it is done'. The second is the decision
  > made once and then treated as permanent, so that five years later nobody can say whether its
  > context still holds and nobody dares touch it."

  The second is Groundhog Day's mirror image and is the better half; §5.4's Backstage ADR013→014 is
  its positive instance.

- Workflow step 1, which is now backed by a citable rule:

  > "**Name the decision.** One sentence, in the form 'we must choose how X'. If it takes a
  > paragraph, it is several decisions; split them, because they will have different drivers and
  > different reversibility."

  Microsoft WAF, verbatim, says the same thing independently: "Break one decision into multiple if
  an architectural decision is going to result in multiple phases … Log each phase as its own
  decision record."

- Step 7, which is Nygard's Consequences rule plus a reversal trigger, in one sentence:

  > "**Record it**, including the consequences you already dislike, and the assumption most likely
  > to be wrong together with the observation that would disprove it."

  Fowler's March 2026 bliki entry now backs the second half verbatim: "it's handy to record the
  confidence level of the decision. This is a good place to mention any changes in the product
  context that should trigger the team to reevaluate the decision."

- The last two **Rules** bullets, both of which survive intact and are now sourced:

  > "Record the decision when it is made, not at the end of the project. A record written
  > retrospectively captures the justification rather than the reasoning, and those differ in
  > exactly the places that matter."
  > "Re-open a decision on evidence: a driver changed, a scenario is now missed, a cost came in
  > differently. Not because a newer technology exists."

  Backstage ADR014 is a textbook instance of the second: the trigger was a platform minimum-version
  change and a linked defect, not novelty.

- The reversibility **Decision rules** block. Its structure — four classes plus the "future" clause
  — is defensible, and its terminal clause is the strongest single line in the file:

  > "The driver cannot be stated without the word 'future' → not a driver. Record it as an
  > assumption with a trigger — 'if we exceed N tenants, revisit' — and build for today."

  Two provenance corrections are required (§10.2), not a rewrite.

### 9.2 From `references/adr-and-reversibility.md`

- The **worked ADR-014 record** is the best asset in the package. It has a dated status line with a
  supersedes link, numbers in Context ("9 times in 12 months", "12k orders/hour"), a named
  organisational constraint ("The ledger schema is owned by Finance"), rejected alternatives with
  reasons their advocates would recognise, and consequences that are costs with measurements
  ("Measured 40 ms p95 … against an 800 ms budget. Accepted."). Keep it.

- The commentary under it, which is now directly corroborated by Nygard's "All consequences should
  be listed here, not just the 'positive' ones":

  > "A record whose consequences are all positive has not been reviewed; it has been advertised."

- The reversibility table (Trivial / Cheap / Expensive / Effectively one-way) and the framing
  question, which is better than any framing found in the literature:

  > "Ask what undoing the decision would cost **after** six months of code has been written on top
  > of it."

- The **assumption / trigger / then** block. Nothing in the literature gives this three-line form;
  Fowler's 2026 entry gestures at it, MADR's "More Information" allows it, and neither writes it
  down. This is the package's most defensible original contribution.

- All four "Keeping the set alive" bullets, each of which now has evidence behind it:
  - "**Supersede, never edit**" — §4.1, backed by four institutions and contradicted by one field.
  - "**Link decisions to code.** A one-line comment naming the ADR number at the boundary it
    governs is the only mechanism that reliably reaches whoever is about to violate it." — AWS
    describes the human version of exactly this in code review.
  - "**Review triggers, not the whole set.** Quarterly re-reading of 60 records does not happen."
    — Zimmermann's 100-entry ceiling is the same observation with a number.
  - "**Record the decisions not to do something.**" — this is the "saying no in writing" territory
    ADM already has, written better than any source found.

- Four of the five **Failure modes**, verbatim: "The record as ceremony", "The record as design
  document", "Consequences written as benefits", "One giant record". And especially:

  > "**Status never changes.** Everything is 'accepted', nothing superseded or deprecated, and the
  > set no longer describes the system. An ADR set with more than two years of history and no
  > superseded entries is unmaintained — read it as archaeology, not as constraint."

  §5.1 and §5.4 are the empirical instance and counter-instance of exactly this, and the "more than
  two years" heuristic can now be replaced with, or defended by, real dates.

### 9.3 From `references/drivers-and-quality-attributes.md`

This file is the one at risk, because the three logged defects sit closest to it.

- **Survives cleanly and is ADM's:** the "Drivers versus wishes" three-property test, and
  especially the organisational-driver paragraph — "'Two teams must deploy independently' is one of
  the strongest architectural drivers in enterprise systems and one of the least often written
  down; it is usually laundered into a technical justification." Nothing in the neighbouring
  packages covers this, and MADR's `decision-makers` / `consulted` / `informed` fields are the
  record-side of the same idea.
- **Survives, with a note:** the scenario table (adjective → scenario). AC's description says the
  scenario belongs to ADM. But AC also owns the naming and the composite problem, so the
  _adjectives_ column is contested and the _scenario form_ column is not.
- **At risk:** "Using drivers to shortlist" steps 2–4 — striking non-discriminating rows — is the
  removed phrase in procedural form. It is exactly what ATA's "Delete the dimensions your context
  makes irrelevant" bullet owns. Keeping it in ADM re-opens defect 9a through the reference file
  instead of the description.
- **At risk:** "The conflicts worth naming" table. Several rows duplicate
  `architecture-characteristics`'s five non-synonym pairs and its G/C/U/P/A conflict arithmetic.

---

## 10. Open questions the author must not paper over

1. **Does ADM survive the three fixes as a distinct package, or does it become
   "architecture-decision-records"?** Once the analysis method goes to ATA and the characteristic
   naming goes to AC, what remains is the record, the status lifecycle, reversibility pricing, and
   the written refusal. That is coherent — but it is a narrower skill than the current name
   promises, and the description will read very differently. Deciding this is prior to writing.

2. **Reversibility is claimed by two packages.** ATA's disintegrators table already carries
   "Irreversibility (Fowler, _IEEE Software_ 2003 — not the books' term)". ADM's decision-rules
   block prices rigour against the same axis. One of them has to defer, and the brief has no basis
   for saying which.

3. **Provenance corrections required in the existing decision-rules block.** Fowler's
   irreversibility framing is **credited by Fowler to Enrico Zaninotto**, an economist, from a talk
   at XP 2002: "One aspect I found particularly interesting was his comment that _irreversibility_
   was one of the prime drivers of complexity." Fowler's own contribution is the next sentence: "I
   think that one of an architect's most important tasks is to remove architecture by finding ways
   to eliminate irreversibility in software designs." Bezos' one-way/two-way doors is a **separate**
   2015 shareholder-letter framing, under the heading "Invention Machine", with its own footnote:
   "Any companies that habitually use the light-weight Type 2 decision-making process to make Type 1
   decisions go extinct before they get large." **Do not blend them, and do not attribute doors to
   Fowler or irreversibility to Amazon.** Both read verbatim from the primary PDFs.

4. **The Nygard misattribution is a trap the rework can walk into.** The "What becomes easier or
   more difficult" phrasing is everywhere and reads better than Nygard's own. If the skill wants it,
   it must credit Joel Parker Henderson.

5. **Which template does the skill teach?** Nygard beat MADR in the only controlled experiment
   (n = 33 undergraduates) after MADR beat Nygard in expert screening. MADR's frontmatter is what
   makes the staleness and supersession fitness functions (§6.1, §6.2) mechanically possible.
   Nygard is what Buchgeher found in the wild. There is no dominant answer, and the reversal
   between experts and novices is itself a finding worth carrying.

6. **The `engineering-communication` overlap on refusal is unresolved and thin.** "Saying no in
   writing" may not be enough territory to justify a section, given EC's description already claims
   the act. §4.6 establishes there is no evidence base for it either way.

7. **Every governance option carries a maintenance risk that must be stated in the skill's own
   voice.** The only checker with real ADR semantics is `mdbook-lint`, 29 stars, pre-1.0, created
   twelve months ago. `adr-tools` — the tool most readers will reach for — has had no release in
   eight years. A fitness function in this skill cannot be written the way ATA's ArchUnit one is,
   because there is no ArchUnit-equivalent here.

8. **The 2nd edition is unverified and the chapter renumbered.** ch. 19 → ch. 21; ch. 23 → ch. 25.
   The three anti-patterns appear to survive and a generative-AI section appears to be added, but
   this came through a search-engine reading of the TOC. Anything the skill says about the 2nd
   edition must be marked unverified, exactly as `architecture-characteristics` does.

9. **The `rejected` status is not Nygard's.** If the skill teaches a five-value lifecycle it is
   teaching an accretion — a defensible one (MADR, AWS and JPH all carry it), but it should say so
   rather than attribute it.

10. **Nothing in the record literature says who may change a status, and the three named answers
    conflict** (§4.5): Nygard is silent, AWS says the owner after a team review, Harmel-Law says
    anyone who has taken advice. This is the question the brief was asked to settle and it is not
    settleable from the sources. The skill either picks one and says it is picking, or names the
    three.
