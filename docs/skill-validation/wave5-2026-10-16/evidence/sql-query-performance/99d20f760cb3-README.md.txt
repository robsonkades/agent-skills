# Invoice export query review

Database target: PostgreSQL 17. The report emits one customer_label per qualifying invoice for tenant 71; repeated labels are intentional and must retain their multiplicity. Results are ordered by label. A row qualifies when active is true or amount is at least 100. No total count or page navigation is part of this query.

current.sql is the current statement; proposed.sql is a proposed two-branch replacement using existing indexes. schema.sql is the current supported schema. seed.sql is a small regression sample, not production statistics. There are no archived actual execution plans, row counts or timings for this rewrite. The ticket describes the report as slow, but has no reliable isolated statement timing yet. Do not change schema or deploy changes.

