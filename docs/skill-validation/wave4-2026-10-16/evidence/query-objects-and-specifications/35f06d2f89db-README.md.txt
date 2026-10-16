# Order inbox query review

Review the current inbox search against the accepted product contract and project
artifacts. Recommend retaining it or the smallest supported correction, with the
evidence and validation needed. Compare an alternative representation only when it
would help this query. This is a read-only design/code review, not an authorized
deployment or database migration.

The application uses Java 17 and Spring JDBC 6.1 JdbcClient against PostgreSQL 17.
The adapter executes inbox-content.sql and inbox-count.sql with named parameters.
It returns a flat scalar DTO and a total; no entity graph or ORM is involved.
There is one caller and no reusable predicate library in this module. The supplied
DDL and seed records are a bounded fixture, not a production inventory.

The query contract and trusted scope are separate inputs. The caller validates
page size 1..200 and a nonnegative offset, obtains tenant/customer scope from the
authenticated access policy, and short-circuits an empty allowed-customer list
to empty content and zero count. The sample request uses a nonempty scope.
JdbcClient expands collection parameters; request values are not interpolated.
The two statements run in the same read-only REPEATABLE READ transaction.
No query plans, integration execution, runtime traces or workload measurements
are supplied. Preserve supported behavior and distinguish source reasoning from
an executed provider/database check.
