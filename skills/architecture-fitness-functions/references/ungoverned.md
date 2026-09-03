# What cannot be governed, and how to record that

Read before declaring a characteristic ungoverned, or before accepting a proxy as governance for a
composite. The whole reference applies one criterion: **the result and escalation rule must be
reproducible enough that independent reviewers can explain any disagreement.** Judgement does not
disqualify a check; hidden judgement does. Record the rubric, evidence, confidence and human owner
when a binary metric would discard the characteristic that actually matters.

## The decomposition procedure

_Fundamentals_ ch. 6 names three reasons characteristics resist definition: they are **vague**,
**inconsistently defined** across departments, and **composite** — built from smaller
characteristics. Run this in order.

1. **Say the name out loud and ask what number would settle it.** If the answer is a list of things,
   it is a composite. Agility decomposes to modularity, testability and deployability; reliability
   to availability, testability, data integrity, data consistency and fault tolerance.
2. **Govern each constituent** with metric + threshold + site + consequence.
3. **Write the residual down.** Complexity under a limit is a proxy for maintainability: passing it
   does not make the system maintainable, and failing it is weak evidence that it is not. Everything
   about maintainability that complexity does not capture is ungoverned. The green build will imply
   otherwise unless a sentence says so.
4. **Ask whether the obstacle is measurability or timing.** Ford's failover case is perfectly
   objective — did the system stay up when the database died? — but running it on every build is
   unacceptable. That is a scheduled or manual check, not an absent one. Conflating the two lets
   teams file measurable things under "can't be automated".
5. **If the composite is maintainability**, `catalogue.md` carries the decomposition worked end to
   end — five constituents, the row that governs each, and the residual none of them see.
6. **Consider a lagging outcome measure** where no leading one exists. Ben Morris (18 Jun 2018):
   feature lead time, deployment frequency, time to onboard a customer, support incident volume and
   uptime _"reveal actual architectural fitness better than structural analysis"_. Treat these as
   reviewed measures, not gates — they trail the change that caused them.

## The judgement-bound categories

From Mahato, Sieczkowski & Kuppusamy, _Agentic Fitness Functions_, InfoQ, 17 Aug 2026 — the most
concrete published inventory of what deterministic checks cannot see.

| Category                    | What it looks like                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Boundary fidelity**       | semantic coupling and eroded ownership that violate no stated rule                      |
| **Semantic contract drift** | an API that stays backward-compatible while ceasing to express the right domain concept |
| **Workflow coupling**       | hidden coordination paths between services that no dependency graph shows               |
| **Stale ADR assumptions**   | a recorded decision whose premises no longer hold operationally                         |

Their key sentence: _"A dependency rule can show that a service interaction changed; it cannot always
tell whether the change represents intentional collaboration or accidental coupling."_ And the
failure mode a suite creates for itself: **every change individually passes every rule while the set
of changes collectively moves the implementation away from the intended architecture.**

Their proposal — LLM advisory checks with versioned rubrics, confidence scores and escalation to
humans, with deterministic gates remaining the governing control — is one 2026 article, not a
practice with a track record. Report it; do not adopt it as settled.

A fifth gap, from Ben Morris (2018), is not a category but an absence: _"discussions around fitness
functions rarely mention areas such as user experience or customer satisfaction."_ Nothing in the
taxonomy forbids a UX fitness function; the practice simply does not produce them, because the
measurable surface of a codebase is structural and the measurable surface of a user is not.

## The register

One file, per quantum, next to the ADRs. It is the artefact `handing it back` reads aloud, and the
one the script checks. JSON so that a check needs no dependency.

```json
{
  "quantum": "order-intake",
  "reviewed": "2026-08-27",
  "entries": [
    {
      "id": "FF-04",
      "characteristic": "security",
      "governance": "T",
      "metric": "max CVSS among resolved dependencies; count matching CISA KEV",
      "threshold": "the score and window in SEC-POL-3; zero KEV at any score",
      "site": "pull request; nightly on the released artefact",
      "consequence": "merge blocked; nightly opens a ticket due inside the policy window",
      "owner": "order-intake tech lead",
      "review": "2027-02-01"
    },
    {
      "id": "FF-06",
      "characteristic": "availability",
      "governance": "C",
      "metric": "SLI success ratio over the rolling 28-day window",
      "threshold": "the 99.9% already promised to customers — borrowed, not chosen",
      "site": "production, continuously",
      "consequence": "deploys freeze when the error budget is spent",
      "owner": "order-intake tech lead",
      "review": "2027-02-01"
    },
    {
      "id": "FF-11",
      "characteristic": "elasticity",
      "governance": "T",
      "metric": "error rate and p99 during a synthetic arrival step to the 90-day peak",
      "threshold": "error rate under the intake SLO; p99 within the measured scale-out window",
      "site": "nightly against staging — a PR gate cannot warm an autoscaler",
      "consequence": "nightly failure blocks the release train until triaged",
      "owner": "order-intake tech lead",
      "review": "2027-02-01"
    },
    {
      "id": "FF-14",
      "characteristic": "deployability",
      "governance": "M",
      "metric": "change failure rate over the rolling month",
      "criterion": "reviewed by the platform lead; a rise over two consecutive months opens work",
      "cadence": "monthly",
      "lastVerdict": "2026-08-04",
      "owner": "platform lead",
      "review": "2027-02-01"
    },
    {
      "characteristic": "maintainability",
      "governance": "none",
      "risk": "complexity and coverage are proxies; boundary erosion inside a module is unseen",
      "owner": "order-intake tech lead",
      "review": "2027-02-01"
    }
  ]
}
```

Five entries, because the ADR's Compliance line cites five: FF-04, FF-06, FF-11, FF-14 and the
ungoverned one. `id` is the handle the ADR quotes; the script ignores it, and a register whose ids
do not match its ADR is a record two people will read differently.

Rules the script enforces, each of which is a failure this skill exists to prevent:

- **`governance` is one of `T`, `C`, `M`, `none`** — `none` is mode **U**. Anything else is a characteristic somebody meant
  to come back to.
- **A governed entry needs `metric`, `threshold` (or `criterion` for `M`), `site` (or `cadence`) and
  `consequence`.** A metric with no consequence is a dashboard — the OWASP `failBuildOnCVSS` case.
- **An `M` entry needs a `lastVerdict` inside one cadence period.** A manual check whose verdict has
  lapsed has silently become ungoverned, and nobody was told.
- **Every entry needs an `owner` and a `review` date that has not passed.** This is the temporal
  axis applied to the register itself: nothing about a stale governance record changes when code
  changes, so only a clock can catch it.
- **`governance: none` needs `risk`** — one sentence naming what is exposed. Without it the entry is
  indistinguishable from an oversight, which is exactly what declaring it ungoverned is meant to
  prevent.

No source states the ungoverned entry as a practice. It is this skill's construction, and it is the
only one that survives the objectivity criterion without pretending: the alternative is a
characteristic on the list, no check anywhere, and a green pipeline implying otherwise.

## The ADR wording

The register holds the state; the ADR holds the decision and the reason.

```text
Consequences  Maintainability is NOT governed. Complexity ≤10 and coverage on new code exist and
              are proxies: they do not observe boundary erosion inside a module, and we accept
              that. Reconsidered if a second team starts merging here, or if two consecutive
              incidents are traced to a module nobody owns.
              Owner: order-intake tech lead. Review: 2027-02-01.
```

Two sentences do the work: **what is not seen**, and **what would change the answer**. An ungoverned
entry with no reversal trigger is a decision nobody can re-open, which is the failure the whole
practice was invented to fix.

## Review cadence

_BEA_ ch. 2: **"Review your fitness functions at least once a year."** Off-cycle triggers: market or
customer growth, a new business capability, an overhaul of an existing area. Business and technical
stakeholders both attend, and the four questions are: are the current ones still relevant; does the
scale or magnitude of a measure need to change; is there a better way to test this; what new ones
does the system need. Add a fifth, from the objectivity criterion: **which entries are ungoverned,
and does anyone still accept that.**
