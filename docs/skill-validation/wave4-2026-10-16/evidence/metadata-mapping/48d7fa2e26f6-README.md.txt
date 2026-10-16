# Mapping verification snapshot

This Java module uses Hibernate ORM 6.6.18.Final, Jakarta Persistence API 3.1.0 and H2 2.2.224 for its isolated verification fixture. The target compiler release is 17. Dependencies must already exist locally; run.mjs performs no installation. Set MM_JAVA_HOME or MM_M2 to existing toolchain/cache paths if needed.

Bootstrap loads bootstrap.properties, then export.properties. schema.sql is the schema fixture used by the verification step. The build is represented by run.mjs; source and config files here are the packaged inputs for this check.

Run `node run.mjs <isolated-output-directory>` to compile and exercise the bootstrap-only step. Append `write` to exercise one mapped insert after bootstrap. Outputs and logs stay outside this input directory; the database is a fresh in-memory H2 fixture for each execution. Inspect docs/accepted-contract.md and docs/proposal.md as well as the implementation.
