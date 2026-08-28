# Templates and the Lifecycle

## Nygard, 2011 — the original, in his own words

Michael Nygard, "Documenting Architecture Decisions", 15 November 2011, on the Relevance/Cognitect
blog. The `thinkrelevance.com` URL most citations use still resolves, via a 301 to `cognitect.com`;
do not describe it as dead.

| Part             | Nygard's words                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Title**        | "short noun phrases" — his example is "ADR 1: Deployment on Ruby on Rails 3.0.10"                                                                                                                                                                            |
| **Context**      | "describes the forces at play, including technological, political, social, and project local"; the language is "value-neutral"                                                                                                                               |
| **Decision**     | "describes our response to these forces. It is stated in full sentences, with active voice. 'We will …'"                                                                                                                                                     |
| **Status**       | "A decision may be 'proposed' if the project stakeholders haven't agreed with it yet, or 'accepted' once it is agreed. If a later ADR changes or reverses a decision, it may be marked as 'deprecated' or 'superseded' with a reference to its replacement." |
| **Consequences** | "describes the resulting context, after applying the decision. All consequences should be listed here, not just the 'positive' ones."                                                                                                                        |

Also his, verbatim, and each of them load-bearing:

- **Numbering.** ADRs are "numbered sequentially and monotonically. Numbers will not be reused."
- **Superseding.** "If a decision is reversed, we will keep the old one around, but mark it as
  superseded. (It's still relevant to know that it _was_ the decision, but is _no longer_ the
  decision.)"
- **Length and voice.** "one or two pages long", written "as if it is a conversation with a future
  developer", with "good writing style, with full sentences organized into paragraphs."
- **Scope.** "a collection of records for 'architecturally significant' decisions: those that affect
  the structure, non-functional characteristics, dependencies, interfaces, or construction
  techniques."

## The misattribution, which is nearly universal

Nygard **never wrote** the sentences most often quoted as his. The widely-copied phrasing —

> "## Context — What is the issue that we're seeing that is motivating this decision or change?"
> "## Decision — What is the change that we're proposing and/or doing?"
> "## Consequences — What becomes easier or more difficult to do because of this change?"

— is from Joel Parker Henderson's `decision-record-template-by-michael-nygard/index.md`, in the
`joelparkerhenderson/architecture-decision-record` collection. The same file renders Status as "What
is the status, such as proposed, accepted, rejected, deprecated, superseded, etc.?", which is where
**`rejected` enters a template calling itself Nygard's**.

Quote the phrasing if you like it — it is better prompting than Nygard's own prose — but credit Joel
Parker Henderson. Attributing "what becomes easier or more difficult" to Nygard is the single most
common ADR sourcing error in circulation.

## The status lifecycle, and who may move it

Nygard's four: **proposed, accepted, deprecated, superseded**. Anything richer is an accretion, which
is not the same as an error — `rejected` is carried by MADR, by AWS and by the Henderson collection,
and this package uses it. Say which you are teaching.

Who may change a status has three named, incompatible answers. The literature settles none of them,
and the honest move is to pick one for your estate and record the pick.

| Model                          | Statuses                                                               | Who moves them                                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nygard (2011)**              | proposed, accepted, deprecated, superseded                             | Silent. He never says.                                                                                                                                                                                                        |
| **AWS Prescriptive Guidance**  | Proposed, Accepted, **Rejected**, Superseded                           | The **ADR owner**, after a team review meeting with a 10–15 minute silent reading slot. On rejection the owner adds a reason "to prevent future discussions on the same topic"                                                |
| **Harmel-Law, advice process** | "typically 'Draft', 'Proposed', 'Adopted', 'Superseded' and 'Retired'" | **Anyone can make an architectural decision**, provided they first consult the affected parties and the subject-matter experts — advice, not consent, no veto. Supported by "a weekly, hour-long Architecture Advisory Forum" |

Harmel-Law, "Scaling the Practice of Architecture, Conversationally", martinfowler.com, 15 December 2021. His rule and qualifier, verbatim: "**The Rule:** anyone can make an architectural decision.
**The Qualifier:** before making the decision, the decision-taker must consult two groups…"

## MADR 4.0.0

`adr/madr`. Release 4.0.0 published 2024-09-17; the repository is live (verified 2026-08-28). Its
template is YAML frontmatter plus a body.

- **Frontmatter, all optional:** `status`, `date` ("{YYYY-MM-DD when the decision was last
  updated}"), `decision-makers`, `consulted`, `informed` — the last three a RACI-shaped split
  between "two-way communication" and "one-way communication".
- **Body:** three sections it treats as required — **Context and Problem Statement**, **Considered
  Options**, **Decision Outcome** — and five optional ones: _Decision Drivers_, _Consequences_
  ("Good, because …" / "Bad, because …"), _Confirmation_, _Pros and Cons of the Options_, _More
  Information_. The **minimal** template keeps the three required plus optional Consequences.

**Confirmation is the field this suite cares about most**, because it writes a fitness-function hook
into the template itself:

> "{Describe how the implementation / compliance of the ADR can/will be confirmed. Is there any
> automated or manual fitness function? If so, list it and explain how it is applied. … E.g., a
> design/code review or a test with a library such as ArchUnit can help validate this. Note that
> although we classify this element as optional, it is included in many ADRs.}"

Richards and Ford's **Compliance** section is the same idea under another name. Either way, naming
the fitness function is this skill's job; deciding whether it is worth governing and what happens
when it goes red is `architecture-fitness-functions`'.

**What MADR costs.** Five optional sections is opt-in format cost, but "Pros and Cons of the Options"
is a per-option analysis with real upkeep. Zimmermann — a MADR co-author — says so himself: the
"maintenance effort of filled out, full-fledged decision records … became rather high", which is why
he invented Y-statements.

**MADR contradicts itself and others, and it is worth knowing before you adopt it.**

- Its `date` field means "when the decision was last updated" — a mutation affordance that Nygard,
  Fowler, Microsoft's Well-Architected Framework and AWS all forbid.
- Its docs say "Do not take the term 'architecture' too seriously … any decisions that might have an
  impact on the architecture somehow are architectural decisions" — the opposite of Nygard's
  significance gate and of Zimmermann's own 100-entry ceiling.
- The acronym officially stood for "Markdown **Any** Decision Records" from 2022-05 until
  4.0.0-beta (2024-09-02) reverted it to "Architectural".
- Its docs say there is no tooling for 3.0.0, while `adr-manager` states it supports "MADRs stored
  in the folder `docs/adr`" and MADR 4.0.0's own instructions say to create `docs/decisions`.

## Y-statements

Zdun, Capilla, Tran and Zimmermann, "Sustainable Architectural Design Decisions", _IEEE Software_
30(6), 2013, pp. 46–53. **Pautasso is not an author of this paper**, despite frequent listing.

> "In the context of `<use case/user story u>`, facing `<concern c>` we decided for `<option o>` to
> achieve `<quality q>`, accepting `<downside d>`."

What it adds: one sentence that forces the downside into the same breath as the decision. What it
costs: no status, no alternatives, no consequences over time. **It cannot be superseded, because it
carries no lifecycle** — a capture format, not an archive format. Their five sustainability criteria
for a decision (strategic; measurable and manageable; achievable and realistic; rooted in
requirements; timeless) reach this file through an InfoQ article derived from the paper, not the
paper itself. Paraphrase, not quotation.

## arc42, and the Henderson collection

**arc42** section 9 is "Architecture Decisions". Its contribution is a routing rule rather than a
template: decide whether a decision belongs in the central section 9 or locally in a building block's
white box, then **defer to Nygard's format** (Tip 9-5). What it costs: it presumes the wider arc42
document exists.

**The Henderson collection** is breadth — Nygard's template, MADR, Tyree/Akerman, business-case,
planning, "alexandrian" — plus examples and file-naming conventions that MADR's own docs link to,
with the warning "As a consequence, some existing tooling might not be applicable." What it costs: it
is the primary vector of the misattribution above, and it is a menu rather than a method. It does not
tell you which to pick.

## Richards and Ford, and edition discipline

_Fundamentals of Software Architecture_ **1st ed. (2020), ch. 19 "Architecture Decisions"** adds two
sections to Nygard's five: **Compliance** (how the decision will be verified) and **Notes**
(metadata — author, approval date). The same source records their significance list — decisions
affecting structure, nonfunctional characteristics, dependencies, interfaces, construction techniques
— which AWS reproduces and credits to them explicitly. It also records that they "recommend storing
ADRs in a wiki rather than Git", which contradicts Fowler and the whole `doc/adr` tradition.

**All of that comes from two agreeing third-party note sets, not from the book text.** Cite it as
such. The **2nd edition (March 2025)** renumbers the chapter to 21 and negotiation from ch. 23 to
ch. 25; its subsection list appears to keep the three anti-patterns and to add a generative-AI
section. **Every claim in that sentence was reached through a search-engine reading of the
publisher's table of contents, not the book or the publisher page, and is unverified.** Never write
that something is "unchanged in the 2nd edition".

## Where the record lives, and 42010

**Repo or wiki** is a real disagreement. Fowler: "The common advice is to keep decision records in the
source repository of the code base to which they apply. A common choice for their location is
`doc/adr`." Backstage, MADR, `adr-tools`, `log4brains` and every linter in `evidence-and-tooling.md`
assume it. Richards and Ford, per the note sets, prefer a wiki. The evidence leans one way only
weakly and only mechanically: every failure record recovered is a directory in a repo that stopped
growing, and every governance tool is a repo linter. A wiki has no equivalent — which is an argument
about tooling, not about knowledge.

**ISO/IEC/IEEE 42010:2022 is not a rival to the ADR.** It is the second edition, which "cancels and
replaces" 42010:2011. Its clause **5.2.12** is "Architecture decisions and rationale"; **6.10** is
"Recording of architecture decisions and rationale", with **6.10.1 Decision recording** and **6.10.2
Rationale recording**. Clause 1 Scope says, verbatim: "This document does not specify the processes,
architecting methods, models, notations, techniques or tools by which an AD is created, utilized or
managed", and "This document does not specify any format or media for recording an AD." An ADR set is
therefore **one conforming way to satisfy 6.10**, provided the wider architecture description also
carries the views, viewpoints, stakeholders and concerns 42010 requires. The real disagreement is
about the rest of the description, not about the decision record. _The clause text itself is
paywalled and was not read; only Scope, Foreword and Contents are verbatim here._

One caution when the lightweight side is argued: ThoughtWorks put "Lightweight Architecture Decision
Records" in **Adopt**, moved there from Trial in November 2016, **last appearing in May 2018**. It is
not on a current radar edition, and citing it as one is wrong.

## Which template to teach

There is no dominant answer, and the reversal in the evidence is itself the finding.

- **Nygard** is what the wild actually contains — Buchgeher et al. report it as predominant in OSS —
  and it won the only controlled comparison: Nogueira, Silva and Conte (arXiv, submitted 2026-04-30)
  found Nygard beating MADR on an overall score with 33 undergraduates (Wilcoxon W = 84.0, p = 0.002,
  Cliff's delta 0.6364). **Undergraduates; the authors name external validity as their own threat.**
- **MADR** had scored higher in that same study's expert screening (0.900 against 0.868) before the
  novices reversed it, and its frontmatter is what makes the staleness and supersession checks
  mechanically possible: `status` and `date` as first-class fields rather than a prose status line.

If you want machine-checkable governance, that is the argument for MADR frontmatter. If you want the
format the next contributor has already seen, that is the argument for Nygard. Either is defensible;
choosing silently is not.
