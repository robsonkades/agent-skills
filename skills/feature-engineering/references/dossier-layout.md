# Dossier layout

## Default

```text
docs/features/<feature-slug>/
├── definition.md      accepted Product/Engineering or Tech Feature revisions
├── analysis.md        discovery, context, scope, impact, options, experiments
├── contracts/         authoritative links or repository-owned specifications
├── plan.md            the executable plan and the resource list
├── progress.md        resource status table — the resumption point
├── execution-log.md   append-only chronology
└── decisions/
    ├── ADR-001-<slug>.md
    └── ADR-002-<slug>.md
```

`<feature-slug>` is lowercase and hyphenated, derived from the feature name, and never renamed
once created — links into it exist in commit messages and in the log.

## Adapting to a repository that already has a standard

Look before creating anything:

| Found                                                      | Do this                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| An existing ADR directory (`docs/adr`, `doc/arch`, `adr/`) | Put decision records there, in the numbering already in use            |
| An existing per-feature or per-RFC directory convention    | Follow it; preserve artefact roles, whatever the file names are        |
| A documentation site with a fixed structure                | Place the dossier where that structure puts working documents          |
| A repository that tracks work only in an issue tracker     | Reuse the authorized record; clarify location only if still unresolved |
| Nothing                                                    | Use the default above                                                  |

Do not create a second ADR numbering scheme next to an existing one. Do not move existing
records to fit the default layout.
Reuse an already authorized artifact location, including an existing issue, before asking where to
write. The diagram shows roles, not a mandatory file count: combine small records and omit unused
directories. External writes still follow the user's authorization and available tool access.

## What each file is for

- **definition.md** — immutable input revision identities, accountable owners, acceptance criteria,
  gaps and approval. New semantic content creates a revision rather than rewriting the baseline.
- **analysis.md** — the current analysis, with dated corrections and prior reasoning retained.
  Update the resolution of an entry rather than leaving contradictory answers looking current.
- **contracts/** — the repository's authoritative contract artefacts or links to an existing
  source of truth. Do not duplicate a contract merely to fit this layout.
- **plan.md** — the living artefact. It changes during implementation, and every change says
  what changed and why.
- **progress.md** — the entry point for resumption: current status, blockers, baseline revisions
  and links to the active plan, decisions, contracts and evidence. Those authoritative records
  must also be current or explicitly stale; read affected records before resuming implementation.
- **execution-log.md** — preserve chronology by appending corrections instead of rewriting past
  outcomes. Avoid secrets and personal payloads. If sensitive content was recorded, follow the
  repository's authorized redaction procedure and retain a sanitized correction trail; append-only
  history does not require preserving exposed sensitive content.
- **decisions/** — ADRs for choices that warrant a separate record; routine decisions stay in
  the existing decision log. Follow the local lifecycle through architecture-decision-making,
  preserving prior rationale when a choice changes.

## Integrate a phase result before handing it on

Keep one authoritative location for each statement; downstream records link to it using the existing
IDs and revisions. A specialist response is an input to this record, not another competing baseline.
Before advancing dependent work:

1. Reconcile the result with the question and source decisions. Preserve qualifiers that change
   behavior: scope, units/defaults, ordering, exceptions, forbidden effects and failure handling.
   For example, “cancel queued exports only; running exports continue” must not become merely
   “support cancellation” in the plan. A conflict returns to its owner; a shorter summary cannot
   silently amend acceptance.
2. Apply the resolved answer or evidence to its existing record, retaining its source, authority
   and status. A proposed option remains proposed; an accepted design is not implemented behavior.
   Keep a material engineering choice in the existing decision log even when it needs no separate ADR.
3. Check the recorded content and links after writing, then update the progress entry with the
   next action and any affected stale or blocked work. Preserve unrelated current results. If the
   authoritative record cannot be read or written, name the limitation and hand off the proposed
   delta explicitly; do not claim it was persisted or silently create a second source of truth.

On resumption, read the progress entry and follow the material links for the next action; do not
replace detailed obligations with the summary. Apply the artefact contract's applicability checks
before reusing a gate or evidence. Missing records leave a reconstruction gap, not proof that an
earlier decision never existed. Reuse supported decisions and ask only for a consequential answer
that the available records cannot establish.

## Bounded lessons

At completion or a material return, retain a lesson only if the observed result could improve a
future decision. In the existing analysis or decision record, link the relevant IDs/evidence and
state the condition, observation, decision implication, limits and what would favor a different
choice. Distinguish a supported lesson from a hypothesis needing another check; one successful
feature does not establish an organizational standard.

Keep lessons scoped to the demonstrated environment and outcome. On reuse, check those conditions
against current evidence. Record any follow-up with its owner and verifiable end state; work outside
the accepted feature remains a proposal, not an automatic scope expansion. Do not create a lesson
for routine work with nothing new to preserve, invent persistent memory, or modify agent instructions
or shared policy merely to retain it.

This adapts the evidence-linked conclusions and concrete actions described in
[Google's postmortem guidance](https://sre.google/workbook/postmortem-culture/); it does not require a
postmortem for every feature or claim that a written lesson has prevented recurrence.

## When there is no dossier

A Light/Inline change writes nothing here. If persistence later becomes Dossier, create it at that
moment and backfill only what is still true — reconstructing a discovery ledger after the fact
produces a justification, and it should be labelled as one.
