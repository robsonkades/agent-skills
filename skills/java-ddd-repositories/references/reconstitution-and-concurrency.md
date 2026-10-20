# Reconstitution and concurrency boundaries

Read when a domain Gateway task touches aggregate restoration or makes claims
about persistence guarantees. Evidence is the domain source at commit
`8d964ce4106c2299164e28980ae7553e2afbdc92`; paths below are relative to
`domain/src/main/java/com/robsonkades/admin/catalogo/domain/`.

## Preserve the actual restoration path

Creation factories generate an identity and current timestamps. The `with(...)`
overloads accept existing state. Recreating a loaded root via `newCategory`,
`newGenre`, `newMember` or `newVideo` would change those facts. Keep the overload
appropriate to the supplied data; do not invent `restore`, `AuditInfo` or revision
fields to standardize these APIs.

| Source                       | `with(...)` contract relevant to the boundary                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category/Category.java`     | Field overload takes `CategoryID`, name, description, active, createdAt, updatedAt and deletedAt. Constructor requires non-null ID/creation/update times; it does not invoke `CategoryValidator`. Copy overload passes these facts through the field overload.              |
| `genre/Genre.java`           | Field overload takes `GenreID`, name, active, `List<CategoryID>`, createdAt, updatedAt and deletedAt. Constructor calls `selfValidate()`. Field overload retains the supplied list; copy overload creates a new list.                                                       |
| `castmember/CastMember.java` | Field overload takes `CastMemberID`, name, `CastMemberType`, createdAt and updatedAt. Constructor calls `selfValidate()`. Copy overload calls that constructor too.                                                                                                         |
| `video/Video.java`           | Field overload takes the ID, scalar/audit state, five media fields and three typed-ID sets, passing `null` as the event list. Copy overload creates new ID sets and passes the source's existing events to the constructor. Neither invokes `VideoValidator` automatically. |

Do not state that restoration always bypasses validation or always clears events.
`Genre` and `CastMember` execute their validators during construction, including
`with(...)`. `Category` and `Video` expose explicit validation. Preserve this
distinction instead of changing it as part of Gateway work; detailed validation
belongs to `java-ddd-domain-services` and aggregate construction to
`java-ddd-aggregates`.

`Entity.java` copies a supplied event list into its own `ArrayList`, or starts empty
when given `null`. Consequently `Video.with(Video)` preserves the buffered events
in a distinct list, while its field-based `with(...)` starts with no buffered
events. The `with(existing)` overloads for Category, Genre and CastMember do not
pass an event list. A Gateway interface does not specify whether its result is the input
instance, a copy, or newly reconstituted state. Do not conclude that an arbitrary
Gateway implementation preserves pending events from its return type alone.

Restoration tests must inspect relevant fields and subsequent behavior rather than
only `equals`: `Entity.equals` requires the same concrete class and equal ID, not
equal full state. Collection aliasing also depends on the actual overload; a
read-only getter is not proof of independent storage. Use real objects when testing
these distinctions; domain tests require `@DisplayName` and no mocks.

## Keep unsupported persistence claims out of domain

No Gateway here declares `expectedVersion`, locks, transaction boundaries, a
persistence receipt or a unit of work. The inspected aggregate types have no
persisted revision field. These facts establish the domain shape, not a finding
that a particular adapter is safe or unsafe under concurrency.

Do not insert ORM annotations, database exceptions, generated technical IDs,
clock/transaction services, lock methods or outbox machinery into the domain to
fill those gaps. A request to establish atomic writes, uniqueness, consistent
loads, isolation, retry safety or committed success needs behavior and evidence
beyond these declarations. Report that as an unresolved cross-layer request.

For a future authorized persistence review, useful questions remain: does loading
preserve all intended state, can errors be distinguished from absence, when is a
write committed, and what coordinates concurrent writers? They are handoff
questions, not implemented guarantees or prescribed solutions in this domain
reference. A domain copy test cannot answer them; neither can a test that simply
stubs a Gateway.
