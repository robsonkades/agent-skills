# Depth, persistence, and phases

## Classify depth by the highest evidenced driver

Evaluate every applicable driver; do not stop at the first or choose the lower plausible class.

### Deep

- new runtime technology, infrastructure component, or external integration;
- public/breaking API, event, data, or operational contract;
- data migration or coexistence across incompatible versions;
- material security, privacy, payment, legal, or compliance consequence;
- feasibility that needs a PoC;
- costly/irreversible decision or several independent authority domains.

### Standard

- several components or more than one module;
- an existing shared/internal contract changes compatibly;
- a meaningful option or operational choice survives;
- a regulated concern is touched but its obligations are established and contained;
- impact, ownership, or failure behavior needs explicit analysis.

### Light

All must hold: one local outcome, known behavior, one authority domain, reversible, no new dependency,
no boundary/schema change, and no material decision.

An unknown material driver prevents Light until resolved. State depth and all drivers, not only the
largest. Identify the narrow evidence needed to resolve it; uncertainty alone does not prove a Deep
driver. Keep the classification provisional and start independent analysis while it is unresolved.

## Classify persistence separately

- **Inline** — work completes in one session/owner and a cold reader does not need intermediate state.
- **Dossier** — work crosses sessions or owners, or depth is Standard/Deep.

A Light feature handed to another person is Light/Dossier. A Deep feature completed in one session is
Deep/Dossier. Persistence changes where state lives, not how risky the feature is.

## Which phases each depth runs

| Phase                  | Light                       | Standard                                        | Deep                                                       |
| ---------------------- | --------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Definition intake      | baseline or concise input   | versioned baseline                              | versioned Product/Engineering or Tech baseline             |
| Discovery              | inline                      | written                                         | written                                                    |
| Repository context     | touched files               | targeted report                                 | targeted report plus authority sources                     |
| Clarification          | only consequential gaps     | adaptive rounds                                 | adaptive rounds plus challenge                             |
| Scope                  | one boundary statement      | scope items                                     | scope items and revision impact                            |
| Architecture impact    | only if boundary appears    | impact map                                      | impact map and independent parties                         |
| Solution analysis      | only if real choice         | real choices only                               | every material choice                                      |
| Feasibility experiment | no                          | reclassify if a decision-relevant PoC is needed | bounded experiment only when its result changes a decision |
| Decision/ADR           | local line if needed        | material choices                                | material choices and cross-boundary ADRs                   |
| Contract definition    | no boundary, so none        | each changed boundary                           | each changed boundary and coexistence                      |
| Decomposition          | none or RES-* only          | RES-*; child features only if valuable          | RES-*; child features only if independently valuable       |
| Risk                   | specific discovered risk    | risks above LOW and boundary candidates         | full derived register                                      |
| Implementation plan    | inline                      | concise dossier plan                            | full dossier plan                                          |
| Readiness              | concise intake/finish check | selected applicable gates                       | full applicable gates                                      |
| Execution/progress     | ordinary execution          | tracked RES-*                                   | tracked RES-*                                              |

Applicability still wins: a Deep feature with no persisted data marks migration concerns N/A with
evidence; it does not invent a migration section.

## Enter at the missing result

Use the requested endpoint and available records to choose the next work. The forward spine describes
dependencies; it does not require replaying valid work or loading the whole suite.

| Current situation                                        | Next useful work                                                                                                        | Evidence needed before advancing                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Intent is still an idea                                  | Co-author the missing definition                                                                                        | Accepted intent and accountable authority for the relevant scope                                                    |
| Intent is accepted, but a fact or choice prevents a plan | Route the specific gap through discovery/context, clarification, or solution/experiment as appropriate                  | A sourced answer or explicit unresolved dependency; current acceptance criteria and changed contracts               |
| A plan is ready and implementation is requested          | Check scoped readiness, then execute the next ready resource                                                            | Applicable gate result and inputs, resource dependencies, planned validation                                        |
| Work is being resumed                                    | Read progress and its relevant source records; check applicability before selecting the next resource or focused return | Current scope, decisions, code/configuration and evidence supporting that transition                                |
| Implementation is reported finished                      | Review completion against the accepted baseline                                                                         | Observed evidence for completion, or explicit failed/unverified criteria                                            |
| Only a review is requested                               | Review the supplied artefact or change within that scope                                                                | Sources supporting findings and the review's coverage limits; do not require implementation to finish a plan review |

For the next transition, identify the needed input that is absent, stale or disputed and the phase
that can establish it. If the input is already sufficient, consume it instead of commissioning a
duplicate report. An existing plan does not prove readiness; an old gate does not prove current
completion. Preserve the requested endpoint even when other lifecycle work remains.

Do not bounce an unchanged unknown between phases. A return must identify what new evidence,
decision or correction it needs, who can supply it, and which work depends on it. If nothing can
resolve it now, retain the blocker and continue independent ready work. A new document or another
question round is useful only if it can change that state.

## Adapt the next analysis step

Choose the unresolved question most likely to change the next authorized decision. First inspect
available repository/session evidence; route remaining product choices to their accountable owner
and technical unknowns to the relevant analysis or experiment. Ask together only questions that can
be answered independently; use each answer to decide whether a follow-up is needed. Depth does not
set a fixed number of questions, rounds, options or documents.

Stop clarification for the stated scope when consequential questions are resolved, shown irrelevant,
or covered by valid accepted gaps that its gate permits. When another round would repeat the same
unknown without new evidence or an available decision-maker, record the missing input, dependent IDs,
owner and next evidence step. Keep dependent work blocked and continue independent ready work;
elapsed effort is neither an answer nor permission to assume one. Reopen clarification when a new
finding changes the answer or reveals a material dependency.

## Reclassification

Escalate immediately when a new driver appears and run only newly required or invalidated work.
De-escalate only when evidence removes the driver; record the evidence and preserve completed artefacts
as history. Never discard analysis to make the current classification look inevitable.
