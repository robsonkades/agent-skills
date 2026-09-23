# Resources

A resource is the smallest unit that is implemented, validated and tracked as one thing. It is
the unit the whole lifecycle downstream operates on: the plan orders resources, execution
honors dependency and ownership constraints, and progress reports their status.
Read this for an authorized delivery breakdown or its revision; definition-only child-feature
analysis does not require a resource catalogue.

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

Use fields needed for the feature; a Light item may be one line with identity, scope, applicable
acceptance and validation, retaining relevant prerequisites and shared ownership.
Do not invent impact/decision IDs or populate an unrelated status ledger just to fill the example.
For shared work, identify ownership and files that require coordination. Two fields do the real work:

- **Validation** — written before implementation starts, not chosen afterwards to fit what was
  built. Derive it from the applicable acceptance and contract, including when reconstructing an
  existing resource; a later-written check can still be valid when it tests that obligation.
- **Depends on** — necessary inputs and their readiness criteria. Shared-file conflicts and
  release/validation prerequisites also constrain safe execution; label them explicitly.

## Resource kinds

These are examples of work and evidence, not a required resource per layer. Choose checks that
establish the affected contract; a resource may span several kinds and need integration evidence.

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

A test-coverage outcome or shared integration check may itself be a resource when accepted scope
or a real handoff warrants separate tracking. Name the behavior/criterion it verifies and its
evidence, rather than treating a count of added tests as acceptance. This does not move ordinary
resource-local tests into a separate testing phase or create a child feature by itself.

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

For example, a producer and consumer may be implemented against an agreed contract in parallel,
while their integration check waits for both implementations. Link that common check and its
prerequisites to both resources instead of adding reciprocal implementation dependencies. If the
check is tracked separately, name its owner and link its evidence back to each affected criterion;
keep affected acceptance open until its required evidence exists. A separate check does not waive
that obligation or reopen unrelated acceptance already established by sufficient evidence.

## Revising an existing breakdown

Preserve IDs, criterion links and recorded status/evidence; the `TODO` example applies to new,
unstarted work. Renaming or regrouping a resource does not make it new. For a split or merge,
record the old-to-new mapping and reason without reusing an ID for a different obligation or
deleting history. Update affected dependencies, acceptance and plan/progress links in their existing
records. Mark evidence stale only where changed scope or contracts invalidate it; do not reset
unaffected completed work or copy a parent's `DONE` status onto unverified new children.

## Child features, when they are used

The following is a delivery-stage illustration; it does not require resources during definition.

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
