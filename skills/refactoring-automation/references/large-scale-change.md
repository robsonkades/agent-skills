# Landing a large-scale change

A change spanning more files than a reviewer can read is approved on trust unless you
replace line-by-line review with something stronger. This file is how.

## Reproducibility is the review

State in the commit message the exact command and the pinned recipe version, so a reviewer
can check out the parent commit, run it, and diff the result against the commit. Identical
means the review reduces to reviewing the recipe — one artefact, with tests. That is the
whole trade.

It only holds if nothing else is in the commit. One hand-fix, one IDE auto-import, one
formatter pass, and the diffs no longer match; the reviewer cannot tell your correction
from the tool's error, and falls back to trusting you. Corrections go in a follow-up
commit, which is small and _is_ reviewable line by line.

Two things routinely break reproducibility by accident: an unpinned recipe or plugin
version, and a formatter whose output depends on the local IDE settings rather than a
checked-in configuration.

## Verifying semantics at scale

Tests are necessary and, at this scale, not sufficient — a suite that covers 60% of a
codebase covers 60% of a 3000-file change. Add evidence that scales:

- **Bytecode or API-surface diff.** For a change that should be semantically null — a
  rename with no visible surface, a formatting pass, an import reorganisation — compile
  before and after and compare. `japicmp` or `revapi` over the two jars reports public API
  differences; an empty report is real evidence. For a rename, expect exactly the renamed
  symbols and nothing else.
- **Compile every downstream consumer** you can reach, without recompiling them against
  the change first. That is the only check that catches a binary-compatibility break
  (java-refactoring's `compatibility.md`).
- **Diff the generated artefacts that encode behaviour**: the OpenAPI document, the
  Hibernate-generated schema, the emitted SQL for a representative workload, the serialised
  form of a few representative payloads. These catch what unit tests do not observe.
- **Spot-check by category, not at random.** Group the changed files by the shape the tool
  matched, and read one from each group. Twelve deliberate files beat forty random ones.

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

A repo-wide change conflicts with every open branch, and the conflicts are unresolvable by
the usual means: the branch author has no way to know how the recipe would have rewritten
their new code.

- Announce it, land it in one short window, and make it the only thing landing then.
- The resolution instruction for branch owners is not "merge and fix conflicts" — it is
  "merge, take the mainline side, then re-run this exact command on your branch". That
  restores the property that the branch's code went through the same transformation.
- Prefer landing after in-flight work merges, not before. Coordination cost is a real cost:
  a technically correct refactoring that burns a week of five people's rebase time may be
  the wrong engineering decision this month (technical-debt-decisions).

## Keep `git blame` usable

A mechanical commit that touches every file destroys line-level history for everyone. Fix
it in the same change, not later:

```bash
git log -1 --format=%H >> .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

The file is honoured by `git blame` locally once configured and by the major forges
automatically. It only works if the commit really was mechanical — another reason not to
mix in hand-edits.

## Rollback

Before landing, know which of the two situations applies, because they have different
answers:

- **Code-only, no persisted or wire consequence** — `git revert` of the mechanical commit
  is sufficient and is the plan. Verify it reverts cleanly _before_ landing, while the
  branch is still cheap.
- **The change touched a schema, a serialised form, a message payload or a published API**
  — revert does not undo what was written or consumed while it was live. That change is not
  a large-scale refactoring; it is a migration, and it needs expand/contract sequencing and
  its own rollback plan (architecture-refactoring-paths).

Deciding which one it is happens before the recipe runs, not after the diff exists.
