# Resources

A resource is the smallest unit that is implemented, validated and tracked as one thing. It is
the unit the whole lifecycle downstream operates on: the plan orders resources, execution
honors dependency and ownership constraints, and progress reports their status.

## Required fields

```text
RES-03 Dispatch state column and migration
      Description   Adds orders.dispatch_state with a LEGACY default for existing rows.
      Depends on    none
      Files         src/main/resources/db/migration/V42__order_dispatch_state.sql
                    src/main/java/com/acme/order/Order.java
      Traces to     IMP-08 (schema), SC-02
      Validation    Migration applies to a copy of the current schema; existing rows
                    read back as LEGACY; the entity maps the column.
      Decisions     ED-03 (default value), ADR-001
      Owner         <implementation and validation owner when work is shared>
      Status        TODO
      Notes         -
```

Use fields needed for the feature; a Light item may be one line with identity, scope and validation.
Do not invent impact/decision IDs or populate an unrelated status ledger just to fill the example.
For shared work, identify ownership and files that require coordination. Two fields do the real work:

- **Validation** — written before implementation starts, not chosen afterwards to fit what was
  built. A validation invented after the fact tests what the code does, not what was wanted.
- **Depends on** — necessary inputs and their readiness criteria. Shared-file conflicts and
  release/validation prerequisites also constrain safe execution; label them explicitly.

## Resource kinds

| Kind                     | Typical validation                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| API endpoint             | Contract test or request test covering success and the named failures                            |
| Request or response type | Serialisation and validation rules, including the rejected cases                                 |
| Application service      | Unit tests over the behaviour, including the failure paths                                       |
| Domain component         | Unit tests over the invariants                                                                   |
| Repository or query      | Test against a real database engine, not a substitute one                                        |
| Migration                | Applied to a copy of the current schema; existing rows checked                                   |
| Message producer         | Payload shape, and that it is emitted at the right point                                         |
| Message consumer         | Handling, idempotency, and what happens on a poison message                                      |
| Outbound client          | Timeout, retry and failure translation                                                           |
| Configuration            | Optional defaults resolve; required missing/invalid values fail explicitly according to contract |
| Security component       | The rule denies what it should, verified for each role                                           |
| Metric or log            | Emitted, with the field names the plan says                                                      |
| Test harness             | The tests that need it can run                                                                   |
| Documentation            | Matches the shipped behaviour                                                                    |

## Sizing

A resource is about right when it can be implemented and validated without stopping, and when
its status is unambiguous — you can say TODO or DONE about it without qualification.

Too big: distinct outcomes can reach acceptance separately, or an independent handoff is hidden
inside one status. Consider splitting; several tests of one invariant do not imply several resources.

Too small: tracking it adds no independently useful acceptance or handoff. Consider merging into
the behavior it serves. A dependent resource can still be valid: name its fixture, prerequisite
or integration validation instead of requiring it to run in isolation.

## Dependencies

Distinguish dependencies from scheduling preferences:

- **Produces-consumes** — RES-02 needs the column RES-01 adds. Forced.
- **Contract** — RES-04 implements CT-01 defined by RES-03. Forced.
- **Validation/release** — implementation can use an agreed contract or fixture, but final
  integration/release needs the real producer. State the separate gate rather than blocking
  all implementation until the other resource is finished.
- **Preference** — it is tidier to do the endpoint first. Not forced; say so, so that a blocked
  resource does not stall unrelated work.

Record the dependency graph and currently ready resources; give a preferred sequence separately.
Check every referenced ID exists, reject cycles, and distinguish missing evidence from a real
dependency. A blocked node need not stall unrelated work; shared-file ownership still matters.

## Child features, when they are used

```text
PF-02  A caller can ask whether a dispatch finished
       Value      Callers stop polling the order endpoint to infer completion.
       Resources  RES-05, RES-06
       Done when  The status endpoint returns the three states for a known dispatch,
                  and 404 for an unknown one.

TF-01  Dispatch delivery uses the operated cluster with measurable replay/recovery
       Enables    PF-01, PF-02
       Resources  RES-01, RES-02, RES-03
       Done when  A representative event reaches its effect; a consumer restart and
                  replay recover the expected state without duplicate business effects,
                  within the agreed recovery objective on the target cluster configuration.
```

A story's "done when" is not the sum of its resources' validations. It is the one observable
statement that the group achieved something, and if it cannot be written the group is not a
story.
