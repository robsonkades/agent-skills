# Payment import storage review

Java 17, Hibernate ORM 6.6, PostgreSQL 18. The mapping inventory records the relevant
entity configuration; schema.sql is the schema for this bounded review fixture.
Payment is an abstract entity with two concrete leaves. Both leaves use the same
payment_ids sequence. The shown queries are the supported request paths. There is
no table that references the abstract payment type; external references in this
module always identify a method and ID. There are no unrelated schema objects in
this fixture, but a production migration would need its own dependency inventory.

The import check produced sample-rows.csv. Product's accepted reference-number
scope is in business-contract.json. Review whether the current constraints and
mapping satisfy that contract and recommend retaining them or the smallest
justified change. Compare a relevant alternative; do not assume a new inheritance
strategy is required. Explain what an implementation and rollout would need.

The online service and a SQL import job both write these tables. Old deployments
can remain active for 24 hours after a release. No query plans, workload timings,
provider SQL trace, integration-test results or rollout approval are supplied.
No database credentials or runnable ORM project are included; this is a review.
