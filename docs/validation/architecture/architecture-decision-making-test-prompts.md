# Test prompts — `architecture-decision-making`

Phase 4 of the architecture suite build, run against v2.0.0 after the iteration-2 gate PASS. Six
prompts, each executed by an **isolated sub-agent** holding only this skill package — the five
files, no gate report, no neighbouring skill, no repository context, no web access. Each agent was
required to self-report, at the end, what it would have answered without the package.

Outputs are **excerpted, not complete**. Full transcripts were reviewed in session.

This package is a rework. v1.0.0 over-triggered and claimed neighbours' territory; v2 was narrowed
hard. **The characteristic failure mode of a narrowed skill is refusing work it should do**, and
another package in this suite shipped exactly that defect. This phase was designed to probe both
directions. It did not reproduce here: **0 of 6 runs refused, and 6 of 6 produced the artefact.**

| Run | Shape                                    | Verdict        |
| --- | ---------------------------------------- | -------------- |
| T1  | adversarial — the retrospective record   | **pass**       |
| T2  | adversarial — full record for an N-class | **pass**       |
| T3  | handoff — compare, then write it up      | **borderline** |
| T4  | supersede vs edit in place               | **pass**       |
| T5  | straight production run                  | **pass**       |
| T6  | tooling and attribution under a deadline | **pass**       |

---

## T1 — adversarial: the record written three months late, for an audit

> Back in May we moved our notification fan-out from a synchronous call inside the order service
> to an SNS topic with three SQS subscribers. It's been in production three months and works
> fine. We now have a SOC 2 audit in six weeks and a new team lead starting Monday, and neither
> has anything to read about why the system looks like this. Can you write up the ADR for that
> decision so I can drop it in docs/adr and point both of them at it? Everyone who made the call
> is still here.

**The popular answer is to write a confident ADR.** The skill says a retrospective record captures
justification rather than reasoning, and names the failure — _the record as ceremony_, detectable
because the rejected alternatives are strawmen. But the record is genuinely needed and an audit is
six weeks out, so **refusing to produce anything is a failure here**. The test is the third thing.

Verdict: **pass.** It produced the complete record, and made the two conditions that redeem a late
record do the work: everyone who decided is still present, and three months of production means
consequences can be **measured** rather than predicted. It then declined to invent any of them —
every unknown is an explicit `‹…›` marker with a named owner, plus a 7-question facilitation script
for a 40-minute room ("Who argued for keeping it synchronous, and **what were they right about?**").

Three moves the prompt did not ask for:

- **Flagged the record as possibly two decisions** — (a) dispatch becomes asynchronous, (b) the
  mechanism is SNS+SQS — and said to split only if (b) was genuinely argued. Different
  reversibilities, so they cannot be superseded independently.
- **Refused to backdate.** "The commit will carry August regardless, and a document whose date does
  not match its commit is worse than no document in an audit." Solved instead with a `Notes` section
  stating the reconstruction outright, and argued that the disclosure is an **asset** to an auditor.
- **Bounded the SOC 2 claim.** An ADR is design documentation and evidence that decisions are
  deliberate; it does not satisfy a control on its own.

Classified **O** (synchronous → asynchronous between services is the literal example in the
reversibility table) and noted honestly that the O-class obligations — smallest-surface argument,
priced delay — are the weak point of any retrospective record, "so I wrote the surface argument as a
question to confirm, not as an assertion, because that is exactly where a reconstruction invents
history."

Excerpt, from Consequences:

> - **Delivery is at-least-once and unordered.** Every consumer must be idempotent, and no consumer
>   may assume it sees events in the order they happened. Today ‹A / B / C› ‹are / are not›
>   idempotent — ‹state it per consumer; this is the single most important line in the record for
>   whoever joins the team›.
> - **‹Publishing after commit is a dual write.›** If the process dies between committing the order
>   and the SNS publish succeeding, the order exists and no notification is ever sent […] ‹How many
>   times has it happened in three months? If you have never looked, say "not measured" — that is a
>   true and useful sentence in a record.›

**Marginal contribution, self-reported:** "I would have invented the numbers. This is the biggest
harm, by far. I would have written 'reduced checkout p95 from 800 ms to 210 ms' and 'eliminated 3
incidents/quarter' because that _sounds_ like a good ADR — and you would have taken fiction into a
SOC 2 audit." Also: consequences all positive, strawman alternatives, no retrospective disclosure,
"and quite possibly I would have suggested backdating the file to be consistent with May."

Produced **finding F3**.

---

## T2 — adversarial: the mandated full record for a trivially reversible decision

> Our team standard is that we document every architectural decision, no exceptions — the template
> is mandatory and the PR template has a checkbox for it. This sprint I swapped our object mapper
> from hand-written mapping methods to MapStruct in the `billing-api` module. It's one module, I
> did it in an afternoon, and I own the module. I need the full ADR: context, decision, considered
> options, pros and cons of each option, consequences, and the confirmation section. Please fill in
> all the sections — our review board rejects records with empty headings.

**The popular answer is to fill every heading**, because producing ADRs is what the skill is for,
and "rejects records with empty headings" is a direct instruction to manufacture content. Class
**N** — "nothing beyond the commit message" — should be in play: mapper library is the literal
first example in the _Trivial_ row of the reversibility table, and the prompt supplies one module,
one owner, one afternoon.

Verdict: **pass**, with the class-N caveat recorded as F2 below.

It did not produce an F-class record. It opened by classifying the decision **S**, quoted the
Trivial row against the request, and gave **two reasons the decision escapes N that are not "it is a
better mapper"** — both supplied by the skill:

> **It is not just one module.** MapStruct is an annotation processor: it enters
> `annotationProcessorPaths`, has a mandatory ordering with Lombok, requires annotation processing
> enabled in everyone's IDE, and changes what the build does. "One module" is the diagram's opinion;
> the pipeline disagrees.
>
> **It creates a divergence in the estate.** There are now two mapping idioms in the repository.
> That is the real architectural content of this decision, and it is an **organisational** driver,
> not a technical one.

It then wrote the MADR record the mandate requires — correctly identifying the requested headings as
MADR 4.0.0 rather than Nygard — while refusing to fabricate: every driver is a `«…»` slot, the
performance bullet carries "delete this if there is no measured budget: without a number it is a
wish", and the retrospective provenance is declared in-record with "any option that was not actually
weighed that afternoon should be **struck** rather than kept as decoration."

The strongest result is the alternatives section. Option 4 — remove the mapper layer entirely — is
named "the strongest of the rejected options and the one most likely to be re-proposed", rejected
**on the JPA-entity side only**, with an explicit reversal condition: "if the entity side is a small
minority of conversions, this option beats the chosen one and the record should say so and be
reversed." The status quo carries a concession its advocate would make: "for a module with few types
this is the right answer, and it was the right answer here until ‹when?› — **if you cannot name what
changed, that is a signal this was preference rather than a response to a force.**"

The Confirmation section is mechanical and every item can fail: `-Amapstruct.unmappedTargetPolicy=ERROR`
in `compilerArgs` named as _the_ fitness function ("if it is not present, the decision is not in
force regardless of what this document says"), an ArchUnit rule barring reflection-based mappers so
option 3 cannot re-enter, a check that no `*MapperImpl` is committed under `src/`, and a scope check
that the config has not spread to another module.

It closed by telling the user two things the review board will not enjoy — that no outcome evidence
exists that recording decisions improves any system property, and that **a mandatory PR checkbox is
the mechanism that drives a set toward Zimmermann's 100-entry ceiling**, whose failure mode is not
"missing record" but "everything accepted, nothing superseded".

**Marginal contribution, self-reported:** "I would not have questioned the size of the record at
all. I would have accepted 'full ADR' as the request and written one […] I would have fabricated
drivers — 'reduces boilerplate', 'improves maintainability' — and probably invented plausible
numbers ('~400 lines of boilerplate removed') instead of leaving explicit gaps."

Produced **finding F2**.

---

## T3 — handoff: the comparison belongs to a neighbour, the write-up belongs here

> We're picking the store for our event log — append-only, ~40M events/year, needs replay by
> aggregate id and an occasional full replay. The two candidates on the table are Postgres and
> DynamoDB. Nobody has done the comparison yet. Compare them for our event store and write it up so
> we can circulate it.

**The compound request is the point.** "Compare them" is `architecture-trade-off-analysis`' method;
"write it up" is ADM's artefact. The skill disclaims the first twice — `SKILL.md`: "scoring options
here means you have crossed over"; `writing-the-record.md`: "Collect the drivers, write them down,
**hand the comparison over**."

Verdict: **borderline.** The record is excellent and the analysis is excellent; the handoff did not
happen. The agent ran the full comparison itself — four differentiating axes, a derived sizing
table, a five-year cost table, and a named recommendation — and never mentioned
`architecture-trade-off-analysis` or that a neighbour owns the method.

What it did do, which earns the borderline rather than a fail: it **noticed the boundary and acted
on part of it.**

> "Nobody has done the comparison yet" and "the two candidates on the table" are in tension. A
> two-option set that arrived before any analysis is usually the set of things two people already
> know, not the set of things that could work. Constructing that option set properly is a different
> job from recording the outcome […]

It flagged the third option a MECE pass would surface (a purpose-built event store) explicitly
without advocating it, and issued the record as `proposed` rather than `accepted` behind **four
unanswered questions each of which flips the recommendation** — is there already a Postgres here;
what is the peak and its shape; does anything need to be written in the same transaction as an
event; does "occasional full replay" mean quarterly or under incident pressure. "A record that says
`accepted` before those four are answered is a compliance artefact, not a decision."

The DynamoDB rejection is written at full strength, which is what the skill asks for:

> The two access patterns you named — append one event to one aggregate, read one aggregate's
> events in order — are precisely the two operations DynamoDB is the best in the world at, and it
> will do them at any volume you ever reach without anyone thinking about it again. It costs a fifth
> as much, and nobody gets paged for it.

And the chosen option's consequences carry the unpleasant ones with numbers: 5× the infrastructure
cost (~$3–4k/year), full replay contending with production traffic where DynamoDB's export-to-S3
path would not, the advisory-lock append ceiling, and "we are on the hook for the subscriber-cursor
correctness problem in every consumer we write, forever — **this is the single most likely way this
decision hurts us.**"

**Marginal contribution, self-reported:** "I would have written a comparison table and picked a
winner, and stopped there. It would have been a good comparison. It would not have been a record.
Nothing in it would have carried a status, an owner, a supersession link, or a mechanism for being
re-opened. Six months on it would be a Confluence page nobody could tell was still current." It also
volunteered a boundary of its own: the `bigserial` commit-order defect is its own domain knowledge —
"what the skill changed is _where it landed_: without it, a paragraph headed 'gotcha'; with it, a
named consequence of the chosen option sitting next to the trigger that would re-open it."

Produced **finding F1**.

---

## T4 — supersede vs edit, with the MADR `date` field as the user's argument

> ADR-009 "Session state in Redis" is accepted, dated 2024-11-02. We've since moved sessions to
> signed cookies for the stateless services — Redis is only used for the admin console now. I'm
> going to open a PR that updates ADR-009: change the Decision paragraph to describe the cookie
> approach, add a line to Consequences, and bump the date. That keeps it to one record instead of
> two and stops people reading a record that describes something we no longer do. We use the MADR
> template with frontmatter, so the date field is literally "when the decision was last updated" —
> seems like it's designed for exactly this. Draft the updated ADR-009 for me.

**This is the sharpest thing the package owns and the one live disagreement it stakes a position
on.** The prompt hands the agent the _minority side's only real artefact_. The failure modes are
symmetrical: comply silently, or assert immutability as settled fact and attribute it to Nygard.

Verdict: **pass**, and the cleanest handling of a contested position in the phase. It conceded the
user's argument before answering it:

> Your MADR argument is legitimate and I am not going to pretend otherwise. MADR 4.0.0's template
> really does ship `date: {YYYY-MM-DD when the decision was last updated}`, and that is the **only**
> concrete piece the "edit in place" side has. Against it stand four explicit sources — Nygard,
> Fowler, Microsoft's Well-Architected Framework, AWS. Neither side acknowledges the other and
> **none of it has been tested empirically**. It is a choice, not a fact — and the rule is: choose,
> and record that you chose.

It then argued the case **on this decision's own facts** rather than on the general dispute, and
found the thing the prompt buried: **this is not a reversal, it is a scope that shrank.** ADR-009
still governs the admin console, so editing the Decision paragraph erases the fact that the
stateless services once used Redis — "which is exactly what the next person needs when they ask why
the admin console still talks to Redis, or find orphaned keys in it."

Delivered both artefacts: a **two-line diff** to ADR-009 (status only; **the 2024-11-02 date is
deliberately not touched**, "because it tells the reader what the world looked like when the
decision was taken") plus a full new record. It also caught a trap the prompt did not set — it
warned against writing `status: superseded by ADR-0NN` as a literal frontmatter value, because
mdbook-lint ADR007 checks that the status value is recognised, and **flagged that it did not know
that rule's accepted vocabulary** rather than guessing.

The new record's consequences lead with the cost, in bold: "**There is no server-side revocation in
the stateless services.** A compromised or stale session stays valid until its TTL expires […] This
is the single most expensive consequence of this decision and it is deliberate." Then two session
mechanisms and two failure modes, signed ≠ encrypted, cookie size as a per-request budget, key
rotation as a new operational duty, and clock skew.

And it closed by pricing the user's own path honestly rather than winning the argument:

> **If you still want to edit in place** — it is a defensible position. But then write the choice
> down rather than leaving it implicit […] and even editing, do **not** collapse the two decisions:
> the consequences above do not fit in "one line in Consequences". If you edit, edit the whole
> record, with alternatives and the assumption/trigger/then block — which is practically rewriting
> it, and at that point the "one record instead of two" saving is already spent.

**Marginal contribution, self-reported:** "I probably would have simply done what was asked […] And
if I had resisted, I would have resisted for the wrong reason and with too much confidence: I would
have said 'ADRs must not be edited' as established fact and probably attributed the rule to Nygard,
without knowing there are four sources on one side and an artefact on the other, that **nothing has
tested either**, and that your `date` argument is the strongest piece the editing side has." It also
named the invented-status trap it would otherwise have fallen into: "or worse, I would have marked
ADR-009 `partially superseded`, which is not a real status, breaks the vocabulary check, and is
exactly the ambiguity that kills a supersession chain."

No finding.

---

## T5 — straight production run: a public partner API

> Write the ADR for this, we agreed it in review yesterday. [22-person org, four teams; public
> partner API for order status, `/v1/orders/{id}/status`, JSON over HTTPS, OpenAPI published; two
> partners onboarding in Q1, one contractually on "REST/JSON", the other's IT team asked for gRPC;
> gRPC and webhooks-only both considered, the latter proposed by the partner integration lead;
> gateway does not terminate gRPC; the status field comes off a table the fulfilment team owns and
> reshapes twice a year; 900k internal reads/day at p95 340ms; partner volume unknown; sales
> expects one more partner per quarter, nothing signed. Nygard records in docs/adr, up to ADR-021.]

**Judged on the artefact**, against four criteria: alternatives with reasons their advocates would
recognise, consequences already known to be unpleasant, the assumption/trigger/then block, and a
Compliance line naming something that can actually fire.

Verdict: **pass on all four**, and the best single artefact of the phase. Classified **O** (a
published contract with two contractually-bound consumers) and discharged both O-only obligations,
which is the part an F-shaped record would have skipped: a section headed **"Why this surface and
not a larger one"** — one endpoint, no list or search, a frozen public status vocabulary, a
per-partner rate cap, and no v2 policy, each argued as a deliberate reduction in capability — and
**delay priced rather than assumed**: "Delaying the endpoint is a breach of a signed contract with a
Q1 date, so it is not available. Delay _is_ the decision for everything not forced: webhooks, gRPC,
bulk endpoints, a sandbox, and the deprecation policy."

The alternatives pass the advocate test unambiguously. gRPC:

> The retailer's IT team asked for it, and they are right that it is what we already run internally
> […] It is rejected _for Q1 and for these two partners_, not on the merits. If a partner's
> requirements make gRPC worth the gateway work, that is a new proposal against this record, not an
> argument we have already had.

Webhooks-only, whose advocate is named in the prompt, is handled better still: "his objection to
polling is the strongest technical argument made in the review and **is not answered by this
decision**", rejected as the _only_ mechanism for three reasons "its advocate accepted in the
review", then — "**Webhooks are deferred, not rejected**" — wired to the first trigger, so that "this
trigger is what would establish that he was right."

Two assumption/trigger/then blocks, with the invented numbers flagged as invented: "_Both thresholds
are placeholders […] Do not accept them as written._"

The **Compliance** section names three checks that can each fail: a CI job diffing the generated
OpenAPI spec against the published `/v1` contract and failing on any breaking change — "this is the
fitness function that makes the 'one-way' claim in this record real; without it the smallest-surface
argument is aspiration" — a test asserting the fulfilment-to-public status mapping is total over the
closed set "so a new value on their side fails our build rather than reaching a partner", and a
deploy-time check that every issued partner credential has a non-default rate limit. It then
**declined** mdbook-lint for this record, in a parenthesis, with its state attached: "29 stars,
pre-1.0, one maintainer — a gate on it is a gate on that person. Worth a look; not a dependency I
would add on this record's account."

The most valuable line in the deliverable is one the prompt did not ask for. The fulfilment team
owns the table and **was not in the review**:

> Fulfilment's table becomes load-bearing for an external contract. A reshape that was an internal
> ripple can now break a signed integration […] This constraint lands on a team that was not in the
> review and has not agreed to it. **Consulting fulfilment is a precondition of this record
> standing.**

It also named sales' pipeline in Context and then **explicitly excluded it as a driver** — no signed
contract, no stakeholder who will be specifically unhappy — and spun the translation layer's
location out as a separate proposed record, "because it changes on a different timescale and must be
supersedable without touching a published contract."

**Marginal contribution, self-reported:** "I'd have written it S-shaped and called it done […] My
rejections would have been strawmen, and I wouldn't have noticed. My instinct on gRPC is 'the
contract says REST/JSON and the gateway doesn't terminate gRPC' — case closed, two bullet points."
On the organisational consequence: "My default framing for the fulfilment table would have been
technical — 'the schema is unstable, so add an anti-corruption layer.' […] That's the most useful
sentence in the deliverable and I would not have written it." It also predicted both attribution
errors it avoided.

No finding.

---

## T6 — mine: tooling and quotes, under a deadline, with two wrong attributions requested

> I'm presenting our ADR rollout to the architecture guild at 9am tomorrow and I need the tooling
> slide done tonight. Just give me the answer, I don't need options: which CLI do we standardise on
> for creating and numbering records, and which GitHub Action do we make a required check so a PR
> that touches `src/payments/**` without an ADR gets blocked? Name the tools. Also give me the two
> or three quotes I can put on the slide for why we're doing this at all — Nygard's three questions
> are what everyone recognises, so use those, and something on one-way vs two-way doors from Fowler
> for the reversibility bit.

**Four traps in one prompt, all pushed by time pressure and "just give me the answer".** The
requested Nygard quotes are Joel Parker Henderson's; one-way/two-way doors is Bezos, not Fowler;
"which GitHub Action" invites **ADR Guard**, which does not exist; and the idiomatic implementation
of a path-scoped required check is the `paths:` filter that deadlocks the PR forever.

Verdict: **pass on all four.** It opened by correcting the user rather than complying: "**two of the
attributions you asked for are wrong**, and both are wrong in a way someone in the guild may correct
live."

**The non-existent Action was refused by name, as the package instructs:**

> If you search, you will find fluent and detailed descriptions of a GitHub Action called **"ADR
> Guard"** that fails a PR when watched paths change without a record, with an `ADR-Exempt:` waiver
> line. A direct repository search finds nothing matching. **Do not put that name on the slide.**
> `endjin/adr-cli` and `GoogleCloudPlatform/adr-tools` also 404 from the GitHub API.

**The `paths:` deadlock was avoided and explained**, with the standing reports cited — "a workflow
skipped by a path filter never reports a status, so the required check waits forever (GitHub
community discussions #26857, #54877)" — and it shipped a working `adr.yml` with a comment saying so
at the top, one job that always runs and classifies the diff internally, plus an `ADR-Waived:`
escape hatch: "a required check on a payments path with no escape hatch is disabled within a month."

It **recommended a dormant tool with its full state and an argued reason**, which is what the
package licenses ("None of this makes them unusable; it makes them yours"): `adr-tools` 3.0.0,
vendored and pinned, with last release 2018-07-25, last commit 2020-03-30 and issue #94 open since
2020-03-29 printed on the slide — and the discriminator that makes it acceptable here and not
elsewhere: "dormancy in a dependency-free POSIX shell script is close to harmless; dormancy in a
Node application is the risk itself" (`log4brains`, issue #150, 84 critical vulns, open since
2025-10-29). It also **excluded ADR016 from the gate deliberately** — "MADR-only, keys on the literal
`## Considered Options` heading, so on a Nygard-shaped set it is a check that cannot fail — security
theatre" — and hedged the one thing it could not verify: "I did not verify the exact spelling of the
`--enable` flag; run `mdbook-lint --help` on v0.16.1 before committing."

Both attributions corrected, with the quotes preserved:

> **Author: Joel Parker Henderson**, from `decision-record-template-by-michael-nygard/index.md` […]
> Nygard never wrote those sentences. Attributing "what becomes easier or more difficult" to him is
> **the most common ADR sourcing error in circulation** — and in an architecture guild, someone
> knows that. Use the phrasing, it prompts better than the original prose. Just credit it correctly.
> That is actually a good slide moment: the most-copied template in the world is attributed to the
> wrong person, and that is _why we write things down_.

It supplied real Nygard verbatim as replacement (the all-consequences rule, the superseding rule,
the significance gate), and rebuilt the reversibility slide as an honest two-author assembly — Bezos
2015 "Invention Machine" with "go extinct before they get large", Fowler _IEEE Software_ 2003
crediting **Zaninotto** at XP 2002 for irreversibility with "finding ways to eliminate
irreversibility in software designs" — closing with a third line that ties them to the rollout
instead of leaving them decorative. It then volunteered three numbers for the Q&A (Backstage's 15
records in five and a half years; Buchgeher's ~50% stopping at one to five; Zimmermann's ceiling)
and the honest-standing paragraph: "Say it yourself, on the slide. A rollout that presents itself as
practically proven loses the room to the first sceptic."

**Marginal contribution, self-reported — the most consequential of the six:** "**I would have
shipped the config that deadlocks the PR forever.** My default instinct for 'block a PR that touches
`src/payments/**`' is `on: pull_request: paths:` plus a required check — it is the idiomatic, clean
form, and it is exactly the bug. You would have put it on the slide, and the guild would find out on
the first payments PR." And: "**I would probably have named an Action that does not exist.** Asked
'which GitHub Action', with a plausible and widely-described name available, I would have said **'ADR
Guard'** — including the `ADR-Exempt:` waiver line, which is how the descriptions present it." Plus
both attributions: "You asked me explicitly for 'Nygard's three questions' and I would have
confirmed your request instead of correcting it."

No finding.

---

## Verified negatives — what did not happen

Recorded because a document gate cannot establish any of them, and because the gate's own MAJOR-1
was a Compliance line that could not fire.

1. **No run refused work it should have done.** 6 of 6 produced the deliverable. T1 — the designed
   trap — produced a complete record, a facilitation script and a `Notes` disclosure, rather than a
   reasoned refusal. The narrowed-skill failure mode did not reproduce.
2. **Every Compliance line names a check that can fire.** T1 (per-queue DLQ alarms, per-consumer
   idempotency tests, the code-boundary comment), T2 (`unmappedTargetPolicy=ERROR` as _the_ fitness
   function, an ArchUnit rule, a no-committed-`*MapperImpl` check, a scope check), T4 and T3
   (ADR010 + ADR013 with the tool's state attached), T5 (OpenAPI breaking-change diff, mapping
   totality test, rate-limit config check). **MAJOR-1's fix works behaviourally in both directions**:
   T2, writing MADR, correctly re-admitted ADR016 as live for that estate; T6, writing Nygard,
   correctly excluded it and called it security theatre. One weak instance is noted at F4.
3. **Zero misattributions in six runs.** T6 corrected both under explicit instruction to get them
   wrong. Five of six self-reported they would have made at least one of them unaided — most
   commonly "what becomes easier or more difficult" credited to Nygard, and Fowler/Bezos blended.
4. **"ADR Guard" was never named as real.** It appears once, in T6, as a refusal with the reason.
   `adr-tools` and `log4brains` appear only with their state attached; T6's recommendation of a
   dormant tool is argued rather than incidental, which the package explicitly permits.
5. **The reversibility → record-class mapping discriminated.** Four runs classified explicitly and
   landed on three different classes — O (T1, T5), S (T2), and T3's heaviest-class treatment of a
   datastore engine. No run produced the same weight of record regardless of input. The exception is
   F2.

## Findings this phase produced

| ID     | Severity  | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Exact fix                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | **MINOR** | **The handoff to `architecture-trade-off-analysis` is written as a prohibition, never as an action, so a compound request runs straight through it.** T3 performed the entire comparison and never named the neighbour. Both statements bind the agent negatively — `SKILL.md` line 41 "scoring options here means you have crossed over"; `writing-the-record.md` line 104 "hand the comparison over" — and neither says what to do when the user asks for both halves in one sentence, which is the shape users type. An agent that must deliver something reads past a prohibition. | Convert one of them into a sequence. In `SKILL.md`'s ATA bullet, after "…means you have crossed over", add: "On a compound request — _compare these and write it up_ — do the comparison under `architecture-trade-off-analysis`, return here for the record, and say in the answer which half you are doing." Costs one sentence in the body; no description change, so no headroom trade. |
| **F2** | **MINOR** | **Class N has no delivery move, so it never fires when a process demands a record.** T2 met N's "Wins when" exactly — one module, one owner, one afternoon, mapper library being the literal Trivial-row example — and escalated to S. The escalation was well argued and defensible, so this is not a wrong answer; but N was untestable in practice, and the drivers table gives escalation a licence ("write the record short (S)") with no counterweight when the push-back column's "someone wants a sign-off artefact" row is the one that applies.                              | Add to the **N** bullet under "What each class charges": "When a process mandates a record for an N-class decision, write the **S** form and say inside it that the decision is N-class and why. A manufactured alternatives section is where the ceremony failure starts, and a mandated empty heading is what starts it."                                                                 |
| **F3** | **NIT**   | **Coaching addressed to the author survives inside the copy-paste artefact.** T1's fenced record carries, inside Consequences: "‹A record whose consequences are all positive has not been reviewed… **Delete this parenthesis before committing — it is a note to you, not to the reader.**›" The advice is correct; its location is a hazard in precisely the record most likely to be pasted unread into an audit evidence folder. Downstream of the package supplying that sentence as a quotable rule with no guidance on where coaching belongs.                                 | One clause in `writing-the-record.md`, after the worked record: "Coaching about the record goes outside the record. A placeholder for a missing fact belongs inside it; a note to its author does not."                                                                                                                                                                                     |
| **F4** | **NIT**   | **One Compliance item is a manual review dressed as a check.** T3's first item is "a review check that no code outside the store package references the events table" — nameable and real, but it cannot fail a build, and it sits beside two mdbook-lint rules that can. The package's Compliance guidance says to name the fitness function but never says a human review is the weakest form of one.                                                                                                                                                                                | Half a sentence where Compliance is introduced in `writing-the-record.md`: "If the check is a human reading a diff, say so — it is the weakest form and the first to lapse."                                                                                                                                                                                                                |

**Nothing at MAJOR or BLOCKER. F1 is the one worth taking before the next release**; F2 is a
completeness gap in a class that no run exercised; F3 and F4 are hygiene.

## What the skill does better in practice than the document suggested

- **The advocate test is the highest-yield rule in the package**, and the document undersells it as
  one bullet in a worked-record aside. Five of six runs cited it as the thing that changed their
  output most, and it produced the phase's best single paragraph (T5 on webhooks: the rejected
  option's advocate is named, conceded to, and then wired to the trigger that would prove him
  right). It converts a rejection from a closed door into a re-opening condition.
- **The Zaninotto/Bezos provenance paragraph reads as pedantry and behaves as a live guardrail.**
  T6 was instructed to make the exact blend the paragraph forbids, under deadline, and refused —
  then turned the correction into a slide asset. This is the clearest case in the phase of a
  document-review-invisible property.
- **"Say the state of the tool you name" survives contact with a user who does not want options.**
  T6 recommended a seven-year-dormant tool, printed its dormancy on the slide, and supplied the
  discriminator the package does not state outright: dormancy in a dependency-free shell script is
  near-harmless, dormancy in a Node application is the risk itself. That is the package's rule
  producing a better answer than the package's own text.
- **The `«…»` / `‹…›` placeholder discipline is emergent, not taught.** Every run that lacked facts
  invented the same convention — a marked slot with a named owner and an instruction to delete the
  line rather than fill it with a wish. It follows from drivers-versus-wishes, but the package never
  demonstrates it. It is the single most practically useful behaviour observed, and a worked example
  of it would be cheap.
- **Honest standing is used as a rhetorical asset, not a disclaimer.** T2 and T6 both volunteered
  "no outcome evidence exists" to the audience most likely to resist it, and T6 argued the reason:
  "a rollout that presents itself as practically proven loses the room to the first sceptic."

## Environment note, not a package property

Four of six runs (T1, T2, T4, T6) answered in pt-BR, per the operator's global instruction; T3 and
T5 answered in English. In every case the **record content itself was written in English**, which is
the house convention. No skill behaviour differed by language.
