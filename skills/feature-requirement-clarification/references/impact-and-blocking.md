# Impact and blocking

Two independent axes. Impact says how much the answer changes. Blocking says whether work can
continue without it. A question can be HIGH impact and non-blocking, if the work it changes is
not the work about to start.

## Impact

| Impact     | The two answers differ in                                                      |
| ---------- | ------------------------------------------------------------------------------ |
| **HIGH**   | The contract, the execution model, what is persisted, or the failure behaviour |
| **MEDIUM** | Which components exist, their internals, or the order of work                  |
| **LOW**    | Internal naming without contract impact, formatting, or nothing consequential  |

Read the table against evidence. Established absence of material consequences makes a question
unnecessary; inability to identify consequences is not proof of LOW impact. Inspect the smallest
relevant contract, affected path or supplied decision, and record provisional impact with the missing
basis when uncertainty remains. Ask a focused question only if that missing basis needs user input;
keep dependent work conditional while continuing independent work.

## Blocking

A question is BLOCKING for identified work when its missing answer is necessary before that work:

- The next resource requires unresolved material intent, evidence or authority; the authorized
  task and available context do not already settle it or delegate the choice.
- Proceeding would make a consequential commitment that cannot be cheaply reversed within existing
  authority; ordinary delegated choices do not become blockers merely because code could differ.
- The answer decides a contract that other people or systems will start depending on.
- The work would commit to an unresolved security, privacy, compliance or data-retention obligation.
- Proceeding would collect, alter or migrate real data under unresolved semantics or authority.
  Isolated synthetic fixtures or analysis may proceed when they preserve the unresolved options
  and do not commit the missing contract.

A question is NOT blocking when the work it affects is later in the execution order and the
answer can arrive before that point. Say so explicitly: "non-blocking until RES-07".
Recheck that dependency before starting the affected work or after the execution order changes;
the earlier non-blocking label does not authorize crossing it without an answer.

## Worked examples

```text
Q  Should processing be synchronous or asynchronous?
   Impact: HIGH — changes the API contract, the execution model, what is
           persisted, and how failure is reported.
   Status: BLOCKING — the first resource is the endpoint, whose signature differs.

Q  Should the job history be retained for 30 days or indefinitely?
   Impact: HIGH — changes the retention obligation, available history and potential privacy exposure.
   Status: NON-BLOCKING for isolated schema design only if both choices are supported.
           Resolve before collecting/retaining real data unless an authorized interim policy
           covers it; identical writes do not establish permission to retain data.

Q  Should the new endpoint be under /api/v1 or /api/v2?
   Impact: HIGH when clients depend on the public path or compatibility behavior.
   Status: Resolve against the accepted API/versioning policy before exposing the endpoint.
           Existing /api/v1 examples alone do not authorize a contract choice; internal
           work independent of the path may proceed.

Q  Should we use Lombok for the new DTOs?
   Impact: LOW for reusing the existing record convention when it fits the DTO contract,
           design is delegated and no authoritative requirement mandates Lombok.
   Status: Not asked for that routine choice. Introducing a dependency or changing DTO
           construction/serialization contracts needs its own consequence assessment;
           repeated records alone establish neither policy nor compatibility.
```

## Handling a blocking question

1. Stop dependent work. Do not start affected implementation on a placeholder.
2. Write the question with both consequences.
3. Say what continues meanwhile — usually the non-dependent resources — and what does not.
4. Record it in the progress artefact as a blocker with the decision it needs, so the state
   survives the end of the session.

An answer that arrives partially — "probably async, but check with the platform team" — is not
an answer. Record it as still blocking, with the owner named.

## When an answer requires evidence

First identify what is missing. Stakeholder expectations establish desired outcomes; technical
verification needs evidence against the requirement, such as inspection, analysis or testing
([NASA: stakeholder expectations](https://www.nasa.gov/reference/4-1-stakeholder-expectations-definition/),
[verification methods](https://www.nasa.gov/reference/5-3-product-verification/)). These distinguish
the evidence needed; they do not impose another lifecycle or approval process.

- "The report must be fast" lacks a usable target. Reuse an applicable SLO or ask the outcome owner
  what delay and workload matter; do not invent a numeric acceptance threshold from a benchmark.
- The same report with an accepted p95 target of 500 ms under a specified workload has a settled
  target. If current capacity is unknown, seek applicable measurements or a bounded check instead
  of asking the owner to confirm that the database can handle it. Preserve the target if an
  experiment fails; changing it is a separate decision with its own authority.

When existing evidence cannot resolve a material feasibility claim, hand off to
`feature-feasibility-experiment` with the unknown, affected decision, accepted requirement and
constraints, evidence already checked, and what supported, refuted or inconclusive results change.
Expect a scoped result with evidence and limitations, or a concrete evidence plan if execution is
not requested or available. If that skill is unavailable, report the same minimal next evidence
action and unresolved claim without inventing a result. Experiment design and execution remain
within the authorized task; a request only to clarify requirements ends with this handoff.

Missing tools, access or representative inputs leave the technical claim unresolved. Stop only
the commitment that needs that claim; continue authorized independent analysis. Do not run a PoC
to settle a missing business decision, or label an option infeasible merely because it was not tested.

## Handling an unanswerable question

Sometimes nobody knows. Then:

- Separate missing intent or authority from missing empirical evidence using the route above.
- Identify the accountable role and the phase/resource that cannot proceed.
- Prefer the reversible option only within existing authorization, including routine choices
  implied by the authorized task. Reversibility alone does not authorize a new contract or scope.
- Otherwise keep it blocked. An explicitly accepted `GAP-*` may permit only the work covered by
  its authority, consequence, owner, expiry and reopening trigger; recording a gap alone clears nothing.
- Record any temporary choice as an assumption with its basis, scope and falsifier; contain it so
  reversal is bounded. Link an `ED-*` when an engineering decision is being tracked in the existing
  lifecycle record. A simple Inline clarification can use a concise sourced note without creating
  a dossier or a new identifier scheme.
