# Contracts at ports

Read when introducing a port, changing an adapter, or explaining why a nominally
interchangeable integration changes application behavior.

## Start with a conversation

Identify who initiates the interaction and what outcome that actor needs. A driving port
offers an application capability such as placing an order; a driven port supplies a needed
capability such as reserving inventory. Both are expressed from the application's perspective.
HTTP, JDBC and a vendor SDK are implementation mechanisms, not port ownership criteria.
[Cockburn](https://alistair.cockburn.us/hexagonal-architecture) distinguishes driving and
driven actors and describes ports by the purpose of their conversation.

Group operations that share meaning and lifecycle. Split when consumers need different
authority, consistency or capabilities; one huge `ExternalServices` interface hides those
differences. Conversely, an interface for every mapper and value object adds no boundary.
Choose command/result names from the use case rather than cloning an external client.
Keep the external protocol's independent evolution inside its adapter.

For a material operation, make the following contract discoverable in its types, tests or
nearby documentation. A routine operation can express these in a few sentences:

- Who may invoke it, with what trustworthy actor/resource context and preconditions.
- Which inputs are valid; what absence means; whether returned values are immutable snapshots,
  live handles or streams; whether order and precision matter.
- Which effects occur together and when success is final or only accepted for later work.
- Which conflicts and infrastructure failures callers must distinguish; whether retry is safe.
- Who owns time limits, cancellation, transactions, acquired resources and cleanup.

Do not hide a material behavior merely because Java's method signature cannot express it.
For example, `void save(Order)` does not tell callers whether it inserts, overwrites,
conditionally updates, or commits before returning.

## Preserve distinctions that determine action

| Outcome                  | Contract implication                                                                                                  | Defect to reject                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No matching value        | `Optional` or an explicit absent result can be appropriate. Include authorized lookup scope.                          | Returning empty for connection failure; leaking existence across tenant boundaries.             |
| Invalid command          | Reject before effects; transport format errors stay at the adapter, domain invariants stay in the application/domain. | Only the HTTP DTO validates a rule also required for batch input.                               |
| Forbidden operation      | Check the resource-level permission on all allowed entry paths using trustworthy identity/context.                    | Trusting an identity or role taken directly from a request body.                                |
| Duplicate or stale state | Specify key/version, accepted winner and whether this is replay, conflict or rejection.                               | Treating every integrity violation as a duplicate; check-then-insert without an atomic arbiter. |
| Dependency unavailable   | Identify which outcomes are known, expose an appropriate application failure and retain diagnostic cause internally.  | Reporting success or absence to conceal an outage.                                              |
| Completion unknown       | Reconcile by a stable operation identifier or apply the agreed idempotency protocol before retry.                     | Assuming a timeout proves that a remote write did not happen.                                   |

Exception versus result type is a compatibility decision, not a hexagonal law. Prefer the
existing convention when it preserves the distinctions callers need. Check mapping into
HTTP status, job outcome and retry policy together when changing error representation.
Do not log sensitive payloads or return raw SQL/client exception messages to callers.

## Two entries must preserve one application policy

An HTTP adapter may authenticate a principal, bind JSON and convert an application result
to a response. A controlled import adapter may establish a service actor, parse a row and
invoke the same operation. Neither may recreate the business decision independently.
The application must enforce the agreed permission and invariant for both. A shared
method is insufficient if one caller bypasses its protected/decorated entry point.

Passing `Actor` as a plain Java value supports core isolation but does not authenticate
that actor. Establish its provenance in each adapter; distinguish an in-process trusted
caller from an exposed protocol. A test-supplied actor proves policy evaluation for that
input, not security of credential verification. Moving a rule into the core does not
remove the need for malformed-payload, authentication and public-error tests outside it.

Prefer immutable command/result values where callers share data. Check collection copies
and element mutability; a record alone does not deep-freeze its components. Avoid coupling
the core to servlet request lifetimes or thread-local security lookup simply to save an
argument. Inspect established context propagation before crossing threads.

## Substitution includes state, time and resources

A fake can implement deterministic examples of absence, duplicates and successful reads.
It often lacks database isolation, collation, ordering, numeric coercion, locking and
failure semantics. Use shared conformance tests for the promised subset, then exercise
real adapter-specific constraints with the intended engine and configuration. If an
adapter cannot meet the contract, exposing another method with the same name is insufficient.

For mutable state, assign the concurrency decision: an atomic conditional write, version
check or database constraint may be necessary. Decide whether ordering is stable and
whose view of time supplies timestamps/expiry. Keep a fake honest by documenting its
limited concurrency model; do not grow a miniature database merely to simulate one.

A port returning a fully materialized bounded value keeps its adapter's connection lifetime
internal. Streaming may be required for volume, but then specify who consumes/closes,
whether iteration can fail after method return, thread affinity, cancellation and bounds.
An adapter must not close the resource before consumption or leave it open after failure.
Neither a generic `Stream` nor a reactive type makes those obligations disappear.

Use a synchronous contract when the caller needs the final result and its resources permit
bounded work. Choose an asynchronous contract only with a defined completion/failure owner,
context propagation, shutdown and overload policy. Do not add futures or retries as an
architectural embellishment. A local interface does not establish delivery after a crash,
exactly-once effects, replacement compatibility or any performance improvement.
