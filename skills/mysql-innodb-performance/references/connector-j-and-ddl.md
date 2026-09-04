# Connector/J and online DDL

## Prepared statements and batching

Server preparation and caching are separate. Enabling server prepare without a useful cache can add
round-trips; defaults for cache count and SQL-length limits may be too small for ORM statements.
Driver batch rewrite is another mechanism again. Stable batch sizes limit statement-shape churn;
confirm prepared-statement counts and server-observed statements.

Treat copied connection properties as suspect. Some accepted legacy names are no-ops or removed;
older SSL flags map to `sslMode`. Verify the exact Connector/J reference and effective connection
behavior, including certificate/hostname verification.

## Fetch and timeouts

A Java fetch-size call does not by itself prove streaming or bounded memory. Exercise a result larger
than heap budget, inspect memory and wire behavior, and verify transaction/autocommit and driver
requirements. Query execution, socket read, connection acquisition, and InnoDB lock wait are separate
timeouts; fit them into one caller deadline without treating one as coverage for all.

## DDL safety

Specify `ALGORITHM` and `LOCK` where supported so an unsupported online expectation fails instead of
silently becoming a table copy. Check operation-specific/version-specific INSTANT budget and whether
old row versions have exhausted it.

Before execution, find long transactions and metadata-lock blockers; an instant metadata change can
wait indefinitely at its boundary. Budget temporary disk, redo/binlog, replica apply, and rollback or
cleanup. Observe the real algorithm and locks in rehearsal with concurrent traffic.
