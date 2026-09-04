# Building the impact map

## Traversal

For each scope item, walk outward in this order and stop when a ring produces nothing:

1. **The element that changes.** The class, the file, the migration, the config key.
2. **Its callers.** Search for them; do not recall them. Record the count.
3. **Its state.** What it reads and writes — fields, tables, caches, files.
4. **Its contract.** Anything anyone outside the component has coded against.
5. **Its configuration.** New keys, changed defaults, environment differences.
6. **Its cross-cutting attachments.** Security rules, transactions, metrics, logs, traces.
7. **Its tests.** Which existing tests cover it, and what they assert.

The rings matter because impact is transitive in exactly one direction: a change is visible to
whoever depends on the changed thing, not to whatever it depends on.

## Entry shape

```text
IMP-01  <path>[:line]   NEW | MODIFIED | READ   INTERNAL | EXTERNAL   <change> <- SC-01
```

- **NEW** — did not exist. No compatibility question, but a naming and placement question.
- **MODIFIED** — exists and changes. The interesting class.
- **READ** — does not change, but the feature depends on its current behaviour. Include it when
  the dependency is new or heavier than before; that is how a change breaks a file nobody edited.

Visibility is about observability, not about access modifiers. A private field that is
persisted is EXTERNAL, because the stored rows outlive the deployment.

## The layers to sweep

A map that only lists application code is the common incomplete one. Sweep all of these and say
"none" where there is none:

| Layer         | Look for                                                        |
| ------------- | --------------------------------------------------------------- |
| API           | Endpoints, request and response types, validation, status codes |
| Application   | Services, orchestration, transaction boundaries                 |
| Domain        | Entities, value objects, invariants, domain events              |
| Persistence   | Repositories, queries, mappings, indexes                        |
| Schema        | Migrations, columns, constraints, existing rows                 |
| Messaging     | Producers, consumers, topics, payload schemas, ordering         |
| Integration   | Outbound clients, timeouts, retries, contracts                  |
| Configuration | Keys, defaults, per-environment values, secrets                 |
| Security      | Authentication, authorisation rules, data exposure              |
| Observability | Metrics, logs, traces, alerts that reference the changed thing  |
| Tests         | Existing tests that must change; levels that must gain a test   |
| Delivery      | Build, packaging, deployment order, feature flags               |

## Boundary crossings

A crossing is any impact where someone outside the change must agree or must deploy. Record it
separately from the map, because it changes the process rather than the code:

```text
Crossing   IMP-07 Order created event gains a field
Depends    two consumers (billing, notifications)
Needs      backward-compatible addition; consumers tolerate unknown fields (verified
           in their deserialiser configuration) -> no coordinated deploy required

Crossing   IMP-11 orders.status gains a value
Depends    the reporting view groups by status
Needs      the view updated in the same release, or it silently drops the new rows
```

The second entry is the shape that costs a weekend: a change that is compatible at the code
level and wrong at the data level.

## Sizing conclusions the map supports

The map is the input to three later decisions, and it should be read for each:

- **Depth** — a map entirely INTERNAL inside one module supports a lower depth class.
- **Test level** — EXTERNAL entries need a test at the level where they are observed.
- **Risk** — every boundary crossing is a candidate risk entry, with the consumer as its
  detection point.

## What the map is not

Not a design, not an order of work, and not a task list. It answers one question — what does
this touch — and it answers it with paths so that the answer can be checked against the diff at
the end.
