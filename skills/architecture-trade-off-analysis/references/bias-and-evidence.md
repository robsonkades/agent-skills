# Bias, Evangelism and the Evidence Base

Two things the body only asserts: what the recorded biases are and what to do about each, and what
the claims in this whole area actually rest on.

## The recorded catalogue

Borowa, Zalewski & Kijas, "The Influence of Cognitive Biases on Architectural Technical Debt"
(arXiv:2309.14175, 2023). Semi-structured interviews with **12 architect-practitioners**, **155
recorded occurrences** of cognitive bias, of which the nine the study tabulates are below. Counts
are theirs; the counter-moves are this skill's.

| Bias                          | Count | What it looks like in an analysis                                        | Counter-move                                                                     |
| ----------------------------- | ----: | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Anchoring                     |    24 | the first option raised becomes the baseline everything is compared to   | build the MECE set before anyone argues; write the options down in one sitting   |
| Irrational escalation         |    20 | a component is kept because it was already paid for                      | price the decision forward only; sunk cost is not a dimension                    |
| Bandwagon effect              |    19 | "everyone is doing X"                                                    | ask which of their conditions you share; that is a scenario, not a citation      |
| Confirmation bias             |    14 | evidence is gathered after the answer is chosen                          | write the observation that would reverse the decision before you gather anything |
| Curse of knowledge            |    14 | the expert's option is scored on capabilities only they can operate      | rate operability by the team that will hold the pager                            |
| Optimism bias                 |    13 | migration cost, learning curve and operational load are all rounded down | put migration and operations in the comparison at full weight                    |
| IKEA effect                   |    10 | the option someone built a prototype for wins                            | have a second person rate the prototype's option in isolation                    |
| Parkinson's Law of triviality |    10 | the meeting spends its time on the cheapest, most legible dimension      | fix the constraining dimension first; timebox the rest                           |
| Law of the instrument         |     2 | the tool that solved the last problem is proposed for this one           | force the disadvantages out loud; require a scenario where it loses              |

## The cascade, verbatim from the same study

> "A decision-maker heard that a specific technology is popular, which led him to believe that it
> may be useful in his case (Bandwagon effect) … He met with a salesman of this specific solution,
> who only informed him about the beneficial aspects of the solution, which persuaded him to buy it
> (Framing effect) … Despite the disadvantages of this solution, it was used simply because it had
> already been paid for (Irrational escalation) … Which led to an 'Architectural Lock-in' because
> this component was so specific and deeply embedded in the system that it turned out extremely
> difficult to replace."

And: _"four participants experienced a situation when a solution was chosen simply because it was
the first possible one that came to notice (anchoring), and even though it was not cost-effective
and did not enable the further evolution of the product, resources were persistently being wasted
on it (irrational escalation)."_

The cascade has one entry point per stage, and each is cheap to block: a MECE set blocks the
bandwagon entry, forcing the disadvantages blocks framing, pricing forward blocks escalation.

## Debiasing works, and works harder on you than on a junior

Borowa, Rebouças de Almeida & Wiese, "Debiasing Architectural Decision-Making: An Experiment With
Students and Practitioners" (arXiv:2502.04011, 2025). Controlled experiment, **16 students and 20
practitioners**, control versus workshop pairs, think-aloud protocol.

> "The workshop improved the participants' argumentation when discussing architectural decisions
> and increased the use of debiasing techniques taught during the workshop … In particular,
> anchoring and optimism bias occurrences decreased significantly."

> "We found that practitioners were more susceptible to cognitive biases than students, so the
> workshop had a more substantial impact on practitioners."

Their speculated cause: _"the practitioners' attachment to their systems."_ This is the empirical
form of the authors' own advice to avoid evangelising your own past decisions — the person most
likely to need the counter-move in the room is the one with the most experience of the system.

The same paper is candid about its field: _"few studies have focused on behavioral factors in ADM,
with even fewer containing any empirical validation of decision-making techniques."_

## Evangelism, in the authors' words

> "Trouble comes because, when someone evangelizes a tool, technique, approach, or anything else
> people build enthusiasm for, they start enhancing the good parts and diminishing the bad parts.
> Unfortunately, in software architecture, the trade-offs always eventually return to complicate
> things."

> "An architect should also be wary of any tool or technique that promises any shocking new
> capabilities … Always force evangelists for the tool or technique to provide an honest assessment
> of the good and bad—nothing in software architecture is all good."

Their diagnosis of where it comes from is worth quoting because it is aimed at architects, not
vendors: _"this architect has likely worked on problems in the past where extensibility was a key
driving architecture characteristic and believes that capability will always drive the decision
process. However, solutions in architecture rarely scale outside narrow confines of a particular
problem space."_ And: _"anecdotal evidence is often compelling."_

The monorepo episode is the model response. A tech lead tried to pull one of the authors into
arguing the opposing side — _"it's not an argument if two sides don't exist."_ The author refused
the framing, observed that the claimed advantages _"required a level of discipline that had never
manifested within the team in the past"_, agreed to try it anyway, and built fitness functions to
detect the specific failure mode. Tip, verbatim: _"don't allow others to force you into
evangelizing something—bring it back to trade-offs."_ Closing position: _"we advise architects to
avoid evangelizing and to try to become the objective arbiter of trade-offs."_

## What the claims in this area rest on

Be able to say this out loud when the method is challenged.

- **The primary sources are practitioner authority plus a private case survey.** _Hard Parts_
  states its evidence: _"we looked at hundreds of examples of distributed architectures (both
  microservices and others) to determine the common coupling points."_ No protocol, no sample
  frame, no published dataset. The teaching vehicle is a fictional company; the evangelism
  section's central example is an anecdote about a conversation.
- **Academic software architecture says the same about itself.** Falessi, Ali Babar, Cantone &
  Kruchten (2010): _"historically, most advances in software architecture have been driven by
  talented people and industrial experience, but there is now a growing need to systematically
  gather empirical evidence about the advantages or otherwise of tools and methods rather than just
  rely on promotional anecdotes or rhetoric."_ And: _"anecdotal evidence alone, irrespective of the
  credibility of the source, may not be enough."_
- **No outcome study exists** showing that teams performing structured trade-off analysis — in any
  form — ship better architectures than teams that do not. Not for ATAM, not for matrices, not for
  ADRs. If you claim otherwise you are claiming beyond the literature.

What _is_ evidenced: that architects decide from experience and intuition rather than method, and
that biases are frequent and reducible. Both are findings about decision-makers.

## Disagreement 1 — can trade-off analysis be made rigorous?

**Side A, the SEI school.** ATAM (Kazman, Klein, Clements) is a nine-step, four-phase,
multi-stakeholder method built on utility trees, quality-attribute scenarios and tactics, designed
so that trade-offs are explicit and auditable. It exists precisely to answer this objection.

**Side B, Ford and Richards.** One sentence, and it is the whole treatment in the book — ATAM
appears exactly once:

> "While several frameworks have existed for decades (such as Architecture Trade-off Analysis
> Method, or ATAM), they lack focus on real problems architects face on a daily basis."

**Side C, the empirical middle.** Sahlabadi et al., _Sensors_ 22(3):1252 (2022), reviewing 27
credentialled evaluation methods: _"despite the crucial role of architectural evaluation and many
SA evaluation methods proposed by research communities, the industry only occasionally practices
these methods"_; _"comprehensive SA evaluation methods, in particular ATAM, require a massive
amount of cost and effort"_; _"even agile development approaches do not encourage using
architecture evaluation methods."_

**Side D, the strongest form of "it is dressed-up intuition".** Dasanayake, Markkula, Aaramaa &
Oivo (arXiv:1610.09240), three European companies, 10 architects: _"software architects' own
decision-making during architecting appears to be heavily based on personal qualities rather than
external resources"_; _"experience is the main source of support for decision-making, and it is
closely followed by intuition."_ Their table: experience for essentially all participants,
intuition for 7 of 10, **methodology for 2 of 10**. Also Zannier, Chiasson & Maurer (2007), who
find designers **satisfice** rather than search exhaustively. (Their finding on how problem
structure correlates with rational versus naturalistic decision-making could not be verified in
either direction — do not cite a direction for it.)

Honest summary: the heavyweight camp has a method the field does not run; the _Hard Parts_ camp
says that is because it answers a differently-sized question; and neither side has outcome data.

## Disagreement 2 — can architecture characteristics be prioritised?

Richards and Ford take the sceptical side themselves (_Fundamentals_ 1st ed., ch. 5):

> "Many architects and domain stakeholders want to prioritize the final list of architecture
> characteristics that the application or system must support. While this is certainly desirable,
> in most cases it is a fool's errand and will not only waste time, but also produce a lot of
> unnecessary frustration and disagreement with the key stakeholders."

Their substitute: _"have the domain stakeholders select the top three most important
characteristics from the final list (in any order)"_ — unordered, explicitly not a ranking. This is
in direct tension with utility trees and weighted decision matrices, which prioritise by
construction, and with any reading of a trade-off table that totals it.

Two reinforcing constraints from the same chapter: _"a common anti-pattern in architecture entails
trying to design a generic architecture, one that supports all the architecture characteristics"_,
and _"work hard to keep the final list as short as possible."_ Their canonical over-specification
failure is the **Vasa** — a 1626–1628 warship built as both troop transport and gunship, two decks
where ships had one, cannons twice the usual size, over the shipbuilders' _"trepidation"_; it
capsized in the harbour during its own salute.

Also from ch. 5: architects and stakeholders speak different languages, and the translation is
one-to-many. "Time to market" means agility, testability and deployability; "user satisfaction"
means performance, availability, fault tolerance, testability, deployability, agility and security.
A stakeholder priority is not a characteristic priority until it has been translated.

## Disagreement 3 — is "it depends" analysis or an escape hatch?

The defence is the authors' own, and it is not a shrug — the dependencies are enumerated in the
next breath: _"it depends on the deployment environment, business drivers, company culture,
budgets, timeframes, developer skill set, and dozens of other factors."_ Gregor Hohpe's version:
architecture _"is rarely good or bad — it's either fit or unfit for purpose"_, and the architect's
job includes _"creating transparency on ramifications."_

There is no well-known written statement of the opposing case. Searching for a citable "it depends
is a cop-out" argument turns up only its pre-emptive rebuttals, so do not attribute the critique to
a named author. The usable form is an operational test rather than a citation: **"it depends" is
analysis only if the speaker can name what it depends on and what they would do under each
condition.** If they cannot, the phrase is mode D pretending to be mode B.
