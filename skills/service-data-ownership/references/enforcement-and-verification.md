# Enforcing the contract in Java/Spring and a relational database

Read when changing persistence wiring or translating an ownership contract into database
permissions and tests. Keep the project's Java, Spring, driver and database versions;
examples below are partial illustrations, not a runnable application or migration script.

## Java and Spring consequences

Trace each `DataSource` or reactive connection factory to its deployed secret reference
and effective database identity. Include batch processes and migration tooling, not just
the HTTP service. With several persistence units, verify repository/entity scanning,
client wiring and transaction-manager selection against the actual resolved versions.
A bean name or separate package does not demonstrate credential separation.

Keep another service's persistence model behind that service. An order client can expose
an operation such as `reserveStock(...)` or an agreed order summary without importing a
remote service's `JpaRepository` or entity graph. Use the existing project's domain types,
DTO and error conventions. Do not create a fluent DSL, generic data-access facade, or
shared entity library simply to make a boundary look uniform. A fluent builder is useful
only if a real optional-input contract warrants it; it cannot enforce ownership.

`@Transactional(readOnly = true)` is a transaction hint, not a universal prohibition on
writes. The Spring Framework 6.2 API explicitly permits transaction subsystems to ignore
it. An ORM read-only setting or missing `save()` call is also insufficient evidence that
the deployed credential cannot write: native SQL, stored functions and another caller may
still reach the database. Verify actual grants and denied operations. See
[Spring's Transactional contract](<https://docs.spring.io/spring-framework/docs/6.2.x/javadoc-api/org/springframework/transaction/annotation/Transactional.html#readOnly()>).

Use restricted runtime credentials; keep schema-owner/migration permissions in the
deployment step or separately controlled migration path when that fits the environment.
Inspect automatic schema generation, `schema.sql`/`data.sql`, Flyway/Liquibase wiring and
profile overrides before removing DDL permissions. Otherwise an application that migrates
on startup may simply stop starting. Check the deployed Boot version's initialization
documentation rather than introducing properties from a different release. Preserve
migration capability through its dedicated identity and test ordinary startup without
that identity available to application code.

Service-level data authority and tenant-level authorisation are distinct. A legitimate
Orders principal may access all Orders rows for technical reasons; the operation still
needs a trusted user/tenant context and a business permission check. If row-level security
is chosen, inspect its bypass roles and session context reset in the connection pool.
Never infer tenant isolation from per-service credentials or a header alone.

## PostgreSQL 17: audit reachable permissions

These concrete semantics illustrate why an access contract needs engine-specific proof.
They are not portable SQL guarantees and are not a requirement to adopt PostgreSQL.

- Inspect object ownership, direct grants, `PUBLIC`, inherited role membership and
  reachable `SET ROLE` paths. Ordinary runtime roles must not reach an owner/admin role
  when the contract intends to restrict them. Owners can re-grant themselves ordinary
  privileges; removing one direct grant may leave another privilege path intact.
- Schema names organise objects; `search_path` controls name resolution rather than
  authorisation. Schema `USAGE` and object permissions are separate. A schema writable
  by an untrusted role in a trusted session's search path can enable object shadowing.
  Audit search paths and `CREATE` rights, including upgraded databases' defaults.
- Review tables, sequences and executable functions separately. Functions/procedures may
  have default `PUBLIC EXECUTE`; inspect privileged functions and their invocation paths
  rather than declaring an account read-only from table privileges alone.
- Check both existing objects and defaults for the actual role that creates future
  objects. `ALTER DEFAULT PRIVILEGES` changes future objects only, and defaults belong
  to the creating role. Per-schema revokes do not remove globally granted defaults.
- A published view needs explicit privileges and correct security semantics. Ordinary
  views use the owner's permissions for underlying relations; `security_invoker` views
  require the caller's underlying privileges. Some views support mutation. Grant only
  the agreed operations, and test base-table denial plus view success. If filtering rows
  for security, examine `security_barrier`, row policies and functions; a `WHERE` clause
  alone is not a general proof against leakage.
- Row-security policies have their own trust boundary: superusers and `BYPASSRLS` roles
  bypass them, and table owners normally do. Test the actual runtime role, never a test
  admin identity that bypasses the control under examination.
- `VALID UNTIL` expires a password, not the role or every authentication method. It is
  not a general exception-expiry mechanism. Define the required cut-off for existing
  sessions, delegated roles and alternate authentication, then verify the revocation path.
- For logical replication, inspect the complete reachable publication set: PostgreSQL 17
  has no publication-level privileges, so another publication can expose data omitted
  by the intended filter. Publisher permissions are checked at connection start, not for
  each change record. Include live replication connections in revocation tests and hand
  any required stopping/restarting and continuity work to the CDC operator.

Primary sources, consulted 2026-09-30:

- [Privileges](https://www.postgresql.org/docs/17/ddl-priv.html) and
  [role membership](https://www.postgresql.org/docs/17/role-membership.html): effective
  access, owner rights and inheritance/role switching.
- [Schemas](https://www.postgresql.org/docs/17/ddl-schemas.html): schema grants, search
  paths and differences in upgraded databases.
- [Default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html):
  object-creator scope, future objects and global/per-schema interaction.
- [Views](https://www.postgresql.org/docs/17/sql-createview.html) and
  [row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html): permissions,
  updatability and policy bypass.
- [CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html): password-expiry
  scope. Verify the target version's behaviour if these mechanisms differ.
- [Logical replication security](https://www.postgresql.org/docs/17/logical-replication-security.html):
  publication visibility and publisher connection-time privilege checks.

## Hostile tests that distinguish denial from a broken fixture

Use a disposable database with the target engine/version, representative grants,
synthetic sensitive rows and the same role graph/authentication shape. Never execute
these probes against a real shared database. This table is a test specification; it is
not evidence that any scenario has already run.

| Connection / setup                                                  | Probe                                                                                     | Required observation                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Dedicated report principal                                          | Supported view/export read, then direct private-table read                                | Supported result succeeds with permitted fields; the private path fails for the expected authorisation reason   |
| Same report principal                                               | Valid update against an existing source row, and any reachable mutating routine           | Mutation denied; authoritative row unchanged; failure is not a syntax error or missing row                      |
| Same report principal, tempting owner membership in hostile fixture | Attempt `SET ROLE` or inherited access to the owner/writer                                | Boundary test catches the reachable privilege; after removing the path, both escalation and mutation are denied |
| Runtime writer                                                      | Valid business command, then prohibited DDL/foreign-service access                        | Ordinary operation succeeds; only the prohibited capability is denied                                           |
| Actual migration creator                                            | Create a representative new object, then retry disallowed access                          | New-object privileges preserve the contract; an old-object-only grant test is insufficient                      |
| Principal whose exception has expired                               | Repeat previously allowed access using a new connection and a pre-existing pooled session | Access no longer meets the exception capability; record exact cut-off semantics and any in-flight work          |
| Authenticated caller with wrong tenant                              | Request a permitted operation for another tenant through supported interface              | No cross-tenant read or mutation; service authentication alone does not satisfy this case                       |

With SQL probes, first confirm the intended database and session identity. The following
is a **partial PostgreSQL 17 probe**, to adapt only inside the disposable fixture with
existing `orders.order_line(order_id, quantity)` and a report principal connected directly.
It deliberately omits provisioning/authentication and does not prove the whole boundary:

```sql
SELECT current_database(), session_user, current_user;
BEGIN;
UPDATE orders.order_line SET quantity = quantity WHERE order_id = 42;
ROLLBACK;
```

For this probe's missing table privilege, expect an insufficient-privilege error
([PostgreSQL SQLSTATE `42501`](https://www.postgresql.org/docs/17/errcodes-appendix.html))
and verify the row through an independent authorised connection. Configure the
test runner to inspect that exact failure and clean up even when a statement errors.
If the update succeeds, the test fails even if the transaction later rolls back or the
assigned value happened to be unchanged. Do not accept timeouts, disconnected databases,
missing tables or SQL syntax failures as evidence of access denial. Row-policy tests have
a different contract: a policy may filter rows without throwing, so check result contents
and affected rows rather than requiring this SQLSTATE for every isolation mechanism.
Separately probe the allowed interface and confirm its expected data; otherwise a broken setup
could produce misleading "all denied" results.

Run through a directly authenticated test principal when claiming authentication/pool
behaviour. An admin session using `SET ROLE` can help isolate permission semantics but
does not validate login policy, secret wiring or existing pooled-session revocation.
For permission changes, repeat relevant checks after reconnecting and through the running
application/job. Report these boundaries separately from compilation, mocked repository
tests and catalog structural validation.
