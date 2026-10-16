# Verifying aggregate persistence contracts

Read when implementing a gateway, mapper, concurrency protocol or test double.
Reuse the target's test framework, fixtures and database harness. The cases below
are acceptance guidance, not claims that tests ran in the consuming project.

## Round trip outside the first persistence context

Create a representative root with non-default identity, timestamps, nullable
lifecycle fields, value objects and multiple owned children. Persist and commit,
clear/close the initial persistence context, then reload through the domain port
in a fresh transaction. Assert:

- Business identity, persisted revision and complete owned state match their
  documented storage representation; unchanged technical IDs remain unchanged.
- Audit times preserve recorded facts with declared storage precision. Advance the
  test clock between save/load so an accidental `now()` mapping fails visibly.
- Child identities and order survive when meaningful; removed children are removed
  only as intended and cannot be reassigned to another root accidentally.
- Reconstitution records no newly raised events. Saving an aggregate with pending
  events preserves the application's agreed capture/outbox contract.
- A missing identity returns absence, while a controlled storage failure and corrupt
  persisted value follow their separate error contracts.

Do not assert only `aggregate.equals(reloaded)`: an entity equality method often
compares ID alone. Compare relevant fields and subsequent behavior. A test that
reads from the same first-level cache does not prove database round-trip fidelity.

## Concurrency and transaction evidence

Use the production database engine/version where its semantics matter, with a
temporary schema/container under the project's harness. Coordinate competing
transactions using barriers/latches at specific steps, not sleeps:

| Case                                                                                    | Required observation                                                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Two loaded copies update revision N                                                     | One accepted change; the stale update returns the specified conflict and cannot overwrite committed state |
| Two copies at nine lines each add a different tenth line                                | Root invariant remains true; child-only paths cannot both commit an eleventh line                         |
| Two transactions edit distinct child rows whose combined values have a root constraint  | Shared root protocol protects the combined invariant, even when neither root scalar changes               |
| A failure occurs after the root write but before child/outbox completion                | No partial aggregate or required outbox change is committed                                               |
| Flush succeeds and a later transaction step fails                                       | Caller receives failure and a fresh transaction observes rollback                                         |
| Two creates use the same normalized natural key within one tenant                       | Exactly one succeeds; the other receives the defined duplicate outcome                                    |
| Strict create receives an ID already belonging to a persisted root                      | Defined collision outcome; the existing root and its children remain unchanged                            |
| Update-only receives a missing ID, including deletion after a preflight existence check | No insert or resurrection; the defined missing/conflict outcome reaches the caller                        |
| The same key appears in two permitted tenant scopes                                     | Behavior matches scoped uniqueness, with no cross-tenant read/write exposure                              |
| A root or child changes between separate load queries                                   | Loaded aggregate satisfies the declared consistency protocol rather than combining incompatible revisions |

For a version-checked load, pause after reading the root at N, commit a root/child
change at N+1 in another transaction, then resume child loading and the revision
check. Verify the final check reaches storage and the whole load retries or fails;
another `find` returning the managed N instance must not make this test pass. With
a verified snapshot alternative, require a coherent N result instead of demanding
N+1. Include enabled persistence/query caches in the relevant setup.

Test a stale delete or concurrent deletion if delete is in the changed contract.
Do not infer missing versus stale from a zero-row update without the contract's
defined discrimination. Do not require exact exception classes from the application
that belong only to the persistence adapter; assert the translated outcome too.

For tenant-aware persistence, supply an ID owned by another tenant to lookup,
update and delete. Assert no disclosure or mutation under the defined access policy.
Use trusted scope in the test entry instead of letting the request choose its own
tenant. Include a wrong-parent child identity if child ownership can be supplied.

## Fakes must expose missing saves

A fake storing `Map<ID, Aggregate>` references can make a use case that forgets
`save` appear correct. Store immutable snapshots or independently copy the root and
every mutable child on write; reconstitute independent objects on read. A shallow
list copy does not isolate mutable elements. Immutable value objects may be shared.

Run these cases against the fake and the real adapter where applicable:

1. Save A, then mutate the caller's A without another save. A fresh read is unchanged.
2. Load B and C independently; mutate B without save. C and a fresh read are unchanged.
3. Save a valid update of B. A fresh read sees the new state; C retains its old snapshot.
4. Attempt to save stale C. The defined conflict occurs if that is part of the port
   contract; a fake must not silently implement last-write-wins instead.
5. Reconstitute after persistence. No new domain events or current-time audit facts
   appear solely from loading or copying.

Capture snapshots through explicit persisted state or a dedicated copy/reconstitution
path. Copying via public business transitions changes semantics. Do not let the fake
own a second set of business rules; those still run in the aggregate. Its contract
tests cover observable port behavior, not database locks, transaction propagation
or every provider exception.

## Boundary and reporting

When dependencies change, verify no domain/application production type imports JPA,
Spring Data, the concrete gateway, or framework pagination. Check signatures as well
as method bodies. An architecture rule must select the actual packages and reject a
temporary known violation in an isolated fixture; an empty selection proves nothing.

Report commands, executed test counts, relevant engine/provider versions and any
skipped tests. Separate mapper/unit evidence, fake contract evidence and database
commit/concurrency evidence. A passing fake test or H2 run does not establish the
production database's isolation or constraints. A proposal with these cases written
but unexecuted remains a proposal with a verification plan.
