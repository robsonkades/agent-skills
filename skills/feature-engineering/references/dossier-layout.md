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

| Found                                                      | Do this                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| An existing ADR directory (`docs/adr`, `doc/arch`, `adr/`) | Put decision records there, in the numbering already in use          |
| An existing per-feature or per-RFC directory convention    | Follow it; keep the five artefact roles, whatever the file names are |
| A documentation site with a fixed structure                | Place the dossier where that structure puts working documents        |
| A repository that tracks work only in an issue tracker     | Ask where the artefacts should live before writing files             |
| Nothing                                                    | Use the default above                                                |

Do not create a second ADR numbering scheme next to an existing one. Do not move existing
records to fit the default layout.

## What each file is for

- **definition.md** — immutable input revision identities, accountable owners, acceptance criteria,
  gaps and approval. New semantic content creates a revision rather than rewriting the baseline.
- **analysis.md** — everything established before the plan. It is written once and then
  amended with dated notes; the amendments are what make it trustworthy later.
- **contracts/** — the repository's authoritative contract artefacts or links to an existing
  source of truth. Do not duplicate a contract merely to fit this layout.
- **plan.md** — the living artefact. It changes during implementation, and every change says
  what changed and why.
- **progress.md** — the only file that must be current at all times. An agent picking the work
  up reads this first and needs nothing else to know where to resume.
- **execution-log.md** — append-only. Entries are never edited or deleted, because the value is
  the chronology; a correction is a new entry.
- **decisions/** — one file per decision, superseded rather than rewritten.

## When there is no dossier

A Light/Inline change writes nothing here. If persistence later becomes Dossier, create it at that
moment and backfill only what is still true — reconstructing a discovery ledger after the fact
produces a justification, and it should be labelled as one.
