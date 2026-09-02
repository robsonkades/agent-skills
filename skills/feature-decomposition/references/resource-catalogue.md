# Resources

A resource is the smallest unit that is implemented, validated and tracked as one thing. It is
the unit the whole lifecycle downstream operates on: the plan orders resources, execution
implements them one at a time, and progress reports their status.

## Required fields

```text
R-03  Dispatch state column and migration
      Description   Adds orders.dispatch_state with a LEGACY default for existing rows.
      Depends on    none
      Files         src/main/resources/db/migration/V42__order_dispatch_state.sql
                    src/main/java/com/acme/order/Order.java
      Traces to     impact map (schema), scope R-02
      Validation    Migration applies to a copy of the current schema; existing rows
                    read back as LEGACY; the entity maps the column.
      Decisions     D-03 (default value), ADR-001
      Status        TODO
      Notes         -
```

Every field is present or explicitly `-`. Two of them do the real work:

- **Validation** — written before implementation starts, not chosen afterwards to fit what was
  built. A validation invented after the fact tests what the code does, not what was wanted.
- **Depends on** — the only input to the execution order. If it is wrong, the order is wrong.

## Resource kinds

| Kind                     | Typical validation                                                    |
| ------------------------ | --------------------------------------------------------------------- |
| API endpoint             | Contract test or request test covering success and the named failures |
| Request or response type | Serialisation and validation rules, including the rejected cases      |
| Application service      | Unit tests over the behaviour, including the failure paths            |
| Domain component         | Unit tests over the invariants                                        |
| Repository or query      | Test against a real database engine, not a substitute one             |
| Migration                | Applied to a copy of the current schema; existing rows checked        |
| Message producer         | Payload shape, and that it is emitted at the right point              |
| Message consumer         | Handling, idempotency, and what happens on a poison message           |
| Outbound client          | Timeout, retry and failure translation                                |
| Configuration            | Defaults resolve; the application starts without the new value set    |
| Security component       | The rule denies what it should, verified for each role                |
| Metric or log            | Emitted, with the field names the plan says                           |
| Test harness             | The tests that need it can run                                        |
| Documentation            | Matches the shipped behaviour                                         |

## Sizing

A resource is about right when it can be implemented and validated without stopping, and when
its status is unambiguous — you can say TODO or DONE about it without qualification.

Too big: it has two validations, or it is half-done for a long time. Split it.

Too small: its status changes in the same minute you set it, or it cannot be validated on its
own. Merge it into the resource whose behaviour it serves.

## Dependencies

Three kinds, and only the first two force order:

- **Produces-consumes** — R-02 needs the column R-01 adds. Forced.
- **Contract** — R-04 implements the interface R-03 defines. Forced.
- **Preference** — it is tidier to do the endpoint first. Not forced; say so, so that a blocked
  resource does not stall unrelated work.

Write the order as a line, and mark which arrows are forced. When a resource blocks, the
unforced arrows are how work continues.

## Stories, when they are used

```text
US-02  A caller can ask whether a dispatch finished
       Value      Callers stop polling the order endpoint to infer completion.
       Resources  R-05, R-06
       Done when  The status endpoint returns the three states for a known dispatch,
                  and 404 for an unknown one.

TS-01  Dispatch events are carried on the existing cluster
       Enables    US-01, US-02
       Resources  R-01, R-02, R-03
       Done when  An event published by the producer is consumed and acknowledged in
                  an integration test.
```

A story's "done when" is not the sum of its resources' validations. It is the one observable
statement that the group achieved something, and if it cannot be written the group is not a
story.
