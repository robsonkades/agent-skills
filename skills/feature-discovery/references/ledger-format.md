# Ledger format

## Entry shapes

Illustrative entries, not claims about this repository. Replace sources with evidence from
the actual feature and use its existing identifier convention. Missing approval stays missing.

```text
FACT   F-01  At revision abc123, the controller returns the created resource inline.
             Source: src/main/java/com/acme/order/OrderController.java:41 at abc123.
             Scope: code path inspected; production behaviour not observed.

FACT   F-02  The user asked for "asynchronous processing", naming no technology.
             Source: request message, 2026-09-02

ASSM   A-01  "Asynchronous" means the caller receives an acknowledgement and the work
             may complete after the initial response.
             Basis: provisional reading of the request, not an accepted contract.
             Falsified by: the required response must wait for completed processing.
             Reliance: current outcome wording; no implementation decision yet.

UNK    U-01  Whether the caller needs to observe completion, and how.
             Impact: HIGH — decides whether a callback, a status endpoint or nothing
             at all is part of the contract.
             Resolution needed: sourced completion needs from the accountable Product role.

DEC    ED-01 Records live in docs/features/async-order-processing/.
             Owner: engineering; proposed by agent (no existing convention found under docs/).
             Status: proposed. Source: agent proposal; accountable-owner acceptance pending.
```

Identifiers are stable for the life of the feature. Later phases cite them — a plan that says
"RES-03 exists because of U-01" is auditable; one that repeats the prose is not.
An unresolved unknown explains risk, not authorization to implement a chosen answer. Link
downstream work to the accepted resolution as well. Polling is compatible with asynchronous
processing and does not itself falsify A-01.

## Impact, defined by consequence

| Impact     | Test                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | Plausible answers materially change scope, acceptance, contracts, security, data, failure behaviour or architecture |
| **MEDIUM** | Plausible answers change bounded internal work, sequencing or operational details without a high-impact consequence |
| **LOW**    | Plausible answers do not materially change delivery, acceptance or operation                                        |

Impact describes the consequence of getting the answer wrong, not its probability or how
much code changes. A one-line authorization rule can be HIGH. When consequences are not yet
established, state a provisional classification and the missing basis rather than inventing
two equally likely answers. Clarification owns prioritization and gap handling.

## Resolving an entry

Append; never overwrite:

```text
UNK    U-01  Whether the caller needs to observe completion, and how.
             Impact: HIGH
             RESOLVED 2026-09-03 -> FACT F-09: a status endpoint is required.
             Source: Product owner answer, round 1, accepted definition revision PD-02.
             Authority: established Product owner for this behaviour.
```

The resolution says where the answer came from. Three sources are not interchangeable: **the
repository** (evidence), **a participant** (intent plus their established authority), and **the
agent** (a proposal that still needs the accountable role when consequential). Use supplied
evidence of scope, authority and supersession to incorporate an established resolution;
conversational recency alone does not establish one.

When sources remain incompatible, facts about what each source says can coexist; their
mutually exclusive claims about the system cannot both be established for the same scope.
Keep the effective value or requirement as UNKNOWN with links to both sources and the
consequence of choosing incorrectly. Mark an affected prior claim as disputed while retaining
its history, and identify downstream entries that relied on it as needing revalidation.
Hand off the unresolved conflict to context or clarification instead of silently picking a
source, replacing the old claim, or reopening a resolution already supported by the input.

Distinguish a dispute from a demonstrated correction. Suppose A-03 says "every order creation
request uses an interactive-user credential" and E-02 relies on it. A supplied, attributable
trace of a scheduled job creating an order with a service-only credential in that same
environment/revision refutes A-03. Append its refuted status and the bounded observed fact;
mark E-02 for revalidation. A trace from a
different environment does not refute the original scoped claim: record it separately and
retain the applicability gap. In neither case does the trace establish all creation paths or
the intended authorization policy. Do not repurpose A-03's ID for a replacement explanation.

## Evidence coverage and changed assumptions

Use these checks when importing a prior ledger or a supplied investigation result. They
classify the available evidence; they do not authorize a new repository sweep or experiment.

**The inherited citation.** Preserve the source chain: what supplied report or ledger was
read, what underlying evidence it cites, and any missing access or coverage. A report with
adequate scoped methods and results can support a fact without rerunning the investigation;
a bare citation to unavailable evidence cannot establish its contents. Retain the old entry
and ID, but mark its current support unresolved when the supplied material cannot establish
the proposition. Do not claim to have inspected the underlying evidence. Two summaries that
both repeat one incident report are not two independent observations. This distinction uses
[W3C PROV's derivation and revision concepts](https://www.w3.org/TR/prov-primer/#derivation-and-revision),
without requiring a provenance graph or a new storage format.

**The explanation that became a fact.** "Three participants abandoned the export screen"
is an observation if the supplied sessions support it. "They abandoned it because export
is slow" is a candidate explanation, not the same fact. If nobody relies on that explanation,
keep it under the unknown cause; if a proposal assumes it, record the assumption and reliance.
Where supplied evidence also makes confusing navigation plausible, use the handoff below
instead of prescribing a faster implementation. This separation of observations from
interpretation follows
[GOV.UK's research-analysis guidance](https://www.gov.uk/service-manual/user-research/analyse-a-research-session#extract-observations).

**The same zero with different coverage.** A supplied sample of request logs contains zero
retry events. Record that observation with its time range, sampling and detection limits;
whether any retries occurred outside that coverage remains unknown. If instead the supplied
evidence establishes a complete audit of all client attempts for that interval, with a method
that detects retries, the narrower claim "no retries occurred in that audited population and
interval" can be a fact. Neither supports "the client can never retry" or "retries are forbidden".
Do not infer complete coverage just because the query returned zero rows or exited successfully.

**The carried-forward estimate.** A prior estimate E-01 relies on assumption A-02 that traffic
resembles last month's workload. New input adds bulk imports. Retain A-02's basis and falsifier,
link E-01 as known reliance, and mark its applicability to the new workload for revalidation.
The estimate is not newly verified by having a source, nor necessarily disproved; the available
evidence no longer justifies carrying it forward unchanged. Preserve unaffected sourced facts.
If nothing yet relies on an assumption, say so or omit the reliance field; do not invent tasks.

This use of traceability to identify affected conclusions draws on
[NASA's requirements-management guidance](https://www.nasa.gov/reference/6-2-requirements-management/).
It supports following dependencies when inputs change, not imposing NASA's lifecycle or an
approval process on this feature ledger.

## Make a material unknown usable by its next owner

For a consequential unknown with competing explanations, identify what different observation
each would predict. Propose a focused check of that difference, reusing available evidence
before requesting new collection. Say which entry or dependent decision the result could
change. If the check cannot distinguish the explanations, choose another evidence need or
state why none is yet available. This does not require probabilities, an experiment plan or
a check for every unknown. Clarification still owns question order and accepted gaps.

For the export example, an illustrative handoff is:

```text
U-04: Why did the three observed sessions end without an export?
Current support: session summary records abandonment; navigation and latency are candidates.
Next evidence: for those same sessions, correlate the export action, request start/end and
               abandonment point with session notes. Reuse captured records if they exist.
Distinction: abandonment before an export request does not support waiting for that request
             as the explanation. Abandonment during a long pending request makes waiting
             plausible, but does not establish the cause without the session context.
Limit: missing events or unrelated aggregate timings leave U-04 open; both causes may coexist.
Reliance: D-02's proposal to speed up export assumes latency; its claimed benefit is unverified.
Return: scoped evidence and remaining uncertainty linked to U-04 and D-02, not a queue design.
```

The check changes when the gap changes: if the request behaviour is already established but
the required completion time is missing, more timing traces cannot establish that requirement.
Pass the intended-use scenario and missing target to clarification instead. If the supplied
inputs already settle the proposition, record the resolution without creating another check.
Choosing evidence to answer a specific question follows
[GOV.UK's research-planning guidance](https://www.gov.uk/service-manual/user-research/plan-user-research-for-your-service#choose-relevant-research-activities);
the example is a proposed handoff, not an executed investigation or proof of a cause.

## Two failure shapes to check the ledger against

**The confident ledger.** Check whether each fact is supported by its cited source and
whether that source establishes code, observed behaviour or stated intent. A request or
decision need not be printable by a command. Do not invent unknowns simply because a short,
well-evidenced request has none.

**The exhaustive ledger.** Forty unknowns, all MEDIUM. Impact was assigned by how uncertain the
answer feels rather than by what it changes. Re-derive consequences and merge duplicates;
neither count nor uniform classification alone proves the ledger wrong.

## What does not belong here

- Options and trade-offs — the solution phase owns those.
- Task lists — decomposition owns those.
- Newly selected implementation designs. Existing design constraints and recorded decisions
  may belong as sourced facts/decisions; discovery does not choose new ones.
