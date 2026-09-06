# Landing a large-scale change

A change spanning more files than a reviewer can read is approved on trust unless you
replace line-by-line review with something stronger. This file is how.

## Reproducibility supports the review

State in the commit message the exact command and the pinned recipe version, so a reviewer
can reproduce the exact starting state, including relevant uncommitted changes, in an isolated
checkout and compare results. Matching diffs establish repeatability; they do not validate
every match, runtime contract or omitted source set.

Record automated stages, deterministic formatting and manual corrections separately so a
reviewer can reproduce and inspect each. Fix known defects before integration; separate commits
are useful only when authorized and compatible with the repository's delivery policy.

Two things routinely break reproducibility by accident: an unpinned recipe or plugin
version, and a formatter whose output depends on the local IDE settings rather than a
checked-in configuration.

## Verifying semantics at scale

Tests are necessary and, at this scale, not sufficient. Global coverage does not establish
coverage of changed behavior, nor assertion quality. Add evidence suited to the change:

- **Bytecode or API-surface diff.** For a change that should be semantically null — a
  rename with no visible surface, a formatting pass, an import reorganisation — compile
  before and after and compare. `japicmp` or `revapi` over the two jars reports public API
  differences; an empty report is real evidence. For a rename, expect exactly the renamed
  symbols and nothing else.
- **Test source and binary compatibility separately.** Recompile consumer sources against
  the new artifact for source compatibility; execute previously compiled consumers with the
  replacement artifact for binary linkage, complemented by API analysis. Neither alone proves
  reflection, serialized/wire or behavioral compatibility (java-refactoring's `compatibility.md`).
- **Diff the generated artefacts that encode behaviour**: the OpenAPI document, the
  Hibernate-generated schema, the emitted SQL for a representative workload, the serialised
  form of a few representative payloads. These catch what unit tests do not observe.
- **Spot-check by category.** Cover match shapes, overloads, inheritance and unusual inputs;
  inspect exceptions and unexpected scope changes individually. A fixed sample count is not proof.

## Stage it

Land a large change in slices that each build, test and ship on their own — one module, or
one package at a time — rather than as one commit that must be all-or-nothing. A slice that
turns out wrong is reverted alone, and the migration survives being paused for a sprint,
which it will be.

Where the old and new forms must coexist across slices, make the intermediate state
legitimate rather than broken: the old form delegating to the new one, with the delegation
deleted in the final slice. An intermediate state with undefined behaviour is not a stage,
it is an outage waiting for the pause.

## Surviving in-flight branches

A repo-wide change can conflict with in-flight work. Preserve both branches' intent and
record which input state the transformation expects.

- Coordinate an integration window through existing authorized channels when needed.
- Do not blindly take the mainline side: that can discard feature changes. Preserve/rebase the
  feature edits in an isolated branch, resolve intent-aware conflicts, and rerun the pinned
  transformation where applicable. Check idempotence and the final combined behavior.
- Prefer landing after in-flight work merges, not before. Coordination cost is a real cost:
  a technically correct refactoring that burns a week of five people's rebase time may be
  the wrong engineering decision this month (technical-debt-decisions).

## Keep `git blame` usable

A broad mechanical commit can obscure blame. If repository policy uses an ignore file,
add the verified mechanical commit ID in a later authorized change; it cannot contain its own
final commit hash. Inspect an existing configuration before modifying it:

```bash
# Substitute the verified mechanical commit ID, not whichever commit happens to be HEAD.
git show --stat "$MECHANICAL_COMMIT_ID"
# Add that ID to .git-blame-ignore-revs according to repository policy.
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

Local `git blame` uses the configured file; hosting support varies. Do not hide semantic
corrections in ignored revisions merely because a tool generated most of the diff.

## Rollback

Before landing, know which of the two situations applies, because they have different
answers:

- **Code-only, no persisted or wire consequence** — reverting the patch can restore code,
  but verify intervening dependencies and deployment compatibility. Test reversal in isolation before landing, while the
  branch is still cheap.
- **The change touched a schema, a serialised form, a message payload or a published API**
  — revert does not undo what was written or consumed while it was live. That change is not
  a large-scale refactoring; it is a migration, and it needs expand/contract sequencing and
  its own rollback plan (architecture-refactoring-paths).

Deciding which one it is happens before the recipe runs, not after the diff exists.
