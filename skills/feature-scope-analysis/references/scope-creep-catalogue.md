# Scope creep catalogue

Additions that arrive without a requirement behind them. Each entry gives the shape, the reason
it feels justified, and the test that settles it.

## The catalogue

| Addition                             | Why it feels right              | Test                                                                                     |
| ------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------- |
| A dashboard or a metrics page        | Operability is good             | Did anyone name an operational question it answers?                                      |
| A configuration switch               | Flexibility is cheap            | Is there a second value anyone will set? Who, and when?                                  |
| An interface with one implementation | Decoupling is good              | Is there a second implementation, a test double that needs it, or a boundary it crosses? |
| A generic version of the thing       | It will be needed again         | Is there a named second caller today?                                                    |
| A retry or a cache                   | Reliability and speed are good  | Is there a measured failure or latency requiring it?                                     |
| Refactoring code the feature reads   | It is right there and it is bad | Does the feature need the change to be correct?                                          |
| Upgrading a dependency               | It is out of date               | Does the feature need the new version?                                                   |
| Extra test levels                    | Coverage is good                | Does the risk of this change justify this level?                                         |
| A migration to the newer pattern     | Consistency is good             | Does this feature's correctness depend on it?                                            |
| Renaming for clarity                 | The name is wrong               | Does the rename fit in a separate commit? Then it is one.                                |
| Backfilling missing tests            | The gap is real                 | Is it in the code this feature changes? Then Required. Otherwise separate.               |
| Handling a case nobody asked for     | It could happen                 | Can anyone say when it has happened, or will?                                            |

Two of these flip to **Required** in a specific circumstance, and it is worth being precise:

- **Tests** for the behaviour this feature adds or changes are Required. Tests for behaviour it
  merely touches are Recommended. Tests for unrelated gaps are Out of scope.
- **A dependency upgrade** is Required when the feature cannot be implemented on the current
  version, and the plan says which API forces it.

## The "while we are in there" rule

The instinct is correct — the cost of coming back is real. The answer is not to fold the work
in, because it makes the change harder to review and harder to revert, and it hides the feature
inside a diff of unrelated edits.

Instead: record it as a finding with its location, put it in Future work, and if it is genuinely
small and genuinely safe, do it as a **separate commit before or after** the feature, never
mixed into the feature's commits.

## Detecting creep after the plan exists

Three signals, in order of reliability:

1. **A file in the diff that no resource names.** The strongest signal, and it is mechanical:
   compare the touched files against the plan's file list.
2. **A resource whose description contains "and".** Usually two resources, one of which was not
   requested.
3. **The estimate moved but the requirement did not.** Something entered scope. Find it.

## Recording a reclassification

```text
C-04  Structured logging for the new consumer
      Was: Required
      Now: Recommended
      Reason: no requirement or risk names it; the project logs unstructured
              everywhere else (context report, 14 occurrences, no counter-example),
              so this feature would be the only structured logger in the system.
      Consequence if dropped: the consumer is diagnosed the same way as the rest
              of the system, which is worse than the alternative but not new.
```

The consequence line is what makes dropping it a decision rather than an omission.
