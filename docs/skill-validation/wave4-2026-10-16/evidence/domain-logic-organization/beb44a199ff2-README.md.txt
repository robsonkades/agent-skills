# Warehouse reservations

The module runs on Java 17 with PostgreSQL 17. Multiple request threads call the
same service. The DataSource supplies connections to the same primary database.
During this release no other writer changes stock or reservations. Every request
has a distinct UUID, and automatic retries are disabled. The initial stock for
SKU-1 is 100. A reservation must never sell more units than were available;
insufficient stock must leave both tables unchanged. There are no notifications,
ORM callbacks or audit effects in this module's current business contract.

Read Bootstrap.java, ReservationService.java, StockGateway.java, read-stock.sql
and schema.sql together. The SQL resource is packaged beside the classes and is
loaded at bootstrap. A deployment trace or database integration test has not been
provided. Source can be compiled with javac --release 17; compilation does not run
a PostgreSQL test. The fixture contains no database credentials or driver.
