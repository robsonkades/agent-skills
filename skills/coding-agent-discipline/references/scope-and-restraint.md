# Scope and restraint

## Where the boundary sits

The deliverable is what was asked for — not less, and not a larger thing you judged to be
better. Three things are inside the boundary without being stated:

- Making the change actually work, including its failure paths.
- Updating what the change breaks — callers, tests, documentation that is now wrong.
- Saying what you did not do.

Everything else is outside it until the user says otherwise.

## Opportunistic improvement versus expansion

The line is the footprint of the change you were asked to make.

**Inside** — do it, mention it in one line:

- Fixing a name in the method you are already rewriting.
- Adding the missing null check on the path you just changed.
- Removing a variable your change made unused.
- Correcting a comment your change made wrong.

**Outside** — report it, do not do it:

- Reformatting the file. Ten lines of change become four hundred, and the review is dead.
- Renaming beyond the change's reach.
- Fixing a bug you noticed in a neighbouring method. It may be deliberate; it certainly needs
  its own test and its own commit.
- Upgrading a dependency because a newer version exists.
- Adding tests to untested code you did not touch — valuable, and a separate piece of work.
- Restructuring "while I am in here".

The test is whether a reviewer, reading the diff against the request, would have to ask "why is
this here?" If so, it belongs in a report, not the diff.

## Overreach patterns that recur

| Pattern                                      | What it costs                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Introducing an interface for one class       | Indirection with no substitution (java-dry-kiss-yagni)                   |
| Adding a config option nobody asked for      | A new supported combination, for ever                                    |
| Generalising for an imagined second case     | The second case never comes, or does not fit the generalisation          |
| Rewriting instead of changing                | Discards undocumented behaviour that was load-bearing                    |
| Adding a dependency to save ten lines        | Supply chain, upgrades, licence, and it must be justified in review      |
| "Improving" adjacent code in the same commit | Makes the real change unreviewable and unrevertable                      |
| Adding defensive checks everywhere           | Noise that hides the two checks that matter (java-defensive-programming) |

## When to stop and ask

Stop when continuing would commit the user to something expensive to reverse, and when you
cannot decide from the code in front of you:

- Two readings of the request produce materially different designs.
- The change requires a new dependency, a schema change, or a public API change that was not
  discussed.
- The correct fix is much larger than the request implies — say so and propose the smaller one
  as well.
- The request appears to contradict an existing convention in the codebase, and you cannot tell
  whether that is deliberate.
- Something in scope is genuinely blocked.

Do not stop for things you can determine yourself: the existing convention, the library
version, whether a method has other callers. Those are searches, not questions.

## When blocked, deliver everything else

A blocked part does not block the rest. Do all the work that does not depend on the answer,
isolate the part that does behind the smallest decision point, and report both together — what
is done and what is waiting, in one message.

Scaling the work down because part of it was hard is the user's call, not yours. If you left
something out, the report must say so in a sentence that cannot be missed.

## Reporting the things you did not do

Three categories, all worth one line each:

1. **Out of scope by decision** — "I did not add the async export job; the cap is a stopgap."
2. **Found but not fixed** — "`OrderMapper.toDto` drops the `cancelledAt` field on line 88;
   unrelated to this change, and it looked deliberate. Not touched."
3. **Unverified** — "The migration is not tested against populated data; no database available
   here."

The second category is where an agent adds the most value at the least cost. Finding a defect
and reporting it costs a sentence; fixing it uninvited costs the review.
