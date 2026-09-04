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
largest.

## Classify persistence separately

- **Inline** — work completes in one session/owner and a cold reader does not need intermediate state.
- **Dossier** — work crosses sessions or owners, or depth is Standard/Deep.

A Light feature handed to another person is Light/Dossier. A Deep feature completed in one session is
Deep/Dossier. Persistence changes where state lives, not how risky the feature is.

## Which phases each depth runs

| Phase                  | Light                       | Standard                                | Deep                                           |
| ---------------------- | --------------------------- | --------------------------------------- | ---------------------------------------------- |
| Definition intake      | baseline or concise input   | versioned baseline                      | versioned Product/Engineering or Tech baseline |
| Discovery              | inline                      | written                                 | written                                        |
| Repository context     | touched files               | targeted report                         | targeted report plus authority sources         |
| Clarification          | only consequential gaps     | adaptive rounds                         | adaptive rounds plus challenge                 |
| Scope                  | one boundary statement      | scope items                             | scope items and revision impact                |
| Architecture impact    | only if boundary appears    | impact map                              | impact map and independent parties             |
| Solution analysis      | only if real choice         | real choices only                       | every material choice                          |
| Feasibility experiment | no                          | only for a blocking uncertainty         | whenever evidence cannot decide                |
| Decision/ADR           | local line if needed        | material choices                        | material choices and cross-boundary ADRs       |
| Contract definition    | no boundary, so none        | each changed boundary                   | each changed boundary and coexistence          |
| Decomposition          | none or RES-* only          | RES-*; child features only if valuable  | valuable child features plus RES-*             |
| Risk                   | specific discovered risk    | risks above LOW and boundary candidates | full derived register                          |
| Implementation plan    | inline                      | concise dossier plan                    | full dossier plan                              |
| Readiness              | concise intake/finish check | selected applicable gates               | full applicable gates                          |
| Execution/progress     | ordinary execution          | tracked RES-*                           | tracked RES-*                                  |

Applicability still wins: a Deep feature with no persisted data marks migration concerns N/A with
evidence; it does not invent a migration section.

## Reclassification

Escalate immediately when a new driver appears and run only newly required or invalidated work.
De-escalate only when evidence removes the driver; record the evidence and preserve completed artefacts
as history. Never discard analysis to make the current classification look inevitable.
