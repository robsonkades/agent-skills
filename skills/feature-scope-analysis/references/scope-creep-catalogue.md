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
| A retry or a cache                   | Reliability and speed are good  | Is there an evidenced requirement or failure model, and is this mechanism safe for it?   |
| Refactoring code the feature reads   | It is right there and it is bad | Does the feature need the change to be correct?                                          |
| Upgrading a dependency               | It is out of date               | Is an upgrade necessary after considering supported alternatives, and authorized?        |
| Extra test levels                    | Coverage is good                | Does the risk of this change justify this level?                                         |
| A migration to the newer pattern     | Consistency is good             | Does this feature's correctness depend on it?                                            |
| Renaming for clarity                 | The name is wrong               | Does agreed behavior or safe implementation require it, or is it incidental cleanup?     |
| Backfilling missing tests            | The gap is real                 | Is this evidence needed to establish changed behavior or a material regression risk?     |
| Handling a case nobody asked for     | It could happen                 | Does the contract, trust boundary or credible failure model require handling it?         |

Two cases need particular care when assessing prerequisites:

- **Validation** sufficient for changed behavior and material regression risks is Required;
  existing checks may suffice. File proximity alone neither requires every missing test nor makes
  a necessary regression check optional. Unrelated coverage gaps remain Out of scope.
- **A dependency upgrade** is a proposed prerequisite only when the target's actual resolved
  version cannot support the requirement and viable supported alternatives have been assessed.
  Record compatibility costs and authority; a preferred API does not authorize upgrading Java,
  a framework or a library. Resolve a prohibited upgrade against scope before dependent work.

## The "while we are in there" rule

The instinct is correct — the cost of coming back is real. The answer is not to fold the work
in, because it makes the change harder to review and harder to revert, and it hides the feature
inside a diff of unrelated edits.

Instead record its location and consequence as Out of scope, or Future work when it depends on
this feature. A separate commit does not authorize incidental work. Execute only within existing
authorization; do not create commits merely because this catalogue suggests separation.

## Detecting creep after the plan exists

Three prompts for investigation, none of which alone proves creep:

1. **Unmapped changes.** Attribute changes against the initial working tree and other contributors'
   work before comparing with the impact map. Necessary missed impact is not automatically added
   scope; unrelated changes can also hide inside a planned file. Preserve others' edits.
2. **A resource whose description contains "and".** Check whether it combines independent outcomes
   or names inseparable parts of one obligation; grammar alone does not decide decomposition.
3. **The estimate moved but the requirement did not.** Check new scope, revised assumptions,
   discovered complexity and dependency delays separately. An estimate change is not scope proof.

## Recording a reclassification

```text
C-04  Structured logging for the new consumer
      Was: Required
      Now: Recommended
      Reason: required correlation and failure diagnosis are covered by existing
              logging and validated queries; no mandatory standard requires a new format.
              Structured fields improve query convenience but are not needed for acceptance.
      Consequence if dropped: the consumer is diagnosed the same way as the rest
              of the system, which is worse than the alternative but not new.
```

The consequence line is what makes dropping it a decision rather than an omission.
