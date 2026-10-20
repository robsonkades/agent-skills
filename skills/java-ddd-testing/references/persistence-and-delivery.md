# Persistence and delivery boundary

Read when a request asks a domain unit test to prove behavior outside the domain.
This reference defines a handoff, not persistence or messaging implementation rules.
The authorized technical source is `C:/git/ddd-example/domain`; it does not provide
database or broker implementations.

| Requested claim                                      | What a domain test can establish                                                                                   | Missing evidence and owner                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| A factory restores the supplied ID, fields and dates | The selected `with(...)` overload preserves those arguments                                                        | A database round trip needs the real adapter and mapping under a separate infrastructure scope.                                      |
| A gateway persists an aggregate                      | Nothing about storage from an interface alone                                                                      | Identify the domain port separately; persistence tests require the actual adapter contract.                                          |
| An invalid update rolls back                         | The real object's state and exception at the domain call                                                           | `Genre` and `CastMember` mutate before throwing. Database rollback and application acceptance cannot be inferred or redesigned here. |
| A media event reaches a consumer                     | `Video` records the expected local event; `Entity` invokes a callback and clears events after successful iteration | Durable delivery, retry and transaction coordination require implementation evidence outside this domain module.                     |
| A use case authorizes, loads or saves correctly      | The domain behavior it invokes                                                                                     | Application orchestration needs its own scope and implementation evidence.                                                           |

Complete the supported local test and state the external claim that remains unproved.
Do not build an in-memory gateway, add a database/container, invent an outbox or mock
an interface to turn that missing evidence into a domain test. Ask for the intended
scope and source before making application or infrastructure changes.
