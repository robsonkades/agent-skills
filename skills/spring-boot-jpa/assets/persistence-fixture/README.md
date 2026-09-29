# Inventory persistence example

Use this example when implementing a managed update or an edit conditioned on the
version a client previously read. Start with
[InventoryService](src/main/java/example/persistence/InventoryService.java): it injects a
concrete Spring Data repository, loads the current entity and changes it inside
`@Transactional`. Boot supplies the datasource, entity-manager factory and transaction
manager. There is no separate persistence framework to copy.

The two operations deliberately have different contracts:

```java
service.reserve("A", 3);                       // command against current stock
service.changeNote("A", clientVersion, null); // conditional edit; null clears the note
```

`reserve` updates available stock and adds an owned movement in the same transaction.
`changeNote` checks the client's earlier version before changing the current managed
entity; Hibernate's `@Version` still protects a race after that check. Neither operation
reconstructs a detached entity or overwrites omitted description/stock fields.

The repository's `findWithMovementsBySku` uses a derived predicate and `@EntityGraph`
when the caller needs the movements as well. Ordinary `findById` keeps its usual fetch
plan. This example makes no promise about a universal query count or collection paging.

Both entities keep reference equality because these operations do not compare detached
copies or place transient entities in hash collections. Sequence generation uses provider
defaults for this disposable schema. Existing production sequences still require matching
mapping, migration and writer contracts; copying this entity is not a migration plan.

## Run in isolation

The baseline is Java 25, Maven, Boot 4.1.1 and its managed Hibernate 7.4.5.Final/H2 2.4.240.
Copy this directory **without any `target/` output** to a temporary working directory:

```text
mvn -B -ntp test
```

Prerequisites: JDK 25, Maven and access to the declared artifacts or a prepared local
repository. Maven writes `target/` in the copy and dependencies in its local repository;
use `-Dmaven.repo.local=<temporary-cache>` for isolated dependency storage. Do not build
in the installed skill directory. The tests select an in-memory H2 URL and disposable
`create-drop` schema, start no HTTP server/container and connect to no existing database.
Do not copy `create-drop` into production configuration.

## What the tests establish

[InventoryServiceTest](src/test/java/example/persistence/InventoryServiceTest.java) exercises
the actual service proxy and repository. Tests have no surrounding test-managed transaction:
after a service call returns, repository queries read committed state in a new context.
Boot's `TransactionTemplate` creates an explicit failing unit for the rollback test, so
the application does not need a fake `reserveThenFail` method.

The only manual entity managers create **two overlapping persistence contexts** for the
optimistic-conflict case. They share Boot's factory, close deterministically and roll back
active transactions even when an assertion fails. This controls the stale-read interleaving;
it is not a template for routine service code or a parallel load test.

Seven tests cover:

- A reservation commits stock and its movement while preserving description.
- A failure after flush rolls back both changes, checked after transaction completion.
- A stale client version is rejected even though the service loads fresh state.
- A current version permits an edit and then explicit clearing with a refreshed version.
- A missing version cannot bypass the conditional edit.
- Two transactions reading the same version cannot both commit their reservation; only
  the winner's stock and movement remain after the loser's rollback.
- An optional note round-trips null and its length limit; an oversized edit preserves
  the previously committed note and version.

Read the Surefire results, not only the process exit. These checks cover this H2/provider
setup. They do not establish SQL Server/PostgreSQL binding, pessimistic lock timeouts,
pagination plans, custom equality, auditing or load behavior. Conditional guidance for
those tasks stays in the skill's references and must be verified in the consuming project.
The note edit does not implement HTTP `If-Match`, authorization or conflict UI policy.

## Mapping decisions worth carrying into a project

Field access applies. Conventional names/types stay implicit; annotations express material
constraints. Column metadata does not prove a deployed constraint or validate every input.

| Attribute             | Contract and owner                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory.sku         | Assigned String ID, up to 40 UTF-16 code units in this example; fixed after creation. The nullable version lets Spring Data identify a new assigned-ID entity. |
| Inventory.version     | Provider-owned nullable Long before insertion; non-null in stored rows. Never assigned from a request.                                                         |
| Inventory.description | Required String, at most 200 UTF-16 units; note/reservation commands preserve it.                                                                              |
| Inventory.available   | Nonnegative int controlled by the reservation rule. A Java primitive cannot represent SQL NULL; the annotation does not create a business CHECK by itself.     |
| Inventory.note        | Optional String, at most 500 UTF-16 units; null, empty and omitted commands have distinct meanings.                                                            |
| Inventory.movements   | Inverse one-to-many, cascade and orphan removal only because the children belong to this inventory item.                                                       |
| Movement.id           | Generated Long; defaults are sufficient for the fixture's generated sequence/schema.                                                                           |
| Movement.inventory    | Required LAZY owning association, immutable `inventory_sku` FK; no cascade to the parent.                                                                      |
| Movement.quantity     | Positive int; guarded on creation and excluded from ORM updates.                                                                                               |

No public API DTO, generic entity interface, tuned pool, auditing configuration or dialect
adapter is required to demonstrate these operations. Add one only when the actual project
contract calls for it. Match database length units, constraints and migrations when adapting
the example; H2 success alone cannot establish those contracts elsewhere.
